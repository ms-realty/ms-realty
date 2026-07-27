import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { DEFAULT_AUDIT_LOG_PATH, appendAuditLog, createAuditLogEntry } from "./audit-log.mjs";
import { openAiCompatibleHermesProvider } from "./hermes-draft-worker.mjs";
import { fromRoot } from "./paths.mjs";

// Hermes generation backend switch, ported from the Tempora convention.
//
// Three backends drive the SAME draft pipeline (dispatch -> provider ->
// validation -> review-gated ledger); only the model call changes:
//
//   openrouter   cloud, per-token spend, works everywhere (default)
//   claude-cli   operator's desktop Claude subscription via `claude -p`
//   codex-cli    operator's desktop Codex subscription via `codex exec`
//
// The CLI backends exist so drafting costs nothing beyond the subscriptions
// the operator already pays for. They are DEV-MACHINE ONLY and fail closed in
// production: the container has no CLIs and no operator session to bill, and
// a silent fallback to the paid API would defeat the point of switching.
//
// Scope guard: this switch covers listing-translation drafting, whose prompts
// are non-sensitive by construction (assertHermesDraftDispatch enforces that
// they contain only listing facts). Lead-reply drafting carries PII and keeps
// its own stricter gate — self_hosted only, in lead-replies.mjs — which this
// switch deliberately does not touch: desktop CLIs are hosted inference too.

export const HERMES_BACKENDS = Object.freeze(["openrouter", "claude-cli", "codex-cli"]);
export const HERMES_CLI_BACKENDS = Object.freeze(["claude-cli", "codex-cli"]);
export const DEFAULT_HERMES_BACKEND = "openrouter";
export const DEFAULT_HERMES_BACKEND_PATH = fromRoot("production", "data", "hermes-backend.json");

const CLI_BINARIES = Object.freeze({ "claude-cli": "claude", "codex-cli": "codex" });
const DEFAULT_CLI_TIMEOUT_MS = 300_000;

// Same contract as the OpenAI-compatible system message in the draft worker,
// with an extra "no prose" line because CLI agents chat by default.
const CLI_SYSTEM_PROMPT = [
  "You are Hermes Agent. Return exactly one JSON object with title, body, seo_title, meta_description, citations.",
  "Draft only; never publish or invoke tools.",
  "The validator requires every value in propertyFacts to appear verbatim (character-for-character, untranslated) somewhere in the draft text - weave each one in, e.g. as 'Grundstück (land)'.",
  "Respond with ONLY the JSON object - no prose, no markdown fences.",
].join(" ");

function assertKnownBackend(backend) {
  if (!HERMES_BACKENDS.includes(backend)) {
    throw new Error(`Unknown Hermes backend: ${backend}. Valid: ${HERMES_BACKENDS.join(", ")}`);
  }
  return backend;
}

export function isCliBackend(backend) {
  return HERMES_CLI_BACKENDS.includes(backend);
}

// Hermetic runs (tests, sandboxes) relocate the state file entirely; a plain
// HERMES_BACKEND env value must not be able to beat an operator's switch, but
// pointing the FILE elsewhere makes the whole mechanism scoped.
export function hermesBackendFilePath(env = process.env) {
  return String(env.HERMES_BACKEND_FILE || "").trim() || DEFAULT_HERMES_BACKEND_PATH;
}

// File wins over env so an operator's explicit switch survives shells that
// export HERMES_BACKEND; env stays useful for one-off runs and CI.
export function readHermesBackend({ filePath, env = process.env } = {}) {
  filePath = filePath || hermesBackendFilePath(env);
  if (fs.existsSync(filePath)) {
    const record = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return {
      backend: assertKnownBackend(String(record.backend || "").trim()),
      source: "file",
      updated_at: record.updated_at || null,
      updated_by: record.updated_by || null,
    };
  }
  const fromEnv = String(env.HERMES_BACKEND || "").trim();
  if (fromEnv) return { backend: assertKnownBackend(fromEnv), source: "env", updated_at: null, updated_by: null };
  return { backend: DEFAULT_HERMES_BACKEND, source: "default", updated_at: null, updated_by: null };
}

