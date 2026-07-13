import { timingSafeEqual } from "node:crypto";

const LOCAL_ADMIN_TOKEN = "local-admin-smoke";
const CREDENTIALS_ENV = "MS_REALTY_ADMIN_CREDENTIALS_JSON";
const OPERATOR_ID = /^[a-z0-9][a-z0-9._-]{1,63}$/i;
const MIN_OPERATOR_TOKEN_LENGTH = 24;

function timingSafeMatch(actual, expected) {
  if (!actual || Buffer.byteLength(actual) !== Buffer.byteLength(expected)) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function operatorId(value, label) {
  const id = String(value || "").trim();
  if (!OPERATOR_ID.test(id)) throw new Error(`${label} must be a stable operator ID`);
  return id;
}

export function adminCredentials(env = process.env) {
  const raw = String(env[CREDENTIALS_ENV] || "").trim();
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${CREDENTIALS_ENV} must be valid JSON`);
  }
  if (!Array.isArray(parsed) || !parsed.length) throw new Error(`${CREDENTIALS_ENV} must be a non-empty array`);

  const tokens = new Set();
  return parsed.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`${CREDENTIALS_ENV} entry ${index + 1} must be an object`);
    }
    const id = operatorId(row.id, `${CREDENTIALS_ENV} entry ${index + 1} id`);
    const token = row.token;
    if (typeof token !== "string" || token.length < MIN_OPERATOR_TOKEN_LENGTH || token.trim() !== token || /\s/.test(token)) {
      throw new Error(`${CREDENTIALS_ENV} entry ${index + 1} token must be a ${MIN_OPERATOR_TOKEN_LENGTH}+ character bearer secret`);
    }
    if (tokens.has(token)) throw new Error(`${CREDENTIALS_ENV} entries must use unique bearer tokens`);
    tokens.add(token);
    return { id, token };
  });
}

export function adminBearerToken(env = process.env) {
  const token = env.MS_REALTY_ADMIN_TOKEN || (env.NODE_ENV === "production" ? "" : LOCAL_ADMIN_TOKEN);
  return token ? `Bearer ${token}` : "";
}

export function resolveAdminPrincipal(auth, env = process.env) {
  let credentials;
  try {
    credentials = adminCredentials(env);
  } catch {
    return null;
  }
  for (const credential of credentials) {
    if (timingSafeMatch(auth, `Bearer ${credential.token}`)) {
      return { id: credential.id, source: "credential_registry", can_mutate: true };
    }
  }
  // Once individual credentials are configured, do not leave the shared token as a second path.
  if (credentials.length) return null;

  const expected = adminBearerToken(env);
  if (!timingSafeMatch(auth, expected)) return null;
  const id = String(env.MS_REALTY_ADMIN_ACTOR || "").trim();
  if (id) {
    try {
      return { id: operatorId(id, "MS_REALTY_ADMIN_ACTOR"), source: "named_legacy_token", can_mutate: true };
    } catch {
      return null;
    }
  }
  return {
    id: null,
    source: "shared_token",
    // Local fixtures can keep exercising workflows; a deployed shared token cannot claim a human action.
    can_mutate: env.NODE_ENV !== "production",
  };
}

export function isAdminAuthorized(auth, env = process.env) {
  return Boolean(resolveAdminPrincipal(auth, env));
}

export function canAdminMutate(principal) {
  return Boolean(principal?.can_mutate);
}

export function bindAuthenticatedOperator(input, principal, fields = ["actor"]) {
  if (!principal?.id) return input;
  const output = { ...(input || {}) };
  for (const field of fields) {
    const submitted = String(input?.[field] || "").trim();
    if (submitted && submitted !== principal.id) {
      throw new Error(`Submitted ${field} must match the authenticated operator`);
    }
    output[field] = principal.id;
  }
  return output;
}

export function withAuthenticatedAuditActor(input, principal) {
  return principal?.id ? { ...input, actor: principal.id } : input;
}
