// Production serves the App Router admin adapter, never the Node server in
// http.mjs. These routes and this payload existed only in http.mjs, so in
// production the availability API, the week calendar, the approved-content
// review API and the saved-search alert dispatch all answered 405, and the
// settings screen rendered with its entire Security and Data section missing.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { readAuditLog } from "../lib/audit-log.mjs";
import { readBrokerAvailability, resetBrokerAvailability } from "../lib/broker-availability.mjs";
import { readSavedSearchAlertDeliveries } from "../lib/saved-search-alert-deliveries.mjs";
import { createAdminSessionOpened, appendAdminSessionEvent } from "../lib/admin-sessions.mjs";

const OPERATIONS_LEAD = {
  id: "operations_lead",
  source: "credential_registry",
  can_mutate: true,
  roles: ["admin"],
  capabilities: ["*"],
};

function workspace(overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-app-admin-b-"));
  const at = (name) => path.join(directory, name);
  for (const name of [
    "audit-log.jsonl",
    "viewings.jsonl",
    "viewing-follow-ups.jsonl",
    "saved-searches.jsonl",
    "saved-search-manage-events.jsonl",
    "saved-search-alert-deliveries.jsonl",
    "public-request-outcomes.jsonl",
    "admin-sessions.jsonl",
    "operator-two-factor.jsonl",
    "workspace-exports.jsonl",
  ]) {
    fs.writeFileSync(at(name), "");
  }
  resetBrokerAvailability(at("broker-availability.jsonl"));
  return {
    at,
    config: {
      ...appAdminConfigFromEnv(),
      adminPrincipal: OPERATIONS_LEAD,
      auditLogPath: at("audit-log.jsonl"),
      brokerAvailabilityLedgerPath: at("broker-availability.jsonl"),
      viewingLedgerPath: at("viewings.jsonl"),
      viewingFollowUpLedgerPath: at("viewing-follow-ups.jsonl"),
      savedSearchLedgerPath: at("saved-searches.jsonl"),
      savedSearchManageEventLedgerPath: at("saved-search-manage-events.jsonl"),
      savedSearchAlertDeliveryLedgerPath: at("saved-search-alert-deliveries.jsonl"),
      publicRequestOutcomeLedgerPath: at("public-request-outcomes.jsonl"),
      adminSessionLedgerPath: at("admin-sessions.jsonl"),
      operatorTwoFactorPath: at("operator-two-factor.jsonl"),
      workspaceExportLedgerPath: at("workspace-exports.jsonl"),
      brokerAvailabilityAt: "2026-08-23T09:00:00.000Z",
      reviewedAt: "2026-08-23T09:00:00.000Z",
      receivedAt: "2026-08-23T09:00:00.000Z",
      savedSearchAlertQueuedAt: "2026-08-23T09:00:00.000Z",
      ...overrides,
    },
  };
}

function adminGet(url, config, headers = {}) {
  return renderAppAdminResponse(new Request(`http://localhost${url}`, { headers: { accept: "application/json", ...headers } }), {
    config,
  });
}

