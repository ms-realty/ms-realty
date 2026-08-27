import test from "node:test";
import assert from "node:assert/strict";
import {
  OriginProxyError,
  requestForOrigin,
  responseForPublicOrigin,
  responseWithEdgeBuildMarker,
} from "../../workers/origin-proxy.mjs";

const PUBLIC_URL = "https://ms-realty.ms-realty-bg.workers.dev";
const ORIGIN_URL = "https://ms-realty-review.157-230-109-185.sslip.io";
const ORIGIN_TOKEN = "origin-proxy-test-token-000000000001";

test("origin proxy preserves the request while translating a same-origin browser write", async () => {
  const request = new Request(`${PUBLIC_URL}/api/leads?source=site`, {
    method: "POST",
    headers: {
      authorization: "Basic preview",
      "content-type": "application/json",
      origin: PUBLIC_URL,
      "sec-fetch-site": "same-origin",
      "x-forwarded-host": "spoofed.example",
      "x-ms-realty-origin-token": "client-spoof",
    },
    body: JSON.stringify({ name: "Owner" }),
  });

  const proxied = requestForOrigin(request, ORIGIN_URL, ORIGIN_TOKEN);
  assert.equal(proxied.url, `${ORIGIN_URL}/api/leads?source=site`);
  assert.equal(proxied.method, "POST");
  assert.equal(proxied.headers.get("authorization"), "Basic preview");
  assert.equal(proxied.headers.get("origin"), ORIGIN_URL);
  assert.equal(proxied.headers.get("x-forwarded-host"), null);
  assert.equal(proxied.headers.get("x-ms-realty-origin-token"), ORIGIN_TOKEN);
  assert.deepEqual(await proxied.json(), { name: "Owner" });
});

test("origin proxy rejects cross-site writes and unsafe origin configuration", () => {
  assert.throws(
    () =>
      requestForOrigin(
        new Request(`${PUBLIC_URL}/api/leads`, {
          method: "POST",
          headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
        }),
        ORIGIN_URL,
        ORIGIN_TOKEN,
      ),
    (error) => error instanceof OriginProxyError && error.status === 403,
  );
  assert.throws(
    () => requestForOrigin(new Request(`${PUBLIC_URL}/bg`), "http://127.0.0.1:3000/path", ORIGIN_TOKEN),
    /credential-free HTTPS origin/,
  );
  assert.throws(
    () => requestForOrigin(new Request(`${PUBLIC_URL}/bg`), ORIGIN_URL, "short"),
    /at least 32 characters/,
  );
});

test("origin proxy keeps clients on workers.dev across absolute redirects", () => {
  const response = responseForPublicOrigin(new Response(null, { status: 302, headers: { location: `${ORIGIN_URL}/admin` } }), {
    originValue: ORIGIN_URL,
    publicUrl: `${PUBLIC_URL}/admin/login`,
  });
  assert.equal(response.headers.get("location"), `${PUBLIC_URL}/admin`);
});

test("edge health identifies both the Worker release and durable origin release", async () => {
  const edgeMarker = "a".repeat(40);
  const originMarker = "b".repeat(40);
  const response = await responseWithEdgeBuildMarker(
    Response.json({ service: "ms-realty", status: "ok", build_marker: originMarker }),
    edgeMarker,
    "/api/health",
  );
  assert.deepEqual(await response.json(), {
    service: "ms-realty",
    status: "ok",
    build_marker: edgeMarker,
    origin_build_marker: originMarker,
    runtime: "cloudflare_origin_proxy",
  });
});

test("edge health keeps the release markers when the origin reports a dependency refusal", async () => {
  const response = await responseWithEdgeBuildMarker(
    new Response(JSON.stringify({ service: "ms-realty", status: "degraded", dependency_status: "unavailable", build_marker: "b".repeat(40) }), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    }),
    "a".repeat(40),
    "/api/health",
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.status, "degraded");
  assert.equal(body.build_marker, "a".repeat(40));
  assert.equal(body.origin_build_marker, "b".repeat(40));
});
