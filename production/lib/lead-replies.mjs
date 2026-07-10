import fs from "node:fs";
import path from "node:path";
import { appendAuditLog, createAuditLogEntry, DEFAULT_AUDIT_LOG_PATH } from "./audit-log.mjs";
import { replyPrompt, validateHermesReplyDraft } from "./hermes.mjs";
import { assertHermesChatCompletionsEndpoint, hermesProviderConfigFromEnv } from "./hermes-provider-provisioning.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_REPLY_OUTBOX_PATH = fromRoot("production", "data", "reply-outbox.jsonl");

export function resetReplyOutbox(filePath = DEFAULT_REPLY_OUTBOX_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readReplyOutbox(filePath = DEFAULT_REPLY_OUTBOX_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function optionalText(value, { max = 4000 } = {}) {
  const text = String(value || "").trim();
  return text ? text.slice(0, max) : null;
}

function booleanInput(value) {
  return value === true || value === "true" || value === "on" || value === "1";
}

function hermesDraftText(input) {
  const draft = input.hermesDraftText || input.translatedDraft || input.hermesDraft;
  if (!draft || draft === true || draft === "true" || draft === "on" || draft === "1") return null;
  if (typeof draft === "object") return optionalText(draft.text || draft.body || draft.message || draft.draft);
  return optionalText(draft);
}

function hasHermesDraftReference(input) {
  return Boolean(input.hermesDraft || input.hermesDraftText || input.translatedDraft);
}

function parseJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return JSON.parse(String(value || "").trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
}

function toolArgumentsPayload(message) {
  return message.tool_calls?.find((call) => call?.function?.arguments)?.function?.arguments || message.function_call?.arguments || null;
}

function replyProviderRequestBody(prompt, model) {
  return {
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    tool_choice: "none",
    messages: [
      {
        role: "system",
        content: "You are Hermes Agent. Draft only. Never send customer messages or invoke tools. Return exactly one JSON object with text, language, citations.",
      },
      { role: "user", content: JSON.stringify(prompt) },
    ],
  };
}

export function openAiCompatibleHermesReplyProvider({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const config = hermesProviderConfigFromEnv(env);
  if (config.mode !== "self_hosted") throw new Error("Hermes reply drafts require self_hosted provider mode");
  if (!config.endpoint) throw new Error("HERMES_CHAT_COMPLETIONS_URL is required");
  assertHermesChatCompletionsEndpoint(config.endpoint);
  if (!config.has_api_key) throw new Error("HERMES_API_KEY is required");
  if (typeof fetchImpl !== "function") throw new Error("fetch is required for Hermes reply provider");

  return async function callHermesReply(prompt) {
    const response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.HERMES_API_KEY}` },
      body: JSON.stringify(replyProviderRequestBody(prompt, config.model)),
    });
    if (!response.ok) throw new Error(`Hermes reply provider failed: ${response.status}`);
    const payload = await response.json();
    const message = payload.choices?.[0]?.message;
    if (!message) throw new Error("Hermes reply provider returned no message");
    return parseJsonObject(toolArgumentsPayload(message) || message.content);
  };
}

function leadForReply(leads, leadId) {
  const lead = leads.find((row) => row.lead_id === leadId);
  if (!lead) throw new Error("Reply draft requires a known leadId");
  return lead;
}

function recordReplyDraftAudit({ auditLogPath, draft, error, lead, recordedAt }) {
  if (!auditLogPath) return null;
  return appendAuditLog(
    createAuditLogEntry(
      {
        action: "hermes_model_call",
        actor: "hermes_reply_worker",
        objectType: "reply_draft",
        objectId: `reply-draft-${lead.lead_id}`,
        locale: lead.original_language,
        status: draft ? "persisted" : "rejected",
        metadata: {
          lead_id: lead.lead_id,
          listing_reference: lead.listing_reference,
          provider: "self_hosted",
          prompt_version: "reply_draft",
          result: draft ? "persisted" : "rejected",
          error: error ? error.message : null,
          sensitive_data: true,
        },
      },
      recordedAt,
    ),
    { filePath: auditLogPath },
  );
}

export async function createHermesReplyDraft(
  leads,
  input,
  {
    auditLogPath = DEFAULT_AUDIT_LOG_PATH,
    provider = openAiCompatibleHermesReplyProvider(),
    recordedAt = new Date().toISOString(),
  } = {},
) {
  const lead = leadForReply(leads, input.leadId);
  const prompt = replyPrompt({
    lead,
    language: input.language || lead.original_language,
    listingFacts: input.listingFacts || {},
  });
  try {
    const output = await provider(prompt);
    const draft = validateHermesReplyDraft({ draft: output, lead, prompt });
    recordReplyDraftAudit({ auditLogPath, draft, lead, recordedAt });
    return { ...draft, prompt_role: prompt.role };
  } catch (error) {
    recordReplyDraftAudit({ auditLogPath, error, lead, recordedAt });
    throw error;
  }
}

export function appendReviewedReply(
  leads,
  input,
  { filePath = DEFAULT_REPLY_OUTBOX_PATH, reviewedAt = new Date().toISOString() } = {},
) {
  const lead = leads.find((row) => row.lead_id === input.leadId);
  if (!lead) throw new Error("Reply requires a known leadId");
  if (!input.reviewedReply || !input.reviewer) throw new Error("reviewedReply and reviewer are required");
  if (input.approved !== true) throw new Error("Broker approval is required before reply is queued");
  const messageOriginal = optionalText(input.originalMessage || input.messageOriginal || lead.message_original || lead.message);
  const translatedDraft = hermesDraftText(input);
  const hermesDraftReferenced = hasHermesDraftReference(input);
  if (hermesDraftReferenced && !translatedDraft) {
    throw new Error("Hermes draft text is required when Hermes draft is referenced");
  }

  const row = {
    id: input.id || `reply-${input.leadId}`,
    lead_id: input.leadId,
    listing_reference: lead.listing_reference,
    original_language: lead.original_language,
    message_original: messageOriginal,
    reply_language: input.language || lead.original_language,
    translated_draft: translatedDraft,
    reviewed_reply: input.reviewedReply,
    reviewer: input.reviewer,
    reviewed_at: reviewedAt,
    status: "queued_for_manual_send",
    broker_approved: true,
    hermes_draft_used: Boolean(translatedDraft),
    hermes_draft_referenced: hermesDraftReferenced,
    show_original_available: Boolean(messageOriginal),
    show_original_requested: booleanInput(input.showOriginal),
    translated_draft_available: Boolean(translatedDraft),
  };

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(row)}\n`);
  return row;
}

export function assertReplyOutbox(rows) {
  if (!rows.length) throw new Error("Reply outbox must contain at least one row");
  for (const row of rows) {
    if (!row.lead_id || !row.reviewed_reply || row.broker_approved !== true) {
      throw new Error("Reply outbox row is missing approval data");
    }
    if (row.status !== "queued_for_manual_send") throw new Error("Replies must not be auto-sent");
    if (row.hermes_draft_used === true && !row.translated_draft) {
      throw new Error("Hermes draft usage must preserve the reviewed translated draft");
    }
    if (row.show_original_requested === true && row.show_original_available !== true) {
      throw new Error("Reply outbox cannot request original view without original message");
    }
  }
  return true;
}
