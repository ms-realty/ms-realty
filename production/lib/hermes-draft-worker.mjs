import fs from "node:fs";
import path from "node:path";
import { DEFAULT_AUDIT_LOG_PATH, appendAuditLog, createAuditLogEntry } from "./audit-log.mjs";
import { evidenceFreshness } from "./evidence-freshness.mjs";
import { validateHermesTranslationDraft } from "./hermes.mjs";
import { DEFAULT_HERMES_DRAFT_DISPATCH_PATH, HERMES_NON_SENSITIVE_LISTING_TRANSLATION } from "./hermes-draft-dispatch.mjs";
import {
  HERMES_AGENT_TERMINAL_BACKENDS,
  HERMES_AGENT_MESSAGING_PLATFORMS,
  HERMES_AGENT_REQUIRED_CAPABILITIES,
  HERMES_AGENT_OFFICIAL_URL,
  HERMES_AGENT_TOOL_GATEWAY_TOOLS,
  assertHermesChatCompletionsEndpoint,
  hermesProviderConfigFromEnv,
} from "./hermes-provider-provisioning.mjs";
import { appendTranslationTask, auditPathFor, DEFAULT_TRANSLATION_LEDGER_PATH } from "./translation-ledger.mjs";
import { fromRoot, repoRelativePath } from "./paths.mjs";

export const DEFAULT_HERMES_DRAFT_WORKER_REPORT_PATH = fromRoot("production", "data", "hermes-draft-worker-report.json");
export const DEFAULT_HERMES_WORKER_SMOKE_REPORT_PATH = fromRoot("production", "data", "hermes-draft-worker-smoke.json");
export const DEFAULT_HERMES_WORKER_SMOKE_LEDGER_PATH = fromRoot("production", "data", "hermes-worker-smoke-translations.jsonl");
export const DEFAULT_HERMES_WORKER_SMOKE_AUDIT_PATH = fromRoot("production", "data", "hermes-worker-smoke-audit.jsonl");
export const DEFAULT_HERMES_WORKER_SMOKE_AUDIT_LOG_PATH = fromRoot("production", "data", "hermes-worker-smoke-audit-log.jsonl");

function parseJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const trimmed = String(value || "")
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/g, "");
  return JSON.parse(trimmed);
}

export function providerRequestBody(row, model) {
  return {
    model,
    temperature: 0.2,
    max_tokens: 1024,
    reasoning_effort: "none",
    response_format: { type: "json_object" },
    tool_choice: "none",
    messages: [
      {
        role: "system",
        content:
          "You are Hermes Agent. Return exactly one JSON object with title, body, seo_title, meta_description, citations. Draft only; never publish or invoke tools.",
      },
      { role: "user", content: JSON.stringify(row.prompt) },
    ],
  };
}

function contentPayload(content) {
  if (typeof content === "string" && content.trim()) return content;
  if (content && typeof content === "object" && !Array.isArray(content)) return content;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => (typeof part === "string" ? part : part?.text || ""))
      .join("")
      .trim();
    if (text) return text;
  }
  return null;
}

function nonEmptyInvocation(value) {
  if (Array.isArray(value)) return value.some((entry) => nonEmptyInvocation(entry));
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(String(value || "").trim());
}

function assertNoProviderToolCalls(message) {
  if (nonEmptyInvocation(message?.tool_calls) || nonEmptyInvocation(message?.function_call)) {
    throw new Error("Hermes provider returned a tool call despite tool_choice none");
  }
}

function draftPayloadFromMessage(message) {
  assertNoProviderToolCalls(message);
  const content = contentPayload(message.content);
  if (content) return content;
  throw new Error("Hermes provider returned no draft JSON");
}

