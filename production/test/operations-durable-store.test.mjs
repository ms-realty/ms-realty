import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  automationConfirmation,
  completeTask,
  createAutomationRule,
  createTask,
  readAutomationRun,
  readAutomationRuns,
  readAutomationRules,
  readHermesRun,
  readHermesRunHistory,
  readTask,
  readTasks,
  runAutomationRule,
  updateAutomationRule,
  updateTask,
} from "../lib/operations-durable-store.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function matches(value, where) {
  if (!where || !Object.keys(where).length) return true;
  if (where.and) return where.and.every((clause) => matches(value, clause));
  return Object.entries(where).every(([key, rule]) => {
    if (rule?.equals !== undefined) return value[key] === rule.equals;
    if (rule?.in) return rule.in.includes(value[key]);
    return true;
  });
}

function fakePayload() {
  const rows = { tasks: [], automation_rules: [], automation_runs: [], automation_run_failures: [] };
  let nextId = 1;
  let snapshot = null;
  let transaction = 0;
  const calls = { create: [], update: [], find: [] };
  const payload = {
    rows,
    calls,
    db: {
      async beginTransaction() {
        snapshot = clone(rows);
        transaction += 1;
        return `tx-${transaction}`;
      },
      async commitTransaction() {
        snapshot = null;
      },
      async rollbackTransaction() {
        for (const collection of Object.keys(rows)) rows[collection] = clone(snapshot[collection]);
        snapshot = null;
      },
    },
    async find({ collection, where, sort, limit, req }) {
      calls.find.push({ collection, where, sort, limit, transactionID: req?.transactionID || null });
      let found = rows[collection].filter((row) => matches(row, where)).map(clone);
      const sortField = String(sort || "").replace(/^-/, "");
      const direction = String(sort || "").startsWith("-") ? -1 : 1;
      if (sortField) found.sort((left, right) => String(left[sortField] || "").localeCompare(String(right[sortField] || "")) * direction);
      return { docs: found.slice(0, limit || found.length) };
    },
    async create({ collection, data, req }) {
      assert.match(String(req?.transactionID || ""), /^tx-/);
      calls.create.push({ collection, data: clone(data), transactionID: req.transactionID });
      const document = { id: nextId++, ...clone(data) };
      rows[collection].push(document);
      return clone(document);
    },
    async update({ collection, id, data, req }) {
      assert.match(String(req?.transactionID || ""), /^tx-/);
      calls.update.push({ collection, id, data: clone(data), transactionID: req.transactionID });
      const document = rows[collection].find((row) => row.id === id);
      if (!document) throw new Error("missing document");
      Object.assign(document, clone(data));
      return clone(document);
    },
  };
  return payload;
}

const principal = { id: "payload-owner-1", roles: ["admin"] };
const workspaceId = "workspace-test";

test("tasks are durable, workspace-scoped, revision-guarded, and idempotent", async () => {
  const payload = fakePayload();
  const audit = [];
  const auditWriter = (entry) => audit.push(entry);
  const created = await createTask({
    payload,
    workspaceId,
    actor: principal.id,
    audit: auditWriter,
    input: {
      task_id: "task-lead-1",
      idempotency_key: "task-intent-1",
      title: "Review the lead queue",
      source_type: "lead",
      source_id: "lead-1",
      assignee_id: "broker-1",
      due_at: "2026-09-03T09:00:00.000Z",
      priority: "high",
    },
  });
  assert.equal(created.idempotent, false);
  assert.equal(created.task.source_type, "lead");
  assert.equal(audit[0].action, "task_created");
  const retry = await createTask({
    payload,
    workspaceId,
    actor: principal.id,
    audit: auditWriter,
    input: {
      task_id: "task-lead-1",
      idempotency_key: "task-intent-1",
      title: "Review the lead queue",
      source_type: "lead",
      source_id: "lead-1",
    },
  });
  assert.equal(retry.idempotent, true);
  await assert.rejects(
    createTask({
      payload,
      workspaceId,
      actor: principal.id,
      input: { task_id: "task-other", idempotency_key: "task-intent-1", title: "Conflicting task", source_type: "manual" },
    }),
    /idempotency key conflicts/,
  );
  const updated = await updateTask({ payload, workspaceId, actor: principal.id, audit: auditWriter, taskId: "task-lead-1", input: { expected_revision: 1, status: "in_progress" } });
  assert.equal(updated.task.status, "in_progress");
  await assert.rejects(updateTask({ payload, workspaceId, actor: principal.id, taskId: "task-lead-1", input: { expected_revision: 1, priority: "urgent" } }), /revision/);
  const completed = await completeTask({ payload, workspaceId, actor: principal.id, audit: auditWriter, taskId: "task-lead-1", recordedAt: "2026-09-03T10:00:00.000Z", input: { expected_revision: 2, completion_note: "Reviewed" } });
  assert.equal(completed.task.status, "completed");
  assert.equal(completed.task.completed_by, principal.id);
  assert.equal(audit.at(-1).action, "task_completed");
  assert.equal((await readTasks({ payload, workspaceId })).length, 1);
  await assert.rejects(readTask({ payload, workspaceId: "another-workspace", taskId: "task-lead-1" }), /not found/);
});

