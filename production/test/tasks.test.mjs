import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TASK_SOURCE_ROUTES,
  appendTaskAction,
  assertTaskEvents,
  buildTaskQueue,
  deriveSourceTasks,
  deriveTasks,
  openTask,
  readTaskEvents,
  resetTaskLedger,
  taskOriginOf,
} from "../lib/tasks.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function ledger() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-tasks-"));
  const filePath = path.join(directory, "task-events.jsonl");
  resetTaskLedger(filePath);
  return filePath;
}

const AT = "2026-09-02T09:00:00.000Z";
const LATER = "2026-09-02T11:00:00.000Z";

function open(filePath, overrides = {}) {
  return openTask(
    {
      taskId: "chase-notary-plan",
      taskType: "document_chase",
      subjectRef: "MS-CRAWL-0001",
      owner: "Maria S.",
      dueAt: "2026-09-05T09:00:00.000Z",
      priority: "urgent",
      note: "Notary is missing the floor plan annex.",
      actor: "Maria S.",
      humanConfirmed: true,
      ...overrides,
    },
    { filePath, recordedAt: AT },
  );
}

// The rule this whole entity exists to hold: work that another screen owns
// cannot be ticked here. A task list that lets you close a lead without
// answering it is a way to record work that never happened.
test("a task derived from another screen's queue refuses every ledger action", () => {
  const filePath = ledger();
  for (const [kind, route] of Object.entries(TASK_SOURCE_ROUTES)) {
    const taskId = `${kind}:some-source-id`;
    assert.equal(taskOriginOf(taskId), "derived", `${kind} is a derived namespace`);
    for (const action of ["task_completed", "task_dismissed", "task_snoozed", "task_reassigned", "task_reopened"]) {
      assert.throws(
        () =>
          appendTaskAction(
            { taskId, action, note: "n", reference: "ref-1", reasonCode: "handled", until: "2027-01-01T00:00:00.000Z", owner: "Someone", actor: "Maria S.", humanConfirmed: true },
            { filePath, recordedAt: AT },
          ),
        (error) => error.message.includes(route),
        `${kind}/${action} names the route that owns it`,
      );
    }
    // And it cannot be opened here either, which would launder it into an
    // authored task carrying the same id.
    assert.throws(
      () => open(filePath, { taskId }),
      /completed where it is worked/,
    );
  }
  assert.equal(readTaskEvents(filePath).length, 0, "nothing reached the ledger");
});

test("an authored task opens, completes and reads back from the ledger", () => {
  const filePath = ledger();
  const opened = open(filePath);
  assert.equal(opened.idempotent, false);
  assert.equal(opened.task.status, "open");
  assert.equal(opened.task.completion.mode, "ledger");
  assert.equal(opened.task.owner, "Maria S.");

  const done = appendTaskAction(
    { taskId: "chase-notary-plan", action: "task_completed", reference: "case-2026-114", actor: "Ivan P.", humanConfirmed: true },
    { filePath, recordedAt: LATER },
  );
  assert.equal(done.task.status, "completed");
  assert.equal(done.task.resolved_by, "Ivan P.");
  assert.equal(done.task.resolution_reference, "case-2026-114");

  const events = readTaskEvents(filePath);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((event) => event.action), ["task_opened", "task_completed"]);
  assert.equal(deriveTasks(events)[0].status, "completed");
});

test("completing requires evidence a later reader can follow", () => {
  const filePath = ledger();
  open(filePath);
  assert.throws(
    () => appendTaskAction({ taskId: "chase-notary-plan", action: "task_completed", actor: "Ivan P.", humanConfirmed: true }, { filePath, recordedAt: LATER }),
    /requires a note or internal reference/,
  );
  // Either one is enough; both are not required.
  assert.equal(
    appendTaskAction({ taskId: "chase-notary-plan", action: "task_completed", note: "Annex received by email.", actor: "Ivan P.", humanConfirmed: true }, { filePath, recordedAt: LATER }).task.status,
    "completed",
  );
});

