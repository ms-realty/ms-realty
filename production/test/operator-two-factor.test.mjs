import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import {
  OPERATOR_TWO_FACTOR_KEY_ENV,
  activateOperatorEnrolment,
  appendOperatorTwoFactorEvent,
  assertOperatorTwoFactorLedger,
  createOperatorEnrolment,
  disableOperatorTwoFactor,
  operatorTwoFactorActive,
  operatorTwoFactorStatus,
  readOperatorTwoFactorEvents,
  resetOperatorTwoFactorLedger,
  verifyOperatorTwoFactor,
} from "../lib/operator-two-factor.mjs";
import { totpCode } from "../lib/totp.mjs";

const KEY = "b6-operator-two-factor-key-0123456789abcdef";
const AT = "2026-08-23T12:00:00.000Z";

function tempLedger() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-two-factor-`)}/operator-two-factor.jsonl`;
  resetOperatorTwoFactorLedger(file);
  return file;
}

function enrolledOperator(filePath, { operatorId = "ivan", recordedAt = AT } = {}) {
  const enrolment = createOperatorEnrolment({ operatorId }, { secret: KEY, recordedAt });
  appendOperatorTwoFactorEvent(enrolment.row, { filePath });
  const activated = activateOperatorEnrolment(
    readOperatorTwoFactorEvents(filePath),
    { operatorId, code: totpCode(enrolment.secret, { timestamp: Date.parse(recordedAt) }) },
    { secret: KEY, recordedAt },
  );
  appendOperatorTwoFactorEvent(activated, { filePath });
  return enrolment;
}

test("enrolment stores an encrypted envelope and never the secret or a code in the clear", () => {
  const filePath = tempLedger();
  const enrolment = createOperatorEnrolment({ operatorId: "ivan" }, { secret: KEY, recordedAt: AT });
  appendOperatorTwoFactorEvent(enrolment.row, { filePath });

  const text = fs.readFileSync(filePath, "utf8");
  assert.ok(!text.includes(enrolment.secret), "the TOTP secret must not reach the ledger");
  for (const code of enrolment.recovery_codes) assert.ok(!text.includes(code), "a recovery code must not reach the ledger");
  const [row] = readOperatorTwoFactorEvents(filePath);
  assert.equal(row.event, "enrolment_started");
  assert.equal(row.envelope.algorithm, "aes-256-gcm");
  assert.equal(row.envelope.subject_type, "operator_two_factor");
  assert.equal(assertOperatorTwoFactorLedger(readOperatorTwoFactorEvents(filePath)), true);
  assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);

  // Pending, not active: enrolling alone does not start guarding sign-in.
  assert.equal(operatorTwoFactorStatus(readOperatorTwoFactorEvents(filePath), "ivan").status, "pending");
  assert.equal(operatorTwoFactorActive(readOperatorTwoFactorEvents(filePath), "ivan"), false);
});

test("activation proves the authenticator holds the secret before the factor goes live", () => {
  const filePath = tempLedger();
  const enrolment = createOperatorEnrolment({ operatorId: "ivan" }, { secret: KEY, recordedAt: AT });
  appendOperatorTwoFactorEvent(enrolment.row, { filePath });

  assert.throws(
    () =>
      activateOperatorEnrolment(readOperatorTwoFactorEvents(filePath), { operatorId: "ivan", code: "000000" }, { secret: KEY, recordedAt: AT }),
    /not accepted/,
  );
  const activated = activateOperatorEnrolment(
    readOperatorTwoFactorEvents(filePath),
    { operatorId: "ivan", code: totpCode(enrolment.secret, { timestamp: Date.parse(AT) }) },
    { secret: KEY, recordedAt: AT },
  );
  appendOperatorTwoFactorEvent(activated, { filePath });
  const status = operatorTwoFactorStatus(readOperatorTwoFactorEvents(filePath), "ivan");
  assert.equal(status.status, "active");
  assert.equal(status.recovery_codes_remaining, 10);
  assert.equal(status.pending_enrolment_id, null);
  // No route or projection ever exposes the envelope.
  assert.ok(!("envelope" in status) && !("secret" in status));
});

test("verification refuses a replay, spends a recovery code once, and prefers TOTP", () => {
  const filePath = tempLedger();
  const enrolment = enrolledOperator(filePath);
  const later = new Date(Date.parse(AT) + 60_000).toISOString();

  const first = verifyOperatorTwoFactor(
    readOperatorTwoFactorEvents(filePath),
    { operatorId: "ivan", code: totpCode(enrolment.secret, { timestamp: Date.parse(later) }) },
    { secret: KEY, recordedAt: later },
  );
  assert.equal(first.ok, true);
  assert.equal(first.method, "totp");
  for (const event of first.events) appendOperatorTwoFactorEvent(event, { filePath });

  // Same code inside the same step, already spent.
  const replay = verifyOperatorTwoFactor(
    readOperatorTwoFactorEvents(filePath),
    { operatorId: "ivan", code: totpCode(enrolment.secret, { timestamp: Date.parse(later) }) },
    { secret: KEY, recordedAt: later },
  );
  assert.equal(replay.ok, false);
  assert.equal(replay.reason, "rejected");

  // A mistyped six-digit code must never burn a recovery code.
  const mistyped = verifyOperatorTwoFactor(
    readOperatorTwoFactorEvents(filePath),
    { operatorId: "ivan", code: "000000" },
    { secret: KEY, recordedAt: later },
  );
  assert.equal(mistyped.ok, false);
  assert.deepEqual(mistyped.events, []);
  assert.equal(operatorTwoFactorStatus(readOperatorTwoFactorEvents(filePath), "ivan").recovery_codes_remaining, 10);

  const recovery = verifyOperatorTwoFactor(
    readOperatorTwoFactorEvents(filePath),
    { operatorId: "ivan", code: enrolment.recovery_codes[2] },
    { secret: KEY, recordedAt: later },
  );
  assert.equal(recovery.ok, true);
  assert.equal(recovery.method, "recovery_code");
  for (const event of recovery.events) appendOperatorTwoFactorEvent(event, { filePath });
  assert.equal(operatorTwoFactorStatus(readOperatorTwoFactorEvents(filePath), "ivan").recovery_codes_remaining, 9);

  const reuse = verifyOperatorTwoFactor(
    readOperatorTwoFactorEvents(filePath),
    { operatorId: "ivan", code: enrolment.recovery_codes[2] },
    { secret: KEY, recordedAt: later },
  );
  assert.equal(reuse.ok, false);
});

