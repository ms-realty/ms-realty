import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { readAuditLog } from "../lib/audit-log.mjs";
import { appendLead, readLeadLedger, resetLeadLedger } from "../lib/lead-ledger.mjs";
import { buildLeadSlaReport } from "../lib/lead-sla.mjs";
import {
  activeLeadSnooze,
  appendLeadSnooze,
  assertLeadSnoozes,
  createLeadSnooze,
  createLeadUnsnooze,
  deriveLeadSnoozeStates,
  readLeadSnoozes,
  resetLeadSnoozes,
} from "../lib/lead-snoozes.mjs";

// A broker defers one enquiry to a chosen moment. The SLA clock DEFERS with
// it: the reminder and the manager escalation skip the snoozed window instead
// of restarting, so a snoozed enquiry can never silently lose its escalation.

const AUTH = { authorization: "Bearer local-admin-smoke" };
const RECEIVED_AT = "2026-07-04T00:00:00.000Z";
const NOW = "2026-07-04T00:05:00.000Z";

function tempFile(prefix) {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-${prefix}-`)}/${prefix}.jsonl`;
  fs.writeFileSync(file, "");
  return file;
}

function leadFixture(id, leadType = "renter") {
  return {
    id: `inbox-${id}`,
    lead: {
      id,
      source: "website_listing_detail",
      intent: "inquiry",
      leadType,
      contact: { name: "Test Person", email: "test@example.com" },
      intake: { complete: true, missing_fields: [], captured_fields: [] },
    },
    original_language: "en",
    admin_locale: "en",
    contact_preference: "email",
    hermes_reply_draft: { broker_approval_required: true },
    confirmation: { status: "ready", message_key: "lead_received" },
    broker_assignment: { broker_id: "broker_international", method: "rules" },
  };
}

function workspace() {
  const leadLedgerPath = tempFile("snooze-leads");
  const leadSnoozeLedgerPath = tempFile("snooze-ledger");
  const auditLogPath = tempFile("snooze-audit");
  resetLeadLedger(leadLedgerPath);
  resetLeadSnoozes(leadSnoozeLedgerPath);
  appendLead(leadFixture("lead-snooze-1"), { filePath: leadLedgerPath, receivedAt: RECEIVED_AT });
  appendLead(leadFixture("lead-snooze-2", "seller"), { filePath: leadLedgerPath, receivedAt: RECEIVED_AT });
  const app = createHttpApp({
    leadDurableStore: { leadDurableStoreEnabled: false },
    leadLedgerPath,
    leadSnoozeLedgerPath,
    auditLogPath,
    receivedAt: RECEIVED_AT,
    reviewedAt: NOW,
    leadSnoozeAt: NOW,
    leadSlaGeneratedAt: NOW,
  });
  return { app, leadLedgerPath, leadSnoozeLedgerPath, auditLogPath };
}

function post(app, url, body, headers = AUTH) {
  return dispatchHttp(app, { url, method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) });
}

test("a snooze defers both SLA clocks by its window instead of restarting them", () => {
  const leads = readLeadLedger(tempFile("noop")) ;
  const lead = { lead_id: "lead-1", source: "website_listing_detail", assigned_broker: "broker_en", sla_due_at: "2026-07-04T00:15:00.000Z", manager_escalation_due_at: "2026-07-04T01:00:00.000Z" };
  const snoozes = [
    {
      id: "lead-snooze-lead-1",
      lead_id: "lead-1",
      action: "snooze",
      actor: "operations_lead",
      reason: "Waiting for the bank valuation.",
      until: "2026-07-06T00:00:00.000Z",
      snooze_id: null,
      recorded_at: "2026-07-04T00:00:00.000Z",
      human_confirmed: true,
    },
  ];
  assert.equal(leads.length, 0);
  const report = buildLeadSlaReport({ leads: [lead], replies: [], replyDeliveryStates: [], snoozes, generatedAt: "2026-07-04T02:00:00.000Z" });
  const row = report.rows[0];
  // The window is two days, so both clocks move out by exactly two days.
  assert.equal(row.original_sla_due_at, "2026-07-04T00:15:00.000Z");
  assert.equal(row.sla_due_at, "2026-07-06T00:15:00.000Z");
  assert.equal(row.original_manager_escalation_due_at, "2026-07-04T01:00:00.000Z");
  assert.equal(row.manager_escalation_due_at, "2026-07-06T01:00:00.000Z");
  // Without the deferral this lead would already be escalated.
  assert.equal(row.status, "pending");
  assert.equal(row.snooze.status, "active");
  assert.equal(report.summary.snoozed, 1);

  // The escalation is deferred, never dropped: once the window passes, it fires.
  const later = buildLeadSlaReport({ leads: [lead], replies: [], replyDeliveryStates: [], snoozes, generatedAt: "2026-07-06T02:00:00.000Z" });
  assert.equal(later.rows[0].status, "manager_escalation_required");
  assert.equal(later.rows[0].snooze.status, "expired");
  assert.equal(later.summary.snoozed, 0);
});

