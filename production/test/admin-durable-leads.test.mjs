import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { importLeadLedgerJsonl } from "../lib/lead-ledger.mjs";
import { LEAD_OPERATIONS } from "../lib/lead-ops-durable-store.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { createPayloadDraftRuntime } from "./payload-draft-runtime.fixture.mjs";

const TOKEN = "durable-admin-read-token-0123456789abcdef";
const CONTACT_SECRET = "durable-admin-contact-key-32-characters-minimum";
const AUTH_ENV = {
  NODE_ENV: "production",
  MS_REALTY_ADMIN_CREDENTIALS_JSON: JSON.stringify([
    { id: "durable_admin", token: TOKEN, roles: ["admin"] },
  ]),
};
const DURABLE_ENV = {
  ...AUTH_ENV,
  MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "true",
  PAYLOAD_SECRET: "p".repeat(40),
  DATABASE_URL: "postgres://payload:secret@db.example.test/ms_realty",
  MS_REALTY_LEAD_CONTACT_KEY: CONTACT_SECRET,
  MS_REALTY_WORKSPACE_ID: "workspace-sandanski",
};
const HEADERS = { authorization: `Bearer ${TOKEN}` };
const PAYLOAD_DRAFT_RUNTIME = createPayloadDraftRuntime(loadCmsSeed()).payload;

const durableLead = {
  received_at: "2026-08-10T09:00:00.000Z",
  id: "inbox-durable-admin-lead",
  lead_id: "durable-admin-lead",
  source: "website_contact_callback",
  intent: "callback",
  lead_type: "buyer",
  listing_reference: "MS-CRAWL-0003",
  property: { location: "Sandanski", type: "apartment" },
  request_details: { callback_time: "Tomorrow" },
  requirements: {
    budget_min_eur: null,
    budget_max_eur: null,
    locations: ["Sandanski"],
    property_types: ["apartment"],
    bedrooms_min: null,
    timeline: null,
    finance_status: null,
  },
  intake_completion: { complete: false, missing_fields: ["budget_max_eur", "timeline"], captured_fields: ["locations"] },
  original_language: "bg",
  admin_locale: "en",
  show_original_available: true,
  contact_preference: "email",
  assigned_broker: "broker_bg",
  assignment_method: "rules",
  duplicate_status: "new_contact",
  sla_due_at: "2026-08-10T09:15:00.000Z",
  manager_escalation_due_at: "2026-08-10T10:00:00.000Z",
  contact: { name: "Durable Admin Lead", email: "durable-admin@example.invalid" },
  message_original: "Durable private message",
  contact_available: true,
};

function durableOperationReader(seed = {}) {
  return async ({ operation }) => seed[operation] || [];
}

function config(readLeadIntakesDurably, overrides = {}) {
  return {
    ...appAdminConfigFromEnv(DURABLE_ENV),
    authEnv: AUTH_ENV,
    reviewedAt: "2026-08-10T09:05:00.000Z",
    readLeadIntakesDurably,
    ...overrides,
  };
}

async function adminGet(pathname, routeConfig, headers = HEADERS) {
  return renderAppAdminResponse(new Request(`https://example.test${pathname}`, { headers }), { config: routeConfig });
}

