import test from "node:test";
import assert from "node:assert/strict";
import {
  issueOperatorChallenge,
  verifyOperatorChallenge,
} from "../lib/operator-challenge.mjs";

const SECRET = "operator-challenge-test-secret-longer-than-thirty-two-characters";
const INPUT = { input: { listingIds: ["MS-00815"], targetStatus: "reserved" }, query: {} };
const BASE = {
  operatorId: "mcp_editor",
  sessionId: "session-a",
  operation: "admin_post_listings_status",
  input: INPUT,
  secret: SECRET,
  now: "2026-08-28T12:00:00.000Z",
};

test("operator challenges bind operator, session, operation, and exact input", () => {
  const challenge = issueOperatorChallenge(BASE);
  const verified = verifyOperatorChallenge(challenge.token, BASE);
  assert.equal(verified.operator_id, BASE.operatorId);
  assert.equal(verified.session_id, BASE.sessionId);
  assert.equal(verified.operation, BASE.operation);
  assert.equal(verified.input_hash, challenge.input_hash);
});

test("operator challenges reject cross-session replay", () => {
  const challenge = issueOperatorChallenge(BASE);
  assert.throws(
    () => verifyOperatorChallenge(challenge.token, { ...BASE, sessionId: "session-b" }),
    (error) => error.code === "session_mismatch",
  );
});

test("operator challenges reject mismatched input", () => {
  const challenge = issueOperatorChallenge(BASE);
  assert.throws(
    () =>
      verifyOperatorChallenge(challenge.token, {
        ...BASE,
        input: { ...INPUT, input: { ...INPUT.input, targetStatus: "sold" } },
      }),
    (error) => error.code === "input_mismatch",
  );
});

test("operator challenges expire at their signed deadline", () => {
  const challenge = issueOperatorChallenge({ ...BASE, ttlSeconds: 30 });
  assert.throws(
    () => verifyOperatorChallenge(challenge.token, { ...BASE, now: "2026-08-28T12:00:30.000Z" }),
    (error) => error.code === "expired",
  );
});

test("operator challenges reject corrupt tokens", () => {
  const challenge = issueOperatorChallenge(BASE);
  for (const token of ["c1.not-base64.!", `${challenge.token}x`, "c1..bad"]) {
    assert.throws(() => verifyOperatorChallenge(token, BASE), () => true);
  }
});