test("un-snoozing restores the original clock", () => {
  const lead = { lead_id: "lead-1", source: "website_listing_detail", assigned_broker: "broker_en", sla_due_at: "2026-07-04T00:15:00.000Z", manager_escalation_due_at: "2026-07-04T01:00:00.000Z" };
  const snoozes = [
    { id: "lead-snooze-lead-1", lead_id: "lead-1", action: "snooze", actor: "operations_lead", reason: "Waiting.", until: "2026-07-06T00:00:00.000Z", snooze_id: null, recorded_at: "2026-07-04T00:00:00.000Z", human_confirmed: true },
    { id: "lead-unsnooze-lead-1", lead_id: "lead-1", action: "unsnooze", actor: "operations_lead", reason: "Taking it now.", until: null, snooze_id: "lead-snooze-lead-1", recorded_at: "2026-07-04T03:00:00.000Z", human_confirmed: true },
  ];
  const report = buildLeadSlaReport({ leads: [lead], replies: [], replyDeliveryStates: [], snoozes, generatedAt: "2026-07-04T04:00:00.000Z" });
  const row = report.rows[0];
  assert.equal(row.sla_due_at, row.original_sla_due_at);
  assert.equal(row.manager_escalation_due_at, row.original_manager_escalation_due_at);
  assert.equal(row.status, "manager_escalation_required");
  assert.equal(row.snooze.status, "restored");
  assert.equal(row.snooze.deferred_minutes, 0);
});

test("the snooze ledger validates its own input and refuses a second open deferral", () => {
  const leads = [{ lead_id: "lead-1" }];
  assert.throws(() => createLeadSnooze(leads, [], { leadId: "lead-2", until: "2026-08-01T00:00:00Z", reason: "x", actor: "a" }, NOW), /known leadId/);
  assert.throws(() => createLeadSnooze(leads, [], { leadId: "lead-1", until: "2020-01-01T00:00:00Z", reason: "x", actor: "a" }, NOW), /in the future/);
  assert.throws(() => createLeadSnooze(leads, [], { leadId: "lead-1", until: "2027-08-01T00:00:00Z", reason: "x", actor: "a" }, NOW), /within 90 days/);
  assert.throws(() => createLeadSnooze(leads, [], { leadId: "lead-1", until: "2026-08-01T00:00:00Z", reason: "", actor: "a" }, NOW), /Snooze reason is required/);
  assert.throws(() => createLeadSnooze(leads, [], { leadId: "lead-1", until: "2026-08-01T00:00:00Z", reason: "x", actor: "" }, NOW), /Snooze actor is required/);

  const first = createLeadSnooze(leads, [], { leadId: "lead-1", until: "2026-08-01T00:00:00Z", reason: "Waiting.", actor: "a", humanConfirmed: true }, NOW);
  const stored = { ...first, id: "lead-snooze-lead-1" };
  // The same deferral twice is the same deferral.
  assert.equal(createLeadSnooze(leads, [stored], { leadId: "lead-1", until: "2026-08-01T00:00:00.000Z", reason: "Waiting.", actor: "a", humanConfirmed: true }, NOW), stored);
  // A different deferral on top of an open one is refused.
  assert.throws(
    () => createLeadSnooze(leads, [stored], { leadId: "lead-1", until: "2026-08-02T00:00:00Z", reason: "Other.", actor: "a", humanConfirmed: true }, NOW),
    /already has an open snooze/,
  );
  assert.throws(() => createLeadUnsnooze(leads, [], { leadId: "lead-1", reason: "x", actor: "a" }, NOW), /no open snooze/);
  assert.equal(activeLeadSnooze([stored], "lead-1", NOW)?.id, "lead-snooze-lead-1");
  assert.equal(activeLeadSnooze([stored], "lead-1", "2026-09-01T00:00:00Z"), null);
  assert.equal(deriveLeadSnoozeStates([stored], { now: "2026-09-01T00:00:00Z" })[0].status, "expired");
});