test("durable admin leads are read only after authentication and never merged with fixtures", async () => {
  let reads = 0;
  const routeConfig = config(async (input) => {
    reads += 1;
    assert.equal(input.admin, true);
    assert.deepEqual(input.workspaceIds, ["workspace-sandanski"]);
    assert.equal(input.user.role, "admin");
    return [durableLead];
  });

  const unauthorized = await adminGet("/api/admin/leads", routeConfig, {});
  assert.equal(unauthorized.status, 401);
  assert.equal(reads, 0, "private contacts must not be opened before authentication");

  const response = await adminGet("/api/admin/leads", routeConfig);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(reads, 1);
  assert.deepEqual(body.leads.map((lead) => lead.lead_id), [durableLead.lead_id]);
  assert.deepEqual(body.leads[0].contact, durableLead.contact);
  assert.equal(body.replies.length, 0);
  assert.equal(body.viewings.length, 0);
  assert.equal(body.deals.length, 0);
  assert.equal(body.sellerPipeline.length, 0);
  assert.equal(body.leadPipelineQueue.states.length, 1);
  assert.equal(JSON.stringify(body).includes("lead-draft-62c8e259-c555-4583-a2c4-0a1b5be53731"), false);

  const today = await adminGet("/api/admin/today", routeConfig);
  const todayBody = await today.json();
  assert.equal(today.status, 200);
  assert.deepEqual(todayBody.leads.map((lead) => lead.lead_id), [durableLead.lead_id]);
  assert.equal(JSON.stringify(todayBody).includes("lead-draft-62c8e259-c555-4583-a2c4-0a1b5be53731"), false);

  const todayHtml = await adminGet("/admin/today?locale=en", routeConfig);
  const todayPage = await todayHtml.text();
  assert.equal(todayHtml.status, 200);
  assert.doesNotMatch(todayPage, /<code class="crm-mono adm-task-list__reference">durable-admin-lead<\/code>/);
  assert.match(todayPage, /data-next-actions="true"/);
});

test("durable admin leads keep durable viewings and writable lead actions when the durable stores are configured", async () => {
  const viewing = {
    id: "durable-admin-viewing-1",
    lead_id: durableLead.lead_id,
    listing_reference: durableLead.listing_reference,
    original_language: "bg",
    admin_locale: "en",
    broker: "durable_admin",
    starts_at: "2026-08-11T10:00:00.000Z",
    booked_at: "2026-08-10T09:10:00.000Z",
    channel: "property_viewing",
    status: "booked",
  };
  const routeConfig = config(async () => [durableLead], {
    leadOperationsDurableStore: {
      leadOperationsDurableStoreEnabled: true,
      payloadSecret: DURABLE_ENV.PAYLOAD_SECRET,
      databaseUrl: DURABLE_ENV.DATABASE_URL,
      workspaceId: DURABLE_ENV.MS_REALTY_WORKSPACE_ID,
    },
    readLeadOperationsDurably: async () => [],
    viewingDurableStore: {
      viewingDurableStoreEnabled: true,
      payloadSecret: DURABLE_ENV.PAYLOAD_SECRET,
      databaseUrl: DURABLE_ENV.DATABASE_URL,
      contactSecret: CONTACT_SECRET,
      workspaceId: DURABLE_ENV.MS_REALTY_WORKSPACE_ID,
    },
    readViewingsDurably: async () => [viewing],
    readViewingTripRequestsDurably: async () => [],
    readViewingTripContactsDurably: async () => new Map(),
    readSellerPipelineItemsDurably: async () => [],
  });

  const response = await adminGet("/api/admin/leads", routeConfig);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.viewings.map((row) => row.id), [viewing.id]);
  assert.equal(body.viewingFollowUpWritable, false);
  assert.equal(body.leadOperations.snoozeWritable, true);
  assert.equal(body.leadOperations.bulkWritable, true);
  assert.equal(body.leadMatching.summary.leads_with_matches >= 0, true);
});

