import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const child = spawn(path.join(root, "scripts", "run-ms-realty-hermes.sh"), [], {
  cwd: root,
  env: { ...process.env, MS_REALTY_REPO_ROOT: process.env.MS_REALTY_REPO_ROOT || path.resolve(root, "../..") },
  stdio: ["pipe", "pipe", "pipe"],
});

let buffer = "";
let stderr = "";
let nextId = 1;
const pending = new Map();

child.stderr.on("data", (chunk) => {
  stderr += chunk;
});
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  for (;;) {
    const newline = buffer.indexOf("\n");
    if (newline < 0) break;
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.id !== undefined && pending.has(message.id)) {
      const callback = pending.get(message.id);
      pending.delete(message.id);
      message.error ? callback.reject(new Error(JSON.stringify(message.error))) : callback.resolve(message.result);
    }
  }
});

function send(method, params) {
  const id = nextId++;
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`MCP ${method} timed out: ${stderr}`));
    }, 10_000);
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
  });
}

try {
  const initialized = await send("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "ms-realty-operator-plugin-smoke", version: "1.0.0" },
  });
  assert.equal(initialized.serverInfo.name, "ms-realty-hermes");
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  const listed = await send("tools/list", {});
  assert.deepEqual(
    listed.tools.map((tool) => tool.name).sort(),
    ["hermes_next_tasks", "hermes_status", "hermes_submit_draft"],
  );
  const status = await send("tools/call", { name: "hermes_status", arguments: {} });
  assert.equal(status.structuredContent.provider.mode, "desktop_subscription");
  assert.ok(status.structuredContent.guardrails.some((value) => value.includes("human review")));
  console.log("MS Realty Operator plugin smoke: pass");
} finally {
  child.kill("SIGTERM");
}