test("POST /api/admin/leads/snooze records one audited, idempotent deferral", async () => {
  const { app, leadSnoozeLedgerPath, auditLogPath } = workspace();
  const body = { leadId: "lead-snooze-1", until: "2026-07-20T09:00:00.000Z", reason: "Customer asked for a call after the valuation.", actor: "operations_lead", humanConfirmed: true };

  for (const humanConfirmed of [undefined, false, "false"]) {
    const refused = await post(app, "/api/admin/leads/snooze", { ...body, humanConfirmed });
    assert.equal(refused.status, 400);
    assert.match(refused.body.message, /explicit human confirmation/);
  }
  assert.equal(readLeadSnoozes(leadSnoozeLedgerPath).length, 0);
  assert.equal(readAuditLog(auditLogPath).length, 0);

  const created = await post(app, "/api/admin/leads/snooze", body);
  assert.equal(created.status, 201);
  const payload = created.body;
  assert.equal(payload.kind, "lead_snooze");
  assert.equal(payload.lead_id, "lead-snooze-1");
  assert.equal(payload.until, "2026-07-20T09:00:00.000Z");
  assert.equal(payload.human_confirmed, true);

  // A retried submission returns the stored record instead of a second row.
  const retried = await post(app, "/api/admin/leads/snooze", body);
  assert.equal(retried.status, 200);
  assert.equal(retried.body.id, payload.id);
  assert.equal(readLeadSnoozes(leadSnoozeLedgerPath).length, 1);
  assertLeadSnoozes(readLeadSnoozes(leadSnoozeLedgerPath));

  const audit = readAuditLog(auditLogPath).filter((row) => row.action === "lead_snoozed");
  assert.equal(audit.length, 1);
  assert.equal(audit[0].object_id, payload.id);
  assert.equal(audit[0].metadata.lead_id, "lead-snooze-1");
  assert.equal(audit[0].metadata.until, "2026-07-20T09:00:00.000Z");

  // The inbox payload now carries the deferral, and the clocks moved with it.
  const inbox = await dispatchHttp(app, { url: "/api/admin/leads?locale=en", headers: AUTH });
  const row = inbox.body.leadSla.rows.find((entry) => entry.lead_id === "lead-snooze-1");
  assert.equal(row.snooze.status, "active");
  assert.ok(Date.parse(row.manager_escalation_due_at) > Date.parse(row.original_manager_escalation_due_at));
});

test("POST /api/admin/leads/unsnooze restores the clock and refuses when nothing is open", async () => {
  const { app, auditLogPath } = workspace();
  await post(app, "/api/admin/leads/snooze", { leadId: "lead-snooze-1", until: "2026-07-20T09:00:00.000Z", reason: "Waiting for the notary.", actor: "operations_lead", humanConfirmed: true });

  const refused = await post(app, "/api/admin/leads/unsnooze", { leadId: "lead-snooze-1", reason: "Customer called back early.", actor: "operations_lead" });
  assert.equal(refused.status, 400);
  assert.match(refused.body.message, /explicit human confirmation/);
  assert.equal(readAuditLog(auditLogPath).filter((entry) => entry.action === "lead_unsnoozed").length, 0);

  const restored = await post(app, "/api/admin/leads/unsnooze", { leadId: "lead-snooze-1", reason: "Customer called back early.", actor: "operations_lead", humanConfirmed: true });
  assert.equal(restored.status, 201);
  assert.equal(restored.body.kind, "lead_unsnooze");

  const inbox = await dispatchHttp(app, { url: "/api/admin/leads?locale=en", headers: AUTH });
  const row = inbox.body.leadSla.rows.find((entry) => entry.lead_id === "lead-snooze-1");
  assert.equal(row.manager_escalation_due_at, row.original_manager_escalation_due_at);
  assert.equal(row.snooze.status, "restored");

  const again = await post(app, "/api/admin/leads/unsnooze", { leadId: "lead-snooze-1", reason: "Nothing left to restore.", actor: "operations_lead" });
  assert.equal(again.status, 400);
  assert.match(again.body.message, /no open snooze/);
  assert.equal(readAuditLog(auditLogPath).filter((entry) => entry.action === "lead_unsnoozed").length, 1);
});