test("broker durable reads use only the intersection of assigned and configured workspaces", async () => {
  const brokerToken = "durable-broker-read-token-0123456789abcdef";
  const brokerEnv = {
    NODE_ENV: "production",
    MS_REALTY_ADMIN_CREDENTIALS_JSON: JSON.stringify([
      {
        id: "durable_broker",
        token: brokerToken,
        roles: ["broker"],
        workspace_ids: ["workspace-sandanski", "workspace-other"],
      },
    ]),
  };
  let readInput;
  const allowedConfig = config(async (input) => {
    readInput = input;
    return [durableLead];
  }, { authEnv: brokerEnv });
  const allowed = await adminGet("/api/admin/leads", allowedConfig, { authorization: `Bearer ${brokerToken}` });
  assert.equal(allowed.status, 200);
  assert.equal(readInput.admin, false);
  assert.deepEqual(readInput.workspaceIds, ["workspace-sandanski"]);
  assert.equal(readInput.user.role, "broker");
  assert.deepEqual(readInput.user.workspace_ids, ["workspace-other", "workspace-sandanski"]);

  let forbiddenReads = 0;
  const forbiddenEnv = {
    NODE_ENV: "production",
    MS_REALTY_ADMIN_CREDENTIALS_JSON: JSON.stringify([
      {
        id: "foreign_broker",
        token: brokerToken,
        roles: ["broker"],
        workspace_ids: ["workspace-other"],
      },
    ]),
  };
  const forbiddenConfig = config(async () => {
    forbiddenReads += 1;
    return [durableLead];
  }, { authEnv: forbiddenEnv });
  const forbidden = await adminGet("/api/admin/leads", forbiddenConfig, { authorization: `Bearer ${brokerToken}` });
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).required_capability, "workspace:access");
  assert.equal(forbiddenReads, 0, "a foreign broker must be rejected before contact decryption starts");
});

test("every lead-backed admin read uses durable leads and filters file or SQLite fixtures", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-durable-admin-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const fixtureLeadId = "sqlite-only-admin-fixture";
  const sourcePath = path.join(directory, "fixture-source.jsonl");
  const leadLedgerPath = path.join(directory, "lead-ledger.jsonl");
  fs.writeFileSync(
    sourcePath,
    `${JSON.stringify({
      received_at: "2026-08-09T09:00:00.000Z",
      lead_id: fixtureLeadId,
      source: "sqlite_fixture_source",
      lead_type: "seller",
      original_language: "en",
      admin_locale: "en",
      sla_due_at: "2026-08-09T09:15:00.000Z",
      manager_escalation_due_at: "2026-08-09T10:00:00.000Z",
      contact: { name: "SQLite Fixture", email: "sqlite-fixture@example.invalid" },
    })}\n`,
  );
  importLeadLedgerJsonl(sourcePath, leadLedgerPath);
  fs.rmSync(leadLedgerPath);

  const sidecar = (name) => {
    const filePath = path.join(directory, `${name}.jsonl`);
    fs.writeFileSync(filePath, `${JSON.stringify({ lead_id: fixtureLeadId })}\n`);
    return filePath;
  };
  const routeConfig = config(async () => [durableLead], {
    leadLedgerPath,
    leadAssignmentLedgerPath: sidecar("lead-assignments"),
    replyOutboxPath: sidecar("reply-outbox"),
    replyDeliveryOutcomeLedgerPath: sidecar("reply-delivery-outcomes"),
    leadPipelineOutcomeLedgerPath: sidecar("lead-pipeline-outcomes"),
    viewingLedgerPath: sidecar("viewings"),
    viewingFollowUpLedgerPath: sidecar("viewing-follow-ups"),
    dealLedgerPath: sidecar("deals"),
    sellerPipelinePath: sidecar("seller-pipeline"),
    sellerPipelineOutcomeLedgerPath: sidecar("seller-pipeline-outcomes"),
    documentChecklistLedgerPath: sidecar("document-checklist-outcomes"),
    accountLedgerPath: sidecar("account-ledger"),
  });

  const root = await adminGet("/admin", routeConfig);
  assert.equal(root.status, 307);

  const contacts = await adminGet("/api/admin/contacts", routeConfig);
  const contactsBody = await contacts.json();
  assert.equal(contacts.status, 200);
  assert.deepEqual(contactsBody.contacts.map((contact) => contact.latest_lead_id), [durableLead.lead_id]);
  assert.deepEqual(contactsBody.accounts, []);

  const documents = await adminGet("/api/admin/documents", routeConfig);
  const documentsBody = await documents.json();
  assert.equal(documents.status, 200);
  assert.deepEqual(documentsBody.documentChecklistQueue.rows.map((row) => row.lead_id), [durableLead.lead_id]);

  const reports = await adminGet("/api/admin/reports", routeConfig);
  const reportsBody = await reports.json();
  assert.equal(reports.status, 200);
  assert.equal(reportsBody.report.summary.leads, 1);
  assert.deepEqual(reportsBody.report.lead_volume.by_source, [{ key: durableLead.source, count: 1 }]);

  const exported = await adminGet("/api/admin/reports/export", routeConfig);
  const exportedBody = await exported.text();
  assert.equal(exported.status, 200);
  assert.match(exportedBody, new RegExp(durableLead.source));
  assert.doesNotMatch(exportedBody, /sqlite_fixture_source/);

  for (const pathname of ["/admin/contacts", "/admin/documents", "/admin/reports"]) {
    const response = await adminGet(pathname, routeConfig);
    const body = await response.text();
    assert.equal(response.status, 200, pathname);
    assert.equal(body.includes(fixtureLeadId), false, pathname);
    assert.equal(body.includes("sqlite-fixture@example.invalid"), false, pathname);
  }
});

