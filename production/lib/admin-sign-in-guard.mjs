import crypto from "node:crypto";
import { appendAuditLog, createAuditLogEntry } from "./audit-log.mjs";
import { clientIdentity } from "./rate-limit.mjs";

// Admin sign-in guard: an address-scoped failure throttle in front of
// /admin/login, and one audit record for every attempt.
//
// Payload's own maxLoginAttempts is per account, which is the wrong axis
// twice over. It does nothing about one address walking a list of operator
// email addresses, and it hands an attacker a way to lock every known
// operator out of the workbench with five requests each. The throttle here
// counts FAILURES per client address, so a busy office is never punished for
// signing in often, and a service outage never counts against anyone.
//
// Attempts are recorded through createAuditLogEntry, so the ADMIN_ACTIONS
// allowlist governs a sign-in record exactly like every other admin action.
// Neither the client address nor the email address is stored in the clear:
// both are reduced to a short fingerprint, which still groups repeated
// attempts against one address or from one source for review.

const DEFAULT_WINDOW_MS = 15 * 60_000;
const DEFAULT_MAX_FAILURES = 10;

// Short one-way fingerprint. Long enough that two addresses do not collide in
// any realistic ledger, short enough to read in a review.
export function signInFingerprint(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "unknown";
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

// The address the attempt came from, or "" when none can be established. An
// unidentifiable caller is deliberately NOT throttled: bucketing every such
// request together would let one attacker lock out every operator, which is
// the failure this guard exists to prevent.
export function signInClientKey(request = {}, { trustProxy = false } = {}) {
  const identity = clientIdentity(request, { trustProxy });
  return identity && identity !== "unknown" ? identity : "";
}

export function createSignInThrottle({
  windowMs = DEFAULT_WINDOW_MS,
  maxFailures = DEFAULT_MAX_FAILURES,
  now = () => Date.now(),
} = {}) {
  if (!Number.isFinite(windowMs) || windowMs < 1000) throw new Error("sign-in throttle windowMs must be >= 1000");
  if (!Number.isInteger(maxFailures) || maxFailures < 1) throw new Error("sign-in throttle maxFailures must be a positive integer");
  const buckets = new Map();
  let calls = 0;
  const sweep = (at) => {
    // Amortized, so a long-running process never accumulates stale addresses.
    if (++calls % 128 !== 0) return;
    for (const [key, bucket] of buckets) if (bucket.resetAt <= at) buckets.delete(key);
  };
  return {
    // A peek, never a charge: the limit counts failures, not sign-ins.
    check(key) {
      const at = now();
      sweep(at);
      const bucket = key ? buckets.get(key) : null;
      if (!bucket || bucket.resetAt <= at) return { allowed: true, remaining: maxFailures };
      if (bucket.failures < maxFailures) return { allowed: true, remaining: maxFailures - bucket.failures };
      return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - at) / 1000)) };
    },
    recordFailure(key) {
      if (!key) return { failures: 0, remaining: maxFailures };
      const at = now();
      sweep(at);
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= at) {
        buckets.set(key, { failures: 1, resetAt: at + windowMs });
        return { failures: 1, remaining: maxFailures - 1 };
      }
      bucket.failures += 1;
      return { failures: bucket.failures, remaining: Math.max(0, maxFailures - bucket.failures) };
    },
    size() {
      return buckets.size;
    },
  };
}

function intFrom(value, fallback, name) {
  const raw = value === undefined || value === "" ? String(fallback) : String(value);
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a positive integer`);
  const parsed = Number(raw);
  if (parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

// Returns null when the sign-in throttle is disabled via env.
export function signInGuardConfigFromEnv(env = process.env) {
  if (env.MS_REALTY_ADMIN_LOGIN_RATE_LIMIT_DISABLED === "1") return null;
  return {
    windowMs: intFrom(
      env.MS_REALTY_ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS,
      DEFAULT_WINDOW_MS,
      "MS_REALTY_ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS",
    ),
    maxFailures: intFrom(env.MS_REALTY_ADMIN_LOGIN_RATE_LIMIT_MAX, DEFAULT_MAX_FAILURES, "MS_REALTY_ADMIN_LOGIN_RATE_LIMIT_MAX"),
  };
}

// The audit row for one attempt. The operator id is recorded whenever the
// password half succeeded, because "someone holds this operator's password"
// is the single most useful thing a review can learn from a refusal.
export function signInAuditEntry({
  outcome,
  email = "",
  clientKey = "",
  operatorId = "",
  reason = "",
  recordedAt = new Date().toISOString(),
} = {}) {
  const succeeded = outcome === "succeeded";
  const operator = String(operatorId || "").trim();
  return createAuditLogEntry(
    {
      action: succeeded ? "admin_signed_in" : "admin_sign_in_failed",
      actor: operator || "anonymous",
      object_type: "admin_sign_in",
      object_id: signInFingerprint(email),
      status: succeeded ? "succeeded" : "failed",
      metadata: {
        client_hash: signInFingerprint(clientKey),
        ...(operator ? { operator_id: operator } : {}),
        ...(reason ? { reason: String(reason).slice(0, 40) } : {}),
      },
    },
    recordedAt,
  );
}

// Writes the attempt where this runtime can keep it. A durable-only runtime
// has an ephemeral disk, so the entry goes to the log stream instead of a
// file that resets on the next wake — the same choice the durable listing
// audit already makes. A ledger that cannot be written must never turn a
// sign-in into a 500, so every failure here is contained.
export function recordSignInAttempt(details, { auditLogPath = "", durableOnly = false, logger = console.info } = {}) {
  let entry;
  try {
    entry = signInAuditEntry(details);
  } catch {
    return null;
  }
  try {
    if (auditLogPath && !durableOnly) appendAuditLog(entry, { filePath: auditLogPath });
    else logger(JSON.stringify({ kind: "admin_sign_in_attempt", ...entry }));
  } catch {
    try {
      logger(JSON.stringify({ kind: "admin_sign_in_attempt", ...entry }));
    } catch {
      // Nowhere left to record it; the sign-in decision itself still stands.
    }
  }
  return entry;
}
