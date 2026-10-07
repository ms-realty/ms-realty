import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  activityEvents,
  auditEvents,
  caseParticipants,
  cases,
  operations,
  tasks,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import {
  type ButlerEvidence,
  butlerHumanActions,
  butlerReceipt,
  butlerRoutineActions,
} from "@/domain/butler";
import type { Actor } from "@/domain/capabilities";
import { recordAudit } from "../audit";
import { caseFixture } from "../cases/testing";
import { hashRequest } from "../crypto";
import { AppError } from "../errors";
import { findOperation, reconcileOperation, runOperation } from "../operations";
import type { ButlerAuthorization } from "./authority";
import { createButlerExecutor, defineButlerAction } from "./executor";
import { readButlerReceipt } from "./receipts";
import { runButlerAction } from "./tasks";

let t: TestDatabase;
let fixture: Awaited<ReturnType<typeof caseFixture>>;
const butler: Actor = { kind: "system", id: "butler" };
beforeAll(async () => {
  t = await createTestDatabase();
  fixture = await caseFixture(t.db);
});
afterAll(async () => {
  await t?.drop();
});

const request = (action: string, body?: Record<string, unknown>) => ({
  action,
  idempotencyKey: randomUUID(),
  body: { caseId: fixture.record.id, ...body },
});
const allTasks = () => t.db.select().from(tasks).where(eq(tasks.caseId, fixture.record.id));
const allActivities = () =>
  t.db.select().from(activityEvents).where(eq(activityEvents.recordId, fixture.record.id));
const verdictAudits = (operationId: string) =>
  t.db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.operationId, operationId), eq(auditEvents.action, "butler.verdict")));

/** Stored fixtures model prior receipts; they never invoke a withdrawn Butler effect. */
async function legacyAttempt(
  input: ReturnType<typeof request>,
  status: "succeeded" | "failed" | "outcome_unknown",
) {
  const operationId = randomUUID();
  const receipt = butlerReceipt(
    operationId,
    input.action,
    status === "succeeded" ? "done_automatically" : "blocked",
    status === "succeeded"
      ? "owner_option_2"
      : status === "outcome_unknown"
        ? "outcome_unknown"
        : "transition_denied",
    status === "succeeded" ? "applied" : status === "outcome_unknown" ? "unknown" : "not_applied",
    "owner_option_2_2026_10_02",
  );
  const result = { providerReceipt: "synthetic-historical-result" };
  await t.db.transaction(async (tx) => {
    await tx.insert(operations).values({
      id: operationId,
      actorKind: butler.kind,
      actorId: butler.id,
      operationType: `butler.${input.action}`,
      idempotencyKey: input.idempotencyKey,
      requestHash: hashRequest({ action: input.action, body: input.body }),
      resultType: "case",
      resultId: fixture.record.id,
      status,
      outcome:
        status === "succeeded"
          ? { kind: "butler_outcome_v1", result, butlerReceipt: receipt }
          : {
              code: status === "failed" ? "transition_denied" : "unavailable",
              current: { butlerReceipt: receipt },
            },
    });
    await recordAudit(tx, {
      action: "butler.verdict",
      actor: butler,
      operationId,
      recordType: "case",
      recordId: fixture.record.id,
      payload: { receipt },
    });
  });
  return { operationId, receipt, result };
}

