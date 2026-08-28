import crypto from "node:crypto";
import { operatorAgentSecret } from "./operator-agent-access.mjs";

export const OPERATOR_CHALLENGE_VERSION = "c1";
export const OPERATOR_CHALLENGE_SECRET_ENV = "MS_REALTY_OPERATOR_CHALLENGE_SECRET";
export const DEFAULT_OPERATOR_CHALLENGE_TTL_SECONDS = 120;
const MIN_SECRET_LENGTH = 32;
const MAX_TTL_SECONDS = 900;
const TOKEN_PART_COUNT = 3;
const SIGNATURE_DOMAIN = "ms-realty/operator-challenge/signature/v1";

export class OperatorChallengeError extends Error {
  constructor(code = "invalid_token") {
    super("The operator confirmation challenge is invalid or expired.");
    this.name = "OperatorChallengeError";
    this.code = code;
  }
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64url(value) {
  const text = String(value || "");
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    return Buffer.from(text, "base64url");
  } catch {
    return null;
  }
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  if (a.length !== b.length || a.length === 0) {
    crypto.timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32));
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function signingSecret(secret) {
  const value = String(secret || "").trim();
  if (value.length < MIN_SECRET_LENGTH) throw new OperatorChallengeError("missing_secret");
  return value;
}

// Prefer a purpose-specific key, while retaining compatibility with the
// already-provisioned operator-agent secret used by the signed-in MCP path.
// The value is never returned to an operator or persisted in a challenge.
export function operatorChallengeSecret(env = process.env) {
  const explicit = String(env[OPERATOR_CHALLENGE_SECRET_ENV] || "").trim();
  if (explicit) {
    if (explicit.length < MIN_SECRET_LENGTH) throw new Error(`${OPERATOR_CHALLENGE_SECRET_ENV} must be at least ${MIN_SECRET_LENGTH} characters`);
    return explicit;
  }
  return operatorAgentSecret(env);
}

function canonicalJson(value, depth = 0) {
  if (depth > 8) throw new OperatorChallengeError("invalid_input");
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new OperatorChallengeError("invalid_input");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry, depth + 1)).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key], depth + 1)}`).join(",")}}`;
  }
  throw new OperatorChallengeError("invalid_input");
}

export function operatorChallengeInputHash(input) {
  return `sha256:${crypto.createHash("sha256").update(canonicalJson(input ?? {})).digest("hex")}`;
}

function epochSeconds(value) {
  if (value === undefined || value === null) return Math.floor(Date.now() / 1000);
  if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value > 10_000_000_000 ? value / 1000 : value);
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) throw new OperatorChallengeError("invalid_time");
  return Math.floor(parsed / 1000);
}

function normalizedField(value, label, maxLength) {
  const text = String(value || "").trim();
  if (!text || text.length > maxLength || /[\u0000-\u001f\u007f]/.test(text)) throw new OperatorChallengeError(`invalid_${label}`);
  return text;
}

function signature(encodedPayload, secret) {
  return crypto.createHmac("sha256", signingSecret(secret)).update(`${SIGNATURE_DOMAIN} ${encodedPayload}`).digest("base64url");
}

export function issueOperatorChallenge({ operatorId, sessionId, operation, input, secret, now, ttlSeconds = DEFAULT_OPERATOR_CHALLENGE_TTL_SECONDS } = {}) {
  const operator = normalizedField(operatorId, "operator", 160);
  const session = normalizedField(sessionId, "session", 160);
  const action = normalizedField(operation, "operation", 200);
  const ttl = Number(ttlSeconds);
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > MAX_TTL_SECONDS) throw new OperatorChallengeError("invalid_ttl");
  const issuedAt = epochSeconds(now);
  const payload = {
    v: OPERATOR_CHALLENGE_VERSION,
    operator_id: operator,
    session_id: session,
    operation: action,
    input_hash: operatorChallengeInputHash(input ?? {}),
    iat: issuedAt,
    exp: issuedAt + ttl,
    nonce: crypto.randomBytes(12).toString("base64url"),
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  const token = `${OPERATOR_CHALLENGE_VERSION}.${encodedPayload}.${signature(encodedPayload, secret)}`;
  return {
    token,
    operator_id: operator,
    session_id: session,
    operation: action,
    input_hash: payload.input_hash,
    issued_at: new Date(issuedAt * 1000).toISOString(),
    expires_at: new Date(payload.exp * 1000).toISOString(),
  };
}

export function verifyOperatorChallenge(
  token,
  { operatorId, sessionId, operation, input, secret, now } = {},
) {
  const raw = String(token || "");
  if (raw.length > 2_048) throw new OperatorChallengeError("invalid_token");
  const parts = raw.split(".");
  if (parts.length !== TOKEN_PART_COUNT || parts[0] !== OPERATOR_CHALLENGE_VERSION) {
    throw new OperatorChallengeError("invalid_token");
  }
  const payloadBytes = decodeBase64url(parts[1]);
  if (!payloadBytes || !safeEqual(parts[2], signature(parts[1], secret))) throw new OperatorChallengeError("invalid_signature");
  let payload;
  try {
    payload = JSON.parse(payloadBytes.toString("utf8"));
  } catch {
    throw new OperatorChallengeError("invalid_payload");
  }
  const expectedKeys = ["v", "operator_id", "session_id", "operation", "input_hash", "iat", "exp", "nonce"];
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.keys(payload).sort().join(",") !== expectedKeys.sort().join(",") ||
    payload.v !== OPERATOR_CHALLENGE_VERSION ||
    !Number.isInteger(payload.iat) ||
    !Number.isInteger(payload.exp) ||
    payload.exp <= payload.iat ||
    payload.exp - payload.iat > MAX_TTL_SECONDS ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(String(payload.nonce || ""))
  ) {
    throw new OperatorChallengeError("invalid_payload");
  }
  const current = epochSeconds(now);
  if (payload.exp <= current || payload.iat > current) throw new OperatorChallengeError("expired");
  if (payload.operator_id !== normalizedField(operatorId, "operator", 160)) throw new OperatorChallengeError("operator_mismatch");
  if (payload.session_id !== normalizedField(sessionId, "session", 160)) throw new OperatorChallengeError("session_mismatch");
  if (payload.operation !== normalizedField(operation, "operation", 200)) throw new OperatorChallengeError("operation_mismatch");
  if (!safeEqual(payload.input_hash, operatorChallengeInputHash(input ?? {}))) throw new OperatorChallengeError("input_mismatch");
  return {
    ...payload,
    issued_at: new Date(payload.iat * 1000).toISOString(),
    expires_at: new Date(payload.exp * 1000).toISOString(),
  };
}