const HOSTED_ROW_FIELDS = new Set([
  "id",
  "status",
  "task_type",
  "object_type",
  "object_id",
  "source_locale",
  "target_locale",
  "target_direction",
  "reviewer_role",
  "provider_mode",
  "data_classification",
  "public_indexable",
  "requires_human_approval",
  "can_publish",
  "can_mark_indexable",
  "source_hash",
  "draft_hash",
  "admin_path",
  "prompt",
  "source_snapshot",
  "citations",
]);
const HOSTED_PROMPT_FIELDS = new Set([
  "role",
  "sourceLocale",
  "targetLocale",
  "sourceText",
  "propertyFacts",
  "glossary",
  "toneRules",
  "forbiddenClaims",
  "seoTargets",
  "capabilities",
  "rules",
]);
const HOSTED_PROPERTY_FACT_FIELDS = new Set([
  "id",
  "location",
  "property_type",
  "offer_type",
  "price_eur",
  "area_sqm",
  "bedrooms",
  "listing_status",
]);
const HOSTED_SOURCE_SNAPSHOT_FIELDS = new Set(["object_type", "object_id", "source_locale", "source_hash", "approved_legal_content"]);
const HOSTED_SEO_TARGET_FIELDS = new Set(["title_max_chars", "meta_description_min_chars", "meta_description_max_chars"]);
const HOSTED_CAPABILITY_FIELDS = new Set(["can_publish", "can_mark_indexable", "requires_human_approval"]);
const HOSTED_CITATION_FIELDS = new Set(["source", "object_id", "task_id", "fields"]);
const HOSTED_CMS_CITATION_FIELDS = new Set([
  "facts.title",
  "facts.description",
  "facts.location",
  "facts.property_type",
  "facts.offer_type",
  "facts.price_eur",
  "facts.area_sqm",
  "facts.bedrooms",
  "facts.listing_status",
]);
const HASH_FIELDS = new Set(["source_hash", "draft_hash"]);
const SENSITIVE_FIELD_NAME = /(^|_)(contact|email|phone|mobile|whatsapp|viber|telegram|signal|sms|message|lead|buyer|seller|owner|customer|client|person|name)(_|$)/;
const EMAIL_ADDRESS = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE_NUMBER = /(?:\+|00)\s*\d(?:[\s().-]*\d){6,}|\b(?:\d[\s().-]*){7,}\d\b/;

function normalizedFieldName(key) {
  return String(key || "")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z\d]+/g, "_")
    .toLowerCase();
}

