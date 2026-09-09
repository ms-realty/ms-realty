import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import test from "node:test";
import { fileURLToPath } from "node:url";

const serverPath = fileURLToPath(new URL("../server.mjs", import.meta.url));

async function freePort() {
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

// Regression: a request to /admin/team with an unreachable Postgres answered
// 403 and then killed the process with an unhandled rejection, so every other
// admin and public route died with it.
test("sessionless Team access does not start unreachable Payload or kill the server", async () => {
  const port = await freePort();
  const closedPort = await freePort();
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", DATABASE_URL: `postgresql://127.0.0.1:${closedPort}/unreachable`, PAYLOAD_SECRET: "test-secret-not-real-0123456789" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break; } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const team = await fetch(`http://127.0.0.1:${port}/admin/team?locale=en`, { headers: { authorization: "Bearer local-admin-smoke" } });
    assert.equal(team.status, 403);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    assert.equal(child.exitCode, null, `server exited: ${stderr.slice(-600)}`);
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(health.status, 200);
    assert.doesNotMatch(stderr, /unhandled_rejection|ECONNREFUSED/);
  } finally {
    child.kill("SIGTERM");
  }
});