test("automation rules require owner confirmation and run only approved types", async () => {
  const payload = fakePayload();
  const audit = [];
  const disabled = await createAutomationRule({
    payload,
    workspaceId,
    actor: principal.id,
    principal,
    audit: (entry) => audit.push(entry),
    input: { rule_id: "rule-alerts", idempotency_key: "rule-intent-1", name: "Saved-search digest", rule_type: "saved_search_alerts", schedule: "hourly" },
  });
  assert.equal(disabled.rule.enabled, false);
  await assert.rejects(
    updateAutomationRule({ payload, workspaceId, actor: principal.id, principal, ruleId: "rule-alerts", input: { enabled: true } }),
    /Owner confirmation must exactly equal/,
  );
  const enabled = await updateAutomationRule({
    payload,
    workspaceId,
    actor: principal.id,
    principal,
    audit: (entry) => audit.push(entry),
    ruleId: "rule-alerts",
    input: { enabled: true, confirmation: automationConfirmation("enable", "rule-alerts") },
  });
  assert.equal(enabled.rule.enabled, true);
  let runnerCalls = 0;
  const run = await runAutomationRule({
    payload,
    workspaceId,
    actor: principal.id,
    principal,
    ruleId: "rule-alerts",
    audit: (entry) => audit.push(entry),
    recordedAt: "2026-09-03T11:00:00.000Z",
    input: { run_id: "run-alerts-1", idempotency_key: "run-intent-1", confirmation: automationConfirmation("run", "rule-alerts") },
    runner: async (rule) => {
      runnerCalls += 1;
      assert.equal(rule.rule_type, "saved_search_alerts");
      return { queued: 2, delivered: 0, url: "https://should-not-persist" };
    },
  });
  assert.equal(run.run.status, "succeeded");
  assert.equal(run.run.result_summary.queued, 2);
  assert.equal(run.run.result_summary.url, undefined);
  assert.equal(runnerCalls, 1);
  const retry = await runAutomationRule({
    payload,
    workspaceId,
    actor: principal.id,
    principal,
    ruleId: "rule-alerts",
    input: { run_id: "run-alerts-1", idempotency_key: "run-intent-1", confirmation: automationConfirmation("run", "rule-alerts") },
    runner: async () => {
      runnerCalls += 1;
      return { queued: 99 };
    },
  });
  assert.equal(retry.idempotent, true);
  assert.equal(runnerCalls, 1);
  await assert.rejects(
    runAutomationRule({
      payload,
      workspaceId,
      actor: principal.id,
      principal,
      ruleId: "rule-alerts",
      input: { run_id: "run-other", idempotency_key: "run-intent-1", confirmation: automationConfirmation("run", "rule-alerts") },
      runner: async () => ({ queued: 99 }),
    }),
    /idempotency key conflicts/,
  );
  const listed = await readAutomationRuns({ payload, workspaceId });
  assert.equal(listed.length, 1);
  const detail = await readAutomationRun({ payload, workspaceId, runId: "run-alerts-1" });
  assert.equal(detail.failures.length, 0);
  assert.ok(audit.some((entry) => entry.action === "automation_run_requested"));
  await assert.rejects(
    createAutomationRule({ payload, workspaceId, actor: principal.id, principal, input: { name: "Arbitrary", rule_type: "webhook", schedule: "manual" } }),
    /Unsupported automation rule type/,
  );
});

