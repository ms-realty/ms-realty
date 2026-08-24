import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { LEAD_OPERATIONS } from "../lib/lead-ops-durable-store.mjs";

// Both runtimes get the same durable ledger, so every assertion below is really
// asserting that they behave identically once the store is switched on.
const WORKSPACE = "workspace-sandanski";
const TOKEN = "durable-ops-token-0123456789abcdef";
const CONTACT_SECRET = "durable-ops-contact-key-32-characters-min";

const AUTH_ENV = {
  NODE_ENV: "production",
  MS_REALTY_ADMIN_CREDENTIALS_JSON: JSON.stringify([{ id: "durable_ops_admin", token: TOKEN, roles: ["admin"] }]),
};
const DURABLE_ENV = {
  ...AUTH_ENV,
  MS_REALTY_RUNTIME_DATA_AUTHORITY: "payload",
  MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "true",
  MS_REALTY_LEAD_OPS_DURABLE_STORE_ENABLED: "true",
  PAYLOAD_SECRET: "p".repeat(40),
  DATABASE_URL: "postgres://payload:secret@db.example.test/ms_realty",
  MS_REALTY_LEAD_CONTACT_KEY: CONTACT_SECRET,
  MS_REALTY_WORKSPACE_ID: WORKSPACE,
};

// An in-memory stand-in for the lead_operations collection, injected into both
// runtimes in place of the Payload-backed reader and writer.
function durableOperationStore() {
  const rows = [];
  return {
    rows,
    rowsFor: (operation) => rows.filter((row) => row.operation === operation).map((row) => row.row),
    readOperations: async ({ operation, workspaceId }) => {
      assert.equal(workspaceId, WORKSPACE, "reads must be workspace-scoped");
      return rows.filter((row) => row.operation === operation && row.workspaceId === workspaceId).map((row) => row.row);
    },
    appendOperations: async ({ operation, row, workspaceId }) => {
      assert.equal(workspaceId, WORKSPACE, "writes must be workspace-scoped");
      const key = `${workspaceId}:${operation}:${row.id}`;
      const stored = rows.find((entry) => entry.key === key);
      if (stored) return { row: stored.row, idempotent: true };
      rows.push({ key, operation, workspaceId, row });
      return { row, idempotent: false };
    },
  };
}

const buyerLead = {
  lead_id: "durable-ops-buyer",
  source: "website_listing_detail",
  intent: "inquiry",
  lead_type: "buyer",
  listing_reference: "MS-OPS-1",
  original_language: "bg",
  admin_locale: "en",
  contact_preference: "email",
  received_at: "2026-08-25T08:00:00.000Z",
  assigned_broker: "broker_bg",
  assignment_method: "rules",
  sla_due_at: "2026-08-25T08:15:00.000Z",
  requirements: null,
  intake_completion: { complete: false, missing_fields: [], captured_fields: [] },
};

function tempPaths(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-lead-ops-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = (name) => {
    const target = path.join(directory, `${name}.jsonl`);
    fs.writeFileSync(target, "");
    return target;
  };
  return {
    directory,
    auditLogPath: file("audit"),
    leadSnoozeLedgerPath: file("lead-snoozes"),
    leadAssignmentLedgerPath: file("lead-assignments"),
    leadPipelineOutcomeLedgerPath: file("lead-pipeline-outcomes"),
    sellerPipelineOutcomeLedgerPath: file("seller-pipeline-outcomes"),
    dealLedgerPath: file("deals"),
    sellerPipelinePath: file("seller-pipeline"),
    viewingLedgerPath: file("viewings"),
    viewingFollowUpLedgerPath: file("viewing-follow-ups"),
    leadLedgerPath: file("leads"),
  };
}

const readAudit = (filePath) =>
  fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

