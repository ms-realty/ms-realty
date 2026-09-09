import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readAuditLog } from "../lib/audit-log.mjs";
import { appendLeadContact } from "../lib/lead-contact-vault.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { ProviderDeliveryError } from "../lib/provider-delivery.mjs";
import { readReplyDeliveryOutcomes } from "../lib/reply-delivery-outcomes.mjs";

const SESSION_TOKEN = "payload.delivery.session";
const CONTACT_SECRET = "standalone-provider-delivery-contact-secret-32-characters";
const APPROVED_AT = "2026-08-13T16:00:00.000Z";
const PROVIDER_CONFIG = {
  credentialSecret: "standalone-provider-credential-secret-32-characters",
  googleClientId: "google-client-id",
  googleClientSecret: "google-client-secret",
};

function payloadAdminAuth() {
  return {
    async resolve(token) {
      return token === SESSION_TOKEN
        ? {
            principal: {
              id: "payload-delivery-admin",
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

function fixture(t, { contact = {}, listingReference = "MS-00815", reply = null } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-http-provider-delivery-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const jsonl = (name, rows = []) => {
    const filePath = path.join(directory, `${name}.jsonl`);
    fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
    return filePath;
  };
  const lead = {
    lead_id: "standalone-provider-lead",
    received_at: "2026-08-13T14:00:00.000Z",
    source: "website_listing_detail",
    lead_type: "buyer",
    listing_reference: listingReference,
    original_language: "bg",
    admin_locale: "bg",
  };
  const paths = {
    leadLedgerPath: jsonl("leads", [lead]),
    leadContactVaultPath: jsonl("lead-contacts"),
    replyOutboxPath: jsonl("replies", reply ? [reply] : []),
    replyDeliveryOutcomeLedgerPath: jsonl("reply-delivery"),
    auditLogPath: jsonl("audit"),
  };
  appendLeadContact(
    {
      lead: { id: lead.lead_id, contact },
      message_original: "Private lead message that must not reach audit.",
      contact_preference: "email",
    },
    { filePath: paths.leadContactVaultPath, secret: CONTACT_SECRET, storedAt: lead.received_at },
  );
  return { lead, paths };
}

function approvedReply(overrides = {}) {
  return {
    id: "reply-standalone-provider-lead",
    lead_id: "standalone-provider-lead",
    listing_reference: "MS-00815",
    original_language: "bg",
    reply_language: "bg",
    reviewed_reply: "Approved reply from the outbox.",
    reviewer: "prior-reviewer",
    reviewed_at: "2026-08-13T15:00:00.000Z",
    status: "queued_for_manual_send",
    broker_approved: true,
    ...overrides,
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

function sentReceipt(provider, idempotencyKey, externalMessageId = `${provider}-message-1`) {
  return {
    idempotency_key: idempotencyKey,
    provider,
    status: "sent",
    approved_by: "payload-delivery-admin",
    approved_at: APPROVED_AT,
    completed_at: APPROVED_AT,
    external_message_id: externalMessageId,
    idempotent: false,
  };
}

test("standalone direct provider send invokes the durable core with server-owned approval and a safe Google subject", async (t) => {
  const privateEmail = "private-buyer@example.test";
  const privateMessage = "Approved direct reply that must not reach audit.";
  const { paths } = fixture(t, {
    contact: { email: privateEmail },
    listingReference: "MS-REF-1\r\nBcc: attacker@example.test",
  });
  const receiptPayload = { kind: "durable-payload-runtime" };
  const providerFetch = async () => {
    throw new Error("The injected delivery core owns provider fetches");
  };
  const calls = [];
  const app = createHttpApp({
    ...paths,
    leadContactKey: CONTACT_SECRET,
    payloadAdminAuth: payloadAdminAuth(),
    providerConnection: PROVIDER_CONFIG,
    providerConnectionPayload: receiptPayload,
    providerFetch,
    replyDeliveredAt: APPROVED_AT,
    deliverApprovedProviderMessage: async (input, options) => {
      calls.push({ input, options });
      return sentReceipt(input.provider, input.idempotencyKey, "gmail-message-direct-1");
    },
  });

  const response = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/replies/delivery",
    headers: sessionHeaders(),
    body: {
      leadId: "standalone-provider-lead",
      reviewedReply: privateMessage,
      idempotencyKey: "delivery-direct-google-1",
      provider: "google",
      recipient: "attacker@example.test",
      approvedAt: "2000-01-01T00:00:00.000Z",
    },
  });

  assert.equal(response.status, 201);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.leadId, "standalone-provider-lead");
  assert.equal(calls[0].input.recipient, privateEmail);
  assert.equal(calls[0].input.message, privateMessage);
  assert.equal(calls[0].input.approved, true);
  assert.equal(calls[0].input.approvedBy, "payload-delivery-admin");
  assert.equal(calls[0].input.approvedAt, APPROVED_AT);
  assert.doesNotMatch(calls[0].input.subject, /[\r\n]/);
  assert.ok(calls[0].input.subject.length <= 200);
  assert.equal(calls[0].options.config, PROVIDER_CONFIG);
  assert.equal(calls[0].options.payload, receiptPayload);
  assert.equal(calls[0].options.fetchImpl, providerFetch);
  assert.equal(response.body.provider_delivery.external_message_id, "gmail-message-direct-1");
  assert.equal(readReplyDeliveryOutcomes(paths.replyDeliveryOutcomeLedgerPath).length, 0);

  const auditRows = readAuditLog(paths.auditLogPath);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0].action, "provider_reply_sent");
  assert.equal(auditRows[0].actor, "payload-delivery-admin");
  const serializedAudit = JSON.stringify(auditRows);
  assert.doesNotMatch(serializedAudit, new RegExp(privateEmail));
  assert.doesNotMatch(serializedAudit, new RegExp(privateMessage));
  const serializedVault = fs.readFileSync(paths.leadContactVaultPath, "utf8");
  assert.doesNotMatch(serializedVault, new RegExp(privateEmail));
});

test("standalone approved reply derives lead, message, WhatsApp recipient, and approval identity on the server", async (t) => {
  const reply = approvedReply();
  const { paths } = fixture(t, {
    contact: { phone: "+359888111222", whatsapp: "+359888333444" },
    reply,
  });
  const calls = [];
  const app = createHttpApp({
    ...paths,
    leadContactKey: CONTACT_SECRET,
    payloadAdminAuth: payloadAdminAuth(),
    providerConnection: PROVIDER_CONFIG,
    providerConnectionPayload: { kind: "receipt-store" },
    replyDeliveredAt: APPROVED_AT,
    deliverApprovedProviderMessage: async (input) => {
      calls.push(input);
      return sentReceipt(input.provider, input.idempotencyKey, "wamid.standalone-1");
    },
  });

  const spoofed = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/replies/delivery",
    headers: sessionHeaders(),
    body: { replyId: reply.id, provider: "whatsapp", approvedBy: "spoofed-reviewer" },
  });
  assert.equal(spoofed.status, 400);
  assert.match(spoofed.body.message, /authenticated operator/);
  assert.equal(calls.length, 0);

  const delivered = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/replies/delivery",
    headers: sessionHeaders(),
    body: {
      replyId: reply.id,
      provider: "whatsapp",
      leadId: "attacker-lead",
      recipient: "+359899999999",
      message: "Attacker-controlled replacement.",
      approvedAt: "2000-01-01T00:00:00.000Z",
    },
  });

  assert.equal(delivered.status, 201);
  assert.equal(calls.length, 1);
  assert.deepEqual(
    {
      leadId: calls[0].leadId,
      idempotencyKey: calls[0].idempotencyKey,
      recipient: calls[0].recipient,
      message: calls[0].message,
      approvedBy: calls[0].approvedBy,
      approvedAt: calls[0].approvedAt,
    },
    {
      leadId: reply.lead_id,
      idempotencyKey: `reply:${reply.id}:whatsapp`,
      recipient: "+359888333444",
      message: reply.reviewed_reply,
      approvedBy: "payload-delivery-admin",
      approvedAt: APPROVED_AT,
    },
  );
  assert.equal(delivered.body.outcome.actor, "payload-delivery-admin");
  assert.equal(delivered.body.delivery.status, "sent");
  assert.equal(readReplyDeliveryOutcomes(paths.replyDeliveryOutcomeLedgerPath).length, 1);
  assert.deepEqual(
    readAuditLog(paths.auditLogPath).map((row) => row.action),
    ["reply_delivery_recorded", "provider_reply_sent"],
  );
  assert.doesNotMatch(JSON.stringify(readAuditLog(paths.auditLogPath)), /Approved reply from the outbox/);
});

