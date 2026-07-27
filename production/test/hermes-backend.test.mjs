import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  DEFAULT_HERMES_BACKEND,
  HERMES_BACKENDS,
  assertHermesBackendAllowed,
  cliHermesProvider,
  hermesBackendStatus,
  hermesProviderMetadataForBackend,
  readHermesBackend,
  setHermesBackend,
} from "../lib/hermes-backend.mjs";
import { readAuditLog } from "../lib/audit-log.mjs";

const FIXED_AT = "2026-07-27T12:00:00Z";

function scratchDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hermes-backend-test-"));
}

test("backend resolution: default, env, then file wins", () => {
  const dir = scratchDir();
  const filePath = path.join(dir, "hermes-backend.json");

  assert.equal(readHermesBackend({ filePath, env: {} }).backend, DEFAULT_HERMES_BACKEND);
  assert.equal(readHermesBackend({ filePath, env: {} }).source, "default");

  const fromEnv = readHermesBackend({ filePath, env: { HERMES_BACKEND: "codex-cli" } });
  assert.deepEqual([fromEnv.backend, fromEnv.source], ["codex-cli", "env"]);

  setHermesBackend("claude-cli", { actor: "test", filePath, auditLogPath: path.join(dir, "audit.jsonl"), recordedAt: FIXED_AT });
  const fromFile = readHermesBackend({ filePath, env: { HERMES_BACKEND: "codex-cli" } });
  assert.deepEqual([fromFile.backend, fromFile.source, fromFile.updated_by], ["claude-cli", "file", "test"]);
});

test("switching is audit-logged and rejects unknown backends and missing actors", () => {
  const dir = scratchDir();
  const filePath = path.join(dir, "hermes-backend.json");
  const auditLogPath = path.join(dir, "audit.jsonl");

  setHermesBackend("codex-cli", { actor: "ops", filePath, auditLogPath, recordedAt: FIXED_AT });
  const rows = readAuditLog(auditLogPath);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, "hermes_backend_switch");
  assert.deepEqual(rows[0].metadata, { previous: DEFAULT_HERMES_BACKEND, next: "codex-cli" });

  assert.throws(() => setHermesBackend("gpt-web", { actor: "ops", filePath, auditLogPath }), /Unknown Hermes backend/);
  assert.throws(() => setHermesBackend("openrouter", { filePath, auditLogPath }), /requires an actor/);
});

test("CLI backends fail closed in production", () => {
  for (const backend of ["claude-cli", "codex-cli"]) {
    assert.throws(() => assertHermesBackendAllowed(backend, { NODE_ENV: "production" }), /dev-machine only/);
    assert.equal(assertHermesBackendAllowed(backend, { NODE_ENV: "development" }), backend);
  }
  assert.equal(assertHermesBackendAllowed("openrouter", { NODE_ENV: "production" }), "openrouter");
  assert.throws(() => cliHermesProvider({ backend: "claude-cli", env: { NODE_ENV: "production" } }), /dev-machine only/);
});

test("provider metadata: CLI backends are hosted inference, never sensitive", () => {
  assert.equal(hermesProviderMetadataForBackend("openrouter"), null);
  const metadata = hermesProviderMetadataForBackend("claude-cli", { env: {} });
  assert.equal(metadata.mode, "claude-cli");
  assert.equal(metadata.sensitiveDataAllowed, false);
  assert.equal(metadata.toolCallParser, "hermes");
});

test("status reports every backend and keeps the reply-draft gate visible", () => {
  const dir = scratchDir();
  const status = hermesBackendStatus({ filePath: path.join(dir, "none.json"), env: {} });
  assert.deepEqual(status.backends, HERMES_BACKENDS);
  assert.equal(status.sensitive_data_allowed, false);
  assert.match(status.lead_reply_drafts, /self_hosted_only/);
});

const DISPATCH_ROW = {
  id: "translation-listing-TEST-1-de",
  object_type: "listing",
  object_id: "TEST-1",
  source_locale: "bg",
  target_locale: "de",
  target_direction: "ltr",
  provider_mode: "hermes_draft",
  reviewer_role: "translation_reviewer",
  source_hash: "hash-1",
  draft_hash: "draft-1",
  prompt: { role: "translation_draft", sourceText: { title: "T" }, propertyFacts: { location: "Sandanski" } },
  source_snapshot: { source_hash: "hash-1" },
  citations: [{ source: "cms_seed" }],
};

const VALID_DRAFT = {
  title: "Haus in Sandanski",
  body: "Ein Haus in Sandanski.",
  seo_title: "Haus Sandanski",
  meta_description: "Haus in Sandanski.",
  citations: [{ source: "cms_seed" }],
};