function adapterConfig(store, paths, overrides = {}) {
  return {
    ...appAdminConfigFromEnv(DURABLE_ENV),
    ...paths,
    authEnv: AUTH_ENV,
    reviewedAt: "2026-08-25T09:00:00.000Z",
    leadSnoozeAt: "2026-08-25T09:00:00.000Z",
    readLeadIntakesDurably: async () => [buyerLead],
    readSellerPipelineItemsDurably: async () => [],
    readLeadOperationsDurably: store.readOperations,
    appendLeadOperationDurably: store.appendOperations,
    ...overrides,
  };
}

const adapterPost = (store, paths, pathname, body, overrides = {}) =>
  renderAppAdminResponse(
    new Request(`https://ms-realty.example${pathname}`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { config: adapterConfig(store, paths, overrides) },
  );

// http.mjs resolves its principal against process.env rather than a config
// value, so the standalone-server cases need the operator installed there.
const previousEnv = {};
before(() => {
  for (const key of ["NODE_ENV", "MS_REALTY_ADMIN_TOKEN", "MS_REALTY_ADMIN_ACTOR", "MS_REALTY_ADMIN_CREDENTIALS_JSON"]) {
    previousEnv[key] = process.env[key];
  }
  process.env.NODE_ENV = "production";
  delete process.env.MS_REALTY_ADMIN_TOKEN;
  delete process.env.MS_REALTY_ADMIN_ACTOR;
  process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([
    { id: "durable_ops_admin", token: TOKEN, roles: ["admin"] },
  ]);
});
after(() => {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function httpApp(store, paths, overrides = {}) {
  return createHttpApp({
    ...paths,
    runtimeDataDurableOnly: true,
    reviewedAt: "2026-08-25T09:00:00.000Z",
    leadSnoozeAt: "2026-08-25T09:00:00.000Z",
    leadDurableStore: {
      leadDurableStoreEnabled: true,
      payloadSecret: "p".repeat(40),
      databaseUrl: "postgres://payload:secret@db.example.test/ms_realty",
      contactSecret: CONTACT_SECRET,
      workspaceId: WORKSPACE,
    },
    leadOperationsDurableStore: {
      leadOperationsDurableStoreEnabled: true,
      payloadSecret: "p".repeat(40),
      databaseUrl: "postgres://payload:secret@db.example.test/ms_realty",
      workspaceId: WORKSPACE,
    },
    readLeadIntakes: async () => [buyerLead],
    readSellerPipelineItemsDurably: async () => [],
    readLeadOperationsDurably: store.readOperations,
    appendLeadOperationDurably: store.appendOperations,
    ...overrides,
  });
}

const httpPost = (app, pathname, body) =>
  dispatchHttp(app, {
    method: "POST",
    url: pathname,
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body,
  });

test("the adapter writes a snooze durably, reads it back, and leaves the file ledger untouched", async (t) => {
  const store = durableOperationStore();
  const paths = tempPaths(t);

  const snoozed = await adapterPost(store, paths, "/api/admin/leads/snooze", {
    leadId: buyerLead.lead_id,
    reason: "Buyer is travelling until September",
    until: "2026-09-10T09:00:00.000Z",
  });
  assert.equal(snoozed.status, 201);
  const body = await snoozed.json();
  assert.equal(body.kind, "lead_snooze");
  assert.equal(body.lead_id, buyerLead.lead_id);

  // The row is in Postgres, not on the disk that the container wipes.
  assert.deepEqual(
    store.rowsFor(LEAD_OPERATIONS.snooze).map((row) => [row.lead_id, row.action, row.until]),
    [[buyerLead.lead_id, "snooze", "2026-09-10T09:00:00.000Z"]],
  );
  assert.equal(fs.readFileSync(paths.leadSnoozeLedgerPath, "utf8"), "", "the file ledger must stay empty");

  // Every mutation still appends an audit entry.
  const audit = readAudit(paths.auditLogPath);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, "lead_snoozed");
  assert.equal(audit[0].metadata.lead_id, buyerLead.lead_id);

  // A retry is the same deferral, not a second one.
  const retry = await adapterPost(store, paths, "/api/admin/leads/snooze", {
    leadId: buyerLead.lead_id,
    reason: "Buyer is travelling until September",
    until: "2026-09-10T09:00:00.000Z",
  });
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).idempotent, true);
  assert.equal(store.rowsFor(LEAD_OPERATIONS.snooze).length, 1);
  assert.equal(readAudit(paths.auditLogPath).length, 1, "an idempotent retry must not double-audit");
});

