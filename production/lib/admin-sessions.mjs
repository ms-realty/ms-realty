import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";
import { newRecordId } from "./record-ids.mjs";

// Admin session registry: an append-only ledger of the browser sessions this
// app has issued or observed, plus the server-side revocation list that makes
// "sign out everywhere" real.
//
// The session token itself is never stored. Rows carry a SHA-256 fingerprint
// of the token, which is what the request path looks up, and a separate public
// `session_id` that is safe to hand to the UI and accept back for revocation.
//
// Revocation is enforced on the way in: a fingerprint with a `session_revoked`
// row is refused before the token is handed to Payload, so a browser that
// still holds the cookie gets nothing.

export const DEFAULT_ADMIN_SESSION_LEDGER_PATH = fromRoot("production", "data", "admin-sessions.jsonl");
export const DEFAULT_ADMIN_SESSION_SEEN_INTERVAL_SECONDS = 300;
export const ADMIN_SESSION_SOURCES = ["payload_session", "credential_registry"];

const EVENTS = new Set(["session_opened", "session_seen", "session_revoked"]);
const FINGERPRINT = /^[0-9a-f]{64}$/;
const REVOCATION_REASONS = new Set(["operator_request", "revoke_others", "team_manage", "sign_out", "security_response"]);

const BROWSERS = [
  [/edg[ea]?\//i, "Edge"],
  [/opr\/|opera/i, "Opera"],
  [/firefox\//i, "Firefox"],
  [/chrome\/|crios\//i, "Chrome"],
  [/safari\//i, "Safari"],
];
const PLATFORMS = [
  [/iphone|ipad|ipod/i, "iOS"],
  [/android/i, "Android"],
  [/mac os x|macintosh/i, "macOS"],
  [/windows/i, "Windows"],
  [/cros/i, "ChromeOS"],
  [/linux/i, "Linux"],
];

// Step-up transport for the credential-registry path. An API client sends the
// token in the x-ms-admin-2fa header; a browser reaching the workbench through
// a bearer proxy cannot set a header, so the same token also rides in this
// cookie. Without it an operator who switches their second factor on from the
// settings screen would have no way to satisfy the gate they just created.
export const ADMIN_STEP_UP_COOKIE = "ms_admin_2fa";
export const ADMIN_STEP_UP_HEADER = "x-ms-admin-2fa";

export function stepUpTokenFromCookie(cookieHeader) {
  for (const part of String(cookieHeader || "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === ADMIN_STEP_UP_COOKIE) {
      try {
        return decodeURIComponent(rest.join("=") || "");
      } catch {
        return "";
      }
    }
  }
  return "";
}

export function adminStepUpSetCookie(token, { maxAgeSeconds }) {
  const requested = Number(maxAgeSeconds);
  const maxAge = Number.isFinite(requested) ? Math.max(0, Math.floor(requested)) : 0;
  return `${ADMIN_STEP_UP_COOKIE}=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export function adminStepUpClearCookie() {
  return `${ADMIN_STEP_UP_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export function adminSessionFingerprint(token) {
  const value = String(token || "");
  if (!value) throw new Error("A session token is required to compute a session fingerprint");
  return crypto.createHash("sha256").update(value).digest("hex");
}

// A deliberately coarse description: browser family and OS family only. No raw
// user agent, no IP address, nothing that re-identifies a device.
export function coarseAdminSessionClient(userAgent) {
  const value = String(userAgent || "");
  if (!value.trim()) return "unknown client";
  const browser = BROWSERS.find(([pattern]) => pattern.test(value))?.[1] || "unknown browser";
  const platform = PLATFORMS.find(([pattern]) => pattern.test(value))?.[1] || "unknown device";
  return `${browser} on ${platform}`;
}

export function resetAdminSessionLedger(filePath = DEFAULT_ADMIN_SESSION_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "", { mode: 0o600 });
}

export function readAdminSessionEvents(filePath = DEFAULT_ADMIN_SESSION_LEDGER_PATH) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function appendAdminSessionEvent(row, { filePath = DEFAULT_ADMIN_SESSION_LEDGER_PATH } = {}) {
  assertAdminSessions([row]);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(row)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
  return row;
}

export function createAdminSessionOpened(
  { token, fingerprint, operatorId, source, userAgent, client, expiresAt = null },
  recordedAt = new Date().toISOString(),
) {
  const sessionFingerprint = fingerprint || adminSessionFingerprint(token);
  if (!FINGERPRINT.test(sessionFingerprint)) throw new Error("Session fingerprint must be a SHA-256 hex digest");
  if (!ADMIN_SESSION_SOURCES.includes(source)) throw new Error("Unknown admin session source");
  const operator = String(operatorId || "").trim();
  if (!operator) throw new Error("An admin session requires an attributable operator");
  return {
    recorded_at: recordedAt,
    event: "session_opened",
    session_id: newRecordId("admin-session"),
    fingerprint: sessionFingerprint,
    operator_id: operator,
    source,
    client: client || coarseAdminSessionClient(userAgent),
    expires_at: expiresAt || null,
  };
}

export function createAdminSessionSeen({ fingerprint, operatorId, sessionId }, recordedAt = new Date().toISOString()) {
  if (!FINGERPRINT.test(String(fingerprint || ""))) throw new Error("Session fingerprint must be a SHA-256 hex digest");
  return {
    recorded_at: recordedAt,
    event: "session_seen",
    session_id: sessionId,
    fingerprint,
    operator_id: String(operatorId || "").trim(),
  };
}

export function createAdminSessionRevoked(
  { fingerprint, operatorId, sessionId, revokedBy, reason = "operator_request" },
  recordedAt = new Date().toISOString(),
) {
  if (!FINGERPRINT.test(String(fingerprint || ""))) throw new Error("Session fingerprint must be a SHA-256 hex digest");
  const actor = String(revokedBy || "").trim();
  if (!actor) throw new Error("Session revocation requires an attributable operator");
  if (!REVOCATION_REASONS.has(reason)) throw new Error("Unknown session revocation reason");
  return {
    recorded_at: recordedAt,
    event: "session_revoked",
    session_id: sessionId,
    fingerprint,
    operator_id: String(operatorId || "").trim(),
    revoked_by: actor,
    reason,
  };
}

function expired(state, now) {
  if (!state.expires_at) return false;
  const expiresAt = Date.parse(state.expires_at);
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

// Internal projection keyed by fingerprint. `fingerprint` stays on the state
// for the request path and is stripped by adminSessionList.
export function adminSessionStates(rows = [], { now = Date.now() } = {}) {
  const states = new Map();
  for (const row of rows) {
    if (!EVENTS.has(row?.event) || !FINGERPRINT.test(String(row.fingerprint || ""))) continue;
    if (row.event === "session_opened") {
      states.set(row.fingerprint, {
        session_id: row.session_id,
        fingerprint: row.fingerprint,
        operator_id: row.operator_id,
        source: row.source,
        client: row.client || "unknown client",
        created_at: row.recorded_at,
        last_seen_at: row.recorded_at,
        expires_at: row.expires_at || null,
        status: "active",
        revoked_at: null,
        revoked_by: null,
      });
      continue;
    }
    const state = states.get(row.fingerprint);
    if (!state) continue;
    if (row.event === "session_seen" && state.status === "active") {
      if (Date.parse(row.recorded_at) >= Date.parse(state.last_seen_at)) state.last_seen_at = row.recorded_at;
    } else if (row.event === "session_revoked" && state.status === "active") {
      state.status = "revoked";
      state.revoked_at = row.recorded_at;
      state.revoked_by = row.revoked_by || null;
    }
  }
  for (const state of states.values()) {
    if (state.status === "active" && expired(state, now)) state.status = "expired";
  }
  return states;
}

export function isAdminSessionRevoked(rows = [], fingerprint) {
  const value = String(fingerprint || "");
  if (!FINGERPRINT.test(value)) return false;
  // Refuse on the row itself, not on the projection: a revocation row is
  // enough on its own, even if the opening row is missing from this file.
  return rows.some((row) => row?.event === "session_revoked" && row.fingerprint === value);
}

export function adminSessionSeenDue(
  rows = [],
  fingerprint,
  { now = Date.now(), intervalSeconds = DEFAULT_ADMIN_SESSION_SEEN_INTERVAL_SECONDS } = {},
) {
  const state = adminSessionStates(rows, { now }).get(String(fingerprint || ""));
  if (!state || state.status !== "active") return false;
  const lastSeen = Date.parse(state.last_seen_at);
  if (!Number.isFinite(lastSeen)) return true;
  return now - lastSeen >= Math.max(1, Number(intervalSeconds) || 0) * 1000;
}

// Response-safe session list. Never carries the fingerprint.
export function adminSessionList(
  rows = [],
  { operatorId, currentFingerprint = "", now = Date.now(), scope = "self", includeRevoked = false } = {},
) {
  const operator = String(operatorId || "").trim();
  return [...adminSessionStates(rows, { now }).values()]
    .filter((state) => (scope === "all" ? true : state.operator_id === operator))
    .filter((state) => (includeRevoked ? state.status !== "expired" : state.status === "active"))
    .map(({ fingerprint, ...state }) => ({ ...state, current: Boolean(currentFingerprint) && fingerprint === currentFingerprint }))
    .sort((left, right) => String(right.last_seen_at).localeCompare(String(left.last_seen_at)));
}

// Builds the revocation rows for one request. `scope: "others"` keeps the
// caller signed in; "one" targets a single public session id.
export function revokeAdminSessions(
  rows = [],
  { operatorId, sessionId = "", scope = "one", revokedBy, currentFingerprint = "", canManageTeam = false },
  { recordedAt = new Date().toISOString(), now = Date.parse(recordedAt) } = {},
) {
  const operator = String(operatorId || "").trim();
  const actor = String(revokedBy || "").trim();
  if (!actor) throw new Error("Session revocation requires an attributable operator");
  const states = [...adminSessionStates(rows, { now }).values()].filter((state) => state.status === "active");
  let targets;
  if (scope === "others") {
    targets = states.filter((state) => state.operator_id === operator && state.fingerprint !== currentFingerprint);
  } else if (scope === "one") {
    const wanted = String(sessionId || "").trim();
    if (!wanted) throw new Error("session_id is required to revoke a single session");
    const target = states.find((state) => state.session_id === wanted);
    if (!target) throw new Error("That session is not active");
    // An operator revokes only their own sessions unless they manage the team.
    if (target.operator_id !== operator && !canManageTeam) {
      const error = new Error("Only the session owner or a team manager may revoke this session");
      error.status = 403;
      error.capability = "team:manage";
      throw error;
    }
    targets = [target];
  } else {
    throw new Error("scope must be one or others");
  }
  const reason = scope === "others" ? "revoke_others" : targets[0]?.operator_id === operator ? "operator_request" : "team_manage";
  return {
    revoked_session_ids: targets.map((state) => state.session_id),
    revoked_current: targets.some((state) => state.fingerprint === currentFingerprint),
    events: targets.map((state) =>
      createAdminSessionRevoked(
        { fingerprint: state.fingerprint, operatorId: state.operator_id, sessionId: state.session_id, revokedBy: actor, reason },
        recordedAt,
      ),
    ),
  };
}

export function assertAdminSessions(rows) {
  for (const row of rows || []) {
    if (!EVENTS.has(row?.event) || !row.recorded_at) throw new Error("Admin session row is missing routing data");
    if (!FINGERPRINT.test(String(row.fingerprint || ""))) throw new Error("Admin session row must store a SHA-256 token fingerprint");
    if ("token" in row || "session_token" in row || "jwt" in row) throw new Error("Admin session ledger must not store a session token");
    if (row.event === "session_opened" && !ADMIN_SESSION_SOURCES.includes(row.source)) {
      throw new Error("Admin session row has an unknown source");
    }
    if (row.event === "session_revoked" && !REVOCATION_REASONS.has(row.reason)) {
      throw new Error("Admin session row has an unknown revocation reason");
    }
  }
  return true;
}