test("durable admin lead reads return 503 without falling back to JSONL", async () => {
  const routeConfig = config(async () => {
    throw new Error("Payload read failed");
  });

  for (const pathname of [
    "/api/admin/leads",
    "/api/admin/today",
    "/api/admin/contacts",
    "/api/admin/documents",
    "/api/admin/reports",
    "/api/admin/reports/export",
    "/admin/contacts",
    "/admin/documents",
    "/admin/reports",
  ]) {
    const response = await adminGet(pathname, routeConfig);
    assert.equal(response.status, 503, pathname);
    assert.equal((await response.json()).kind, "lead_store_unavailable");
  }
});

test("durable admin leads project durable assignments, snoozes, deals, and viewings in runtime-data durable mode", async () => {
  const routeConfig = config(async () => [durableLead], {
    runtimeDataDurableOnly: true,
    payloadListingRuntime: PAYLOAD_DRAFT_RUNTIME,
    leadOperationsDurableStore: {
      leadOperationsDurableStoreEnabled: true,
      payloadSecret: "p".repeat(40),
      databaseUrl: "postgres://payload:secret@db.example.test/ms_realty",
      workspaceId: "workspace-sandanski",
    },
    viewingDurableStore: {
      viewingDurableStoreEnabled: true,
      payloadSecret: "p".repeat(40),
      databaseUrl: "postgres://payload:secret@db.example.test/ms_realty",
    },
    readLeadOperationsDurably: durableOperationReader({
      [LEAD_OPERATIONS.assignment]: [
        {
          id: "assignment-1",
          lead_id: durableLead.lead_id,
          broker_id: "broker_ru",
          actor: "durable_admin",
          reason: "Russian-speaking buyer",
          recorded_at: "2026-08-10T09:01:00.000Z",
        },
      ],
      [LEAD_OPERATIONS.snooze]: [
        {
          id: "snooze-1",
          lead_id: durableLead.lead_id,
          action: "snooze",
          reason: "Waiting for travel dates",
          until: "2026-09-20T09:00:00.000Z",
          actor: "durable_admin",
          recorded_at: "2026-08-10T09:02:00.000Z",
        },
      ],
      [LEAD_OPERATIONS.leadPipelineOutcome]: [
        {
          id: "pipeline-1",
          lead_id: durableLead.lead_id,
          actor: "durable_admin",
          action: "qualify",
          to_stage: "qualified",
          recorded_at: "2026-08-10T09:03:00.000Z",
        },
      ],
      [LEAD_OPERATIONS.deal]: [
        {
          id: "deal-1",
          lead_id: durableLead.lead_id,
          actor: "durable_admin",
          closed_at: "2026-08-10T09:04:00.000Z",
          recorded_at: "2026-08-10T09:04:00.000Z",
        },
      ],
    }),
    readSellerPipelineItemsDurably: async () => [],
    readViewingsDurably: async () => [
      {
        id: "durable-viewing-1",
        lead_id: durableLead.lead_id,
        listing_reference: durableLead.listing_reference,
        broker: "broker_ru",
        status: "booked",
        booked_at: "2026-08-10T09:10:00.000Z",
        starts_at: "2026-08-10T09:30:00.000Z",
        original_language: "bg",
        admin_locale: "en",
      },
    ],
  });

  const response = await adminGet("/api/admin/leads", routeConfig);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.runtime_data_mode, "durable_only");
  assert.equal(body.leadOperations.snoozeWritable, true);
  assert.equal(body.leadOperations.bulkWritable, true);
  assert.equal(body.leadOperations.savedViewsWritable, false);
  assert.equal(body.leads[0].assigned_broker, "broker_ru");
  assert.equal(body.leadSla.rows[0].snooze.status, "active");
  assert.match(JSON.stringify(body.leadPipelineQueue.states), /closed/);
  assert.equal(body.deals.length, 1);
  assert.equal(body.deals[0].lead_id, durableLead.lead_id);
  assert.equal(body.viewings.length, 1);
  assert.equal(body.viewings[0].id, "durable-viewing-1");
  assert.deepEqual(
    Object.fromEntries(Object.entries(body.dataAvailability).map(([key, value]) => [key, value.status])),
    {
      replies: "unavailable",
      communicationThreads: "unavailable",
      languageRequests: "unavailable",
      translationTasks: "unavailable",
      savedSearches: "unavailable",
      brokerContacts: "unavailable",
    },
  );
  assert.equal(body.summary.replies, null);
  assert.equal(body.summary.repliesQueued, null);
  assert.equal(body.summary.communicationThreads, null);
  assert.equal(body.summary.languageRequests, null);
  assert.equal(body.summary.savedSearches, null);
  assert.equal(body.summary.publicRequestsOpen, null);

  const htmlResponse = await adminGet("/admin/leads?locale=en", routeConfig);
  const html = await htmlResponse.text();
  assert.equal(htmlResponse.status, 200);
  assert.match(html, /data-unavailable-data="replies,communicationThreads,languageRequests,translationTasks,savedSearches,brokerContacts"/);
  assert.match(html, /Data connection required/);
  assert.doesNotMatch(html, /data-communication-thread-empty="true"/);
});

