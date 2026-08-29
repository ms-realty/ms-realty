import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { LEAD_OPERATIONS } from "../lib/lead-ops-durable-store.mjs";
import { createSellerPipelineItem } from "../lib/seller-pipeline.mjs";

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
const DURABLE_VIEWING_STORE = {
  viewingDurableStoreEnabled: true,
  payloadSecret: "p".repeat(40),
  databaseUrl: "postgres://payload:secret@db.example.test/ms_realty",
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

function seedDurableOperation(store, operation, row) {
  store.rows.push({ key: `${WORKSPACE}:${operation}:${row.id}`, operation, workspaceId: WORKSPACE, row });
}

function durableConsentStore(seed = []) {
  const events = [...seed];
  return {
    events,
    readConsentEvents: async ({ workspaceId }) => {
      assert.equal(workspaceId, WORKSPACE, "consent reads must be workspace-scoped");
      return events.map((event) => event.payload);
    },
    appendConsentEvent: async ({ event, workspaceId }) => {
      assert.equal(workspaceId, WORKSPACE, "consent writes must be workspace-scoped");
      const stored = events.find((entry) => entry.event_id === event.event_id);
      if (stored) return { row: stored.payload, idempotent: true };
      events.push(event);
      return { row: event.payload, idempotent: false };
    },
  };
}

const grantedConsent = (leadId) => ({
  event_id: `consent-inquiry-follow-up:${leadId}`,
  workspace_id: WORKSPACE,
  lead_id: leadId,
  recorded_at: "2026-08-25T08:00:00.000Z",
  payload: {
    recorded_at: "2026-08-25T08:00:00.000Z",
    consent_type: "inquiry_follow_up",
    source: "website_listing_detail",
    subject_id: leadId,
    locale: "bg",
    contact_fingerprint: "fp-durable-ops",
    granted: true,
    legal_basis: "legitimate_interest",
    marketing_opt_in: false,
  },
});

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

const sellerLead = {
  lead_id: "durable-ops-seller",
  source: "website_seller_valuation",
  intent: "valuation",
  lead_type: "seller",
  listing_reference: "MS-OPS-SELLER-1",
  original_language: "bg",
  admin_locale: "en",
  contact_preference: "phone",
  received_at: "2026-08-25T08:05:00.000Z",
  assigned_broker: "broker_bg",
  assignment_method: "rules",
  sla_due_at: "2026-08-25T08:20:00.000Z",
  property: { location: "Sandanski", type: "apartment" },
  contact: { name: "Seller Durable", phone: "+359888000002" },
  intake_completion: { complete: false, missing_fields: [], captured_fields: [] },
};

const sellerPipelineSeed = createSellerPipelineItem(
  {
    lead: {
      id: sellerLead.lead_id,
      leadType: "seller",
      source: sellerLead.source,
      contact: sellerLead.contact,
      property: sellerLead.property,
    },
    original_language: sellerLead.original_language,
    admin_locale: sellerLead.admin_locale,
  },
  { createdAt: "2026-08-25T08:05:30.000Z", owner: "broker_bg" },
);

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
    consentLedgerPath: file("consent-ledger"),
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
    viewingDurableStore: DURABLE_VIEWING_STORE,
    readViewingsDurably: async () => [],
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
    brokerProfiles: [{ id: "broker_ru", languages: ["ru"] }],
    readSellerPipelineItemsDurably: async () => [],
    readLeadOperationsDurably: store.readOperations,
    appendLeadOperationDurably: store.appendOperations,
    viewingDurableStore: DURABLE_VIEWING_STORE,
    readViewingsDurably: async () => [],
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
  assert.equal(Object.hasOwn(served.body, "leadMatching"), false, "the restarted inbox must not fabricate inventory matching evidence");
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

test("a restarted durable inbox keeps assignments, viewings, deals, seller outcomes, and writable controls", async (t) => {
  const store = durableOperationStore();
  const persistedPaths = tempPaths(t);
  const durableViewings = [
    {
      id: "durable-viewing-1",
      lead_id: buyerLead.lead_id,
      listing_reference: buyerLead.listing_reference,
      broker: "broker_ru",
      status: "booked",
      booked_at: "2026-08-25T09:10:00.000Z",
      starts_at: "2026-08-25T09:15:00.000Z",
      original_language: "bg",
      admin_locale: "en",
    },
  ];
  seedDurableOperation(store, LEAD_OPERATIONS.assignment, {
    id: "assignment-restart-1",
    lead_id: buyerLead.lead_id,
    broker_id: "broker_ru",
    actor: "durable_ops_admin",
    reason: "Russian-speaking buyer",
    recorded_at: "2026-08-25T09:01:00.000Z",
  });
  seedDurableOperation(store, LEAD_OPERATIONS.snooze, {
    id: "snooze-restart-1",
    lead_id: buyerLead.lead_id,
    action: "snooze",
    reason: "Waiting for travel dates",
    until: "2026-09-10T09:00:00.000Z",
    actor: "durable_ops_admin",
    recorded_at: "2026-08-25T09:02:00.000Z",
  });
  seedDurableOperation(store, LEAD_OPERATIONS.leadPipelineOutcome, {
    id: "pipeline-restart-1",
    lead_id: buyerLead.lead_id,
    actor: "durable_ops_admin",
    action: "qualify",
    to_stage: "qualified",
    budget_max_eur: 120000,
    locations: ["Sandanski"],
    timeline: "Within three months",
    recorded_at: "2026-08-25T09:03:00.000Z",
  });
  seedDurableOperation(store, LEAD_OPERATIONS.deal, {
    id: "deal-restart-1",
    lead_id: buyerLead.lead_id,
    actor: "durable_ops_admin",
    closed_at: "2026-08-25T09:04:00.000Z",
    recorded_at: "2026-08-25T09:04:00.000Z",
  });
  seedDurableOperation(store, LEAD_OPERATIONS.sellerPipelineOutcome, {
    id: "seller-restart-1",
    seller_pipeline_id: sellerPipelineSeed.id,
    lead_id: sellerLead.lead_id,
    actor: "broker_bg",
    action: "callback_completed",
    note: "Seller confirmed valuation call.",
    recorded_at: "2026-08-25T09:05:00.000Z",
  });

  const restarted = httpApp(store, tempPaths(t), {
    readLeadIntakes: async () => [buyerLead, sellerLead],
    readSellerPipelineItemsDurably: async () => [sellerPipelineSeed],
    viewingDurableStore: {
      viewingDurableStoreEnabled: true,
      payloadSecret: "p".repeat(40),
      databaseUrl: "postgres://payload:secret@db.example.test/ms_realty",
    },
    readViewingsDurably: async () => durableViewings,
  });
  const served = await dispatchHttp(restarted, {
    url: "/api/admin/leads",
    headers: { authorization: `Bearer ${TOKEN}` },
  });

  assert.equal(served.status, 200);
  assert.equal(served.body.runtime_data_mode, "durable_only");
  assert.equal(served.body.leadOperations.snoozeWritable, true);
  assert.equal(served.body.leadOperations.bulkWritable, true);
  assert.equal(served.body.leadOperations.savedViewsWritable, false);
  const buyer = served.body.leads.find((lead) => lead.lead_id === buyerLead.lead_id);
  assert.equal(buyer.assigned_broker, "broker_ru");
  const slaRow = served.body.leadSla.rows.find((row) => row.lead_id === buyerLead.lead_id);
  assert.equal(slaRow.snooze.status, "active");
  assert.equal(served.body.viewings.length, 1);
  assert.equal(served.body.viewings[0].id, "durable-viewing-1");
  assert.equal(served.body.dataAvailability.replies.status, "unavailable");
  assert.equal(served.body.dataAvailability.communicationThreads.status, "unavailable");
  assert.equal(served.body.summary.replies, null);
  assert.equal(served.body.summary.communicationThreads, null);
  assert.equal(served.body.deals.length, 1);
  assert.equal(served.body.deals[0].lead_id, buyerLead.lead_id);
  assert.match(JSON.stringify(served.body.leadPipelineQueue.states), /closed/);
  const sellerQueueRow = served.body.sellerPipelineQueue.rows.find((row) => row.seller_pipeline_id === sellerPipelineSeed.id);
  assert.equal(sellerQueueRow.stage, "callback_completed");
  assert.equal(Object.hasOwn(served.body, "leadMatching"), false);

  const html = await dispatchHttp(restarted, {
    url: "/admin/leads?locale=en",
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  assert.equal(html.status, 200);
  assert.match(html.body, /data-unavailable-data="replies,communicationThreads,languageRequests,translationTasks,savedSearches,brokerContacts"/);
  assert.match(html.body, /Data connection required/);
  assert.doesNotMatch(html.body, /data-communication-thread-empty="true"/);
});

test("durable-only standalone admin reads fail closed when viewing storage is not configured", async (t) => {
  const app = httpApp(durableOperationStore(), tempPaths(t), {
    viewingDurableStore: { viewingDurableStoreEnabled: false },
  });
  const response = await dispatchHttp(app, {
    url: "/api/admin/leads",
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  assert.equal(response.status, 503);
  assert.equal(response.body.kind, "viewing_store_unavailable");
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

test("a durable deal row is read back after a restart without reviving file-era viewing evidence", async (t) => {
  const store = durableOperationStore();
  const paths = tempPaths(t);
  seedDurableOperation(store, LEAD_OPERATIONS.deal, {
    id: "deal-readback-1",
    lead_id: buyerLead.lead_id,
    actor: "durable_ops_admin",
    closed_at: "2026-08-25T10:00:00.000Z",
    recorded_at: "2026-08-25T10:00:00.000Z",
  });
  const restarted = httpApp(store, tempPaths(t));
  const response = await dispatchHttp(restarted, {
    url: "/api/admin/leads",
    headers: { authorization: `Bearer ${TOKEN}` },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.deals.length, 1);
  assert.equal(response.body.deals[0].lead_id, buyerLead.lead_id);
  assert.equal(fs.readFileSync(paths.dealLedgerPath, "utf8"), "", "the deal file ledger must stay empty");
  assert.equal(response.body.viewings.length, 0, "durable reads must not revive file-era viewing evidence");
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

test("durable lead inbox returns 503 when the operations store cannot be read after restart", async (t) => {
  const paths = tempPaths(t);
  const app = httpApp(durableOperationStore(), paths, {
    readLeadOperationsDurably: async () => {
      throw new Error("database unavailable");
    },
  });
  const response = await dispatchHttp(app, {
    url: "/api/admin/leads",
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  assert.equal(response.status, 503);
  assert.equal(response.body.kind, "lead_operation_store_unavailable");
});

test("both runtimes tell the inbox its leads came from the durable store", async (t) => {
  const store = durableOperationStore();
  const paths = tempPaths(t);

  // react-admin-site.mjs switches the reply controls on page.leadSourceDurable:
  // durable leads get the direct provider reply form, file-era leads get the
  // queue form. The adapter has always set it; the standalone server did not,
  // so it rendered the wrong form against durable leads.
  const served = await dispatchHttp(httpApp(store, paths), {
    url: "/api/admin/leads",
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  assert.equal(served.status, 200);
  assert.equal(served.body.leadSourceDurable, true);

  const fileBacked = await dispatchHttp(
    httpApp(store, tempPaths(t), {
      runtimeDataDurableOnly: false,
      leadDurableStore: { leadDurableStoreEnabled: false },
      leadOperationsDurableStore: { leadOperationsDurableStoreEnabled: false },
      viewingDurableStore: { viewingDurableStoreEnabled: false },
    }),
    { url: "/api/admin/leads", headers: { authorization: `Bearer ${TOKEN}` } },
  );
  assert.equal(fileBacked.status, 200);
  assert.equal(fileBacked.body.leadSourceDurable, false, "a file-backed runtime must say so");
});

test("a consent withdrawal is recorded durably and supersedes the grant intake stored", async (t) => {
  const store = durableOperationStore();
  const consents = durableConsentStore([grantedConsent(buyerLead.lead_id)]);
  const paths = tempPaths(t);
  const injected = {
    readConsentEventsDurably: consents.readConsentEvents,
    appendConsentEventDurably: consents.appendConsentEvent,
  };

  const withdrawn = await adapterPost(
    store,
    paths,
    "/api/admin/consents/withdraw",
    { consentType: "inquiry_follow_up", subjectId: buyerLead.lead_id, reasonCode: "customer_request", humanConfirmed: true },
    injected,
  );
  assert.equal(withdrawn.status, 201);
  const body = await withdrawn.json();
  assert.equal(body.record.granted, false);
  assert.equal(body.record.supersedes_recorded_at, "2026-08-25T08:00:00.000Z");

  // Appended, never rewritten: the grant is still there, outranked by the withdrawal.
  assert.equal(consents.events.length, 2);
  assert.equal(consents.events[0].payload.granted, true);
  assert.equal(consents.events[1].payload.granted, false);
  assert.equal(consents.events[1].lead_id, buyerLead.lead_id);
  assert.equal(fs.readFileSync(paths.directory + "/consent-ledger.jsonl", "utf8").length, 0);

  const audit = readAudit(paths.auditLogPath);
  assert.ok(audit.some((row) => row.action === "consent_withdrawn" && row.object_id === buyerLead.lead_id));

  // A retry finds the consent already withdrawn and adds nothing.
  const retry = await adapterPost(
    store,
    paths,
    "/api/admin/consents/withdraw",
    { consentType: "inquiry_follow_up", subjectId: buyerLead.lead_id, reasonCode: "customer_request", humanConfirmed: true },
    injected,
  );
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).idempotent, true);
  assert.equal(consents.events.length, 2);

  // The standalone server reads the same durable history back.
  const served = await httpPost(
    httpApp(store, tempPaths(t), injected),
    "/api/admin/consents/withdraw",
    { consentType: "inquiry_follow_up", subjectId: buyerLead.lead_id, reasonCode: "customer_request", humanConfirmed: true },
  );
  assert.equal(served.status, 200);
  assert.equal(served.body.idempotent, true, "the withdrawal written by the adapter must be visible here");
});
