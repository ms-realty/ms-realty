// Fixed-window in-process rate limiter for public write endpoints.
// One limiter instance per server process; keyed by client IP + route.
// Behind Caddy/another proxy, the client IP comes from x-forwarded-for.

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 30;

export function createRateLimiter({ windowMs = DEFAULT_WINDOW_MS, max = DEFAULT_MAX, now = () => Date.now() } = {}) {
  if (!Number.isFinite(windowMs) || windowMs < 1000) throw new Error("rate limiter windowMs must be >= 1000");
  if (!Number.isInteger(max) || max < 1) throw new Error("rate limiter max must be a positive integer");
  const buckets = new Map();
  let calls = 0;
  return {
    allow(key) {
      const at = now();
      // Amortized sweep so long-running processes do not accumulate stale keys.
      if (++calls % 256 === 0) {
        for (const [bucketKey, bucket] of buckets) {
          if (bucket.resetAt <= at) buckets.delete(bucketKey);
        }
      }
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= at) {
        const resetAt = at + windowMs;
        buckets.set(key, { count: 1, resetAt });
        return { allowed: true, remaining: max - 1, resetAt };
      }
      if (bucket.count < max) {
        bucket.count += 1;
        return { allowed: true, remaining: max - bucket.count, resetAt: bucket.resetAt };
      }
      return {
        allowed: false,
        remaining: 0,
        resetAt: bucket.resetAt,
        retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - at) / 1000)),
      };
    },
    size() {
      return buckets.size;
    },
  };
}

function readHeader(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") return String(headers.get(name) || "");
  const direct = headers[name];
  if (direct) return String(direct);
  const pascal = name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-");
  return headers[pascal] ? String(headers[pascal]) : "";
}

export function clientIpFromHeaders(headers = {}) {
  const forwarded = readHeader(headers, "x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  const realIp = readHeader(headers, "x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

function intFrom(value, fallback, name) {
  const raw = value === undefined || value === "" ? String(fallback) : String(value);
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a positive integer`);
  const parsed = Number(raw);
  if (parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

// Returns null when rate limiting is disabled via env.
export function rateLimitConfigFromEnv(env = process.env) {
  if (env.MS_REALTY_RATE_LIMIT_DISABLED === "1") return null;
  return {
    windowMs: intFrom(env.MS_REALTY_RATE_LIMIT_WINDOW_MS, DEFAULT_WINDOW_MS, "MS_REALTY_RATE_LIMIT_WINDOW_MS"),
    max: intFrom(env.MS_REALTY_RATE_LIMIT_MAX, DEFAULT_MAX, "MS_REALTY_RATE_LIMIT_MAX"),
  };
}
