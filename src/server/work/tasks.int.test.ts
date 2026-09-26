import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activityEvents, tasks } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createStaff } from "../testing";
import { completeTask, listTasks, setNextAction, snoozeTask } from "./tasks";
import { createTaskRow } from "./testing";

// O18 Tasks (§07.6, F19, A45): evidence on completion, attempts are not completions, snoozing
// needs a review point and never erases a missed promise.
let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

const now = new Date("2026-09-26T09:00:00Z");
const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000);
let counter = 0;
const op = () => {
  counter += 1;
  return `task-op-${counter}`;
};
const taskRow = async (id: string) => (await t.db.select().from(tasks).where(eq(tasks.id, id)))[0];

describe("listTasks", () => {
  it("lists the actor's, unowned or all open tasks by due point", async () => {
    const broker = await createStaff(t.db, { roles: ["assigned_broker"] });
    const later = await createTaskRow(t.db, { ownerStaffId: broker.id, dueAt: at(5) });
    const overdue = await createTaskRow(t.db, {
      ownerStaffId: broker.id,
      dueAt: at(-2),
      type: "publishing",
    });
    const undated = await createTaskRow(t.db, { ownerStaffId: broker.id });
    const unowned = await createTaskRow(t.db, { dueAt: at(1) });

    const mine = await listTasks(t.db, broker.actor, { now });
    expect(mine.map((r) => r.task.id)).toEqual([overdue.id, later.id, undated.id]);
    expect(mine[0]).toMatchObject({
      due: { at: at(-2).toISOString(), overdue: true },
      highImpact: true,
      owner: { staffId: broker.id },
      state: "open",
    });
    const pool = await listTasks(t.db, broker.actor, { view: "unassigned", now });
    expect(pool.map((r) => r.task.id)).toContain(unowned.id);
    const soon = await listTasks(t.db, broker.actor, { now, dueBefore: at(0).toISOString() });
    expect(soon.map((r) => r.task.id)).toEqual([overdue.id]);

    const editor = await createStaff(t.db, { roles: ["content_editor"] });
    await expect(listTasks(t.db, editor.actor, { now })).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("completeTask", () => {
  it("requires evidence text and records what happened", async () => {
    const broker = await createStaff(t.db, { roles: ["assigned_broker"] });
    const task = await createTaskRow(t.db, { ownerStaffId: broker.id, dueAt: at(1) });
    await expect(
      completeTask(t.db, broker.actor, {
        taskId: task.id,
        expectedVersion: 1,
        operationId: op(),
        evidence: { outcome: "completed", note: "  " },
      }),
    ).rejects.toMatchObject({
      code: "validation_failed",
      fieldErrors: { "evidence.note": ["required"] },
    });
    const input = {
      taskId: task.id,
      expectedVersion: 1,
      operationId: op(),
      evidence: { outcome: "completed" as const, note: "Sent the floor plan by email" },
    };
    const done = await completeTask(t.db, broker.actor, input, { now });
    expect(done.outcome).toEqual({ taskId: task.id, version: 2, state: "done", completed: true });
    expect(await completeTask(t.db, broker.actor, input, { now })).toEqual({
      ...done,
      replayed: true,
    });
    expect(await taskRow(task.id)).toMatchObject({
      state: "done",
      outcomeNote: "Sent the floor plan by email",
      completedAt: now,
      completedByStaffId: broker.id,
    });
    await expect(
      completeTask(t.db, broker.actor, { ...input, operationId: op() }),
    ).rejects.toMatchObject({ code: "version_conflict" });
  });

  it("needs evidence records when the task demands them", async () => {
    const broker = await createStaff(t.db, { roles: ["assigned_broker"] });
    const task = await createTaskRow(t.db, { ownerStaffId: broker.id, evidenceRequired: true });
    await expect(
      completeTask(t.db, broker.actor, {
        taskId: task.id,
        expectedVersion: 1,
        operationId: op(),
        evidence: { outcome: "completed", note: "Checked the deed" },
      }),
    ).rejects.toMatchObject({
      code: "transition_denied",
      fieldErrors: { transition: ["evidence_required"] },
    });
    const done = await completeTask(t.db, broker.actor, {
      taskId: task.id,
      expectedVersion: 1,
      operationId: op(),
      evidence: {
        outcome: "completed",
        note: "Checked the deed",
        evidenceIds: ["6f1f7a3e-3a57-4a45-9d6b-7f3c1a2b9e10"],
      },
    });
    expect(done.outcome.state).toBe("done");
  });

  it("records a missed call as an attempt and keeps the task open (F19)", async () => {
    const broker = await createStaff(t.db, { roles: ["assigned_broker"] });
    const task = await createTaskRow(t.db, {
      ownerStaffId: broker.id,
      type: "call",
      dueAt: at(1),
    });
    const attempt = await completeTask(t.db, broker.actor, {
      taskId: task.id,
      expectedVersion: 1,
      operationId: op(),
      evidence: { outcome: "attempted_contact", note: "No answer, voicemail full" },
    });
    expect(attempt.outcome).toEqual({
      taskId: task.id,
      version: 2,
      state: "open",
      completed: false,
    });
    expect(await taskRow(task.id)).toMatchObject({ state: "open", completedAt: null });
    const events = await t.db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.recordId, task.id));
    expect(events.map((e) => e.messageKey)).toEqual(["activity.task.contact_attempted"]);
  });

  it("is staff only; the AI service cannot complete work (A66)", async () => {
    const broker = await createStaff(t.db, { roles: ["assigned_broker"] });
    const task = await createTaskRow(t.db, { ownerStaffId: broker.id });
    await expect(
      completeTask(
        t.db,
        { kind: "ai_service", id: "hermes" },
        {
          taskId: task.id,
          expectedVersion: 1,
          operationId: op(),
          evidence: { outcome: "completed", note: "Done" },
        },
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("snoozeTask", () => {
  it("needs a future review point and leaves the due point untouched (A45)", async () => {
    const broker = await createStaff(t.db, { roles: ["assigned_broker"] });
    const task = await createTaskRow(t.db, {
      ownerStaffId: broker.id,
      commitment: "client_promise",
      dueAt: at(-3),
    });
    const base = { taskId: task.id, expectedVersion: 1 };
    await expect(
      snoozeTask(t.db, broker.actor, { ...base, operationId: op(), until: "" }, { now }),
    ).rejects.toMatchObject({ fieldErrors: { until: ["next_review_point_required"] } });
    await expect(
      snoozeTask(
        t.db,
        broker.actor,
        { ...base, operationId: op(), until: at(-1).toISOString() },
        { now },
      ),
    ).rejects.toMatchObject({ fieldErrors: { until: ["must_be_in_future"] } });
    const snoozed = await snoozeTask(
      t.db,
      broker.actor,
      { ...base, operationId: op(), until: at(20).toISOString() },
      { now },
    );
    expect(snoozed.outcome).toEqual({
      taskId: task.id,
      version: 2,
      reviewAt: at(20).toISOString(),
    });
    expect(await taskRow(task.id)).toMatchObject({ dueAt: at(-3), followUpAt: at(20) });
    const [row] = await listTasks(t.db, broker.actor, { now });
    expect(row).toMatchObject({ due: { overdue: true }, reviewAt: at(20).toISOString() });
    // A missed promise cannot be re-dated either.
    await expect(
      setNextAction(
        t.db,
        broker.actor,
        {
          taskId: task.id,
          expectedVersion: 2,
          operationId: op(),
          title: "Send it later",
          dueAt: at(48).toISOString(),
        },
        { now },
      ),
    ).rejects.toMatchObject({ fieldErrors: { transition: ["missed_commitment"] } });
  });
});