describe("durable Butler draft-only authorization", () => {
  it.each([
    { kind: "ai_service", id: "hermes" },
    { kind: "system", id: "butler" },
    { kind: "staff", id: "forged-human" },
  ] as const)("$kind cannot execute a Butler action by claiming authority", async (actor) => {
    let calls = 0;
    const input = {
      actor,
      type: "butler.task.create",
      idempotencyKey: randomUUID(),
      requestHash: hashRequest({}),
      subject: { type: "case", id: fixture.record.id },
      butlerAuthorization: {} as ButlerAuthorization,
    };
    for (let retry = 0; retry < 2; retry++)
      await expect(
        runOperation(t.db, input, async () => {
          calls++;
        }),
      ).rejects.toMatchObject({
        code: "forbidden",
        current: {
          butlerReceipt: {
            verdict: "blocked",
            reason: "server_authority_required",
            manual: { available: true, requiresAuthorization: true },
          },
        },
      });
    expect(calls).toBe(0);
    const saved = await findOperation(t.db, actor, input.type, input.idempotencyKey);
    expect(saved).toMatchObject({ status: "failed", butlerReceipt: { verdict: "blocked" } });
    expect(
      await t.db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.operationId, saved?.operationId ?? "")),
    ).toHaveLength(1);
  });
  it("raw AI also cannot evade the boundary by choosing an ordinary command name", async () => {
    let calls = 0;
    await expect(
      runOperation(
        t.db,
        {
          actor: { kind: "ai_service", id: "hermes" },
          type: "message.send_external",
          idempotencyKey: randomUUID(),
          requestHash: hashRequest({}),
        },
        async () => {
          calls++;
        },
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(calls).toBe(0);
  });
  it.each(butlerHumanActions)(
    "%s is awaiting approval; no worker impersonates a reviewer",
    async (action) => {
      const input = request(action, { approved: true, reviewedBy: fixture.staff.id });
      const before = await allTasks();
      await expect(runButlerAction(t.db, input)).rejects.toMatchObject({
        code: "butler_approval_required",
        current: {
          butlerReceipt: {
            action,
            verdict: "awaiting_approval",
            outcome: "not_applied",
            manual: { available: true },
          },
        },
      });
      const receipt = await findOperation(t.db, butler, `butler.${action}`, input.idempotencyKey);
      expect(receipt?.butlerReceipt?.verdict).toBe("awaiting_approval");
      expect(await allTasks()).toHaveLength(before.length);
    },
  );
  it("unrecognized commands are durably blocked rather than implicitly allowed", async () => {
    const input = request("new.action");
    await expect(runButlerAction(t.db, input)).rejects.toMatchObject({
      current: { butlerReceipt: { verdict: "blocked", reason: "action_not_allowlisted" } },
    });
  });
  it.each(butlerRoutineActions.filter((a) => a !== "task.create"))(
    "%s without a registered guard is blocked",
    async (action) => {
      await expect(runButlerAction(t.db, request(action))).rejects.toMatchObject({
        code: "forbidden",
        current: { butlerReceipt: { verdict: "blocked" } },
      });
    },
  );
  it("a valid old task intent retains one human receipt without inserting a task or activity", async () => {
    const input = request("task.create", {
      title: "Synthetic internal follow-up",
      purpose: "Review source documents",
    });
    const before = await allTasks();
    const activitiesBefore = await allActivities();
    for (let retry = 0; retry < 2; retry++)
      await expect(runButlerAction(t.db, input)).rejects.toMatchObject({
        code: "butler_approval_required",
        current: {
          butlerReceipt: {
            policy: "owner_draft_only",
            action: "task.create",
            verdict: "awaiting_approval",
            reason: "draft_only",
            outcome: "not_applied",
            manual: {
              available: true,
              requiresAuthorization: true,
              requiresReconciliation: false,
            },
          },
        },
      });
    const stored = await findOperation(t.db, butler, "butler.task.create", input.idempotencyKey);
    if (!stored?.butlerReceipt) throw new Error("Missing blocked Butler receipt");
    expect(stored.status).toBe("failed");
    expect(await readButlerReceipt(t.db, fixture.staff.session, stored.operationId)).toEqual(
      stored.butlerReceipt,
    );
    await expect(
      readButlerReceipt(t.db, fixture.client.session, stored.operationId),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(await allTasks()).toEqual(before);
    expect(await allActivities()).toEqual(activitiesBefore);
    expect(await verdictAudits(stored.operationId)).toHaveLength(1);
    await expect(
      runButlerAction(t.db, { ...input, body: { ...input.body, title: "Changed request" } }),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
  });
  it("the task schema cannot smuggle a promise, cancellation or a model's approval facts", async () => {
    for (const extra of [
      { promisedToClient: true },
      { state: "cancelled" },
      { ownerAvailable: true },
      { approved: true },
    ])
      await expect(
        runButlerAction(t.db, request("task.create", { title: "No effect", ...extra })),
      ).rejects.toMatchObject({ code: "validation_failed" });
  });
  it("case closure is checked before the denial and failed attempts stay parked", async () => {
    await t.db
      .update(cases)
      .set({
        disposition: "closed",
        closureOutcome: "Synthetic closeout",
        commitmentDispositions: {},
      })
      .where(eq(cases.id, fixture.record.id));
    const input = request("task.create", { title: "Must not create after closure" });
    const before = await allTasks();
    await expect(runButlerAction(t.db, input)).rejects.toMatchObject({
      code: "not_found",
      current: { butlerReceipt: { verdict: "blocked" } },
    });
    expect(await allTasks()).toHaveLength(before.length);
    await t.db
      .update(cases)
      .set({ disposition: "active", closureOutcome: null, commitmentDispositions: null })
      .where(eq(cases.id, fixture.record.id));
    // A changed precondition needs a new intent/key; a parked failed attempt never changes itself.
    await expect(runButlerAction(t.db, input)).rejects.toMatchObject({ code: "not_found" });
  });
  it("a registered message adapter re-reads live participation, never submitted booleans", async () => {
    let calls = 0;
    const adapter = defineButlerAction(
      "reminder.send",
      z.object({ caseId: z.uuid(), partyId: z.uuid() }).strict(),
      {
        async readAndLock(ctx, command): Promise<ButlerEvidence> {
          const [participant] = await ctx.tx
            .select()
            .from(caseParticipants)
            .where(
              and(
                eq(caseParticipants.caseId, command.caseId),
                eq(caseParticipants.partyId, command.partyId),
              ),
            )
            .for("update");
          return {
            caseId: command.caseId,
            caseActive: true,
            protectedEffects: [],
            message: {
              templateId: "fixture-reviewed-template",
              templateAction: "reminder.send",
              approvedDigest: "fixture-exact-rendering",
              renderedDigest: "fixture-exact-rendering",
              active: true,
              recipients: [
                {
                  partyId: command.partyId,
                  currentCaseParticipant: !!participant && !participant.revokedAt,
                  contactEligible: true,
                  firstContactHumanReceiptId: "fixture-human-contact",
                },
              ],
            },
          };
        },
        async execute() {
          calls++;
          return { providerReceipt: "synthetic-test-only" };
        },
      },
    );
    const execute = createButlerExecutor([adapter]);
    await t.db
      .update(caseParticipants)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(caseParticipants.caseId, fixture.record.id),
          eq(caseParticipants.partyId, fixture.client.partyId),
        ),
      );
    await expect(
      execute(t.db, request("reminder.send", { partyId: fixture.client.partyId })),
    ).rejects.toMatchObject({ current: { butlerReceipt: { reason: "recipient_not_eligible" } } });
    expect(calls).toBe(0);
    await t.db
      .update(caseParticipants)
      .set({ revokedAt: null })
      .where(
        and(
          eq(caseParticipants.caseId, fixture.record.id),
          eq(caseParticipants.partyId, fixture.client.partyId),
        ),
      );
    await expect(
      execute(t.db, request("reminder.send", { partyId: fixture.client.partyId })),
    ).rejects.toMatchObject({
      code: "butler_approval_required",
      current: { butlerReceipt: { reason: "draft_only", outcome: "not_applied" } },
    });
    expect(calls).toBe(0);
  });
  it("a fully valid registered task intent never reaches its effect callback", async () => {
    let calls = 0;
    const execute = createButlerExecutor([
      defineButlerAction("task.create", z.object({ caseId: z.uuid() }).strict(), {
        async readAndLock(_ctx, command): Promise<ButlerEvidence> {
          return {
            caseId: command.caseId,
            caseActive: true,
            protectedEffects: [],
            task: { internalCreationOnly: true, ownerAvailable: true, makesClientPromise: false },
          };
        },
        async execute(ctx, command) {
          calls++;
          await ctx.tx.insert(tasks).values({ caseId: command.caseId, title: "Must never exist" });
          throw new Error("Must never reach an external effect either");
        },
      }),
    ]);
    const input = request("task.create");
    const before = await allTasks();
    for (let retry = 0; retry < 2; retry++)
      await expect(execute(t.db, input)).rejects.toMatchObject({
        code: "butler_approval_required",
        current: { butlerReceipt: { reason: "draft_only", outcome: "not_applied" } },
      });
    expect(calls).toBe(0);
    expect(await allTasks()).toEqual(before);
  });
  it("a JSON adapter lookalike cannot register an effect", () => {
    expect(() => createButlerExecutor([{} as ReturnType<typeof defineButlerAction>])).toThrow(
      "Invalid Butler adapter registry",
    );
  });
  it.each([
    new AppError("unavailable"),
    new AppError("unavailable", { outcome: "unknown" }),
    new Error("Synthetic failed evidence lookup"),
  ])(
    "a failed evidence lookup rolls back writes and retains its blocked verdict: %s",
    async (failure) => {
      let reads = 0;
      let effects = 0;
      const execute = createButlerExecutor([
        defineButlerAction("task.create", z.object({ caseId: z.uuid() }).strict(), {
          async readAndLock(ctx, command): Promise<ButlerEvidence> {
            reads++;
            await ctx.tx
              .insert(tasks)
              .values({ caseId: command.caseId, title: "Rolled back task" });
            throw failure;
          },
          async execute() {
            effects++;
          },
        }),
      ]);
      const input = request("task.create");
      const before = await allTasks();
      for (let i = 0; i < 2; i++)
        await expect(execute(t.db, input)).rejects.toMatchObject({
          code: "unavailable",
          outcome: "not_applied",
          current: {
            butlerReceipt: {
              verdict: "blocked",
              outcome: "not_applied",
              manual: { requiresReconciliation: false },
            },
          },
        });
      expect(reads).toBe(1);
      expect(effects).toBe(0);
      expect(await allTasks()).toEqual(before);
      const stored = await findOperation(t.db, butler, "butler.task.create", input.idempotencyKey);
      expect(stored?.status).toBe("failed");
      expect(await verdictAudits(stored?.operationId ?? "")).toHaveLength(1);
    },
  );
  it.each(["succeeded", "failed"] as const)(
    "a historical %s receipt replays unchanged without an effect or duplicate audit",
    async (status) => {
      const input = request("task.create", { title: "Historical intent" });
      const stored = await legacyAttempt(input, status);
      const before = await allTasks();
      const activitiesBefore = await allActivities();
      for (let retry = 0; retry < 2; retry++) {
        if (status === "succeeded")
          expect(await runButlerAction(t.db, input)).toEqual({
            operationId: stored.operationId,
            replayed: true,
            outcome: stored.result,
            butlerReceipt: stored.receipt,
          });
        else
          await expect(runButlerAction(t.db, input)).rejects.toMatchObject({
            code: "transition_denied",
            current: { butlerReceipt: stored.receipt },
          });
      }
      expect(await readButlerReceipt(t.db, fixture.staff.session, stored.operationId)).toEqual(
        stored.receipt,
      );
      expect(await verdictAudits(stored.operationId)).toHaveLength(1);
      expect(await allTasks()).toEqual(before);
      expect(await allActivities()).toEqual(activitiesBefore);
      await expect(
        runButlerAction(t.db, {
          ...input,
          body: { ...input.body, title: "Changed historical intent" },
        }),
      ).rejects.toMatchObject({ code: "idempotency_key_reused" });
    },
  );
  it.each(["succeeded", "failed"] as const)(
    "a historical unknown effect stays parked and retains its policy after %s reconciliation",
    async (status) => {
      const input = request("chaser.send");
      const stored = await legacyAttempt(input, "outcome_unknown");
      const before = await allTasks();
      const activitiesBefore = await allActivities();
      for (let retry = 0; retry < 2; retry++)
        await expect(runButlerAction(t.db, input)).rejects.toMatchObject({
          code: "outcome_unknown",
          current: { butlerReceipt: stored.receipt },
        });
      expect(stored.receipt.manual.requiresReconciliation).toBe(true);
      expect(
        await reconcileOperation(
          t.db,
          stored.operationId,
          status === "succeeded"
            ? { status, outcome: stored.result }
            : { status, code: "transition_denied" },
        ),
      ).toBe(true);
      const receipt = await readButlerReceipt(t.db, fixture.staff.session, stored.operationId);
      expect(receipt).toMatchObject({
        policy: "owner_option_2_2026_10_02",
        verdict: status === "succeeded" ? "done_automatically" : "blocked",
        outcome: status === "succeeded" ? "applied" : "not_applied",
        manual: { requiresReconciliation: false },
      });
      if (status === "succeeded")
        expect(await runButlerAction(t.db, input)).toMatchObject({
          replayed: true,
          outcome: stored.result,
          butlerReceipt: receipt,
        });
      else
        await expect(runButlerAction(t.db, input)).rejects.toMatchObject({
          code: "transition_denied",
          current: { butlerReceipt: receipt },
        });
      expect(
        await reconcileOperation(t.db, stored.operationId, {
          status: "failed",
          code: "transition_denied",
        }),
      ).toBe(false);
      expect(await verdictAudits(stored.operationId)).toHaveLength(1);
      expect(
        await t.db
          .select()
          .from(auditEvents)
          .where(
            and(
              eq(auditEvents.operationId, stored.operationId),
              eq(auditEvents.action, "butler.reconciled"),
            ),
          ),
      ).toHaveLength(1);
      expect(await allTasks()).toEqual(before);
      expect(await allActivities()).toEqual(activitiesBefore);
    },
  );
});
