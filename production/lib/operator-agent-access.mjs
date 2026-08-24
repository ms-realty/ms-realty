// The credential an operator hands to their own desktop AI.
//
// /admin/connect used to paste the operator's raw bearer token into a prompt.
// That token is the operator's whole identity, it never expires, and it cannot
// be withdrawn from the assistant without locking the human out too. A page
// whose entire job is "press one button" should not be handing out something
// that dangerous, and an operator signed in with a browser session does not
// have a bearer token to paste at all -- that card simply disappeared for them.
//
// So the button mints a separate, delegated capability instead, built exactly
// like the saved-search manage link in saved-search-access.mjs:
//
//   a1.<b64url(operator id)>.<b64url(roles)>.<b64url(expiry seconds)>.<b64url(sig)>
//
// The signature is an HMAC over all three fields, keyed by a per-operator key
// that is itself derived from the server secret and the operator id. A token is
// therefore single-purpose by construction: valid for one operator, under one
// server secret, until one expiry.
//
// It is a delegation, never an escalation. The roles carried are the minting
// operator's own roles, so the assistant can do what that human can do and
// nothing more, and it stops working on its own. Rotating
// MS_REALTY_OPERATOR_AGENT_TOKEN_SECRET revokes every outstanding token at once.
import crypto from "node:crypto";
import { normalizedRoles, operatorId as assertOperatorId } from "./admin-auth.mjs";

export const OPERATOR_AGENT_TOKEN_VERSION = "a1";
export const OPERATOR_AGENT_SECRET_ENV = "MS_REALTY_OPERATOR_AGENT_TOKEN_SECRET";
export const DEFAULT_OPERATOR_AGENT_TTL_DAYS = 90;

const MIN_SECRET_LENGTH = 32;
const TOKEN_PART_COUNT = 5;
const KEY_DOMAIN = "ms-realty/operator-agent/v1";
const SIGNATURE_DOMAIN = "ms-realty/operator-agent/signature/v1";

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64url(value) {
  const text = String(value || "");
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  return Buffer.from(text, "base64url").toString("utf8");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  if (a.length !== b.length || a.length === 0) {
    // Burn a comparison so a length mismatch is not the faster answer.
    crypto.timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32));
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

// Fails closed. No secret configured means no token is ever minted and no token
// is ever accepted, which is why the card can honestly say "needs setup".
export function operatorAgentSecret(env = process.env) {
  const secret = String(env[OPERATOR_AGENT_SECRET_ENV] || "").trim();
  if (!secret) return "";
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`${OPERATOR_AGENT_SECRET_ENV} must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  return secret;
}

export function operatorAgentTtlDays(env = process.env) {
  const raw = String(env.MS_REALTY_OPERATOR_AGENT_TOKEN_TTL_DAYS || "").trim();
  if (!raw) return DEFAULT_OPERATOR_AGENT_TTL_DAYS;
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 365) {
    throw new Error("MS_REALTY_OPERATOR_AGENT_TOKEN_TTL_DAYS must be between 1 and 365");
  }
  return Number(raw);
}

function perOperatorKey(secret, operator) {
  return crypto.createHmac("sha256", String(secret)).update(`${KEY_DOMAIN} ${operator}`).digest();
}

function signature(secret, operator, roles, expiresAtSeconds) {
  return crypto
    .createHmac("sha256", perOperatorKey(secret, operator))
    .update(`${SIGNATURE_DOMAIN} ${OPERATOR_AGENT_TOKEN_VERSION} ${operator} ${roles} ${expiresAtSeconds}`)
    .digest();
}

export function mintOperatorAgentToken(
  { operatorId, roles },
  { secret, issuedAt = new Date().toISOString(), ttlDays = DEFAULT_OPERATOR_AGENT_TTL_DAYS } = {},
) {
  const operator = assertOperatorId(operatorId, "Operator agent token operator id");
  const grantedRoles = normalizedRoles(roles, "Operator agent token roles").join(",");
  const signingSecret = String(secret || "");
  if (signingSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(`${OPERATOR_AGENT_SECRET_ENV} must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  if (!Number.isInteger(ttlDays) || ttlDays < 1) throw new Error("Operator agent token ttlDays must be a positive integer");
  const issuedSeconds = Math.floor(Date.parse(issuedAt) / 1000);
  if (!Number.isFinite(issuedSeconds)) throw new Error("issuedAt must be an ISO timestamp");
  const expiresAtSeconds = issuedSeconds + ttlDays * 24 * 60 * 60;
  const token = [
    OPERATOR_AGENT_TOKEN_VERSION,
    base64url(operator),
    base64url(grantedRoles),
    base64url(String(expiresAtSeconds)),
    base64url(signature(signingSecret, operator, grantedRoles, expiresAtSeconds)),
  ].join(".");
  return {
    token,
    operator_id: operator,
    roles: grantedRoles.split(","),
    issued_at: new Date(issuedSeconds * 1000).toISOString(),
    expires_at: new Date(expiresAtSeconds * 1000).toISOString(),
  };
}

// What the connect screen calls. Returns null -- and the card honestly says it
// needs setup -- when no signing secret is configured, or when the caller is a
// shared token with no operator identity to delegate from.
export function issueOperatorAgentToken({ principal, env = process.env, issuedAt = new Date().toISOString() } = {}) {
  let secret;
  try {
    secret = operatorAgentSecret(env);
  } catch {
    return null;
  }
  if (!secret) return null;
  if (!principal?.id || !Array.isArray(principal.roles) || !principal.roles.length) return null;
  try {
    return mintOperatorAgentToken(
      { operatorId: principal.id, roles: principal.roles },
      { secret, issuedAt, ttlDays: operatorAgentTtlDays(env) },
    );
  } catch {
    return null;
  }
}

// Returns a principal shaped like the ones resolveAdminPrincipal produces, or
// null. Every failure -- wrong shape, wrong signature, expired, unparseable
// roles -- returns the same null, so the endpoint cannot be probed.
export function resolveOperatorAgentPrincipal(auth, env = process.env, { now = Date.now() } = {}) {
  let signingSecret;
  try {
    signingSecret = operatorAgentSecret(env);
  } catch {
    return null;
  }
  if (!signingSecret) return null;
  const header = String(auth || "");
  if (!header.startsWith("Bearer ")) return null;
  const raw = header.slice(7).trim();
  if (!raw || raw.length > 512) return null;
  const parts = raw.split(".");
  if (parts.length !== TOKEN_PART_COUNT || parts[0] !== OPERATOR_AGENT_TOKEN_VERSION) return null;
  const [, encodedOperator, encodedRoles, encodedExpiry, encodedSignature] = parts;
  const operator = decodeBase64url(encodedOperator);
  const roles = decodeBase64url(encodedRoles);
  const expiryText = decodeBase64url(encodedExpiry);
  if (!operator || !roles || !expiryText || !/^\d{1,15}$/.test(expiryText)) return null;
  const expiresAtSeconds = Number(expiryText);
  const expected = base64url(signature(signingSecret, operator, roles, expiresAtSeconds));
  if (!safeEqual(encodedSignature, expected)) return null;
  if (expiresAtSeconds <= Math.floor(now / 1000)) return null;
  let grantedRoles;
  try {
    grantedRoles = normalizedRoles(roles, "Operator agent token roles");
    assertOperatorId(operator, "Operator agent token operator id");
  } catch {
    return null;
  }
  return {
    id: operator,
    source: "operator_agent_token",
    can_mutate: true,
    roles: grantedRoles,
    expires_at: new Date(expiresAtSeconds * 1000).toISOString(),
  };
}