test("no action lands without a named person who confirmed it", () => {
  const filePath = ledger();
  open(filePath);
  for (const input of [
    { note: "done", actor: "Ivan P." },
    { note: "done", actor: "Ivan P.", humanConfirmed: false },
    { note: "done", humanConfirmed: true },
    { note: "done", actor: "   ", humanConfirmed: true },
  ]) {
    assert.throws(
      () => appendTaskAction({ taskId: "chase-notary-plan", action: "task_completed", ...input }, { filePath, recordedAt: LATER }),
      /human confirmation|Task actor is required/,
    );
  }
  assert.equal(readTaskEvents(filePath).length, 1, "only the opening event exists");
});

test("dismissing is not completing, and says why", () => {
  const filePath = ledger();
  open(filePath);
  assert.throws(
    () => appendTaskAction({ taskId: "chase-notary-plan", action: "task_dismissed", note: "not needed", actor: "Ivan P.", humanConfirmed: true }, { filePath, recordedAt: LATER }),
    /reason code is required/,
  );
  const dismissed = appendTaskAction(
    { taskId: "chase-notary-plan", action: "task_dismissed", reasonCode: "seller_withdrew", actor: "Ivan P.", humanConfirmed: true },
    { filePath, recordedAt: LATER },
  );
  assert.equal(dismissed.task.status, "dismissed");
  assert.equal(dismissed.task.reason_code, "seller_withdrew");
  assert.equal(dismissed.task.resolution_reference, null, "a dismissal never looks like a completion");
});

test("a snooze must name a future moment, so it hides work for a stated time", () => {
  const filePath = ledger();
  open(filePath);
  assert.throws(
    () => appendTaskAction({ taskId: "chase-notary-plan", action: "task_snoozed", reasonCode: "waiting_on_client", actor: "Ivan P.", humanConfirmed: true }, { filePath, recordedAt: LATER }),
    /must be an ISO timestamp/,
  );
  assert.throws(
    () => appendTaskAction({ taskId: "chase-notary-plan", action: "task_snoozed", until: AT, reasonCode: "waiting_on_client", actor: "Ivan P.", humanConfirmed: true }, { filePath, recordedAt: LATER }),
    /must be in the future/,
  );
  const snoozed = appendTaskAction(
    { taskId: "chase-notary-plan", action: "task_snoozed", until: "2026-09-10T09:00:00.000Z", reasonCode: "waiting_on_client", actor: "Ivan P.", humanConfirmed: true },
    { filePath, recordedAt: LATER },
  );
  assert.equal(snoozed.task.status, "snoozed");
  assert.equal(snoozed.task.snoozed_until, "2026-09-10T09:00:00.000Z");
});

test("reassigning to the current owner is refused rather than recorded as activity", () => {
  const filePath = ledger();
  open(filePath);
  assert.throws(
    () => appendTaskAction({ taskId: "chase-notary-plan", action: "task_reassigned", owner: "Maria S.", actor: "Ivan P.", humanConfirmed: true }, { filePath, recordedAt: LATER }),
    /already assigned to that owner/,
  );
  assert.equal(
    appendTaskAction({ taskId: "chase-notary-plan", action: "task_reassigned", owner: "Ivan P.", actor: "Ivan P.", humanConfirmed: true }, { filePath, recordedAt: LATER }).task.owner,
    "Ivan P.",
  );
});