test("a missing or rotated key fails closed instead of skipping the second factor", () => {
  const filePath = tempLedger();
  const enrolment = enrolledOperator(filePath);
  const later = new Date(Date.parse(AT) + 60_000).toISOString();
  const rows = readOperatorTwoFactorEvents(filePath);

  // Still enrolled and still required...
  assert.equal(operatorTwoFactorActive(rows, "ivan"), true);
  // ...but nothing verifies against the wrong key.
  const wrongKey = verifyOperatorTwoFactor(
    rows,
    { operatorId: "ivan", code: totpCode(enrolment.secret, { timestamp: Date.parse(later) }) },
    { secret: "b6-a-completely-different-key-0123456789", recordedAt: later },
  );
  assert.equal(wrongKey.ok, false);
  assert.equal(wrongKey.reason, "enrolment_unreadable");

  const previous = process.env[OPERATOR_TWO_FACTOR_KEY_ENV];
  try {
    delete process.env[OPERATOR_TWO_FACTOR_KEY_ENV];
    assert.throws(() => createOperatorEnrolment({ operatorId: "second" }), new RegExp(`${OPERATOR_TWO_FACTOR_KEY_ENV} must be at least 32`));
  } finally {
    if (previous === undefined) delete process.env[OPERATOR_TWO_FACTOR_KEY_ENV];
    else process.env[OPERATOR_TWO_FACTOR_KEY_ENV] = previous;
  }
});

test("disabling needs a live factor unless a team manager forces it", () => {
  const filePath = tempLedger();
  const enrolment = enrolledOperator(filePath);
  const later = new Date(Date.parse(AT) + 60_000).toISOString();

  assert.throws(
    () =>
      disableOperatorTwoFactor(
        readOperatorTwoFactorEvents(filePath),
        { operatorId: "ivan", code: "000000", actor: "ivan" },
        { secret: KEY, recordedAt: later },
      ),
    /not accepted/,
  );
  const forced = disableOperatorTwoFactor(
    readOperatorTwoFactorEvents(filePath),
    { operatorId: "ivan", actor: "owner", reason: "team_manage", forced: true },
    { secret: KEY, recordedAt: later },
  );
  for (const event of forced) appendOperatorTwoFactorEvent(event, { filePath });
  const status = operatorTwoFactorStatus(readOperatorTwoFactorEvents(filePath), "ivan");
  assert.equal(status.status, "disabled");
  assert.equal(status.recovery_codes_remaining, 0);
  assert.equal(operatorTwoFactorActive(readOperatorTwoFactorEvents(filePath), "ivan"), false);

  // A disabled operator can enrol again; a live one cannot be silently replaced.
  const second = createOperatorEnrolment({ operatorId: "ivan" }, { secret: KEY, recordedAt: later });
  appendOperatorTwoFactorEvent(second.row, { filePath });
  assert.equal(operatorTwoFactorStatus(readOperatorTwoFactorEvents(filePath), "ivan").status, "pending");
  assert.notEqual(second.secret, enrolment.secret);
});

test("the ledger contract refuses malformed and secret-bearing rows", () => {
  assert.throws(() => assertOperatorTwoFactorLedger([{ event: "activated", operator_id: "ivan" }]), /missing routing data/);
  assert.throws(
    () =>
      assertOperatorTwoFactorLedger([
        { recorded_at: AT, event: "verified", operator_id: "ivan", enrolment_id: "two-factor-1", secret: "GEZDGNBV" },
      ]),
    /must not store a secret/,
  );
  assert.throws(
    () => assertOperatorTwoFactorLedger([{ recorded_at: AT, event: "enrolment_started", operator_id: "ivan", enrolment_id: "two-factor-1" }]),
    /encrypted envelope/,
  );
  assert.throws(
    () =>
      assertOperatorTwoFactorLedger([
        { recorded_at: AT, event: "activated", operator_id: "ivan", enrolment_id: "two-factor-1", envelope: { algorithm: "aes-256-gcm" } },
      ]),
    /Only an enrolment row/,
  );
  assert.throws(() => createOperatorEnrolment({ operatorId: "not a valid id!" }, { secret: KEY }), /stable operator ID/);
});
