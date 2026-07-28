import readline from "node:readline";
import { DEFAULT_AUDIT_LOG_PATH, appendAuditLog, createAuditLogEntry } from "../lib/audit-log.mjs";
import { hermesBackendStatus } from "../lib/hermes-backend.mjs";
import { buildHermesDraftDispatch } from "../lib/hermes-draft-dispatch.mjs";
import { taskFromHermesDraft } from "../lib/hermes-draft-worker.mjs";
import { buildTranslationCoverageReport } from "../lib/translation-coverage.mjs";
import {
  DEFAULT_TRANSLATION_LEDGER_PATH,
  appendTranslationTask,
  readTranslationLedger,
} from "../lib/translation-ledger.mjs";

// MCP server that plugs the MS Realty Hermes pipeline into desktop AI apps
// (ChatGPT desktop, Claude desktop/Code, Codex CLI). Ported from the Tempora
// convention: the DESKTOP model does the drafting on the operator's
// subscription; this server only hands out canonical prompts and validates
// what comes back. No model call ever happens here, so connecting a desktop
// app costs nothing per token.
//
//   hermes_kinds          what work exists
//   hermes_task           next pending task(s): canonical prompt + contract
//   hermes_validate_draft validate + persist into the review-gated ledger
//   hermes_status         backend switch, queue depth, safety profile
//
// Scope: listing-translation drafting only. Those prompts are non-sensitive
// by construction (assertHermesDraftDispatch enforces listing facts only).
// Lead-reply drafting carries PII and is deliberately NOT exposed here — it
// keeps its self_hosted-only gate in lead-replies.mjs.
//
// Zero dependencies by design, like the rest of production/: the stdio
// transport is newline-delimited JSON-RPC 2.0, small enough to speak by hand.

const LEDGER_PATH = process.env.MS_REALTY_TRANSLATION_LEDGER_PATH || DEFAULT_TRANSLATION_LEDGER_PATH;
const AUDIT_PATH = process.env.MS_REALTY_HERMES_AUDIT_PATH || undefined;
const AUDIT_LOG_PATH = process.env.MS_REALTY_AUDIT_LOG_PATH || DEFAULT_AUDIT_LOG_PATH;
const MAX_TASKS_PER_CALL = 5;

let clientLabel = "desktop-mcp-client";

function freshDispatch(limit) {
  const translationTasks = readTranslationLedger(LEDGER_PATH);
  const translationCoverage = buildTranslationCoverageReport({ translationTasks });
  return buildHermesDraftDispatch({ translationCoverage, limit });
}

function outputContract(row) {
  const seo = row.prompt?.seoTargets || {};
  return {
    required_fields: ["title", "body", "seo_title", "meta_description", "citations"],
    rules: [
      "Every value in prompt.propertyFacts must appear verbatim (character-for-character, untranslated) in the draft text - weave enum values in, e.g. 'Grundstück (land)'.",
      "Never frame Sandanski as a sea destination.",
      "No legal, tax, financing, or valuation claims beyond the source content.",
      ...(seo.title_max_chars ? [`seo_title must be <= ${seo.title_max_chars} characters`] : []),
      ...(seo.meta_description_max_chars ? [`meta_description must be <= ${seo.meta_description_max_chars} characters`] : []),
      "citations must cite the provided sources; reuse the task's citations array unless you add better ones.",
    ],
    suggested_citations: row.citations,
  };
}

