// Capability access for a visitor-owned saved search.
//
// There are no public accounts and there must not be. A visitor who saved a
// search still has to be able to see it, pause it, retune it, and delete it,
// so creation mints a capability token and returns a manage link carrying it.
//
// Token shape (one opaque URL parameter, never personal data):
//
//   s1.<b64url(record id)>.<b64url(expiry, epoch seconds)>.<b64url(signature)>
//
// The signature is an HMAC over the record id and the expiry, keyed by a
// per-record secret that is itself derived from the server secret and the
// record id. So a token is single-purpose by construction: it is only ever
// valid for one saved search, on one route, under one server secret.
//
// The ledger stores ONLY the derived verifier — sha256 of the whole token —
// never the token itself. A leaked ledger therefore yields no working links,
// and the verifier gives revocation: a record whose row has gone (deleted) or
// whose verifier no longer matches (secret rotated) refuses the token.
//
// Every refusal — missing, malformed, wrong signature, expired, unknown
// record, revoked — returns the same generic answer, so the endpoint cannot be
// used to probe whether a given saved search exists.
import crypto from "node:crypto";

export const SAVED_SEARCH_TOKEN_VERSION = "s1";
export const SAVED_SEARCH_ACCESS_SECRET_ENV = "MS_REALTY_SAVED_SEARCH_TOKEN_SECRET";

// Local development only. Production must set the env var: a deployment that
// keeps this value is refused rather than silently signing guessable links.
export const DEFAULT_SAVED_SEARCH_ACCESS_SECRET = "local-development-saved-search-manage-secret-not-for-production";

export const DEFAULT_SAVED_SEARCH_MANAGE_PATH = "/{locale}/alerts";
export const DEFAULT_SAVED_SEARCH_MANAGE_TTL_DAYS = 365;

const MIN_SECRET_LENGTH = 32;
const TOKEN_PART_COUNT = 4;
const KEY_DOMAIN = "ms-realty/saved-search-manage/v1";
const SIGNATURE_DOMAIN = "ms-realty/saved-search-manage/signature/v1";
const VERIFIER_DOMAIN = "ms-realty/saved-search-manage/verifier/v1";

// One refusal for every failure mode. Callers must not vary it.
export const SAVED_SEARCH_LINK_REFUSAL = Object.freeze({
  kind: "saved_search_link_invalid",
  message: "This manage link is not valid. Save the search again to get a new link.",
});

export class SavedSearchLinkRefusedError extends Error {
  constructor(reason) {
    super(SAVED_SEARCH_LINK_REFUSAL.message);
    this.name = "SavedSearchLinkRefusedError";
    this.code = SAVED_SEARCH_LINK_REFUSAL.kind;
    this.status = 404;
    // Kept for the audit trail only; never rendered to the caller.
    this.reason = String(reason || "invalid");
  }
}

function base64url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

function decodeBase64url(value) {
  const text = String(value || "");
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new SavedSearchLinkRefusedError("malformed_token");
  return Buffer.from(text, "base64url");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  if (a.length !== b.length || a.length === 0) {
    // Still burn a comparison so a length mismatch is not a faster answer.
    crypto.timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32));
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

// The configured signing secret. Fails closed: a production deployment that
// never set the env var refuses to mint or verify links at all.
export function savedSearchAccessSecret(env = process.env) {
  const configured = String(env[SAVED_SEARCH_ACCESS_SECRET_ENV] || "").trim();
  const secret = configured || DEFAULT_SAVED_SEARCH_ACCESS_SECRET;
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`${SAVED_SEARCH_ACCESS_SECRET_ENV} must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  if (!configured && String(env.NODE_ENV || "").trim() === "production") {
    throw new Error(`${SAVED_SEARCH_ACCESS_SECRET_ENV} is required in production`);
  }
  return secret;
}

// The secret, or nothing. A deployment that cannot sign links must still serve
// the rest of the site: every route that needs the secret refuses on its own
// terms rather than the process failing to start.
export function savedSearchManageSecretOrNull(env = process.env) {
  try {
    return savedSearchAccessSecret(env);
  } catch {
    return null;
  }
}

export function savedSearchManageTtlDays(env = process.env) {
  const raw = String(env.MS_REALTY_SAVED_SEARCH_MANAGE_TTL_DAYS || "").trim();
  if (!raw) return DEFAULT_SAVED_SEARCH_MANAGE_TTL_DAYS;
  if (!/^\d+$/.test(raw) || Number(raw) < 1) {
    throw new Error("MS_REALTY_SAVED_SEARCH_MANAGE_TTL_DAYS must be a positive integer");
  }
  return Number(raw);
}

export function savedSearchManagePathTemplate(env = process.env) {
  const template = String(env.MS_REALTY_SAVED_SEARCH_MANAGE_PATH || "").trim() || DEFAULT_SAVED_SEARCH_MANAGE_PATH;
  if (!template.startsWith("/")) throw new Error("MS_REALTY_SAVED_SEARCH_MANAGE_PATH must start with /");
  return template;
}

// Per-record secret: the server secret never signs anything directly, so one
// record's key can never be replayed against another record.
function perRecordKey(secret, recordId) {
  return crypto.createHmac("sha256", String(secret)).update(`${KEY_DOMAIN}\u0000${recordId}`).digest();
}

function signature(secret, recordId, expiresAtSeconds) {
  return crypto
    .createHmac("sha256", perRecordKey(secret, recordId))
    .update(`${SIGNATURE_DOMAIN}\u0000${SAVED_SEARCH_TOKEN_VERSION}\u0000${recordId}\u0000${expiresAtSeconds}`)
    .digest();
}

// The stored value. Deriving it from the whole token means the ledger holds
// nothing that can be turned back into a working link.
export function savedSearchAccessVerifier(token) {
  return crypto.createHash("sha256").update(`${VERIFIER_DOMAIN}\u0000${String(token || "")}`).digest("hex");
}

function isoSeconds(value, label) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be an ISO timestamp`);
  return Math.floor(parsed / 1000);
}

