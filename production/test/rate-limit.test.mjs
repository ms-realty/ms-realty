import test from "node:test";
import assert from "node:assert/strict";
import { clientIdentity, clientIpFromHeaders, createRateLimiter, rateLimitConfigFromEnv } from "../lib/rate-limit.mjs";

test("limiter allows up to max per key, then blocks with retry-after", () => {
  let now = 1_000;
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2, now: () => now });
  assert.equal(limiter.allow("ip:/api/leads").allowed, true);
  assert.equal(limiter.allow("ip:/api/leads").allowed, true);
  const blocked = limiter.allow("ip:/api/leads");
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 1, "blocked response carries a retry delay");
  assert.equal(limiter.allow("other:/api/leads").allowed, true, "other keys are unaffected");

  now += 61_000;
  assert.equal(limiter.allow("ip:/api/leads").allowed, true, "window resets after windowMs");
});

test("limiter validates its configuration", () => {
  assert.throws(() => createRateLimiter({ windowMs: 100 }));
  assert.throws(() => createRateLimiter({ max: 0 }));
});

test("untrusted identity ignores spoofable forwarded headers, uses the socket peer", () => {
  // Default (no trusted proxy): X-Forwarded-For is NOT trusted — a caller
  // cannot rotate it to escape the limiter.
  assert.equal(clientIpFromHeaders({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }), "unknown");
  assert.equal(clientIdentity({ headers: { "x-forwarded-for": "203.0.113.7" } }, { trustProxy: false }), "unknown");
  // The un-spoofable socket peer is used instead when present.
  assert.equal(
    clientIdentity({ headers: { "x-forwarded-for": "203.0.113.7" }, remoteAddress: "192.0.2.50" }, { trustProxy: false }),
    "192.0.2.50",
  );
  // A rotated X-Forwarded-For does not change the identity for a fixed peer.
  assert.equal(
    clientIdentity({ headers: { "x-forwarded-for": "9.9.9.9" }, remoteAddress: "192.0.2.50" }, { trustProxy: false }),
    "192.0.2.50",
  );
});

test("trusted identity prefers Cloudflare's verified cf-connecting-ip", () => {
  assert.equal(
    clientIdentity({ headers: { "cf-connecting-ip": "198.51.100.5", "x-forwarded-for": "1.2.3.4" } }, { trustProxy: true }),
    "198.51.100.5",
  );
  // Falls back through x-real-ip then the first X-Forwarded-For hop.
  assert.equal(clientIdentity({ headers: { "x-real-ip": "192.0.2.9" } }, { trustProxy: true }), "192.0.2.9");
  assert.equal(
    clientIdentity({ headers: new Headers({ "x-forwarded-for": "203.0.113.99, 10.0.0.1" }) }, { trustProxy: true }),
    "203.0.113.99",
  );
  assert.equal(clientIdentity({ headers: {} }, { trustProxy: true }), "unknown");
});

test("rateLimitConfigFromEnv parses, defaults, disables, and validates", () => {
  assert.deepEqual(rateLimitConfigFromEnv({}), { windowMs: 60_000, max: 30 });
  assert.equal(rateLimitConfigFromEnv({ MS_REALTY_RATE_LIMIT_DISABLED: "1" }), null);
  assert.deepEqual(rateLimitConfigFromEnv({ MS_REALTY_RATE_LIMIT_MAX: "5", MS_REALTY_RATE_LIMIT_WINDOW_MS: "10000" }), {
    windowMs: 10_000,
    max: 5,
  });
  assert.throws(() => rateLimitConfigFromEnv({ MS_REALTY_RATE_LIMIT_MAX: "not-a-number" }));
});
