import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fromRoot } from "../lib/paths.mjs";

test("Hermes stdio MCP initializes and exposes the guarded bridge tools", async (t) => {
  const child = spawn(process.execPath, [fromRoot("production", "scripts", "hermes-mcp-server.mjs")], {
    cwd: fromRoot(),
    stdio: ["pipe", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));

  let buffer = "";
  let stderr = "";
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
      const request = pending.get(message.id);
      if (!request) continue;
      pending.delete(message.id);
      message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
    }
  });

  let nextId = 1;
  const send = (method, params) => {
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
  };

  const initialized = await send("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "ms-realty-hermes-test", version: "1.0.0" },
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
  assert.ok(status.structuredContent.eligible_for_desktop > 0);
});
