// Postgres token buckets for public endpoints. Keys are the purpose plus a keyed hash of the
// identifier (IP address, email), so the table holds no personal data.
import "server-only";
import { eq, lt } from "drizzle-orm";
import { rateLimitBuckets } from "@/db/schema";
import { getEnv } from "./config/env";
import { keyedHash } from "./crypto";
import type { Executor } from "./db";
import { AppError } from "./errors";

export interface RateLimitPolicy {
  /** Largest burst. */
  readonly capacity: number;
  /** Tokens regained per second. */
  readonly refillPerSecond: number;
}

export const rateLimitPolicies = {
  /**
   * Sign-in link requests per email address from one client IP: 5 at once, then one every
   * 3 minutes. Keyed with the IP so requests from elsewhere cannot lock the address out.
   */
  "sign_in.email": { capacity: 5, refillPerSecond: 1 / 180 },
  /** Sign-in link requests per client IP: 20 at once, then one every 30 seconds. */
  "sign_in.ip": { capacity: 20, refillPerSecond: 1 / 30 },
  /** Passkey ceremonies per client IP. */
  "passkey.ip": { capacity: 30, refillPerSecond: 1 / 10 },
  /** New inquiries (POST /api/inquiries) per client IP: 5 at once, then one every 2 minutes. */
  "inquiry.ip": { capacity: 5, refillPerSecond: 1 / 120 },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitPurpose = keyof typeof rateLimitPolicies;

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  /** Whole seconds until the next token; 0 when allowed. */
  readonly retryAfterSeconds: number;
}

export interface ConsumeOptions {
  readonly cost?: number;
  readonly now?: Date;
  /** Overrides the named policy (tests, one-off endpoints). */
  readonly policy?: RateLimitPolicy;
}

export async function consumeRateLimit(
  db: Executor,
  purpose: RateLimitPurpose,
  identifier: string,
  options: ConsumeOptions = {},
): Promise<RateLimitDecision> {
  const policy = options.policy ?? rateLimitPolicies[purpose];
  const cost = options.cost ?? 1;
  const now = options.now ?? new Date();
  const key = `${purpose}:${keyedHash(getEnv().authSecret, identifier.trim().toLowerCase())}`;
  // An idle bucket is full again after this long, so its row can go.
  const expiresAt = new Date(now.getTime() + (policy.capacity / policy.refillPerSecond) * 1000);

  return db.transaction(async (tx) => {
    await tx
      .insert(rateLimitBuckets)
      .values({ key, tokens: policy.capacity, refilledAt: now, expiresAt })
      .onConflictDoNothing();
    const [bucket] = await tx
      .select()
      .from(rateLimitBuckets)
      .where(eq(rateLimitBuckets.key, key))
      .for("update");
    if (!bucket) throw new Error("Rate-limit bucket vanished inside its transaction.");

    const elapsed = Math.max(0, (now.getTime() - bucket.refilledAt.getTime()) / 1000);
    const available = Math.min(policy.capacity, bucket.tokens + elapsed * policy.refillPerSecond);
    const allowed = available >= cost;
    const tokens = allowed ? available - cost : available;
    await tx
      .update(rateLimitBuckets)
      .set({ tokens, refilledAt: now, expiresAt })
      .where(eq(rateLimitBuckets.key, key));
    return {
      allowed,
      remaining: Math.floor(tokens),
      retryAfterSeconds: allowed ? 0 : Math.ceil((cost - tokens) / policy.refillPerSecond),
    };
  });
}

/** Consumes a token or throws `rate_limited` carrying Retry-After. */
export async function enforceRateLimit(
  db: Executor,
  purpose: RateLimitPurpose,
  identifier: string,
  options?: ConsumeOptions,
): Promise<void> {
  const decision = await consumeRateLimit(db, purpose, identifier, options);
  if (!decision.allowed) {
    throw new AppError("rate_limited", { retryAfterSeconds: decision.retryAfterSeconds });
  }
}

/** Deletes buckets that have refilled completely; run periodically by the job worker. */
export async function pruneRateLimits(db: Executor, now: Date = new Date()): Promise<number> {
  const rows = await db
    .delete(rateLimitBuckets)
    .where(lt(rateLimitBuckets.expiresAt, now))
    .returning({ key: rateLimitBuckets.key });
  return rows.length;
}
