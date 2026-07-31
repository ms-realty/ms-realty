import test from "node:test";
import assert from "node:assert/strict";
import { crossOriginWriteRejection } from "../lib/request-guard.mjs";

const HOST = { host: "review.ms-realty.example" };

test("safe methods are never rejected", () => {
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    assert.equal(crossOriginWriteRejection(method, { ...HOST, origin: "https://evil.example" }), null);
  }
});

test("non-browser clients pass: no Origin and no Sec-Fetch-Site cannot be CSRF'd", () => {
  assert.equal(crossOriginWriteRejection("POST", HOST), null);
});

test("same-origin browser writes pass", () => {
  assert.equal(
    crossOriginWriteRejection("POST", { ...HOST, origin: "https://review.ms-realty.example", "sec-fetch-site": "same-origin" }),
    null,
  );
  // A no-JS admin form posts Origin without Sec-Fetch-Site on older browsers.
  assert.equal(crossOriginWriteRejection("POST", { ...HOST, origin: "https://review.ms-realty.example" }), null);
});

test("cross-site writes are rejected", () => {
  assert.equal(
    crossOriginWriteRejection("POST", { ...HOST, origin: "https://evil.example", "sec-fetch-site": "cross-site" }),
    "cross_site_request",
  );
  // Sec-Fetch-Site absent, Origin present and foreign: still rejected.
  assert.equal(crossOriginWriteRejection("POST", { ...HOST, origin: "https://evil.example" }), "cross_origin_request");
});

test("x-forwarded-host wins over host, so the guard sees the public origin behind Caddy", () => {
  const headers = {
    host: "app:3000",
    "x-forwarded-host": "review.ms-realty.example",
    origin: "https://review.ms-realty.example",
  };
  assert.equal(crossOriginWriteRejection("POST", headers), null);
});

test("MS_REALTY_TRUSTED_WRITE_ORIGINS allows a named extra host", () => {
  const headers = { ...HOST, origin: "https://admin.ms-realty.example" };
  assert.equal(crossOriginWriteRejection("POST", headers), "cross_origin_request");
  assert.equal(
    crossOriginWriteRejection("POST", headers, { env: { MS_REALTY_TRUSTED_WRITE_ORIGINS: "https://admin.ms-realty.example" } }),
    null,
  );
  // Bare hostnames are accepted too.
  assert.equal(
    crossOriginWriteRejection("POST", headers, { env: { MS_REALTY_TRUSTED_WRITE_ORIGINS: "admin.ms-realty.example" } }),
    null,
  );
});

test("Headers objects work, not just plain header maps", () => {
  const headers = new Headers({ host: "review.ms-realty.example", origin: "https://evil.example" });
  assert.equal(crossOriginWriteRejection("POST", headers), "cross_origin_request");
});

test("a malformed Origin is rejected rather than parsed loosely", () => {
  assert.equal(crossOriginWriteRejection("POST", { ...HOST, origin: "not a url" }), "invalid_origin");
});
