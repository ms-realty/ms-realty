import assert from "node:assert/strict";
import test from "node:test";
import {
  SESSION_COOKIE,
  adminOperators,
  authenticateOperator,
  clearedSessionCookie,
  hashPassword,
  issueSession,
  parseCookies,
  readSession,
  sessionCookie,
  verifyPassword,
} from "../lib/admin-sessions.mjs";

const SECRET = "a".repeat(40);
const envWith = (extra = {}) => ({ MS_REALTY_SESSION_SECRET: SECRET, ...extra });

test("passwords are scrypt-hashed with a per-operator salt and verify in constant time", () => {
  const a = hashPassword("correct-horse-battery");
  const b = hashPassword("correct-horse-battery");
  assert.notEqual(a, b, "same password must not produce the same hash");
  assert.ok(verifyPassword("correct-horse-battery", a));
  assert.ok(!verifyPassword("correct-horse-batter", a));
  assert.ok(!verifyPassword("", a));
  assert.ok(!verifyPassword("x", "not-a-hash"));
  assert.throws(() => hashPassword("short"), /at least 12 characters/);
});

test("operator directory validates ids, hashes, and roles", () => {
  const good = JSON.stringify([{ id: "broker_bg", password_hash: hashPassword("correct-horse-battery"), roles: ["broker"] }]);
  assert.equal(adminOperators({ MS_REALTY_ADMIN_OPERATORS_JSON: good }).length, 1);
  assert.deepEqual(adminOperators({}), []);
  assert.throws(() => adminOperators({ MS_REALTY_ADMIN_OPERATORS_JSON: "{" }), /valid JSON/);
  assert.throws(() => adminOperators({ MS_REALTY_ADMIN_OPERATORS_JSON: "[]" }), /non-empty/);
  assert.throws(
    () => adminOperators({ MS_REALTY_ADMIN_OPERATORS_JSON: JSON.stringify([{ id: "ok", password_hash: "plaintext", roles: ["admin"] }]) }),
    /scrypt password_hash/,
  );
  assert.throws(
    () => adminOperators({ MS_REALTY_ADMIN_OPERATORS_JSON: JSON.stringify([{ id: "bad id!", password_hash: hashPassword("correct-horse-battery"), roles: ["admin"] }]) }),
    /stable operator ID/,
  );
  const dup = JSON.stringify([
    { id: "same", password_hash: hashPassword("correct-horse-battery"), roles: ["admin"] },
    { id: "same", password_hash: hashPassword("correct-horse-battery"), roles: ["broker"] },
  ]);
  assert.throws(() => adminOperators({ MS_REALTY_ADMIN_OPERATORS_JSON: dup }), /unique/);
});

test("login accepts the right password and rejects everything else", () => {
  const env = { MS_REALTY_ADMIN_OPERATORS_JSON: JSON.stringify([
    { id: "broker_bg", password_hash: hashPassword("correct-horse-battery"), roles: ["broker"] },
  ]) };
  assert.equal(authenticateOperator("broker_bg", "correct-horse-battery", { env }).id, "broker_bg");
  assert.equal(authenticateOperator("broker_bg", "wrong", { env }), null);
  assert.equal(authenticateOperator("unknown", "correct-horse-battery", { env }), null);
  assert.equal(authenticateOperator("", "", { env }), null);
});

test("session tokens round-trip and carry the operator identity", () => {
  const env = envWith();
  const token = issueSession({ id: "broker_bg", roles: ["broker"] }, { env });
  const session = readSession(token, { env });
  assert.equal(session.id, "broker_bg");
  assert.deepEqual(session.roles, ["broker"]);
  assert.ok(session.sid, "a session id is present for audit correlation");
});

test("a tampered payload, a foreign secret, or an expired token is refused", () => {
  const env = envWith();
  const token = issueSession({ id: "broker_bg", roles: ["broker"] }, { env });

  // Forge an admin role and re-encode without re-signing.
  const [payload, signature] = token.split(".");
  const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  body.roles = ["admin"];
  const forged = `${Buffer.from(JSON.stringify(body), "utf8").toString("base64url")}.${signature}`;
  assert.equal(readSession(forged, { env }), null, "role escalation must fail the signature check");

  assert.equal(readSession(token, { env: { MS_REALTY_SESSION_SECRET: "b".repeat(40) } }), null, "another secret must not verify");
  assert.equal(readSession(token, { env: {} }), null, "a missing secret fails closed");
  assert.equal(readSession(token, { env: { MS_REALTY_SESSION_SECRET: "short" } }), null, "a weak secret fails closed");
  assert.equal(readSession("", { env }), null);
  assert.equal(readSession("garbage", { env }), null);

  const expired = issueSession({ id: "broker_bg", roles: ["broker"] }, { env, ttlSeconds: 1, now: 0 });
  assert.equal(readSession(expired, { env, now: 5000 }), null, "an expired session is refused");
});

test("issuing a session requires a strong secret", () => {
  assert.throws(() => issueSession({ id: "x", roles: ["admin"] }, { env: {} }), /MS_REALTY_SESSION_SECRET/);
});

test("cookies are HttpOnly and SameSite, and Secure only in production", () => {
  const dev = sessionCookie("token", { env: {} });
  assert.match(dev, /HttpOnly/);
  assert.match(dev, /SameSite=Lax/);
  assert.ok(!/Secure/.test(dev), "Secure would break a plain-HTTP local preview");
  assert.match(sessionCookie("token", { env: { NODE_ENV: "production" } }), /Secure/);
  assert.match(clearedSessionCookie({ NODE_ENV: "production" }), /Max-Age=0/);
  assert.deepEqual(parseCookies(`${SESSION_COOKIE}=abc; other=1`)[SESSION_COOKIE], "abc");
  assert.deepEqual(parseCookies(""), {});
});
