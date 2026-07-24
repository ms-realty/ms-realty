import test from "node:test";
import assert from "node:assert/strict";
import { clientIpFromHeaders, createRateLimiter, rateLimitConfigFromEnv } from "../lib/rate-limit.mjs";

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

test("clientIpFromHeaders parses plain objects and fetch Headers", () => {
  assert.equal(clientIpFromHeaders({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }), "203.0.113.7");
  assert.equal(clientIpFromHeaders({ "X-Forwarded-For": "198.51.100.3" }), "198.51.100.3");
  assert.equal(clientIpFromHeaders({ "x-real-ip": "192.0.2.9" }), "192.0.2.9");
  assert.equal(clientIpFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.99" })), "203.0.113.99");
  assert.equal(clientIpFromHeaders({}), "unknown");
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
