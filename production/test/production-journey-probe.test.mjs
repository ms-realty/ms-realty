import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { fromRoot } from "../lib/paths.mjs";

function runProbe(baseUrl, expectedBuildMarker) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fromRoot("production", "scripts", "probe-production-journeys.mjs")], {
      env: {
        ...process.env,
        MS_REALTY_EXPECTED_BUILD_MARKER: expectedBuildMarker,
        MS_REALTY_PRODUCTION_URL: baseUrl,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr, stdout }));
  });
}

test("production journey probe fails when either deployed layer reports a different exact release", async (t) => {
  const actualBuildMarker = "a".repeat(40);
  const expectedBuildMarker = "b".repeat(40);
  let health = { service: "ms-realty", status: "ok", build_marker: actualBuildMarker };
  const server = http.createServer((request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (request.url === "/api/health") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(health));
    } else if (request.url?.startsWith("/bg/tarsene")) {
      response.statusCode = 503;
      response.end('MS Realty <div class="search-unavailable"></div><a href="tel:+359879696870">Call</a>');
    } else if (request.url === "/bg") {
      response.end('MS Realty <a href="tel:+359879696870">Call</a>');
    } else if (request.url === "/admin/login") {
      response.end("<form></form>");
    } else if (request.url === "/api/admin/launch-readiness") {
      response.statusCode = 401;
      response.end();
    } else if (request.url === "/api/ready") {
      response.statusCode = 503;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ blockers: [] }));
    } else {
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const result = await runProbe(baseUrl, expectedBuildMarker);
  assert.equal(result.code, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.failed, 1);
  assert.deepEqual(report.checks.find(({ id }) => id === "health"), {
    id: "health",
    status: "fail",
    error: "health must report expected build marker",
  });

  health = { service: "ms-realty", status: "ok", build_marker: expectedBuildMarker, origin_build_marker: actualBuildMarker };
  const staleOrigin = await runProbe(baseUrl, expectedBuildMarker);
  assert.equal(staleOrigin.code, 1, staleOrigin.stderr);
  const staleOriginReport = JSON.parse(staleOrigin.stdout);
  assert.deepEqual(staleOriginReport.checks.find(({ id }) => id === "health"), {
    id: "health",
    status: "fail",
    error: "health origin must report expected build marker",
  });
});