// Mints deterministically from (secret, record id, expiry): a retried
// submission that returns the original record re-derives the original link
// instead of handing back a token the stored verifier would reject.
export function mintSavedSearchAccess(
  recordId,
  { secret, issuedAt = new Date().toISOString(), ttlDays = DEFAULT_SAVED_SEARCH_MANAGE_TTL_DAYS } = {},
) {
  const id = String(recordId || "").trim();
  if (!id) throw new Error("Saved search manage access requires a record id");
  if (!Number.isInteger(ttlDays) || ttlDays < 1) throw new Error("Saved search manage ttlDays must be a positive integer");
  const signingSecret = String(secret || "");
  if (signingSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(`${SAVED_SEARCH_ACCESS_SECRET_ENV} must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  const issuedSeconds = isoSeconds(issuedAt, "issuedAt");
  const expiresAtSeconds = issuedSeconds + ttlDays * 24 * 60 * 60;
  const token = [
    SAVED_SEARCH_TOKEN_VERSION,
    base64url(id),
    base64url(String(expiresAtSeconds)),
    base64url(signature(signingSecret, id, expiresAtSeconds)),
  ].join(".");
  return {
    token,
    access: {
      version: SAVED_SEARCH_TOKEN_VERSION,
      verifier: savedSearchAccessVerifier(token),
      issued_at: new Date(issuedSeconds * 1000).toISOString(),
      expires_at: new Date(expiresAtSeconds * 1000).toISOString(),
    },
  };
}

// Reads the record id out of a structurally valid, correctly signed token.
// Throws the single generic refusal for every other outcome.
export function readSavedSearchAccessToken(token, { secret, now = new Date().toISOString() } = {}) {
  const raw = String(token || "").trim();
  if (!raw) throw new SavedSearchLinkRefusedError("missing_token");
  if (raw.length > 512) throw new SavedSearchLinkRefusedError("malformed_token");
  const parts = raw.split(".");
  if (parts.length !== TOKEN_PART_COUNT) throw new SavedSearchLinkRefusedError("malformed_token");
  const [version, encodedId, encodedExpiry, encodedSignature] = parts;
  if (version !== SAVED_SEARCH_TOKEN_VERSION) throw new SavedSearchLinkRefusedError("unknown_version");
  const recordId = decodeBase64url(encodedId).toString("utf8");
  const expiryText = decodeBase64url(encodedExpiry).toString("utf8");
  if (!recordId || !/^\d{1,15}$/.test(expiryText)) throw new SavedSearchLinkRefusedError("malformed_token");
  const expiresAtSeconds = Number(expiryText);
  const signingSecret = String(secret || "");
  if (signingSecret.length < MIN_SECRET_LENGTH) throw new SavedSearchLinkRefusedError("secret_unavailable");
  const expected = base64url(signature(signingSecret, recordId, expiresAtSeconds));
  if (!safeEqual(encodedSignature, expected)) throw new SavedSearchLinkRefusedError("bad_signature");
  const nowSeconds = isoSeconds(now, "now");
  if (expiresAtSeconds <= nowSeconds) throw new SavedSearchLinkRefusedError("expired");
  return {
    record_id: recordId,
    verifier: savedSearchAccessVerifier(raw),
    expires_at: new Date(expiresAtSeconds * 1000).toISOString(),
  };
}

// Confirms the presented token still belongs to this exact stored record.
// A record without stored access, or with a different verifier, is refused
// with the same answer as an unknown record.
export function assertSavedSearchAccess(record, presented) {
  const stored = record?.manage_access;
  const storedVerifier = String(stored?.verifier || "");
  if (!storedVerifier || stored?.version !== SAVED_SEARCH_TOKEN_VERSION) {
    throw new SavedSearchLinkRefusedError("no_stored_access");
  }
  if (!safeEqual(storedVerifier, presented?.verifier)) throw new SavedSearchLinkRefusedError("verifier_mismatch");
  return true;
}

export function savedSearchManagePath(locale, token, { template = DEFAULT_SAVED_SEARCH_MANAGE_PATH } = {}) {
  const path = template.replace("{locale}", encodeURIComponent(String(locale || "en")));
  return `${path}?token=${encodeURIComponent(String(token || ""))}`;
}

export function savedSearchManageLink(
  { locale, token, expiresAt },
  { origin = "", template = DEFAULT_SAVED_SEARCH_MANAGE_PATH } = {},
) {
  const path = savedSearchManagePath(locale, token, { template });
  return {
    token,
    path,
    url: origin ? `${String(origin).replace(/\/+$/, "")}${path}` : path,
    expires_at: expiresAt || null,
  };
}
