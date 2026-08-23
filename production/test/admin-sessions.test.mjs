import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import {
  adminSessionFingerprint,
  adminSessionList,
  adminSessionSeenDue,
  adminSessionStates,
  appendAdminSessionEvent,
  assertAdminSessions,
  coarseAdminSessionClient,
  createAdminSessionOpened,
  createAdminSessionSeen,
  isAdminSessionRevoked,
  readAdminSessionEvents,
  resetAdminSessionLedger,
  revokeAdminSessions,
} from "../lib/admin-sessions.mjs";

const AT = "2026-08-23T12:00:00.000Z";
const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";
const SAFARI_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1 Version/17.0 Mobile Safari/604.1";

function tempLedger() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-admin-sessions-`)}/admin-sessions.jsonl`;
  resetAdminSessionLedger(file);
  return file;
}

function minutesAfter(minutes) {
  return new Date(Date.parse(AT) + minutes * 60_000).toISOString();
}

test("the ledger stores a token fingerprint, never the token", () => {
  const filePath = tempLedger();
  const token = "session-token-that-must-never-be-persisted";
  const opened = appendAdminSessionEvent(
    createAdminSessionOpened({ token, operatorId: "ivan", source: "payload_session", userAgent: CHROME_MAC }, AT),
    { filePath },
  );

  const text = fs.readFileSync(filePath, "utf8");
  assert.ok(!text.includes(token), "the session token must not reach the ledger");
  assert.equal(opened.fingerprint, adminSessionFingerprint(token));
  assert.match(opened.session_id, /^admin-session-[0-9a-f-]{36}$/);
  assert.notEqual(opened.session_id, opened.fingerprint);
  assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
  assert.equal(assertAdminSessions(readAdminSessionEvents(filePath)), true);
});

test("the client description stays coarse and carries no raw user agent", () => {
  assert.equal(coarseAdminSessionClient(CHROME_MAC), "Chrome on macOS");
  assert.equal(coarseAdminSessionClient(SAFARI_IOS), "Safari on iOS");
  assert.equal(coarseAdminSessionClient("Mozilla/5.0 (Windows NT 10.0) Firefox/121.0"), "Firefox on Windows");
  assert.equal(coarseAdminSessionClient(""), "unknown client");
  assert.equal(coarseAdminSessionClient("curl/8.4.0"), "unknown browser on unknown device");

  const opened = createAdminSessionOpened(
    { token: "t", operatorId: "ivan", source: "payload_session", userAgent: CHROME_MAC },
    AT,
  );
  assert.ok(!JSON.stringify(opened).includes("AppleWebKit"), "the raw user agent must not be stored");
});

test("the list marks the current session, hides the fingerprint, and drops expired rows", () => {
  const filePath = tempLedger();
  const current = "current-session-token";
  const other = "other-session-token";
  const stale = "stale-session-token";
  appendAdminSessionEvent(
    createAdminSessionOpened({ token: current, operatorId: "ivan", source: "payload_session", userAgent: CHROME_MAC, expiresAt: minutesAfter(120) }, AT),
    { filePath },
  );
  appendAdminSessionEvent(
    createAdminSessionOpened({ token: other, operatorId: "ivan", source: "credential_registry", userAgent: SAFARI_IOS, expiresAt: minutesAfter(120) }, minutesAfter(5)),
    { filePath },
  );
  appendAdminSessionEvent(
    createAdminSessionOpened({ token: stale, operatorId: "ivan", source: "payload_session", userAgent: CHROME_MAC, expiresAt: minutesAfter(1) }, AT),
    { filePath },
  );
  appendAdminSessionEvent(
    createAdminSessionOpened({ token: "someone-else", operatorId: "maria", source: "payload_session", userAgent: CHROME_MAC }, AT),
    { filePath },
  );

  const rows = readAdminSessionEvents(filePath);
  const now = Date.parse(minutesAfter(10));
  const mine = adminSessionList(rows, { operatorId: "ivan", currentFingerprint: adminSessionFingerprint(current), now });
  assert.deepEqual(
    mine.map((session) => [session.source, session.client, session.current]),
    [
      ["credential_registry", "Safari on iOS", false],
      ["payload_session", "Chrome on macOS", true],
    ],
  );
  assert.ok(mine.every((session) => !("fingerprint" in session)), "the list must never carry a fingerprint");
  assert.ok(mine.every((session) => session.created_at && session.last_seen_at));

  // Another operator's session is out of scope without team:manage.
  assert.equal(mine.some((session) => session.operator_id === "maria"), false);
  const everyone = adminSessionList(rows, { operatorId: "ivan", scope: "all", now });
  assert.equal(everyone.some((session) => session.operator_id === "maria"), true);
});

test("last-seen is throttled rather than written on every request", () => {
  const filePath = tempLedger();
  const token = "throttled-session-token";
  appendAdminSessionEvent(createAdminSessionOpened({ token, operatorId: "ivan", source: "payload_session" }, AT), { filePath });
  const fingerprint = adminSessionFingerprint(token);

  assert.equal(adminSessionSeenDue(readAdminSessionEvents(filePath), fingerprint, { now: Date.parse(minutesAfter(1)) }), false);
  assert.equal(adminSessionSeenDue(readAdminSessionEvents(filePath), fingerprint, { now: Date.parse(minutesAfter(6)) }), true);
  appendAdminSessionEvent(createAdminSessionSeen({ fingerprint, operatorId: "ivan" }, minutesAfter(6)), { filePath });
  assert.equal(adminSessionSeenDue(readAdminSessionEvents(filePath), fingerprint, { now: Date.parse(minutesAfter(7)) }), false);
  assert.equal(
    adminSessionStates(readAdminSessionEvents(filePath)).get(fingerprint).last_seen_at,
    minutesAfter(6),
  );
  // Unknown fingerprints are never "due"; that would create a phantom session.
  assert.equal(adminSessionSeenDue(readAdminSessionEvents(filePath), adminSessionFingerprint("nope"), { now: Date.now() }), false);
});