test("a durable snooze survives the container and still reaches the inbox", async (t) => {
  const store = durableOperationStore();
  const paths = tempPaths(t);
  const snoozed = await adapterPost(store, paths, "/api/admin/leads/snooze", {
    leadId: buyerLead.lead_id,
    reason: "Buyer is travelling until September",
    until: "2026-09-10T09:00:00.000Z",
  });
  assert.equal(snoozed.status, 201);

  // A restart takes the disk with it; only Postgres survives. The inbox is
  // served from a runtime whose ledger files are empty, and the deferral the
  // adapter wrote is still the deferral the screen paints.
  const restarted = httpApp(store, tempPaths(t));
  const served = await dispatchHttp(restarted, {
    url: "/api/admin/leads",
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  assert.equal(served.status, 200);
  // The snooze reaches the screen through the SLA report, whose clock it defers.
  const slaRow = (served.body.leadSla || served.body.lead_sla).rows.find((row) => row.lead_id === buyerLead.lead_id);
  assert.ok(slaRow, "the lead must still be in the SLA report");
  assert.equal(slaRow.snooze.status, "active", "the durable snooze must be read back after the restart");
  assert.equal(slaRow.snooze.until, "2026-09-10T09:00:00.000Z");
  assert.equal(slaRow.snooze.reason, "Buyer is travelling until September");
});

test("the standalone server writes every migrated lead operation durably", async (t) => {
  const store = durableOperationStore();
  const paths = tempPaths(t);
  const app = httpApp(store, paths);

  const snoozed = await httpPost(app, "/api/admin/leads/snooze", {
    leadId: buyerLead.lead_id,
    reason: "Buyer is travelling until September",
    until: "2026-09-10T09:00:00.000Z",
  });
  assert.equal(snoozed.status, 201);
  assert.equal(snoozed.body.kind, "lead_snooze");

  const unsnoozed = await httpPost(app, "/api/admin/leads/unsnooze", {
    leadId: buyerLead.lead_id,
    reason: "Buyer came back early",
  });
  assert.equal(unsnoozed.status, 201);
  assert.equal(unsnoozed.body.kind, "lead_unsnooze");
  assert.deepEqual(
    store.rowsFor(LEAD_OPERATIONS.snooze).map((row) => row.action),
    ["snooze", "unsnooze"],
    "append order must be preserved so the open snooze resolves correctly",
  );

  const assigned = await httpPost(app, "/api/admin/leads/assign", {
    leadId: buyerLead.lead_id,
    brokerId: "broker_ru",
    reason: "Russian-speaking buyer",
    assignmentConfirmed: true,
  });
  assert.equal(assigned.status, 201);
  assert.equal(store.rowsFor(LEAD_OPERATIONS.assignment).length, 1);
  assert.equal(store.rowsFor(LEAD_OPERATIONS.assignment)[0].broker_id, "broker_ru");

  const qualified = await httpPost(app, "/api/admin/lead-pipeline/outcome", {
    leadId: buyerLead.lead_id,
    action: "qualify",
    budgetMaxEur: 120000,
    locations: "Sandanski",
    timeline: "Within three months",
  });
  assert.equal(qualified.status, 201);
  assert.equal(store.rowsFor(LEAD_OPERATIONS.leadPipelineOutcome).length, 1);
  assert.equal(store.rowsFor(LEAD_OPERATIONS.leadPipelineOutcome)[0].to_stage, "qualified");

  // Nothing reached the disk.
  for (const filePath of [
    paths.leadSnoozeLedgerPath,
    paths.leadAssignmentLedgerPath,
    paths.leadPipelineOutcomeLedgerPath,
  ]) {
    assert.equal(fs.readFileSync(filePath, "utf8"), "", `${path.basename(filePath)} must stay empty`);
  }
});

test("a durable pipeline outcome is read back into the pipeline queue", async (t) => {
  const store = durableOperationStore();
  const paths = tempPaths(t);
  const app = httpApp(store, paths);
  await httpPost(app, "/api/admin/lead-pipeline/outcome", {
    leadId: buyerLead.lead_id,
    action: "qualify",
    budgetMaxEur: 120000,
    locations: "Sandanski",
    timeline: "Within three months",
  });

  const restarted = httpApp(store, tempPaths(t));
  const pipeline = await dispatchHttp(restarted, {
    url: "/api/admin/pipeline",
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  assert.equal(pipeline.status, 200, "the pipeline read is exempt once its outcomes are durable");
  assert.match(JSON.stringify(pipeline.body), /qualified/, "the durable stage must reach the queue");
});

test("bulk actions fan out to the durable ledgers with one audit entry per enquiry", async (t) => {
  const store = durableOperationStore();
  const paths = tempPaths(t);

  const response = await adapterPost(store, paths, "/api/admin/leads/bulk", {
    action: "snooze",
    leadIds: [buyerLead.lead_id, "lead-that-does-not-exist"],
    reason: "Batch deferral while the office is closed",
    until: "2026-09-10T09:00:00.000Z",
    bulkConfirmed: true,
  });
  // One applied, one refused: a refusal on one enquiry never discards the rest.
  assert.equal(response.status, 207);
  const body = await response.json();
  assert.equal(body.kind, "lead_bulk_action");
  assert.equal(body.applied, 1);
  assert.equal(body.refused, 1);
  assert.equal(store.rowsFor(LEAD_OPERATIONS.snooze).length, 1);
  const audit = readAudit(paths.auditLogPath);
  assert.equal(audit.length, 1, "exactly one audit entry for the one enquiry that changed");
  assert.equal(audit[0].action, "lead_snoozed");
});

test("a closed deal is written durably and read back after a restart", async (t) => {
  const store = durableOperationStore();
  const paths = tempPaths(t);
  // A buyer only reaches a contract after a viewing happened, so seed the
  // viewing evidence the pipeline derives its stage from.
  // A buyer qualifies first, then views, then offers. The viewing evidence is
  // seeded between those steps so the journey runs in the order it really does.
  const beforeViewing = httpApp(store, paths, { leadPipelineOutcomeAt: "2026-08-25T09:00:00.000Z" });
  const qualified = await httpPost(beforeViewing, "/api/admin/lead-pipeline/outcome", {
    leadId: buyerLead.lead_id,
    action: "qualify",
    budgetMaxEur: 120000,
    locations: "Sandanski",
    timeline: "Within three months",
  });
  assert.equal(qualified.status, 201, "qualify must be accepted");

  fs.writeFileSync(
    paths.viewingLedgerPath,
    `${JSON.stringify({ id: "viewing-ops", lead_id: buyerLead.lead_id, booked_at: "2026-08-25T09:10:00.000Z", starts_at: "2026-08-25T09:15:00.000Z" })}\n`,
  );
  fs.writeFileSync(
    paths.viewingFollowUpLedgerPath,
    `${JSON.stringify({ id: "follow-up-ops", lead_id: buyerLead.lead_id, action: "complete", task: "follow_up", recorded_at: "2026-08-25T09:20:00.000Z" })}\n`,
  );

  const app = httpApp(store, paths, {
    leadPipelineOutcomeAt: "2026-08-25T09:30:00.000Z",
    dealClosedAt: "2026-08-25T10:00:00.000Z",
  });
  for (const step of [
    { action: "offer_submitted", offerAmountEur: 118000 },
    { action: "due_diligence_started" },
    { action: "contract_signed" },
  ]) {
    const response = await httpPost(app, "/api/admin/lead-pipeline/outcome", { leadId: buyerLead.lead_id, ...step });
    assert.equal(response.status, 201, `${step.action} must be accepted`);
  }
  assert.equal(store.rowsFor(LEAD_OPERATIONS.leadPipelineOutcome).length, 4);

  const closed = await httpPost(app, "/api/admin/deals/close", { leadId: buyerLead.lead_id });
  assert.equal(closed.status, 201);
  assert.equal(store.rowsFor(LEAD_OPERATIONS.deal).length, 1);
  assert.equal(store.rowsFor(LEAD_OPERATIONS.deal)[0].lead_id, buyerLead.lead_id);
  assert.equal(fs.readFileSync(paths.dealLedgerPath, "utf8"), "", "the deal file ledger must stay empty");

  // KNOWN GAP, asserted so a change is deliberate: the audit log is still
  // file-backed, and http.mjs's writeAudit is a no-op under the durable-only
  // authority. The adapter does append the entry (see the snooze case above);
  // this runtime will only match once the audit log itself becomes durable.
  assert.equal(readAudit(paths.auditLogPath).length, 0);

  // A retried close returns the original deal rather than creating a second.
  const retry = await httpPost(app, "/api/admin/deals/close", { leadId: buyerLead.lead_id });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.idempotent, true);
  assert.equal(store.rowsFor(LEAD_OPERATIONS.deal).length, 1);
});

test("the migrated routes are accepted and the unmigrated ones still fail closed", async (t) => {
  const store = durableOperationStore();
  const paths = tempPaths(t);
  const app = httpApp(store, paths);

  // Migrated: reaches its handler instead of the boundary.
  const snoozed = await httpPost(app, "/api/admin/leads/snooze", {
    leadId: buyerLead.lead_id,
    reason: "Buyer is travelling until September",
    until: "2026-09-10T09:00:00.000Z",
  });
  assert.equal(snoozed.status, 201);

  // Not migrated: still refused, and both runtimes state the same reason.
  for (const pathname of [
    "/api/admin/replies",
    "/api/admin/replies/draft",
    "/api/admin/accounts",
    "/api/admin/accounts/link",
    "/api/admin/documents/outcome",
    "/api/admin/consents/withdraw",
  ]) {
    const refused = await httpPost(app, pathname, { leadId: buyerLead.lead_id });
    assert.equal(refused.status, 503, `${pathname} must stay refused`);
    assert.equal(refused.body.kind, "lead_store_read_only", `${pathname} must state the lead-store reason`);

    const adapterRefused = await adapterPost(store, paths, pathname, { leadId: buyerLead.lead_id });
    assert.equal(adapterRefused.status, 503, `${pathname} must stay refused in the adapter too`);
    assert.equal(
      (await adapterRefused.json()).kind,
      "lead_store_read_only",
      `${pathname} must state the same reason in both runtimes`,
    );
  }
});

test("an operator-requested but unconfigured operations store fails closed instead of writing to disk", async (t) => {
  const store = durableOperationStore();
  const paths = tempPaths(t);
  const app = httpApp(store, paths, {
    // Enabled by the operator, but the workspace was never configured.
    leadOperationsDurableStore: {
      leadOperationsDurableStoreEnabled: true,
      payloadSecret: "p".repeat(40),
      databaseUrl: "postgres://payload:secret@db.example.test/ms_realty",
      workspaceId: "",
    },
  });
  const response = await httpPost(app, "/api/admin/leads/snooze", {
    leadId: buyerLead.lead_id,
    reason: "Buyer is travelling until September",
    until: "2026-09-10T09:00:00.000Z",
  });
  assert.notEqual(response.status, 201, "an incomplete configuration must never report success");
  assert.equal(store.rows.length, 0);
  assert.equal(fs.readFileSync(paths.leadSnoozeLedgerPath, "utf8"), "", "and must never silently use the file ledger");
});