function assertAllowedFields(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains a non-allowlisted field: ${key}`);
  }
}

function assertNoPii(value, label = "dispatch", field = null) {
  if (typeof value === "string") {
    if (HASH_FIELDS.has(field) && /^[a-f\d]{64}$/i.test(value)) return;
    if (EMAIL_ADDRESS.test(value) || PHONE_NUMBER.test(value)) throw new Error(`${label} contains PII-like contact data`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoPii(entry, `${label}[${index}]`, field));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_FIELD_NAME.test(normalizedFieldName(key))) {
      throw new Error(`${label} contains a sensitive field: ${key}`);
    }
    assertNoPii(nested, `${label}.${key}`, key);
  }
}

function assertHostedCitations(citations) {
  if (!Array.isArray(citations) || !citations.length) throw new Error("Hosted Hermes fallback requires canonical source citations");
  for (const citation of citations) {
    assertAllowedFields(citation, HOSTED_CITATION_FIELDS, "Hosted Hermes dispatch citation");
    if (citation.source === "cms_seed") {
      if (
        !citation.object_id ||
        !Array.isArray(citation.fields || []) ||
        citation.fields.some((field) => !HOSTED_CMS_CITATION_FIELDS.has(field))
      ) {
        throw new Error("Hosted Hermes fallback requires CMS source citations");
      }
      continue;
    }
    if (citation.source === "translation_coverage" && citation.task_id) continue;
    throw new Error("Hosted Hermes fallback only accepts CMS and translation coverage citations");
  }
}

function assertHostedFallbackDispatch(row) {
  if (row?.data_classification !== HERMES_NON_SENSITIVE_LISTING_TRANSLATION) {
    throw new Error("Hosted Hermes fallback requires an explicitly classified non-sensitive listing translation dispatch");
  }
  if (row.object_type !== "listing" || row.status !== "ready_for_hermes" || row.provider_mode !== "hermes_draft") {
    throw new Error("Hosted Hermes fallback only accepts model-ready listing translation dispatches");
  }
  assertAllowedFields(row, HOSTED_ROW_FIELDS, "Hosted Hermes dispatch");
  assertAllowedFields(row.prompt, HOSTED_PROMPT_FIELDS, "Hosted Hermes dispatch prompt");
  assertAllowedFields(row.prompt.propertyFacts || {}, HOSTED_PROPERTY_FACT_FIELDS, "Hosted Hermes dispatch property facts");
  assertAllowedFields(row.source_snapshot, HOSTED_SOURCE_SNAPSHOT_FIELDS, "Hosted Hermes dispatch source snapshot");
  if (row.prompt.seoTargets !== undefined) {
    assertAllowedFields(row.prompt.seoTargets, HOSTED_SEO_TARGET_FIELDS, "Hosted Hermes dispatch SEO targets");
  }
  if (row.prompt.capabilities !== undefined) {
    assertAllowedFields(row.prompt.capabilities, HOSTED_CAPABILITY_FIELDS, "Hosted Hermes dispatch capabilities");
  }
  if (row.prompt.glossary && Object.keys(row.prompt.glossary).length) {
    throw new Error("Hosted Hermes fallback requires an empty allowlisted glossary");
  }
  assertHostedCitations(row.citations);
  if (
    row.prompt.role !== "translation_draft" ||
    row.prompt.sourceLocale !== row.source_locale ||
    row.prompt.targetLocale !== row.target_locale ||
    row.source_snapshot?.object_type !== "listing" ||
    row.source_snapshot?.object_id !== row.object_id ||
    row.source_snapshot?.source_hash !== row.source_hash
  ) {
    throw new Error("Hosted Hermes fallback requires a canonical listing translation prompt and source snapshot");
  }
  assertNoPii(row);
}

export function assertProviderMayReceiveDispatch(row, providerMetadata) {
  if (providerMetadata?.mode === "self_hosted" && providerMetadata.sensitiveDataAllowed === true) return;
  assertHostedFallbackDispatch(row);
}

export function readHermesDraftDispatch(filePath = DEFAULT_HERMES_DRAFT_DISPATCH_PATH) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function openAiCompatibleHermesProvider({
  endpoint,
  apiKey,
  model,
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const config = hermesProviderConfigFromEnv(env);
  const resolvedEndpoint = endpoint === undefined ? config.endpoint : endpoint;
  const resolvedApiKey = apiKey === undefined ? env.HERMES_API_KEY : apiKey;
  const resolvedModel = model === undefined ? config.model : model;
  if (!resolvedEndpoint) throw new Error("HERMES_CHAT_COMPLETIONS_URL is required");
  assertHermesChatCompletionsEndpoint(resolvedEndpoint);
  if (!resolvedApiKey) throw new Error("HERMES_API_KEY is required");
  if (typeof fetchImpl !== "function") throw new Error("fetch is required for Hermes provider");

  return async function callHermes(row) {
    const response = await fetchImpl(resolvedEndpoint, {
      method: "POST",
      signal: AbortSignal.timeout(180_000),
      headers: {
        "content-type": "application/json",
        ...(resolvedApiKey ? { authorization: `Bearer ${resolvedApiKey}` } : {}),
      },
      body: JSON.stringify(providerRequestBody(row, resolvedModel)),
    });
    if (!response.ok) throw new Error(`Hermes provider failed: ${response.status}`);
    const payload = await response.json();
    const message = payload.choices?.[0]?.message;
    if (!message) throw new Error("Hermes provider returned no message");
    return parseJsonObject(draftPayloadFromMessage(message));
  };
}

export function taskFromHermesDraft(row, draft) {
  const output = validateHermesTranslationDraft({
    draft: { ...draft, citations: row.citations },
    propertyFacts: row.prompt.propertyFacts || {},
    sourceSnapshot: row.source_snapshot,
  });
  return {
    id: row.id,
    object_type: row.object_type,
    object_id: row.object_id,
    source_locale: row.source_locale,
    target_locale: row.target_locale,
    target_direction: row.target_direction,
    status: "hermes_drafted",
    source_hash: row.source_hash,
    draft_hash: row.draft_hash,
    provider_mode: row.provider_mode,
    reviewer_role: row.reviewer_role,
    public_indexable: false,
    requires_human_approval: true,
    hermes: {
      prompt: row.prompt,
      output,
      source_snapshot: row.source_snapshot,
      citations: row.citations,
      can_publish: false,
      can_mark_indexable: false,
    },
  };
}

function providerMetadataFromEnv(env = process.env) {
  const config = hermesProviderConfigFromEnv(env);
  return {
    mode: config.mode,
    model: config.model,
    endpoint: config.endpoint_redacted,
    toolCallParser: "hermes",
    sensitiveDataAllowed: config.mode === "self_hosted",
  };
}

function agentRuntimeMetadata() {
  return {
    product: "Nous Hermes Agent",
    license: "MIT",
    official_url: HERMES_AGENT_OFFICIAL_URL,
    project_context_file: "AGENTS.md",
    required_capabilities: HERMES_AGENT_REQUIRED_CAPABILITIES,
    messaging_platforms: HERMES_AGENT_MESSAGING_PLATFORMS,
    tool_gateway: {
      required_tools: HERMES_AGENT_TOOL_GATEWAY_TOOLS,
    },
    terminal_backends: HERMES_AGENT_TERMINAL_BACKENDS,
  };
}

function recordHermesAuditLog({ row, auditLogPath, providerMetadata, result, error, recordedAt }) {
  if (!auditLogPath) return null;
  return appendAuditLog(
    createAuditLogEntry(
      {
        action: "hermes_model_call",
        actor: "hermes_worker",
        objectType: "translation_task",
        objectId: row.id,
        locale: row.target_locale,
        status: result,
        metadata: {
          object_id: row.object_id,
          object_type: row.object_type,
          provider_mode: row.provider_mode,
          provider: providerMetadata.mode,
          model: providerMetadata.model,
          prompt_version: row.prompt?.version || row.prompt?.role || "translation_draft",
          tool_call_parser: providerMetadata.toolCallParser || "hermes",
          tool_calls: providerMetadata.toolCalls ?? 0,
          input_tokens: providerMetadata.inputTokens ?? null,
          output_tokens: providerMetadata.outputTokens ?? null,
          sensitive_data: providerMetadata.sensitiveDataAllowed === true,
          result,
          error: error ? error.message : null,
        },
      },
      recordedAt,
    ),
    { filePath: auditLogPath },
  );
}

export async function runHermesDraftWorker({
  dispatch = readHermesDraftDispatch(),
  provider = openAiCompatibleHermesProvider(),
  filePath = DEFAULT_TRANSLATION_LEDGER_PATH,
  auditPath,
  auditLogPath = DEFAULT_AUDIT_LOG_PATH,
  providerMetadata = providerMetadataFromEnv(),
  limit = dispatch.rows.length,
  recordedAt = "2026-07-06T00:00:00Z",
  generatedAt = "2026-07-06T00:00:00Z",
} = {}) {
  const rows = dispatch.rows.slice(0, limit);
  const resolvedAuditPath = auditPathFor(filePath, auditPath);
  const persisted = [];
  const rejected = [];
  const auditLogRows = [];

  for (const row of rows) {
    try {
      assertProviderMayReceiveDispatch(row, providerMetadata);
      const draft = await provider(row);
      const task = taskFromHermesDraft(row, draft);
      appendTranslationTask(task, { filePath, auditPath, recordedAt });
      persisted.push({ id: task.id, target_locale: task.target_locale, status: task.status, public_indexable: false });
      const auditLogRow = recordHermesAuditLog({ row, auditLogPath, providerMetadata, result: "persisted", recordedAt });
      if (auditLogRow) auditLogRows.push(auditLogRow);
    } catch (error) {
      rejected.push({ id: row.id, target_locale: row.target_locale, error: error.message });
      const auditLogRow = recordHermesAuditLog({ row, auditLogPath, providerMetadata, result: "rejected", error, recordedAt });
      if (auditLogRow) auditLogRows.push(auditLogRow);
    }
  }

  return {
    generated_at: generatedAt,
    agent_runtime: agentRuntimeMetadata(),
    ledger_path: repoRelativePath(filePath),
    audit_path: repoRelativePath(resolvedAuditPath),
    audit_log_path: repoRelativePath(auditLogPath) || null,
    audit_log_rows: auditLogRows.length,
    provider: {
      mode: providerMetadata.mode,
      model: providerMetadata.model,
      endpoint: providerMetadata.endpoint || null,
      tool_call_parser: providerMetadata.toolCallParser || "hermes",
      sensitive_data_allowed: providerMetadata.sensitiveDataAllowed === true,
    },
    summary: {
      attempted: rows.length,
      persisted: persisted.length,
      rejected: rejected.length,
    },
    persisted,
    rejected,
  };
}

export function assertHermesDraftWorkerReport(report) {
  if (!report.generated_at || Number.isNaN(Date.parse(report.generated_at))) {
    throw new Error("Hermes worker report must include valid generated_at");
  }
  if (report.agent_runtime?.product !== "Nous Hermes Agent") throw new Error("Hermes worker report must target Nous Hermes Agent");
  if (report.agent_runtime?.license !== "MIT") throw new Error("Hermes worker report must record the Hermes Agent MIT license");
  if (report.agent_runtime?.official_url !== HERMES_AGENT_OFFICIAL_URL) {
    throw new Error("Hermes worker report must link the official Hermes Agent runtime");
  }
  if (report.agent_runtime?.project_context_file !== "AGENTS.md") {
    throw new Error("Hermes worker report must include AGENTS.md project context evidence");
  }
  for (const capability of HERMES_AGENT_REQUIRED_CAPABILITIES) {
    if (!report.agent_runtime?.required_capabilities?.includes(capability)) {
      throw new Error("Hermes worker report must include official Hermes Agent capabilities");
    }
  }
  for (const platform of HERMES_AGENT_MESSAGING_PLATFORMS) {
    if (!report.agent_runtime?.messaging_platforms?.includes(platform)) {
      throw new Error("Hermes worker report must include official Hermes Agent messaging platforms");
    }
  }
  for (const tool of HERMES_AGENT_TOOL_GATEWAY_TOOLS) {
    if (!report.agent_runtime?.tool_gateway?.required_tools?.includes(tool)) {
      throw new Error("Hermes worker report must include Hermes tool gateway tools");
    }
  }
  for (const backend of HERMES_AGENT_TERMINAL_BACKENDS) {
    if (!report.agent_runtime?.terminal_backends?.includes(backend)) {
      throw new Error("Hermes worker report must include Hermes sandbox backends");
    }
  }
  if (report.provider?.tool_call_parser !== "hermes") throw new Error("Hermes worker report must use Hermes tool parser");
  if (!String(report.provider?.mode || "").trim()) throw new Error("Hermes worker report must include provider mode");
  if (!String(report.provider?.model || "").trim()) throw new Error("Hermes worker report must include provider model");
  if (report.provider?.endpoint) assertHermesChatCompletionsEndpoint(report.provider.endpoint, "Hermes worker endpoint");
  if (report.provider?.mode === "self_hosted" && report.provider.sensitive_data_allowed !== true) {
    throw new Error("Self-hosted Hermes worker reports must allow sensitive data");
  }
  if (report.provider?.mode === "openrouter" && report.provider.sensitive_data_allowed !== false) {
    throw new Error("Hosted Hermes worker reports must be marked non-sensitive only");
  }
  if (report.summary.attempted < 1) throw new Error("Hermes worker must attempt at least one draft");
  if (report.summary.persisted < 1) throw new Error("Hermes worker must persist at least one draft");
  if (report.summary.attempted !== report.summary.persisted + report.summary.rejected) {
    throw new Error("Hermes worker summary must match persisted and rejected rows");
  }
  if (!Array.isArray(report.persisted) || !Array.isArray(report.rejected)) {
    throw new Error("Hermes worker report must include persisted and rejected rows");
  }
  if (report.persisted.length !== report.summary.persisted || report.rejected.length !== report.summary.rejected) {
    throw new Error("Hermes worker row counts must match summary");
  }
  if (!report.audit_log_path || report.audit_log_rows !== report.summary.attempted) {
    throw new Error("Hermes worker audit log must cover every attempted model call");
  }
  for (const row of report.persisted) {
    if (row.status !== "hermes_drafted" || row.public_indexable !== false) {
      throw new Error("Hermes worker must persist non-indexable draft tasks only");
    }
  }
  return true;
}

export function readReusableHermesDraftWorkerReport(filePath = DEFAULT_HERMES_DRAFT_WORKER_REPORT_PATH) {
  if (!fs.existsSync(filePath)) return null;
  const report = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (report.provider?.mode !== "desktop_subscription") return null;
  assertHermesDraftWorkerReport(report);
  if (evidenceFreshness("live_services", report.generated_at).status !== "fresh") return null;
  return report;
}

export function writeHermesDraftWorkerReport(report, filePath = DEFAULT_HERMES_DRAFT_WORKER_REPORT_PATH) {
  assertHermesDraftWorkerReport(report);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
  return filePath;
}