export function setHermesBackend(
  backend,
  {
    actor,
    filePath = hermesBackendFilePath(),
    auditLogPath = DEFAULT_AUDIT_LOG_PATH,
    recordedAt = new Date().toISOString(),
  } = {},
) {
  assertKnownBackend(backend);
  const actorName = String(actor || "").trim();
  if (!actorName) throw new Error("Hermes backend switch requires an actor");

  const previous = readHermesBackend({ filePath }).backend;
  const record = { backend, updated_at: recordedAt, updated_by: actorName };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`);

  appendAuditLog(
    createAuditLogEntry(
      {
        action: "hermes_backend_switch",
        actor: actorName,
        objectType: "hermes_backend",
        objectId: backend,
        status: "applied",
        metadata: { previous, next: backend },
      },
      recordedAt,
    ),
    { filePath: auditLogPath },
  );
  return record;
}

// Fail closed: in production the CLI backends refuse to construct a provider,
// so queued drafts stay queued instead of silently billing the paid API.
export function assertHermesBackendAllowed(backend, env = process.env) {
  assertKnownBackend(backend);
  if (isCliBackend(backend) && env.NODE_ENV === "production") {
    throw new Error(`Hermes backend ${backend} is dev-machine only; production must use openrouter or self_hosted`);
  }
  return backend;
}

export function cliBinaryAvailable(backend, { spawnSyncImpl = spawnSync } = {}) {
  const binary = CLI_BINARIES[backend];
  if (!binary) return false;
  const probe = spawnSyncImpl(process.platform === "win32" ? "where" : "which", [binary], { encoding: "utf8" });
  return probe.status === 0;
}

function parseDraftJson(text) {
  const trimmed = String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/g, "");
  if (!trimmed) throw new Error("Hermes CLI returned no draft JSON");
  // CLI agents occasionally wrap the object in a sentence despite the prompt;
  // recover the outermost object rather than failing the whole batch row.
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("Hermes CLI output contains no JSON object");
  return JSON.parse(trimmed.slice(start, end + 1));
}

function runCli(argv, { timeoutMs = DEFAULT_CLI_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Hermes CLI timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Hermes CLI exited ${code}: ${stderr.trim().slice(0, 400)}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function cliPromptFor(row) {
  return `${CLI_SYSTEM_PROMPT}\n\nTask input JSON:\n${JSON.stringify(row.prompt)}`;
}

// `claude -p --output-format json` prints one envelope object whose `result`
// field is the assistant's final text; the draft JSON lives inside that text.
async function claudeCliDraft(row, { binary, model, timeoutMs }) {
  const argv = [...binary, "-p", cliPromptFor(row), "--output-format", "json", ...(model ? ["--model", model] : [])];
  const { stdout } = await runCli(argv, { timeoutMs });
  const envelope = JSON.parse(stdout);
  if (envelope.is_error) throw new Error(`claude-cli reported an error: ${String(envelope.result).slice(0, 200)}`);
  return parseDraftJson(envelope.result);
}

// `codex exec` streams progress to stdout; the only stable contract for the
// final answer is --output-last-message, so the draft is read from that file.
async function codexCliDraft(row, { binary, model, timeoutMs }) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-codex-"));
  const lastMessagePath = path.join(scratch, "last-message.txt");
  try {
    const argv = [
      ...binary,
      "exec",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--output-last-message",
      lastMessagePath,
      ...(model ? ["--model", model] : []),
      cliPromptFor(row),
    ];
    await runCli(argv, { timeoutMs });
    return parseDraftJson(fs.readFileSync(lastMessagePath, "utf8"));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

export function cliHermesProvider({
  backend,
  env = process.env,
  model = env.HERMES_CLI_MODEL || null,
  timeoutMs = Number(env.HERMES_CLI_TIMEOUT_MS || DEFAULT_CLI_TIMEOUT_MS),
  // Tests replace the executable with [process.execPath, fixture.mjs]; real
  // runs resolve `claude`/`codex` from PATH.
  binaryOverride = null,
} = {}) {
  assertHermesBackendAllowed(backend, env);
  const binary = binaryOverride || [CLI_BINARIES[backend]];
  const draft = backend === "claude-cli" ? claudeCliDraft : codexCliDraft;
  return (row) => draft(row, { binary, model, timeoutMs });
}

export function hermesProviderForBackend(backend, { env = process.env, ...cliOptions } = {}) {
  assertHermesBackendAllowed(backend, env);
  if (backend === "openrouter") return openAiCompatibleHermesProvider();
  return cliHermesProvider({ backend, env, ...cliOptions });
}

// Worker reports and audit rows need provider metadata; for CLI backends the
// endpoint is the local binary and sensitive data stays forbidden (desktop
// CLIs are hosted inference under the operator's subscription, not
// self-hosted infrastructure).
export function hermesProviderMetadataForBackend(backend, { env = process.env } = {}) {
  if (backend === "openrouter") return null; // worker derives it from env, unchanged
  return {
    mode: backend,
    model: env.HERMES_CLI_MODEL || `${backend}-subscription-default`,
    endpoint: null,
    toolCallParser: "hermes",
    sensitiveDataAllowed: false,
  };
}

export function hermesBackendStatus({ filePath, env = process.env } = {}) {
  const record = readHermesBackend({ filePath: filePath || hermesBackendFilePath(env), env });
  const cli = isCliBackend(record.backend)
    ? { binary: CLI_BINARIES[record.backend], available: cliBinaryAvailable(record.backend) }
    : null;
  let productionAllowed = true;
  try {
    assertHermesBackendAllowed(record.backend, { NODE_ENV: "production" });
  } catch {
    productionAllowed = false;
  }
  return {
    ...record,
    backends: HERMES_BACKENDS,
    cli,
    model: isCliBackend(record.backend)
      ? env.HERMES_CLI_MODEL || `${record.backend}-subscription-default`
      : String(env.HERMES_MODEL || "").trim() || null,
    production_allowed: productionAllowed,
    sensitive_data_allowed: false,
    // Reads as documentation in the admin UI: switching backends never
    // loosens the PII gate on reply drafting.
    lead_reply_drafts: "self_hosted_only_unaffected_by_this_switch",
  };
}
