import crypto from "node:crypto";

// Named-operator sessions for the broker workspace.
//
// Until now the edge proxy attached one shared admin bearer to every /admin/*
// request, so anyone who reached the edge was an admin and every audit entry
// named the same pseudo-operator. This replaces that with a real login: a
// password verified against a per-operator scrypt hash, and an HMAC-signed
// HttpOnly cookie carrying the operator id and roles.
//
// Deliberately self-contained. The workspace never reads Postgres, so binding
// broker login to Payload/Postgres availability would invent a failure mode.
// Everything here is node:crypto — no new dependency, matching the rest of
// production/lib.
//
// The bearer path in admin-auth.mjs stays for automation (CI smoke, scripts).

const OPERATORS_ENV = "MS_REALTY_ADMIN_OPERATORS_JSON";
const SESSION_SECRET_ENV = "MS_REALTY_SESSION_SECRET";
export const SESSION_COOKIE = "ms_realty_admin_session";

const OPERATOR_ID = /^[a-z0-9][a-z0-9._-]{1,63}$/i;
const MIN_SESSION_SECRET_LENGTH = 32;
const DEFAULT_TTL_SECONDS = 12 * 60 * 60; // one working day
const SCRYPT_KEYLEN = 64;
// Node's defaults (N=16384, r=8, p=1) — deliberate: raising N without raising
// maxmem throws, and this is a handful of operators, not a consumer signup.
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const value = String(password || "");
  if (value.length < 12) throw new Error("Operator password must be at least 12 characters");
  const derived = crypto.scryptSync(value, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, expected] = parts;
  let derived;
  try {
    derived = crypto.scryptSync(String(password || ""), salt, SCRYPT_KEYLEN, SCRYPT_PARAMS).toString("hex");
  } catch {
    return false;
  }
  const a = Buffer.from(derived, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function sessionSecret(env = process.env) {
  const secret = String(env[SESSION_SECRET_ENV] || "").trim();
  if (secret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(`${SESSION_SECRET_ENV} must be at least ${MIN_SESSION_SECRET_LENGTH} characters`);
  }
  return secret;
}

// Operator directory: [{ id, password_hash, roles: [...] }]
export function adminOperators(env = process.env) {
  const raw = String(env[OPERATORS_ENV] || "").trim();
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${OPERATORS_ENV} must be valid JSON`);
  }
  if (!Array.isArray(parsed) || !parsed.length) throw new Error(`${OPERATORS_ENV} must be a non-empty array`);
  const ids = new Set();
  return parsed.map((row, index) => {
    const label = `${OPERATORS_ENV} entry ${index + 1}`;
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`${label} must be an object`);
    const id = String(row.id || "").trim();
    if (!OPERATOR_ID.test(id)) throw new Error(`${label} id must be a stable operator ID`);
    if (ids.has(id)) throw new Error(`${OPERATORS_ENV} operator ids must be unique`);
    ids.add(id);
    const passwordHash = String(row.password_hash || row.passwordHash || "").trim();
    if (!passwordHash.startsWith("scrypt$")) throw new Error(`${label} needs a scrypt password_hash`);
    const roles = Array.isArray(row.roles) ? row.roles : String(row.roles || "").split(",");
    const normalized = [...new Set(roles.map((r) => String(r || "").trim().toLowerCase()).filter(Boolean))].sort();
    if (!normalized.length) throw new Error(`${label} needs at least one role`);
    return { id, passwordHash, roles: normalized };
  });
}

function sign(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function issueSession(operator, { env = process.env, ttlSeconds = DEFAULT_TTL_SECONDS, now = Date.now() } = {}) {
  const secret = sessionSecret(env);
  const body = {
    sub: operator.id,
    roles: operator.roles,
    exp: Math.floor(now / 1000) + ttlSeconds,
    // Random id so a session can be told apart in the audit log.
    sid: crypto.randomBytes(9).toString("base64url"),
  };
  const payload = Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function readSession(token, { env = process.env, now = Date.now() } = {}) {
  const value = String(token || "");
  const dot = value.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = value.slice(0, dot);
  const signature = value.slice(dot + 1);

  let secret;
  try {
    secret = sessionSecret(env);
  } catch {
    return null; // fail closed when the secret is missing or too weak
  }
  const expected = sign(payload, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let body;
  try {
    body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!body || typeof body.sub !== "string" || !Array.isArray(body.roles)) return null;
  if (!Number.isFinite(body.exp) || body.exp * 1000 <= now) return null;
  return { id: body.sub, roles: body.roles, sid: body.sid || null, expiresAt: body.exp };
}

export function authenticateOperator(id, password, { env = process.env } = {}) {
  const operators = adminOperators(env);
  const operator = operators.find((candidate) => candidate.id === String(id || "").trim());
  // Verify against a decoy when the id is unknown so a wrong id and a wrong
  // password cost the same time.
  const stored = operator ? operator.passwordHash : hashPassword("decoy-password-not-in-use");
  const matches = verifyPassword(password, stored);
  return operator && matches ? operator : null;
}

export function parseCookies(header) {
  const jar = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    try {
      jar[key] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      jar[key] = part.slice(index + 1).trim();
    }
  }
  return jar;
}

export function sessionCookie(token, { env = process.env, ttlSeconds = DEFAULT_TTL_SECONDS } = {}) {
  const attributes = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    // Lax, not Strict: a broker following a link into the workspace must stay
    // signed in. Cross-origin writes are blocked separately by request-guard.
    "SameSite=Lax",
    `Max-Age=${ttlSeconds}`,
  ];
  if (env.NODE_ENV === "production") attributes.push("Secure");
  return attributes.join("; ");
}

export function clearedSessionCookie(env = process.env) {
  const attributes = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (env.NODE_ENV === "production") attributes.push("Secure");
  return attributes.join("; ");
}