test("a resolved task changes again only after it is reopened", () => {
  const filePath = ledger();
  open(filePath);
  appendTaskAction({ taskId: "chase-notary-plan", action: "task_completed", note: "done", actor: "Ivan P.", humanConfirmed: true }, { filePath, recordedAt: LATER });
  assert.throws(
    () => appendTaskAction({ taskId: "chase-notary-plan", action: "task_completed", note: "again", actor: "Ivan P.", humanConfirmed: true }, { filePath, recordedAt: LATER }),
    /must be reopened before it changes again/,
  );
  const reopened = appendTaskAction(
    { taskId: "chase-notary-plan", action: "task_reopened", reasonCode: "annex_rejected", actor: "Ivan P.", humanConfirmed: true },
    { filePath, recordedAt: LATER },
  );
  assert.equal(reopened.task.status, "open");
  assert.equal(reopened.task.resolved_at, null);
  assert.equal(reopened.task.resolution_note, null);
  // And reopening something that was never resolved is equally refused.
  assert.throws(
    () => appendTaskAction({ taskId: "chase-notary-plan", action: "task_reopened", reasonCode: "again", actor: "Ivan P.", humanConfirmed: true }, { filePath, recordedAt: LATER }),
    /Only a completed or dismissed task can be reopened/,
  );
});

test("actions are recorded in order, and an event id replays instead of duplicating", () => {
  const filePath = ledger();
  open(filePath);
  assert.throws(
    () => appendTaskAction({ taskId: "chase-notary-plan", action: "task_completed", note: "done", actor: "Ivan P.", humanConfirmed: true }, { filePath, recordedAt: "2026-09-01T09:00:00.000Z" }),
    /chronological order/,
  );
  const input = { taskId: "chase-notary-plan", eventId: "task-chase-1", action: "task_completed", note: "done", actor: "Ivan P.", humanConfirmed: true };
  const first = appendTaskAction(input, { filePath, recordedAt: LATER });
  const replay = appendTaskAction(input, { filePath, recordedAt: LATER });
  assert.equal(first.idempotent, false);
  assert.equal(replay.idempotent, true);
  assert.equal(readTaskEvents(filePath).length, 2, "a replay writes nothing");
  // Opening the same task twice with the same shape replays too; with a
  // different shape it is a collision, not a second task.
  assert.equal(open(filePath).idempotent, true);
  assert.throws(() => open(filePath, { owner: "Someone Else" }), /already belongs to another task/);
});

test("the queue merges both origins and marks only the authored ones completable", () => {
  const filePath = ledger();
  open(filePath);
  const page = {
    website_funnel: { lead_tracking_status: "mismatch", lead_tracking_gap: 3 },
    viewingFollowUpQueue: { rows: [{ viewing_id: "V-1", task: "feedback", due_at: "2026-09-02T08:00:00.000Z", overdue: true }] },
    publicRequestQueue: { rows: [{ request_id: "R-1", request_type: "saved_search", status: "open", next_follow_up_at: "2026-09-04T08:00:00.000Z" }] },
  };
  const queue = buildTaskQueue({ page, events: readTaskEvents(filePath), now: LATER });

  assert.equal(queue.kind, "task_queue");
  assert.equal(queue.summary.derived, 3);
  assert.equal(queue.summary.authored, 1);
  assert.equal(queue.summary.completable, 1, "only the authored task can be ticked here");
  for (const row of queue.rows) {
    if (row.origin === "derived") {
      assert.equal(row.completion.mode, "delegated");
      assert.ok(row.completion.route.startsWith("/admin/"), "a delegated row names where the work is done");
    } else {
      assert.equal(row.completion.mode, "ledger");
    }
  }
  // Critical and overdue first, matching the order Today already uses.
  assert.equal(queue.rows[0].task_id, "integrity:website-leads");
  assert.deepEqual(queue.rows.map((row) => row.overdue), [true, true, false, false]);

  // A snoozed task leaves the queue until its moment arrives.
  appendTaskAction(
    { taskId: "chase-notary-plan", action: "task_snoozed", until: "2026-09-10T09:00:00.000Z", reasonCode: "waiting_on_client", actor: "Ivan P.", humanConfirmed: true },
    { filePath, recordedAt: LATER },
  );
  const hidden = buildTaskQueue({ page, events: readTaskEvents(filePath), now: LATER });
  assert.equal(hidden.summary.authored, 0);
  assert.equal(hidden.summary.snoozed, 1);
  const returned = buildTaskQueue({ page, events: readTaskEvents(filePath), now: "2026-09-11T09:00:00.000Z" });
  assert.equal(returned.summary.authored, 1, "the task comes back on its own");
});

