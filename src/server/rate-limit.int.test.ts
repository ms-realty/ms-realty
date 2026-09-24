import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { rateLimitBuckets } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { consumeRateLimit, enforceRateLimit, pruneRateLimits } from "./rate-limit";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

const policy = { capacity: 3, refillPerSecond: 1 };
const at = (seconds: number) => new Date(Date.UTC(2026, 8, 24, 12, 0, 0) + seconds * 1000);

describe("token bucket", () => {
  it("allows a burst up to capacity, then refuses with retry-after", async () => {
    const results = [];
    for (let i = 0; i < 4; i += 1) {
      results.push(
        await consumeRateLimit(t.db, "sign_in.ip", "203.0.113.1", { policy, now: at(0) }),
      );
    }
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3]?.retryAfterSeconds).toBe(1);
    await expect(
      enforceRateLimit(t.db, "sign_in.ip", "203.0.113.1", { policy, now: at(0) }),
    ).rejects.toMatchObject({ code: "rate_limited", status: 429, retryAfterSeconds: 1 });
  });

  it("refills over time but never beyond capacity", async () => {
    const id = "203.0.113.2";
    for (let i = 0; i < 3; i += 1)
      await consumeRateLimit(t.db, "sign_in.ip", id, { policy, now: at(0) });
    expect((await consumeRateLimit(t.db, "sign_in.ip", id, { policy, now: at(2) })).allowed).toBe(
      true,
    );
    const later = await consumeRateLimit(t.db, "sign_in.ip", id, { policy, now: at(1000) });
    expect(later).toMatchObject({ allowed: true, remaining: 2 });
  });

  it("keys by purpose and a keyed hash; no identifier is stored", async () => {
    await consumeRateLimit(t.db, "sign_in.email", "Someone@Example.test", { policy, now: at(0) });
    const rows = await t.db.select().from(rateLimitBuckets);
    expect(JSON.stringify(rows).toLowerCase()).not.toContain("someone@example.test");
    expect(rows.some((r) => r.key.startsWith("sign_in.email:"))).toBe(true);
    // Case and whitespace do not open a fresh bucket.
    const again = await consumeRateLimit(t.db, "sign_in.email", " someone@example.test", {
      policy,
      now: at(0),
    });
    expect(again.remaining).toBe(1);
  });

  it("is atomic under concurrency", async () => {
    const attempts = await Promise.all(
      Array.from({ length: 10 }, () =>
        consumeRateLimit(t.db, "passkey.ip", "203.0.113.9", { policy, now: at(0) }),
      ),
    );
    expect(attempts.filter((a) => a.allowed)).toHaveLength(3);
  });

  it("prunes buckets that have fully refilled", async () => {
    await consumeRateLimit(t.db, "sign_in.ip", "203.0.113.50", { policy, now: at(0) });
    expect(await pruneRateLimits(t.db, at(3600))).toBeGreaterThan(0);
  });
});