test("the snooze routes refuse bad input and an unauthenticated caller", async () => {
  const { app, leadSnoozeLedgerPath } = workspace();
  const unauthenticated = await dispatchHttp(app, {
    url: "/api/admin/leads/snooze",
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ leadId: "lead-snooze-1", until: "2026-07-20T09:00:00.000Z", reason: "x" }),
  });
  assert.equal(unauthenticated.status, 401);

  for (const [body, pattern] of [
    [{ leadId: "lead-unknown", until: "2026-07-20T09:00:00.000Z", reason: "x", actor: "operations_lead" }, /known leadId/],
    [{ leadId: "lead-snooze-1", until: "2020-01-01T00:00:00Z", reason: "x", actor: "operations_lead" }, /in the future/],
    [{ leadId: "lead-snooze-1", until: "not-a-date", reason: "x", actor: "operations_lead" }, /ISO timestamp/],
    [{ leadId: "lead-snooze-1", until: "2026-07-20T09:00:00.000Z", actor: "operations_lead" }, /reason is required/],
    [{ leadId: "lead-snooze-1", until: "2026-07-20T09:00:00.000Z", reason: "x" }, /actor is required/],
  ]) {
    const refused = await post(app, "/api/admin/leads/snooze", body);
    assert.equal(refused.status, 400, JSON.stringify(body));
    assert.match(refused.body.message, pattern);
  }
  // Nothing was written by any refusal.
  assert.equal(readLeadSnoozes(leadSnoozeLedgerPath).length, 0);
});

test("the snooze ledger refuses rows that lost their audit data or carry contact details", () => {
  const good = appendLeadSnooze(
    { id: null, lead_id: "lead-1", action: "snooze", actor: "operations_lead", reason: "Waiting.", until: "2026-08-01T00:00:00.000Z", snooze_id: null, recorded_at: NOW, human_confirmed: true },
    { filePath: tempFile("snooze-assert") },
  );
  assert.equal(assertLeadSnoozes([good]), true);
  assert.throws(() => assertLeadSnoozes([{ ...good, human_confirmed: false }]), /missing audit data/);
  assert.throws(() => assertLeadSnoozes([{ ...good, reason: "" }]), /missing audit data/);
  assert.throws(() => assertLeadSnoozes([{ ...good, email: "leak@example.com" }]), /private contact data/);
  assert.throws(() => assertLeadSnoozes([{ ...good, action: "unsnooze" }]), /must not carry a deferral window/);
});

test("a named operator owns the deferral and a mismatched actor is refused", async () => {
  const previous = process.env.MS_REALTY_ADMIN_ACTOR;
  process.env.MS_REALTY_ADMIN_ACTOR = "operations_lead";
  try {
    const { app, auditLogPath } = workspace();
    const bound = await post(app, "/api/admin/leads/snooze", {
      leadId: "lead-snooze-1",
      until: "2026-07-20T09:00:00.000Z",
      reason: "Waiting for the survey.",
      humanConfirmed: true,
    });
    assert.equal(bound.status, 201);
    assert.equal(bound.body.actor, "operations_lead");
    assert.equal(readAuditLog(auditLogPath).find((row) => row.action === "lead_snoozed").actor, "operations_lead");

    const impersonated = await post(app, "/api/admin/leads/snooze", {
      leadId: "lead-snooze-2",
      until: "2026-07-20T09:00:00.000Z",
      reason: "Not mine to record.",
      actor: "someone_else",
    });
    assert.equal(impersonated.status, 400);
    assert.match(impersonated.body.message, /must match the authenticated operator/);
  } finally {
    if (previous === undefined) delete process.env.MS_REALTY_ADMIN_ACTOR;
    else process.env.MS_REALTY_ADMIN_ACTOR = previous;
  }
});
