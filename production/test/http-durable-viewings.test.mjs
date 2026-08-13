import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { ViewingConflictError, ViewingStoreUnavailableError } from "../lib/viewing-durable-store.mjs";

const SESSION_TOKEN = "payload.viewings.session";

function payloadAdminAuth() {
  return {
    async resolve(token) {
      return token === SESSION_TOKEN
        ? {
            principal: {
              id: "payload-viewing-admin",
              source: "payload_session",
              can_mutate: true,
              roles: ["admin"],
              workspace_ids: ["sandanski"],
            },
            user: { id: 1 },
          }
        : null;
    },
  };
}

function sessionHeaders() {
  return {
    cookie: `ms_admin=${SESSION_TOKEN}`,
    host: "ms-realty.example",
    origin: "https://ms-realty.example",
    "sec-fetch-site": "same-origin",
    "content-type": "application/json",
  };
}

function jsonlFile(directory, name, rows = []) {
  const filePath = path.join(directory, `${name}.jsonl`);
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
  return filePath;
}

function fixture(t, { legacyViewings = [] } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-http-durable-viewings-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return {
    leadLedgerPath: jsonlFile(directory, "leads"),
    leadAssignmentLedgerPath: jsonlFile(directory, "lead-assignments"),
    leadPipelineOutcomeLedgerPath: jsonlFile(directory, "lead-pipeline-outcomes"),
    viewingLedgerPath: jsonlFile(directory, "viewings", legacyViewings),
    viewingFollowUpLedgerPath: jsonlFile(directory, "viewing-follow-ups"),
    dealLedgerPath: jsonlFile(directory, "deals"),
    sellerPipelinePath: jsonlFile(directory, "seller-pipeline"),
    sellerPipelineOutcomeLedgerPath: jsonlFile(directory, "seller-pipeline-outcomes"),
    replyOutboxPath: jsonlFile(directory, "replies"),
    replyDeliveryOutcomeLedgerPath: jsonlFile(directory, "reply-delivery"),
    savedSearchLedgerPath: jsonlFile(directory, "saved-searches"),
    languageRequestPath: jsonlFile(directory, "language-requests"),
    publicRequestOutcomeLedgerPath: jsonlFile(directory, "public-request-outcomes"),
    translationLedgerPath: jsonlFile(directory, "translations"),
    auditLogPath: jsonlFile(directory, "audit"),
  };
}

function durableLead(overrides = {}) {
  return {
    lead_id: "lead-durable-viewing",
    source: "website_listing_detail",
    lead_type: "seller",
    received_at: "2026-08-13T10:00:00.000Z",
    original_language: "bg",
    admin_locale: "bg",
    listing_reference: "MS-DURABLE-99",
    contact_preference: "email",
    ...overrides,
  };
}

function legacyViewing() {
  return {
    id: "legacy-file-viewing",
    lead_id: "legacy-file-lead",
    listing_reference: "MS-FILE-ONLY",
    original_language: "en",
    admin_locale: "en",
    broker: "legacy-broker",
    starts_at: "2026-08-22T09:00:00.000Z",
    booked_at: "2026-08-13T08:00:00.000Z",
    channel: "property_viewing",
    status: "booked",
    follow_up_task: {
      id: "task-legacy-file-viewing",
      owner: "legacy-broker",
      status: "open",
      due_at: "2026-08-22T09:30:00.000Z",
    },
    feedback_request: {
      id: "feedback-legacy-file-viewing",
      owner: "legacy-broker",
      status: "open",
      due_at: "2026-08-22T11:00:00.000Z",
      channel: "email",
    },
  };
}