const TOOLS = [
  {
    name: "hermes_kinds",
    description: "List the Hermes job kinds this platform accepts from desktop apps, with pending counts.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "hermes_task",
    description:
      "Fetch the next pending Hermes task(s): canonical prompt plus a strict output contract. Generate the draft YOURSELF from the prompt (that is the point - your model, the operator's subscription), then call hermes_validate_draft.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: MAX_TASKS_PER_CALL, description: "How many tasks to fetch (default 1)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "hermes_validate_draft",
    description:
      "Validate a generated draft against the real content rules and, if valid, persist it into the review-gated translation ledger (never published, always requires human approval). On validation failure the error says exactly what to fix - regenerate and retry.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task_id returned by hermes_task" },
        output: {
          type: "object",
          description: "The draft: {title, body, seo_title, meta_description, citations}",
          properties: {
            title: { type: "string" },
            body: { type: "string" },
            seo_title: { type: "string" },
            meta_description: { type: "string" },
            citations: { type: "array" },
          },
          required: ["title", "body", "seo_title", "meta_description", "citations"],
        },
      },
      required: ["task_id", "output"],
      additionalProperties: false,
    },
  },
  {
    name: "hermes_status",
    description: "Current Hermes generation backend, queue depth by locale, and the safety profile of this connection.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

function toolKinds() {
  const dispatch = freshDispatch(1);
  return {
    kinds: [
      {
        kind: "translation_draft",
        description: "Translate listing content between locales under strict fact-preservation rules.",
        pending: dispatch.summary.eligible_tasks,
        workflow: ["hermes_task", "generate the draft with YOUR model", "hermes_validate_draft"],
        sensitive_data: false,
      },
    ],
    note: "Lead-reply drafting is not available over MCP: those prompts carry PII and stay self_hosted-only.",
  };
}

function toolTask(args) {
  const limit = Math.min(Math.max(Number(args?.limit) || 1, 1), MAX_TASKS_PER_CALL);
  const dispatch = freshDispatch(limit);
  if (!dispatch.rows.length) {
    return { tasks: [], message: "No pending Hermes tasks. Everything eligible is drafted or under review." };
  }
  return {
    tasks: dispatch.rows.map((row) => ({
      task_id: row.id,
      object_id: row.object_id,
      source_locale: row.source_locale,
      target_locale: row.target_locale,
      target_direction: row.target_direction,
      prompt: row.prompt,
      output_contract: outputContract(row),
    })),
    remaining_after_these: dispatch.summary.remaining_after_batch,
    next_step: "Generate each draft yourself, then call hermes_validate_draft with {task_id, output}.",
  };
}

function toolValidateDraft(args) {
  const taskId = String(args?.task_id || "").trim();
  if (!taskId) throw new Error("task_id is required");
  // The whole queue, not a window: with 658 eligible tasks a 500-row slice
  // would strand tasks handed out near the tail. The builder just slices, so
  // this costs one coverage pass either way.
  const dispatch = freshDispatch(Number.MAX_SAFE_INTEGER);
  const row = dispatch.rows.find((candidate) => candidate.id === taskId);
  if (!row) throw new Error(`Unknown or already-drafted task: ${taskId}. Call hermes_task for the current queue.`);

  const recordedAt = new Date().toISOString();
  const task = taskFromHermesDraft(row, args.output);
  appendTranslationTask(task, { filePath: LEDGER_PATH, auditPath: AUDIT_PATH, recordedAt });
  appendAuditLog(
    createAuditLogEntry(
      {
        action: "hermes_model_call",
        actor: "hermes_desktop_mcp",
        objectType: "translation_task",
        objectId: task.id,
        locale: task.target_locale,
        status: "persisted",
        metadata: {
          object_id: task.object_id,
          object_type: task.object_type,
          provider_mode: row.provider_mode,
          provider: "desktop-mcp",
          model: clientLabel,
          prompt_version: row.prompt?.version || row.prompt?.role || "translation_draft",
          tool_call_parser: "hermes",
          sensitive_data: false,
          result: "persisted",
        },
      },
      recordedAt,
    ),
    { filePath: AUDIT_LOG_PATH },
  );

  return {
    persisted: task.id,
    status: task.status,
    target_locale: task.target_locale,
    public_indexable: false,
    requires_human_approval: true,
    review_at: "/admin/translations",
  };
}

function toolStatus() {
  const dispatch = freshDispatch(25);
  return {
    backend_switch: hermesBackendStatus(),
    queue: dispatch.summary,
    connection: {
      client: clientLabel,
      drafts_persist_to: LEDGER_PATH,
      audit_log: AUDIT_LOG_PATH,
    },
    safety: {
      draft_only: true,
      human_approval_required: true,
      can_publish: false,
      lead_reply_drafts: "not exposed over MCP (PII stays self_hosted-only)",
    },
  };
}

const TOOL_HANDLERS = {
  hermes_kinds: toolKinds,
  hermes_task: toolTask,
  hermes_validate_draft: toolValidateDraft,
  hermes_status: toolStatus,
};

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function handleRequest(message) {
  const { id, method, params } = message;
  if (method === "initialize") {
    const info = params?.clientInfo;
    if (info?.name) clientLabel = `${info.name}${info.version ? `@${info.version}` : ""}`;
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: params?.protocolVersion || "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "ms-realty-hermes", version: "1.0.0" },
      },
    });
    return;
  }
  if (method === "ping") {
    send({ jsonrpc: "2.0", id, result: {} });
    return;
  }
  if (method === "tools/list") {
    send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    return;
  }
  if (method === "tools/call") {
    const handler = TOOL_HANDLERS[params?.name];
    if (!handler) {
      send({ jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown tool: ${params?.name}` } });
      return;
    }
    try {
      const result = handler(params?.arguments || {});
      send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] } });
    } catch (error) {
      // Tool-level failures (validation rejections included) are results, not
      // protocol errors: the model reads the message, fixes the draft, retries.
      send({
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: `VALIDATION_FAILED: ${error.message}` }], isError: true },
      });
    }
    return;
  }
  if (id !== undefined) send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  if (typeof message.method !== "string") return; // ignore stray responses
  if (message.method.startsWith("notifications/")) return;
  try {
    handleRequest(message);
  } catch (error) {
    if (message.id !== undefined) {
      send({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: error.message } });
    }
  }
});

console.error(`ms-realty-hermes MCP server ready (ledger: ${LEDGER_PATH})`);
