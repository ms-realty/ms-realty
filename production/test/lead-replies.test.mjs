import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { assertAuditLog, readAuditLog, resetAuditLog } from "../lib/audit-log.mjs";
import {
  appendReviewedReply,
  assertReplyOutbox,
  createHermesReplyDraft,
  openAiCompatibleHermesReplyProvider,
  readReplyOutbox,
  resetReplyOutbox,
} from "../lib/lead-replies.mjs";

test("reply outbox requires known lead and broker approval", () => {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-replies-`)}/replies.jsonl`;
  resetReplyOutbox(file);
  const leads = [
    {
      lead_id: "lead-test",
      listing_reference: "MS-00815",
      original_language: "he",
      message_original: "Interested in this property.",
    },
  ];

  assert.throws(
    () => appendReviewedReply(leads, { leadId: "lead-test", reviewedReply: "Draft", reviewer: "broker_ru" }, { filePath: file }),
    /Broker approval/,
  );
  assert.throws(
    () =>
      appendReviewedReply(
        leads,
        {
          leadId: "lead-test",
          reviewedReply: "Reviewed reply approved by broker.",
          reviewer: "broker_ru",
          approved: true,
          hermesDraft: "true",
        },
        { filePath: file },
      ),
    /Hermes draft text/,
  );

  appendReviewedReply(
    leads,
    {
      leadId: "lead-test",
      language: "he",
      translatedDraft: "Hermes draft in Hebrew for broker review.",
      reviewedReply: "Reviewed reply approved by broker.",
      reviewer: "broker_ru",
      approved: true,
      showOriginal: "on",
    },
    { filePath: file, reviewedAt: "2026-07-04T00:05:00Z" },
  );

  const rows = readReplyOutbox(file);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "queued_for_manual_send");
  assert.equal(rows[0].message_original, "Interested in this property.");
  assert.equal(rows[0].translated_draft, "Hermes draft in Hebrew for broker review.");
  assert.equal(rows[0].hermes_draft_used, true);
  assert.equal(rows[0].show_original_available, true);
  assert.equal(rows[0].show_original_requested, true);
  assert.equal(assertReplyOutbox(rows), true);
});

test("reviewed reply retries are idempotent and conflicting duplicates are rejected", () => {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-reply-idempotency-`)}/replies.jsonl`;
  resetReplyOutbox(file);
  const leads = [{ lead_id: "lead-retry", listing_reference: "MS-00815", original_language: "en" }];
  const input = {
    leadId: "lead-retry",
    language: "en",
    reviewedReply: "Approved reply.",
    reviewer: "broker_en",
    approved: true,
  };
  const created = appendReviewedReply(leads, input, { filePath: file, reviewedAt: "2026-07-18T10:00:00Z" });
  const retried = appendReviewedReply(leads, input, { filePath: file, reviewedAt: "2026-07-18T10:01:00Z" });
  assert.equal(created.idempotent, false);
  assert.equal(retried.idempotent, true);
  assert.equal(readReplyOutbox(file).length, 1);
  assert.throws(
    () =>
      appendReviewedReply(
        leads,
        { ...input, reviewedReply: "A conflicting approved reply." },
        { filePath: file, reviewedAt: "2026-07-18T10:02:00Z" },
      ),
    /different broker-reviewed reply/,
  );
});