test("durable-only Next admin reads fail closed when viewing storage is not configured", async () => {
  const routeConfig = config(async () => [durableLead], {
    runtimeDataDurableOnly: true,
    payloadListingRuntime: PAYLOAD_DRAFT_RUNTIME,
  });
  const response = await adminGet("/api/admin/leads", routeConfig);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).kind, "viewing_store_unavailable");
});

test("durable admin lead reads return 503 when durable lead operations cannot be read", async () => {
  const routeConfig = config(async () => [durableLead], {
    runtimeDataDurableOnly: true,
    payloadListingRuntime: PAYLOAD_DRAFT_RUNTIME,
    leadOperationsDurableStore: {
      leadOperationsDurableStoreEnabled: true,
      payloadSecret: "p".repeat(40),
      databaseUrl: "postgres://payload:secret@db.example.test/ms_realty",
      workspaceId: "workspace-sandanski",
    },
    viewingDurableStore: {
      viewingDurableStoreEnabled: true,
      payloadSecret: "p".repeat(40),
      databaseUrl: "postgres://payload:secret@db.example.test/ms_realty",
    },
    readViewingsDurably: async () => [],
    readLeadOperationsDurably: async () => {
      throw new Error("database unavailable");
    },
    readSellerPipelineItemsDurably: async () => [],
  });

  const response = await adminGet("/api/admin/leads", routeConfig);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).kind, "lead_operation_store_unavailable");
});

