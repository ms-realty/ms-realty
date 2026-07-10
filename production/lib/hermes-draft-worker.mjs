import fs from "node:fs";
import path from "node:path";
import { DEFAULT_AUDIT_LOG_PATH, appendAuditLog, createAuditLogEntry } from "./audit-log.mjs";
import { validateHermesTranslationDraft } from "./hermes.mjs";
import { DEFAULT_HERMES_DRAFT_DISPATCH_PATH } from "./hermes-draft-dispatch.mjs";
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
import { fromRoot } from "./paths.mjs";

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

function providerRequestBody(row, model) {
  return {
    model,
    temperature: 0.2,
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

function toolArgumentsPayload(message) {
  const toolCall = message.tool_calls?.find((call) => call?.function?.arguments);
  if (toolCall) return toolCall.function.arguments;
  if (message.function_call?.arguments) return message.function_call.arguments;
  return null;
}

function draftPayloadFromMessage(message) {
  const content = contentPayload(message.content);
  if (content) return content;
  const toolArguments = toolArgumentsPayload(message);
  if (toolArguments) return toolArguments;
  throw new Error("Hermes provider returned no draft JSON");
}

export function readHermesDraftDispatch(filePath = DEFAULT_HERMES_DRAFT_DISPATCH_PATH) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function openAiCompatibleHermesProvider({
  endpoint = process.env.HERMES_CHAT_COMPLETIONS_URL,
  apiKey = process.env.HERMES_API_KEY,
  model = process.env.HERMES_MODEL || "NousResearch/Hermes-4-14B",
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!endpoint) throw new Error("HERMES_CHAT_COMPLETIONS_URL is required");
  assertHermesChatCompletionsEndpoint(endpoint);
  if (!apiKey) throw new Error("HERMES_API_KEY is required");
  if (typeof fetchImpl !== "function") throw new Error("fetch is required for Hermes provider");

  return async function callHermes(row) {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(providerRequestBody(row, model)),
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
    draft,
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
    ledger_path: filePath,
    audit_path: resolvedAuditPath,
    audit_log_path: auditLogPath || null,
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

export function writeHermesDraftWorkerReport(report, filePath = DEFAULT_HERMES_DRAFT_WORKER_REPORT_PATH) {
  assertHermesDraftWorkerReport(report);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
  return filePath;
}