// Today already fuses these queues. If Tasks read a different set the two
// screens would disagree about what is outstanding, which is worse than not
// having a Tasks screen at all.
test("the derived half reads exactly the queues Today reads", () => {
  const site = fs.readFileSync(path.join(ROOT, "production/lib/react-admin-site.mjs"), "utf8");
  const start = site.indexOf("function todayNextActions");
  const end = site.indexOf("function TodayBriefingPanel");
  assert.ok(start > -1 && end > start, "todayNextActions is still the Today aggregation");
  const today = site.slice(start, end);
  // Compare the two functions that must agree, not the two files: the lead half
  // of the selection is now one shared implementation both screens call, so its
  // queue reads belong to neither side of this comparison.
  const module = fs.readFileSync(path.join(ROOT, "production/lib/tasks.mjs"), "utf8");
  const derivedStart = module.indexOf("export function deriveSourceTasks");
  const derivedEnd = module.indexOf("function sortTasks(");
  assert.ok(derivedStart > -1 && derivedEnd > derivedStart, "deriveSourceTasks is still the derived half");
  const tasks = module.slice(derivedStart, derivedEnd);

  const queuesIn = (source) => [...source.matchAll(/page\.([A-Za-z_]+Queue)\?/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(queuesIn(tasks))].sort(), [...new Set(queuesIn(today))].sort());

  // And it names each item identically, so the two lists point at one thing.
  const keysIn = (source, field) =>
    [...source.matchAll(new RegExp(`${field}: \`([^\`]+)\``, "g"))].map((match) => match[1].replace(/\$\{[^}]+\}/g, "*"));
  const todayKeys = [...new Set(keysIn(today, "key")), "integrity:website-leads"].sort();
  const taskKeys = [...new Set(keysIn(tasks, "task_id")), "integrity:website-leads"].sort();
  assert.deepEqual(taskKeys, todayKeys);
});

test("a hand-edited ledger row is rejected rather than half-read", () => {
  assert.throws(() => assertTaskEvents([{ id: "x", task_id: "t", action: "task_invented", actor: "A", human_confirmed: true, recorded_at: AT }]), /unknown action/);
  assert.throws(() => assertTaskEvents([{ id: "x", task_id: "t", action: "task_opened", task_type: "chase", owner: "A", priority: "normal", actor: "A", human_confirmed: false, recorded_at: AT }]), /human confirmation/);
  assert.throws(() => assertTaskEvents([{ id: "x", task_id: "lead:L-1", action: "task_completed", note: "n", actor: "A", human_confirmed: true, recorded_at: AT }]), /completed where it is worked/);
  assert.throws(() => assertTaskEvents([{ id: "x", task_id: "t", action: "task_completed", note: "n", actor: "A", human_confirmed: true, recorded_at: AT }]), /unknown task/);
  assert.throws(() => assertTaskEvents([{ id: "x", task_id: "t", action: "task_opened", task_type: "chase", owner: "A", priority: "normal", actor: "A", human_confirmed: true, recorded_at: AT, smuggled: "value" }]), /field is not allowed: smuggled/);
});

test("deriveSourceTasks skips work another screen has already closed", () => {
  const page = {
    viewingFollowUpQueue: { rows: [{ viewing_id: "V-1", task: "feedback", task_status: "done" }, { viewing_id: "V-2", task: "feedback", task_status: "open" }] },
    sellerPipelineQueue: { rows: [{ seller_pipeline_id: "S-1", task: "call", task_status: "done" }] },
    publicRequestQueue: { rows: [{ request_id: "R-1", request_type: "language", status: "closed" }] },
    leadPipelineQueue: { rows: [{ lead_id: "L-1", status: "won" }] },
  };
  assert.deepEqual(deriveSourceTasks(page).map((row) => row.task_id), ["viewing:V-2:feedback"]);
});