// A stand-in `claude` binary: prints the -p envelope shape on stdout.
function fakeClaudeScript(dir, draft) {
  const file = path.join(dir, "fake-claude.mjs");
  fs.writeFileSync(
    file,
    `console.log(JSON.stringify({ type: "result", is_error: false, result: ${JSON.stringify(`Draft ready:\n\`\`\`json\n${JSON.stringify(draft)}\n\`\`\``)} }));`,
  );
  return file;
}

// A stand-in `codex` binary: honors --output-last-message like codex exec.
function fakeCodexScript(dir) {
  const file = path.join(dir, "fake-codex.mjs");
  fs.writeFileSync(
    file,
    [
      'import fs from "node:fs";',
      'const at = process.argv.indexOf("--output-last-message");',
      "const target = process.argv[at + 1];",
      `fs.writeFileSync(target, ${JSON.stringify(JSON.stringify(VALID_DRAFT))});`,
      'console.log("codex exec progress noise");',
    ].join("\n"),
  );
  return file;
}

test("claude-cli provider parses the envelope and strips fences", async () => {
  const dir = scratchDir();
  const provider = cliHermesProvider({
    backend: "claude-cli",
    env: { NODE_ENV: "test" },
    binaryOverride: [process.execPath, fakeClaudeScript(dir, VALID_DRAFT)],
  });
  assert.deepEqual(await provider(DISPATCH_ROW), VALID_DRAFT);
});

test("codex-cli provider reads the last-message file, not stdout noise", async () => {
  const dir = scratchDir();
  const provider = cliHermesProvider({
    backend: "codex-cli",
    env: { NODE_ENV: "test" },
    binaryOverride: [process.execPath, fakeCodexScript(dir)],
  });
  assert.deepEqual(await provider(DISPATCH_ROW), VALID_DRAFT);
});

test("CLI failures surface stderr instead of hanging the batch", async () => {
  const dir = scratchDir();
  const script = path.join(dir, "fake-broken.mjs");
  fs.writeFileSync(script, 'console.error("subscription expired"); process.exit(3);');
  const provider = cliHermesProvider({
    backend: "claude-cli",
    env: { NODE_ENV: "test" },
    binaryOverride: [process.execPath, script],
  });
  await assert.rejects(provider(DISPATCH_ROW), /exited 3: subscription expired/);
});

// The MCP server speaks newline-delimited JSON-RPC over stdio; drive it the
// way a desktop app does and assert the full task->draft->persist loop.
test("MCP server: initialize, list, task, reject invalid, persist valid", async () => {
  const dir = scratchDir();
  const server = spawn(process.execPath, ["production/scripts/hermes-mcp-server.mjs"], {
    env: {
      ...process.env,
      MS_REALTY_TRANSLATION_LEDGER_PATH: path.join(dir, "translations.jsonl"),
      MS_REALTY_AUDIT_LOG_PATH: path.join(dir, "audit-log.jsonl"),
    },
    stdio: ["pipe", "pipe", "ignore"],
  });

  const pending = new Map();
  let buffer = "";
  server.stdout.on("data", (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    }
  });
  let nextId = 1;
  const rpc = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, resolve);
      server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      setTimeout(() => reject(new Error(`rpc timeout: ${method}`)), 30_000).unref();
    });

  try {
    const init = await rpc("initialize", { protocolVersion: "2025-06-18", clientInfo: { name: "test-client", version: "9" } });
    assert.equal(init.result.serverInfo.name, "ms-realty-hermes");

    const tools = await rpc("tools/list", {});
    assert.deepEqual(
      tools.result.tools.map((tool) => tool.name),
      ["hermes_kinds", "hermes_task", "hermes_validate_draft", "hermes_status"],
    );

    const taskResult = JSON.parse((await rpc("tools/call", { name: "hermes_task", arguments: { limit: 1 } })).result.content[0].text);
    const task = taskResult.tasks[0];
    assert.ok(task.task_id);
    assert.equal(task.prompt.role, "translation_draft");
    assert.ok(task.output_contract.rules.length >= 3);

    const invalid = await rpc("tools/call", {
      name: "hermes_validate_draft",
      arguments: { task_id: task.task_id, output: { title: "x", body: "x", seo_title: "x", meta_description: "x", citations: [] } },
    });
    assert.equal(invalid.result.isError, true);
    assert.match(invalid.result.content[0].text, /VALIDATION_FAILED/);

    const facts = Object.values(task.prompt.propertyFacts || {}).map(String);
    const body = `Entwurf. ${facts.map((fact) => `Fakt: ${fact}.`).join(" ")}`;
    const valid = await rpc("tools/call", {
      name: "hermes_validate_draft",
      arguments: {
        task_id: task.task_id,
        output: {
          title: body.slice(0, 80),
          body,
          seo_title: body.slice(0, 55),
          meta_description: body.slice(0, 150),
          citations: task.output_contract.suggested_citations,
        },
      },
    });
    assert.notEqual(valid.result.isError, true);
    const persisted = JSON.parse(valid.result.content[0].text);
    assert.equal(persisted.status, "hermes_drafted");
    assert.equal(persisted.requires_human_approval, true);

    const ledgerRow = JSON.parse(fs.readFileSync(path.join(dir, "translations.jsonl"), "utf8").trim().split("\n")[0]);
    assert.equal(ledgerRow.public_indexable, false);
    const auditRow = JSON.parse(fs.readFileSync(path.join(dir, "audit-log.jsonl"), "utf8").trim().split("\n")[0]);
    assert.equal(auditRow.metadata.provider, "desktop-mcp");
    assert.equal(auditRow.metadata.model, "test-client@9");
  } finally {
    server.kill();
  }
});

test("HERMES_BACKEND_FILE relocates the state file for hermetic runs", () => {
  const dir = scratchDir();
  const filePath = path.join(dir, "relocated.json");
  setHermesBackend("codex-cli", { actor: "test", filePath, auditLogPath: path.join(dir, "audit.jsonl"), recordedAt: FIXED_AT });
  const env = { HERMES_BACKEND_FILE: filePath };
  assert.equal(readHermesBackend({ env }).backend, "codex-cli");
  // Pointing at an absent file falls back to env/default resolution.
  const absent = { HERMES_BACKEND_FILE: path.join(dir, "missing.json"), HERMES_BACKEND: "openrouter" };
  assert.deepEqual(
    [readHermesBackend({ env: absent }).backend, readHermesBackend({ env: absent }).source],
    ["openrouter", "env"],
  );
});
