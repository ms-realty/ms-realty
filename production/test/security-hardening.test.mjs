import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHttpApp } from "../lib/http.mjs";
import { close, createNodeServer, listen } from "../lib/node-server.mjs";

test("public HTML responses carry a content-security-policy", async () => {
  const app = createHttpApp({});
  const res = await app({ method: "GET", url: "/bg", headers: { accept: "text/html", host: "localhost" }, body: "" });
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /text\/html/);
  assert.match(res.headers["content-security-policy"], /default-src 'self'/);
  assert.match(res.headers["content-security-policy"], /frame-ancestors 'none'/);
  assert.match(res.headers["content-security-policy"], /object-src 'none'/);
});

test("public write endpoints are rate limited when configured", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-rate-limit-http-"));
  const eventLedgerPath = path.join(dir, "events.jsonl");
  fs.writeFileSync(eventLedgerPath, "");
  const app = createHttpApp({ rateLimit: { max: 2, windowMs: 60_000 }, eventLedgerPath });
  const post = (ip) =>
    app({
      method: "POST",
      url: "/api/events",
      // The node server injects the socket address; forwarded headers are only
      // honoured behind a trusted proxy (MS_REALTY_TRUST_PROXY=1).
      headers: { "content-type": "application/json", "x-ms-realty-socket-address": ip },
      body: JSON.stringify({ event: "rate_limit_probe", page: "/bg" }),
    });

  const first = await post("203.0.113.1");
  const second = await post("203.0.113.1");
  assert.notEqual(first.status, 429);
  assert.notEqual(second.status, 429);

  const blocked = await post("203.0.113.1");
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.kind, "rate_limited");
  assert.ok(Number(blocked.headers["retry-after"]) >= 1);
  assert.equal(blocked.headers["cache-control"], "no-store");

  const otherIp = await post("203.0.113.2");
  assert.notEqual(otherIp.status, 429, "a different client IP is not blocked");
});

test("public write endpoints are not limited without configuration", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-no-rate-limit-http-"));
  const eventLedgerPath = path.join(dir, "events.jsonl");
  fs.writeFileSync(eventLedgerPath, "");
  const app = createHttpApp({ eventLedgerPath });
  for (let index = 0; index < 5; index += 1) {
    const res = await app({
      method: "POST",
      url: "/api/events",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "probe", page: "/bg" }),
    });
    assert.notEqual(res.status, 429);
  }
});

test("node server gzip-compresses large text responses and skips small ones", async () => {
  const big = `<!doctype html><html><body>${"x".repeat(5000)}</body></html>`;
  const small = "ok";
  const app = async (request) =>
    request.url === "/big"
      ? { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: big }
      : { status: 200, headers: { "content-type": "text/plain; charset=utf-8" }, body: small };
  const server = createNodeServer(app);
  const address = await listen(server);
  try {
    const bigResponse = await fetch(`http://127.0.0.1:${address.port}/big`, { headers: { "accept-encoding": "gzip" } });
    assert.equal(bigResponse.headers.get("content-encoding"), "gzip");
    assert.match(bigResponse.headers.get("vary") || "", /accept-encoding/);
    assert.equal(await bigResponse.text(), big, "body survives compression round-trip");

    const smallResponse = await fetch(`http://127.0.0.1:${address.port}/small`);
    assert.equal(smallResponse.headers.get("content-encoding"), null);
    assert.equal(await smallResponse.text(), small);
  } finally {
    await close(server);
  }
});