test("standalone Viber delivery uses only the current lead viber_user_id", async (t) => {
  const { paths } = fixture(t, { contact: { viber: "+359888111222" } });
  let invoked = false;
  const app = createHttpApp({
    ...paths,
    leadContactKey: CONTACT_SECRET,
    payloadAdminAuth: payloadAdminAuth(),
    providerConnection: PROVIDER_CONFIG,
    replyDeliveredAt: APPROVED_AT,
    deliverApprovedProviderMessage: async () => {
      invoked = true;
      throw new Error("must not send without a Viber user id");
    },
  });
  const response = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/replies/delivery",
    headers: sessionHeaders(),
    body: {
      leadId: "standalone-provider-lead",
      message: "Approved Viber reply.",
      idempotencyKey: "delivery-direct-viber-1",
      provider: "viber",
    },
  });
  assert.equal(response.status, 400);
  assert.match(response.body.message, /Viber recipient/);
  assert.equal(invoked, false);
});

test("standalone provider delivery maps uncertain, conflict, unavailable, and definite failures exactly", async (t) => {
  const cases = [
    ["provider_delivery_uncertain", 409],
    ["provider_delivery_conflict", 409],
    ["provider_delivery_unavailable", 503],
    ["provider_delivery_rejected", 400],
  ];
  for (const [code, expectedStatus] of cases) {
    await t.test(code, async (subtest) => {
      const { paths } = fixture(subtest, { contact: { email: "buyer@example.test" } });
      const app = createHttpApp({
        ...paths,
        leadContactKey: CONTACT_SECRET,
        payloadAdminAuth: payloadAdminAuth(),
        providerConnection: PROVIDER_CONFIG,
        replyDeliveredAt: APPROVED_AT,
        deliverApprovedProviderMessage: async () => {
          throw new ProviderDeliveryError("Safe provider failure", { code });
        },
      });
      const response = await dispatchHttp(app, {
        method: "POST",
        url: "/api/admin/replies/delivery",
        headers: sessionHeaders(),
        body: {
          leadId: "standalone-provider-lead",
          message: "Approved provider reply.",
          idempotencyKey: `delivery-error-${code}`,
          provider: "google",
        },
      });
      assert.equal(response.status, expectedStatus);
      assert.equal(response.body.kind, code);
      assert.equal(readAuditLog(paths.auditLogPath).length, 0);
    });
  }
});

test("standalone delivery without provider preserves the legacy manual action path", async (t) => {
  const reply = approvedReply();
  const { paths } = fixture(t, { contact: { email: "buyer@example.test" }, reply });
  let providerCalls = 0;
  const app = createHttpApp({
    ...paths,
    leadContactKey: CONTACT_SECRET,
    payloadAdminAuth: payloadAdminAuth(),
    replyDeliveredAt: APPROVED_AT,
    deliverApprovedProviderMessage: async () => {
      providerCalls += 1;
      throw new Error("legacy manual delivery must not invoke provider core");
    },
  });
  const response = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/replies/delivery",
    headers: sessionHeaders(),
    body: { replyId: reply.id, action: "sent", channel: "email" },
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.outcome.actor, "payload-delivery-admin");
  assert.equal(response.body.delivery.status, "sent");
  assert.equal(providerCalls, 0);
  assert.equal(readReplyDeliveryOutcomes(paths.replyDeliveryOutcomeLedgerPath).length, 1);
  assert.equal(readAuditLog(paths.auditLogPath).filter((row) => row.action === "reply_delivery_recorded").length, 1);
});