test("Hermes reply draft calls provider and logs redacted model audit before broker approval", async () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-reply-draft-`);
  const auditLogPath = `${dir}/audit-log.jsonl`;
  const replyOutboxPath = `${dir}/replies.jsonl`;
  resetAuditLog(auditLogPath);
  resetReplyOutbox(replyOutboxPath);
  const leads = [
    {
      lead_id: "lead-draft-test",
      listing_reference: "MS-00815",
      original_language: "he",
      message_original: "Interested in this property.",
      contact_preference: "whatsapp",
    },
  ];
  let capturedPrompt;

  const draft = await createHermesReplyDraft(
    leads,
    { leadId: "lead-draft-test", language: "he", listingFacts: { id: "MS-00815", location: "Sandanski" } },
    {
      auditLogPath,
      recordedAt: "2026-07-08T12:00:00Z",
      provider: async (prompt) => {
        capturedPrompt = prompt;
        return {
          text: "MS-00815 Sandanski reply draft for broker review.",
          language: "he",
          citations: [{ source: "listing", field: "id" }],
        };
      },
    },
  );

  assert.equal(draft.status, "hermes_reply_draft");
  assert.equal(draft.lead_id, "lead-draft-test");
  assert.equal(draft.can_send_without_approval, false);
  assert.equal(draft.broker_approval_required, true);
  assert.equal(capturedPrompt.capabilities.can_send_customer_messages, false);
  assert.equal(capturedPrompt.capabilities.requires_broker_approval, true);
  assert.deepEqual(readReplyOutbox(replyOutboxPath), []);

  const auditRows = readAuditLog(auditLogPath);
  assert.equal(assertAuditLog(auditRows), true);
  assert.equal(auditRows[0].action, "hermes_model_call");
  assert.equal(auditRows[0].actor, "hermes_reply_worker");
  assert.equal(auditRows[0].metadata.prompt_version, "reply_draft");
  assert.equal(auditRows[0].metadata.sensitive_data, true);
  assert.equal(JSON.stringify(auditRows).includes("Interested in this property"), false);

  const queued = appendReviewedReply(
    leads,
    {
      leadId: "lead-draft-test",
      language: "he",
      hermesDraftText: draft.text,
      reviewedReply: "Reviewed reply approved by broker.",
      reviewer: "broker_ru",
      approved: true,
    },
    { filePath: replyOutboxPath, reviewedAt: "2026-07-08T12:05:00Z" },
  );
  assert.equal(queued.status, "queued_for_manual_send");
  assert.equal(queued.hermes_draft_used, true);
  assert.equal(assertReplyOutbox(readReplyOutbox(replyOutboxPath)), true);
});

test("Hermes reply provider requires self-hosted Hermes Agent endpoint", async () => {
  assert.throws(
    () =>
      openAiCompatibleHermesReplyProvider({
        env: {
          HERMES_PROVIDER_MODE: "openrouter",
          HERMES_API_KEY: "secret",
        },
      }),
    /self_hosted/,
  );

  const calls = [];
  const provider = openAiCompatibleHermesReplyProvider({
    env: {
      HERMES_PROVIDER_MODE: "self_hosted",
      HERMES_CHAT_COMPLETIONS_URL: "http://127.0.0.1:8080/v1/chat/completions",
      HERMES_API_KEY: "secret",
      HERMES_MODEL: "NousResearch/Hermes-4-14B",
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    text: "Draft for broker review.",
                    language: "en",
                    citations: [{ source: "lead", field: "message_original" }],
                  }),
                },
              },
            ],
          };
        },
      };
    },
  });

  const output = await provider({ role: "reply_draft", leadId: "lead-provider-test" });
  assert.equal(output.text, "Draft for broker review.");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:8080/v1/chat/completions");
  assert.equal(calls[0].options.headers.authorization, "Bearer secret");
  const body = JSON.parse(calls[0].options.body);
  assert.match(body.messages[0].content, /Draft only/);
  assert.equal(body.tool_choice, "none");
  assert.equal(body.tools, undefined);
});

test("Hermes reply drafts reject function-call responses and audit the failure before an outbox entry", async () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-reply-tool-call-`);
  const auditLogPath = `${dir}/audit-log.jsonl`;
  resetAuditLog(auditLogPath);
  const leads = [
    {
      lead_id: "lead-tool-call-test",
      listing_reference: "MS-00815",
      original_language: "en",
      message_original: "Interested in this property.",
    },
  ];
  const provider = openAiCompatibleHermesReplyProvider({
    env: {
      HERMES_PROVIDER_MODE: "self_hosted",
      HERMES_CHAT_COMPLETIONS_URL: "http://127.0.0.1:8080/v1/chat/completions",
      HERMES_API_KEY: "secret",
    },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                function_call: {
                  name: "draft_reply",
                  arguments: JSON.stringify({ text: "Draft for broker review.", language: "en" }),
                },
              },
            },
          ],
        };
      },
    }),
  });

  await assert.rejects(
    () => createHermesReplyDraft(leads, { leadId: "lead-tool-call-test", language: "en" }, { auditLogPath, provider }),
    /tool call despite tool_choice none/,
  );
  const auditRows = readAuditLog(auditLogPath);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0].status, "rejected");
  assert.match(auditRows[0].metadata.error, /tool call despite tool_choice none/);
});