function adminPost(url, body, config) {
  return renderAppAdminResponse(
    new Request(`http://localhost${url}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    }),
    { config },
  );
}

test("the admin adapter serves the approved-content review payload", async () => {
  const { config } = workspace();

  const review = await adminGet("/api/admin/approved-content", config);
  const body = await review.json();
  assert.equal(review.status, 200);
  // The shipped records are deliberately unapproved, so the payload's job is to
  // report why each one is withheld rather than to render it.
  assert.equal(typeof body, "object");
  assert.equal(body === null, false);
  assert.equal("kind" in body || "records" in body || "sections" in body, true);
});

test("the admin adapter records and reads a broker's week", async () => {
  const { config, at } = workspace();

  const empty = await adminGet("/api/admin/availability", config);
  const emptyBody = await empty.json();
  assert.equal(empty.status, 200);
  assert.equal(emptyBody.kind, "admin_broker_availability");
  assert.equal(typeof emptyBody.timezone, "string");
  assert.equal(Array.isArray(emptyBody.brokers), true);

  const recorded = await adminPost(
    "/api/admin/availability",
    {
      brokerId: "broker_en",
      timezone: "Europe/Sofia",
      weeklyHours: [{ weekday: 1, start: "09:00", end: "13:00" }],
    },
    config,
  );
  const recordedBody = await recorded.json();
  assert.equal(recorded.status, 201);
  assert.equal(recordedBody.kind, "admin_broker_availability_recorded");
  assert.equal(recordedBody.availability.broker_id, "broker_en");
  assert.equal(readBrokerAvailability(at("broker-availability.jsonl")).length, 1);

  // The change is accountable, and a repeat is idempotent rather than a second
  // row and a second audit entry.
  const audit = readAuditLog(at("audit-log.jsonl"));
  assert.equal(audit.filter((row) => row.action === "broker_availability_updated").length, 1);
  const again = await adminPost(
    "/api/admin/availability",
    {
      brokerId: "broker_en",
      timezone: "Europe/Sofia",
      weeklyHours: [{ weekday: 1, start: "09:00", end: "13:00" }],
    },
    config,
  );
  assert.equal(again.status, 200);
  assert.equal(readBrokerAvailability(at("broker-availability.jsonl")).length, 1);

  const filtered = await adminGet("/api/admin/availability?broker=broker_en", config);
  const filteredBody = await filtered.json();
  assert.deepEqual(
    filteredBody.history.map((row) => row.broker_id),
    ["broker_en"],
  );

  const badInput = await adminPost("/api/admin/availability", { brokerId: "broker_en", timezone: "Mars/Olympus" }, config);
  assert.equal(badInput.status, 400);

  const wrongMethod = await renderAppAdminResponse(
    new Request("http://localhost/api/admin/availability", { method: "DELETE", headers: { accept: "application/json" } }),
    { config },
  );
  assert.equal(wrongMethod.status, 405);
});

test("the admin adapter serves the viewing week calendar", async () => {
  const { config } = workspace();

  const week = await adminGet("/api/admin/viewings/week", config);
  const body = await week.json();
  assert.equal(week.status, 200);
  assert.equal(body.kind, "admin_viewing_week");
  assert.equal(typeof body.week, "object");
  assert.equal(body.week === null, false);

  const wrongMethod = await adminPost("/api/admin/viewings/week", {}, config);
  assert.equal(wrongMethod.status, 405);
});

test("the admin adapter can dispatch saved-search alerts", async () => {
  const { config, at } = workspace();

  const run = await adminPost("/api/admin/saved-search-alerts/run-due", {}, config);
  const body = await run.json();
  assert.equal(run.status, 201);
  assert.equal(body.kind, "saved_search_alert_run");
  // Stated explicitly: this route creates broker work, it never sends.
  assert.equal(body.delivered, 0);
  assert.equal(Array.isArray(body.queued), true);
  assert.equal(readSavedSearchAlertDeliveries(at("saved-search-alert-deliveries.jsonl")).length, body.queued.length);

  const wrongMethod = await adminGet("/api/admin/saved-search-alerts/run-due", config);
  assert.equal(wrongMethod.status, 405);

  const unconfigured = await adminPost("/api/admin/saved-search-alerts/run-due", {}, {
    ...config,
    savedSearchAlertDeliveryLedgerPath: null,
  });
  assert.equal(unconfigured.status, 503);
  assert.equal((await unconfigured.json()).kind, "saved_search_alert_storage_unavailable");
});

test("the settings payload carries the workspace security sections", async () => {
  const { config, at } = workspace();
  appendAdminSessionEvent(
    createAdminSessionOpened(
      {
        token: "app-admin-security-session-token-000001",
        operatorId: "operations_lead",
        source: "credential_registry",
        expiresAt: "2026-08-24T09:00:00.000Z",
        userAgent: "test",
      },
      "2026-08-23T09:00:00.000Z",
    ),
    { filePath: at("admin-sessions.jsonl") },
  );

  const settings = await adminGet("/api/admin/settings", config);
  const body = await settings.json();
  assert.equal(settings.status, 200);
  // The renderer shows 2FA enrolment, the session list, the export form and the
  // retention preview only when this is present.
  assert.notEqual(body.workspace_security, null);
  assert.equal(body.workspace_security.operator_id, "operations_lead");
  assert.notEqual(body.workspace_security.two_factor, null);
  assert.equal(body.workspace_security.two_factor.step_up_header, "x-ms-admin-2fa");
  assert.notEqual(body.workspace_security.sessions, null);
  assert.equal(body.workspace_security.sessions.rows.length, 1);
  assert.notEqual(body.workspace_security.exports, null);
  assert.equal(Array.isArray(body.workspace_security.exports.datasets), true);
  assert.notEqual(body.workspace_security.audit_retention, null);
  assert.equal(body.workspace_security.audit_retention.applied_on_read, false);

  // And the screen an operator actually opens carries the live controls, not
  // the "not connected" panel.
  const page = await renderAppAdminResponse(
    new Request("http://localhost/admin/settings", { headers: { accept: "text/html" } }),
    { config },
  );
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /data-settings-section="security"[^>]*data-settings-live="true"/);
  assert.match(html, /data-settings-section="data"[^>]*data-settings-live="true"/);
  assert.match(html, /data-two-factor-status="not_enrolled"/);
  assert.match(html, /data-export-form="true"/);
  assert.match(html, /action="\/api\/admin\/security\/two-factor\/enrol"/);
  // The prune command is shown, never offered as a button.
  assert.match(html, /npm run audit:retention -- --apply/);
});

test("without the workspace-security ledgers the settings sections stay absent", async () => {
  const { config } = workspace({
    adminSessionLedgerPath: null,
    operatorTwoFactorPath: null,
    workspaceExportLedgerPath: null,
  });

  const settings = await adminGet("/api/admin/settings", config);
  // Absent, not broken: that is what keeps the sections in their honest
  // "not connected" treatment instead of offering controls that would fail.
  assert.equal((await settings.json()).workspace_security, null);
});

test("a viewing follow-up is refused while the durable viewing store owns the viewing", async () => {
  const { config, at } = workspace({
    viewingDurableStore: { viewingDurableStoreEnabled: true },
  });

  const refused = await adminPost(
    "/api/admin/viewings/follow-up",
    { viewingId: "viewing-1", task: "call", action: "record", actor: "operations_lead" },
    config,
  );
  assert.equal(refused.status, 503);
  assert.equal((await refused.json()).kind, "viewing_follow_up_read_only");
  // Nothing was written: a file follow-up for a Postgres viewing would split
  // the viewing's state across two stores that never reconcile.
  assert.equal(fs.readFileSync(at("viewing-follow-ups.jsonl"), "utf8"), "");
});