test("standalone durable viewing booking uses durable leads, persists calendar receipt, and powers viewings surfaces", async (t) => {
  const paths = fixture(t, { legacyViewings: [legacyViewing()] });
  const durableRows = [];
  const calendarReceipts = [];
  const app = createHttpApp({
    ...paths,
    payloadAdminAuth: payloadAdminAuth(),
    bookedAt: "2026-08-13T12:00:00.000Z",
    leadDurableStore: {
      leadDurableStoreEnabled: true,
      payloadSecret: "payload-secret-for-test",
      databaseUrl: "postgres://test.invalid/ms_realty",
      contactSecret: "lead-contact-secret-longer-than-thirty-two-characters",
    },
    readLeadIntakesDurably: async () => [durableLead()],
    viewingDurableStore: {
      viewingDurableStoreEnabled: true,
      payloadSecret: "payload-secret-for-test",
      databaseUrl: "postgres://test.invalid/ms_realty",
    },
    readViewingsDurably: async () => durableRows,
    persistViewingDurably: async (viewing) => {
      durableRows.push({ ...viewing, durable: true });
      return { ...viewing, durable: true };
    },
    syncViewingToGoogleCalendar: async () => ({
      status: "synced",
      provider: "google",
      calendar_event_id: "msr-calendar-viewing",
    }),
    recordViewingCalendarSync: async (viewingId, result) => {
      calendarReceipts.push({ viewingId, ...result });
      return { ...result, recorded_at: "2026-08-13T12:00:00.000Z" };
    },
  });

  const created = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/viewings",
    headers: sessionHeaders(),
    body: {
      leadId: "lead-durable-viewing",
      startsAt: "2026-08-20T10:00:00.000Z",
    },
  });

  assert.equal(created.status, 201);
  assert.equal(created.body.durable, true);
  assert.equal(created.body.broker, "payload-viewing-admin");
  assert.equal(created.body.listing_reference, "MS-DURABLE-99");
  assert.deepEqual(created.body.calendar_sync, {
    status: "synced",
    provider: "google",
    calendar_event_id: "msr-calendar-viewing",
    recorded_at: "2026-08-13T12:00:00.000Z",
  });
  assert.deepEqual(calendarReceipts, [
    {
      viewingId: created.body.id,
      status: "synced",
      provider: "google",
      calendar_event_id: "msr-calendar-viewing",
    },
  ]);
  assert.equal(durableRows.length, 1);

  const followUp = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/viewings/follow-up",
    headers: sessionHeaders(),
    body: { viewingId: created.body.id, action: "complete" },
  });
  assert.equal(followUp.status, 503);
  assert.equal(followUp.body.kind, "viewing_follow_up_read_only");
  assert.equal(fs.readFileSync(paths.viewingFollowUpLedgerPath, "utf8"), "");

  const viewings = await dispatchHttp(app, {
    url: "/api/admin/viewings",
    headers: sessionHeaders(),
  });
  assert.equal(viewings.status, 200);
  assert.equal(viewings.body.kind, "admin_viewings");
  assert.equal(viewings.body.summary.viewings, 1);
  assert.equal(viewings.body.viewingFollowUpWritable, false);
  assert.equal(viewings.body.viewings[0].id, created.body.id);
  assert.equal(viewings.body.viewings[0].listing_reference, "MS-DURABLE-99");

  durableRows.push({
    ...legacyViewing(),
    id: "durable-other-broker-viewing",
    lead_id: "lead-not-visible-to-session",
    listing_reference: "MS-DURABLE-HIDDEN",
    durable: true,
  });

  const calendar = await dispatchHttp(app, {
    url: "/api/admin/viewings.ics",
    headers: sessionHeaders(),
  });
  assert.equal(calendar.status, 200);
  assert.match(calendar.body, /MS Realty viewing MS-DURABLE-99/);
  assert.doesNotMatch(calendar.body, /MS Realty viewing MS-FILE-ONLY/);
  assert.doesNotMatch(calendar.body, /MS Realty viewing MS-DURABLE-HIDDEN/);

  const reports = await dispatchHttp(app, {
    url: "/api/admin/reports",
    headers: sessionHeaders(),
  });
  assert.equal(reports.status, 200);
  const sourceRow = reports.body.report.source_quality.find((row) => row.source === "website_listing_detail");
  assert.equal(sourceRow.viewing_leads, 1);
});

test("standalone durable viewings map booking conflicts to 409", async (t) => {
  const paths = fixture(t);
  const app = createHttpApp({
    ...paths,
    payloadAdminAuth: payloadAdminAuth(),
    bookedAt: "2026-08-13T12:00:00.000Z",
    leadDurableStore: {
      leadDurableStoreEnabled: true,
      payloadSecret: "payload-secret-for-test",
      databaseUrl: "postgres://test.invalid/ms_realty",
      contactSecret: "lead-contact-secret-longer-than-thirty-two-characters",
    },
    readLeadIntakesDurably: async () => [durableLead()],
    viewingDurableStore: {
      viewingDurableStoreEnabled: true,
      payloadSecret: "payload-secret-for-test",
      databaseUrl: "postgres://test.invalid/ms_realty",
    },
    readViewingsDurably: async () => [],
    persistViewingDurably: async () => {
      throw new ViewingConflictError();
    },
  });

  const response = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/viewings",
    headers: sessionHeaders(),
    body: {
      leadId: "lead-durable-viewing",
      startsAt: "2026-08-20T10:00:00.000Z",
    },
  });

  assert.equal(response.status, 409);
  assert.equal(response.body.kind, "viewing_conflict");
});

test("standalone durable viewings fail closed when enabled but incomplete or unavailable", async (t) => {
  await t.test("enabled but incomplete configuration does not fall back to the file ledger", async (subtest) => {
    const paths = fixture(subtest, { legacyViewings: [legacyViewing()] });
    const app = createHttpApp({
      ...paths,
      payloadAdminAuth: payloadAdminAuth(),
      viewingDurableStore: {
        viewingDurableStoreEnabled: true,
        payloadSecret: "",
        databaseUrl: "",
      },
    });
    const response = await dispatchHttp(app, {
      url: "/api/admin/viewings.ics",
      headers: sessionHeaders(),
    });
    assert.equal(response.status, 503);
    assert.equal(response.body.kind, "viewing_store_unavailable");
  });

  await t.test("runtime unavailability returns 503 on admin viewings surfaces", async (subtest) => {
    const paths = fixture(subtest);
    const app = createHttpApp({
      ...paths,
      payloadAdminAuth: payloadAdminAuth(),
      viewingDurableStore: {
        viewingDurableStoreEnabled: true,
        payloadSecret: "payload-secret-for-test",
        databaseUrl: "postgres://test.invalid/ms_realty",
      },
      readViewingsDurably: async () => {
        throw new ViewingStoreUnavailableError("read failed");
      },
    });
    const response = await dispatchHttp(app, {
      url: "/api/admin/viewings",
      headers: sessionHeaders(),
    });
    assert.equal(response.status, 503);
    assert.equal(response.body.kind, "viewing_store_unavailable");
  });
});
