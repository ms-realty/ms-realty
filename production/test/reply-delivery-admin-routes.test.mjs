import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { readAuditLog } from "../lib/audit-log.mjs";
import { readReplyDeliveryOutcomes } from "../lib/reply-delivery-outcomes.mjs";

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-reply-delivery-routes-"));
  const jsonl = (name, rows = []) => {
    const filePath = path.join(directory, `${name}.jsonl`);
    fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
    return filePath;
  };
  const lead = {
    lead_id: "http-delivery-lead",
    received_at: "2026-07-18T10:00:00.000Z",
    source: "website_listing_detail",
    lead_type: "buyer",
    listing_reference: "MS-00815",
    original_language: "ru",
    admin_locale: "ru",
    message_original: "Please contact me.",
    contact_preference: "email",
    assigned_broker: "broker_ru",
    broker_assignment: { broker_id: "broker_ru" },
    sla_due_at: "2026-07-18T10:15:00.000Z",
    manager_escalation_due_at: "2026-07-18T10:30:00.000Z",
  };
  return {
    lead,
    paths: {
      leadLedgerPath: jsonl("leads", [lead]),
      replyOutboxPath: jsonl("replies"),
      replyDeliveryOutcomeLedgerPath: jsonl("reply-delivery"),
      auditLogPath: jsonl("audit"),
    },
  };
}

test("HTTP reply workflow remains actionable until a broker records actual delivery", async () => {
  const { paths } = fixture();
  const app = createHttpApp({
    ...paths,
    reviewedAt: "2026-07-18T10:05:00.000Z",
    replyDeliveredAt: "2026-07-18T10:06:00.000Z",
    leadSlaGeneratedAt: "2026-07-18T10:20:00.000Z",
  });
  const auth = { authorization: "Bearer local-admin-smoke" };
  const queued = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/replies",
    headers: auth,
    body: {
      leadId: "http-delivery-lead",
      language: "ru",
      approved: true,
      reviewer: "broker_ru",
      reviewedReply: "Broker-reviewed reply for manual delivery.",
    },
  });
  assert.equal(queued.status, 201);
  const queuedRetry = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/replies",
    headers: auth,
    body: {
      leadId: "http-delivery-lead",
      language: "ru",
      approved: true,
      reviewer: "broker_ru",
      reviewedReply: "Broker-reviewed reply for manual delivery.",
    },
  });
  assert.equal(queuedRetry.status, 200);
  assert.equal(queuedRetry.body.idempotent, true);
  assert.equal(readAuditLog(paths.auditLogPath).filter((row) => row.action === "reply_approved").length, 1);

  const queuedInbox = await dispatchHttp(app, { url: "/api/admin/leads", headers: auth });
  assert.equal(queuedInbox.body.summary.repliesQueued, 1);
  assert.equal(queuedInbox.body.summary.repliesSent, 0);
  assert.equal(queuedInbox.body.leadSla.rows[0].status, "reminder_required");
  const queuedHtml = await dispatchHttp(app, { url: "/admin/leads", headers: auth });
  assert.match(queuedHtml.body, /data-reply-delivery-form="true"/);
  assert.match(queuedHtml.body, /data-lead-replied="false"/);

  const unauthorized = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/replies/delivery",
    body: { replyId: queued.body.id, actor: "broker_ru", action: "sent", channel: "email" },
  });
  assert.equal(unauthorized.status, 401);

  const delivered = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/replies/delivery",
    headers: auth,
    body: { replyId: queued.body.id, actor: "broker_ru", action: "sent", channel: "email" },
  });
  assert.equal(delivered.status, 201);
  assert.equal(delivered.body.delivery.status, "sent");
  assert.equal(delivered.body.delivery.sent_at, "2026-07-18T10:06:00.000Z");

  const deliveredInbox = await dispatchHttp(app, { url: "/api/admin/leads", headers: auth });
  assert.equal(deliveredInbox.body.summary.repliesQueued, 0);
  assert.equal(deliveredInbox.body.summary.repliesSent, 1);
  assert.equal(deliveredInbox.body.leadSla.rows[0].status, "customer_reply_sent");
  assert.equal(readReplyDeliveryOutcomes(paths.replyDeliveryOutcomeLedgerPath).length, 1);
  assert.equal(readAuditLog(paths.auditLogPath).filter((row) => row.action === "reply_delivery_recorded").length, 1);
});