test("automation failures are durable and Hermes history remains read-only and redacted", async () => {
  const payload = fakePayload();
  const audit = [];
  await createAutomationRule({ payload, workspaceId, actor: principal.id, principal, input: { rule_id: "rule-publish", name: "Listing schedules", rule_type: "listing_publication_schedules", schedule: "daily" } });
  await updateAutomationRule({ payload, workspaceId, actor: principal.id, principal, ruleId: "rule-publish", input: { enabled: true, confirmation: automationConfirmation("enable", "rule-publish") } });
  const failed = await runAutomationRule({
    payload,
    workspaceId,
    actor: principal.id,
    principal,
    ruleId: "rule-publish",
    audit: (entry) => audit.push(entry),
    input: { run_id: "run-publish-1", confirmation: automationConfirmation("run", "rule-publish") },
    runner: async () => {
      throw Object.assign(new Error("listing schedule unavailable"), { code: "schedule_unavailable" });
    },
  });
  assert.equal(failed.run.status, "failed");
  assert.equal(failed.failure.failure_code, "schedule_unavailable");
  assert.equal((await readAutomationRun({ payload, workspaceId, runId: "run-publish-1" })).failures[0].message, "listing schedule unavailable");
  assert.ok(audit.some((entry) => entry.action === "automation_run_failed"));

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-hermes-runs-"));
  const auditPath = path.join(directory, "hermes-audit.jsonl");
  fs.writeFileSync(auditPath, `${JSON.stringify({
    recorded_at: "2026-09-03T12:00:00.000Z",
    task_id: "translation-task-1",
    object_type: "listing",
    object_id: "listing-1",
    source_locale: "bg",
    target_locale: "en",
    status: "hermes_drafted",
    provider_mode: "self_hosted",
    source_hash: "a".repeat(64),
    draft_hash: "b".repeat(64),
    has_output: true,
    public_indexable: false,
    human_approved: false,
    can_publish: false,
    can_mark_indexable: false,
  })}\n`);
  const history = await readHermesRunHistory({ auditPath });
  assert.equal(history[0].run_id, "translation-task-1");
  assert.equal(history[0].can_publish, false);
  assert.equal(history[0].source, "hermes-audit");
  assert.equal(Object.hasOwn(history[0], "prompt"), false);
  assert.equal((await readHermesRun({ auditPath, runId: "translation-task-1" })).task_id, "translation-task-1");
});

test("operations schema and Payload collections retain deterministic durable boundaries", async () => {
  const migration = fs.readFileSync(new URL("../../migrations/20260901_140000_operations_workspace.ts", import.meta.url), "utf8");
  for (const table of ["tasks", "automation_rules", "automation_runs", "automation_run_failures"]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS \\"${table}\\"`));
    assert.match(migration, new RegExp(`${table}_workspace_id_idx`));
  }
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS "tasks_workspace_idempotency_key_idx"/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS "automation_runs_workspace_idempotency_key_idx"/);
  assert.match(migration, /export async function down[\s\S]*void db/);
  const config = await (await import("../../payload.config.js")).default;
  for (const slug of ["tasks", "automation_rules", "automation_runs", "automation_run_failures"]) {
    const collection = config.collections.find((entry) => entry.slug === slug);
    assert.ok(collection, `${slug} must be registered in Payload`);
    assert.equal(collection.access.create({ req: { user: { role: "admin" } } }), false);
    assert.deepEqual(collection.access.read({ req: { user: { role: "broker", workspace_ids: [workspaceId] } } }), { workspace_id: { in: [workspaceId] } });
  }
});