test("durable admin lead reads do not collapse provider connection store failures into disconnected state", async () => {
  const routeConfig = config(async () => [durableLead], {
    providerConnection: {
      publicOrigin: "https://ms-realty.example",
      credentialSecret: "provider-credential-secret-32-characters",
      stateSecret: "provider-oauth-state-secret-32-characters",
      payloadSecret: "p".repeat(40),
      databaseUrl: "postgres://payload:secret@db.example.test/ms_realty",
      googleClientId: "google-client-id",
      googleClientSecret: "google-client-secret",
    },
    readProviderConnections: async () => {
      throw new Error("provider connection store unavailable");
    },
  });

  const response = await adminGet("/api/admin/leads", routeConfig);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).kind, "provider_connection_unavailable");
});

test("durable mode rejects admin mutations that only persist to local lead files", async () => {
  const routeConfig = config(async () => [durableLead]);
  const paths = [
    "/api/admin/replies",
    "/api/admin/replies/delivery",
    "/api/admin/lead-pipeline/outcome",
    "/api/admin/leads",
    "/api/admin/leads/assign",
    "/api/admin/accounts",
    "/api/admin/accounts/link",
    "/api/admin/documents/outcome",
    "/api/admin/consents/withdraw",
    "/api/admin/replies/draft",
    "/api/admin/viewings",
    "/api/admin/viewings/follow-up",
    "/api/admin/seller-pipeline/outcome",
    "/api/admin/deals/close",
  ];

  for (const pathname of paths) {
    const response = await renderAppAdminResponse(
      new Request(`https://example.test${pathname}`, {
        method: "POST",
        headers: { ...HEADERS, "content-type": "application/json" },
        body: "{}",
      }),
      { config: routeConfig },
    );
    assert.equal(response.status, 503, pathname);
    assert.equal((await response.json()).kind, "lead_store_read_only", pathname);
  }
});

test("owner reports read durable funnel events and never fall back to the container ledger", async () => {
  const routeConfig = config(async () => [durableLead], {
    eventDurableStore: {
      eventDurableStoreEnabled: true,
      payloadSecret: "p".repeat(32),
      databaseUrl: "postgres://payload:secret@db.example.test/ms_realty",
    },
    readEventsDurably: async () => [
      { recorded_at: "2026-08-10T09:00:00.000Z", type: "page_view", path: "/bg/", locale: "bg", filters: {} },
      { recorded_at: "2026-08-10T09:01:00.000Z", type: "cta_click", path: "/bg/imoti/one", locale: "bg", action: "inquiry", filters: {} },
    ],
  });

  const response = await adminGet("/api/admin/reports", routeConfig);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.report.website_funnel.stages, [
    { key: "page_view", count: 1 },
    { key: "search", count: 0 },
    { key: "cta_click", count: 1 },
    { key: "lead", count: 0 },
  ]);
  assert.equal(body.report.website_funnel.lead_conversion_pct, 0);
  assert.equal(body.report.website_funnel.durable_website_leads, 1);
  assert.equal(body.report.website_funnel.lead_tracking_gap, 1);
  assert.equal(body.report.website_funnel.lead_tracking_status, "mismatch");

  const today = await adminGet("/admin/today?locale=en", routeConfig);
  const todayHtml = await today.text();
  assert.equal(today.status, 200);
  assert.match(todayHtml, /data-today-primary-action="integrity"/);
  assert.match(todayHtml, /Website submissions do not match CRM/);
  assert.match(todayHtml, /Durable CRM leads without a submission event: 1\./);
  assert.match(todayHtml, /href="\/admin\/reports#website-funnel"/);

  const unavailable = await adminGet("/api/admin/reports", {
    ...routeConfig,
    readEventsDurably: async () => {
      throw new Error("database unavailable");
    },
  });
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).kind, "event_store_unavailable");

  const degradedToday = await adminGet("/api/admin/today", {
    ...routeConfig,
    readEventsDurably: async () => {
      throw new Error("database unavailable");
    },
  });
  const degradedTodayBody = await degradedToday.json();
  assert.equal(degradedToday.status, 200);
  assert.equal(degradedTodayBody.website_funnel.lead_tracking_status, "unavailable");
});