test("revoking others keeps the caller signed in and refuses another operator's session", () => {
  const filePath = tempLedger();
  const current = "caller-session-token";
  appendAdminSessionEvent(createAdminSessionOpened({ token: current, operatorId: "ivan", source: "payload_session" }, AT), { filePath });
  appendAdminSessionEvent(createAdminSessionOpened({ token: "ivan-phone", operatorId: "ivan", source: "payload_session" }, AT), { filePath });
  const foreign = appendAdminSessionEvent(
    createAdminSessionOpened({ token: "maria-laptop", operatorId: "maria", source: "payload_session" }, AT),
    { filePath },
  );
  const currentFingerprint = adminSessionFingerprint(current);

  const others = revokeAdminSessions(
    readAdminSessionEvents(filePath),
    { operatorId: "ivan", scope: "others", revokedBy: "ivan", currentFingerprint },
    { recordedAt: minutesAfter(1) },
  );
  assert.equal(others.revoked_session_ids.length, 1);
  assert.equal(others.revoked_current, false);
  for (const event of others.events) appendAdminSessionEvent(event, { filePath });
  assert.equal(adminSessionList(readAdminSessionEvents(filePath), { operatorId: "ivan" }).length, 1);
  assert.equal(adminSessionList(readAdminSessionEvents(filePath), { operatorId: "maria" }).length, 1);

  // Someone else's session is refused without team:manage, and allowed with it.
  assert.throws(
    () =>
      revokeAdminSessions(
        readAdminSessionEvents(filePath),
        { operatorId: "ivan", sessionId: foreign.session_id, scope: "one", revokedBy: "ivan", currentFingerprint },
        { recordedAt: minutesAfter(2) },
      ),
    (error) => error.status === 403 && error.capability === "team:manage",
  );
  const managed = revokeAdminSessions(
    readAdminSessionEvents(filePath),
    { operatorId: "ivan", sessionId: foreign.session_id, scope: "one", revokedBy: "ivan", currentFingerprint, canManageTeam: true },
    { recordedAt: minutesAfter(2) },
  );
  assert.deepEqual(managed.revoked_session_ids, [foreign.session_id]);
  assert.equal(managed.events[0].reason, "team_manage");
});

test("a revocation row invalidates the token even without its opening row", () => {
  const filePath = tempLedger();
  const token = "revoked-session-token";
  const opened = appendAdminSessionEvent(
    createAdminSessionOpened({ token, operatorId: "ivan", source: "payload_session" }, AT),
    { filePath },
  );
  assert.equal(isAdminSessionRevoked(readAdminSessionEvents(filePath), opened.fingerprint), false);

  const result = revokeAdminSessions(
    readAdminSessionEvents(filePath),
    { operatorId: "ivan", sessionId: opened.session_id, scope: "one", revokedBy: "ivan", currentFingerprint: opened.fingerprint },
    { recordedAt: minutesAfter(1) },
  );
  assert.equal(result.revoked_current, true);
  for (const event of result.events) appendAdminSessionEvent(event, { filePath });
  assert.equal(isAdminSessionRevoked(readAdminSessionEvents(filePath), opened.fingerprint), true);
  // A truncated ledger that kept only the revocation still refuses the token.
  assert.equal(isAdminSessionRevoked(readAdminSessionEvents(filePath).slice(1), opened.fingerprint), true);
  // Revoking a session that is already gone is refused rather than silently ignored.
  assert.throws(
    () =>
      revokeAdminSessions(
        readAdminSessionEvents(filePath),
        { operatorId: "ivan", sessionId: opened.session_id, scope: "one", revokedBy: "ivan" },
        { recordedAt: minutesAfter(2) },
      ),
    /not active/,
  );
});

test("the ledger contract refuses tokens, unknown sources and unknown reasons", () => {
  assert.throws(() => assertAdminSessions([{ recorded_at: AT, event: "session_opened", fingerprint: "short" }]), /SHA-256 token fingerprint/);
  assert.throws(
    () => assertAdminSessions([{ recorded_at: AT, event: "session_opened", fingerprint: "a".repeat(64), source: "guess" }]),
    /unknown source/,
  );
  assert.throws(
    () =>
      assertAdminSessions([
        { recorded_at: AT, event: "session_opened", fingerprint: "a".repeat(64), source: "payload_session", token: "leak" },
      ]),
    /must not store a session token/,
  );
  assert.throws(
    () =>
      assertAdminSessions([
        { recorded_at: AT, event: "session_revoked", fingerprint: "a".repeat(64), reason: "because", revoked_by: "ivan" },
      ]),
    /unknown revocation reason/,
  );
  assert.throws(() => createAdminSessionOpened({ token: "t", operatorId: "", source: "payload_session" }), /attributable operator/);
  assert.throws(() => createAdminSessionOpened({ token: "t", operatorId: "ivan", source: "guess" }), /Unknown admin session source/);
});
