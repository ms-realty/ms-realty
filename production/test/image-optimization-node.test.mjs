import test from "node:test";
import assert from "node:assert/strict";
import { createHttpApp } from "../lib/http.mjs";

// The bare Node server has no /_next/image optimizer; it must keep serving
// the plain original media URLs (this file runs in its own process, so the
// App Router adapter's optimizer flag is not enabled here).

test("node server public HTML keeps plain original media URLs", async () => {
  const app = createHttpApp({});
  const res = await app({
    method: "GET",
    url: "/bg/imoti/MS-CRAWL-0001",
    headers: { accept: "text/html", host: "makler-realty.com" },
    body: "",
  });
  assert.equal(res.status, 200);
  assert.ok(!res.body.includes("/_next/image"), "no optimizer URLs on the node surface");
  assert.match(res.body, /src="https:\/\/makler-realty\.com\/wp-content\/uploads\//);
});
