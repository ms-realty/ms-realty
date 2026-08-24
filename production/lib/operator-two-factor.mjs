import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";
import { newRecordId } from "./record-ids.mjs";
import { createPrivateContactEnvelope, openPrivateContactEnvelope } from "./private-contact-vault.mjs";
import {
  RECOVERY_CODE_COUNT,
  TOTP_DEFAULT_WINDOW,
  createRecoveryCodeHashes,
  generateRecoveryCodes,
  generateTotpSecret,
  matchRecoveryCode,
  normalizeRecoveryCode,
  normalizeTotpCode,
  totpProvisioningUri,
  verifyTotpCode,
} from "./totp.mjs";

// Operator second factor: an append-only enrolment ledger whose rows never
// contain the shared secret or a recovery code in the clear. The secret and
// the recovery-code hashes travel inside the same AES-256-GCM envelope the
// contact vault uses, keyed by MS_REALTY_OPERATOR_2FA_KEY. Losing that key
// disables verification for every enrolled operator — which is the correct
// fail-closed outcome, not a reason to fall back to "allow".

export const DEFAULT_OPERATOR_TWO_FACTOR_PATH = fromRoot("production", "data", "operator-two-factor.jsonl");
export const OPERATOR_TWO_FACTOR_KEY_ENV = "MS_REALTY_OPERATOR_2FA_KEY";
export const OPERATOR_TWO_FACTOR_ISSUER = "MS Realty";

const ENVELOPE_SUBJECT_TYPE = "operator_two_factor";
const EVENTS = new Set(["enrolment_started", "activated", "verified", "recovery_code_used", "disabled"]);
const OPERATOR_ID = /^[a-z0-9][a-z0-9._-]{1,63}$/i;
const SECRET_BEARING_FIELDS = new Set(["secret", "recovery_code", "recovery_codes", "code", "totp_secret", "provisioning_uri"]);

function operatorKey(value) {
  const id = String(value || "").trim();
  if (!OPERATOR_ID.test(id)) throw new Error("Two-factor enrolment requires a stable operator ID");
  return id;
}

function twoFactorSecret(secret) {
  const value = String(secret ?? process.env[OPERATOR_TWO_FACTOR_KEY_ENV] ?? "");
  if (value.length < 32) throw new Error(`${OPERATOR_TWO_FACTOR_KEY_ENV} must be at least 32 characters`);
  return value;
}

export function resetOperatorTwoFactorLedger(filePath = DEFAULT_OPERATOR_TWO_FACTOR_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "", { mode: 0o600 });
}

export function readOperatorTwoFactorEvents(filePath = DEFAULT_OPERATOR_TWO_FACTOR_PATH) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function appendOperatorTwoFactorEvent(row, { filePath = DEFAULT_OPERATOR_TWO_FACTOR_PATH } = {}) {
  if (!EVENTS.has(row?.event)) throw new Error("Unknown two-factor event");
  assertOperatorTwoFactorLedger([row]);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(row)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
  return row;
}

// The plaintext secret and recovery codes are returned once, to the enrolling
// operator, and are never written to the ledger, an audit entry, or a log.
export function createOperatorEnrolment(
  { operatorId, account = "", issuer = OPERATOR_TWO_FACTOR_ISSUER, recoveryCodeCount = RECOVERY_CODE_COUNT } = {},
  { secret, recordedAt = new Date().toISOString(), totpSecret = generateTotpSecret(), recoveryCodes } = {},
) {
  const operator = operatorKey(operatorId);
  const vaultSecret = twoFactorSecret(secret);
  const codes = recoveryCodes || generateRecoveryCodes(recoveryCodeCount);
  const enrolmentId = newRecordId("two-factor");
  const envelope = createPrivateContactEnvelope(
    {
      subjectType: ENVELOPE_SUBJECT_TYPE,
      subjectId: enrolmentId,
      payload: { operator_id: operator, secret: totpSecret, recovery_code_hashes: createRecoveryCodeHashes(codes) },
    },
    { secret: vaultSecret, secretName: OPERATOR_TWO_FACTOR_KEY_ENV, storedAt: recordedAt },
  );
  return {
    row: {
      recorded_at: recordedAt,
      event: "enrolment_started",
      operator_id: operator,
      enrolment_id: enrolmentId,
      recovery_code_count: codes.length,
      envelope,
    },
    enrolment_id: enrolmentId,
    // Shown once, in the enrolment response body only.
    secret: totpSecret,
    recovery_codes: codes,
    provisioning_uri: totpProvisioningUri({
      secret: totpSecret,
      issuer,
      account: String(account || operator).trim() || operator,
    }),
  };
}

function openEnrolment(row, secret) {
  try {
    const opened = openPrivateContactEnvelope(row.envelope, {
      secret: twoFactorSecret(secret),
      secretName: OPERATOR_TWO_FACTOR_KEY_ENV,
    });
    return opened.subject_type === ENVELOPE_SUBJECT_TYPE ? opened.payload : null;
  } catch {
    // A rotated or missing key must not silently downgrade to "no second factor".
    return null;
  }
}

// Latest-wins projection per operator. Rows are replayed in ledger order so a
// disable is only undone by a later enrolment.
export function operatorTwoFactorStates(rows = [], { secret } = {}) {
  const states = new Map();
  for (const row of rows) {
    const operator = String(row?.operator_id || "").trim();
    if (!operator || !EVENTS.has(row?.event)) continue;
    if (row.event === "enrolment_started") {
      states.set(operator, {
        operator_id: operator,
        status: "pending",
        enrolment_id: row.enrolment_id,
        envelope: row.envelope,
        started_at: row.recorded_at,
        activated_at: null,
        disabled_at: null,
        recovery_code_count: Number(row.recovery_code_count) || 0,
        used_recovery_indexes: [],
        last_counter: null,
      });
      continue;
    }
    const state = states.get(operator);
    if (!state || state.enrolment_id !== row.enrolment_id) continue;
    if (row.event === "activated" && state.status === "pending") {
      state.status = "active";
      state.activated_at = row.recorded_at;
      if (Number.isInteger(row.counter)) state.last_counter = row.counter;
    } else if (row.event === "verified" && state.status === "active") {
      if (Number.isInteger(row.counter)) state.last_counter = Math.max(state.last_counter ?? -1, row.counter);
    } else if (row.event === "recovery_code_used" && state.status === "active") {
      if (Number.isInteger(row.code_index)) state.used_recovery_indexes = [...new Set([...state.used_recovery_indexes, row.code_index])];
    } else if (row.event === "disabled") {
      state.status = "disabled";
      state.disabled_at = row.recorded_at;
    }
  }
  if (secret !== undefined) {
    for (const state of states.values()) state.payload = state.envelope ? openEnrolment({ envelope: state.envelope }, secret) : null;
  }
  return states;
}

// Response-safe projection: status and counts only, never the envelope.
export function operatorTwoFactorStatus(rows = [], operatorId) {
  const operator = String(operatorId || "").trim();
  const state = operatorTwoFactorStates(rows).get(operator);
  if (!state) {
    return { operator_id: operator, status: "not_enrolled", activated_at: null, recovery_codes_remaining: 0, pending_enrolment_id: null };
  }
  return {
    operator_id: operator,
    status: state.status,
    activated_at: state.activated_at,
    disabled_at: state.disabled_at,
    recovery_codes_remaining:
      state.status === "active" ? Math.max(0, state.recovery_code_count - state.used_recovery_indexes.length) : 0,
    pending_enrolment_id: state.status === "pending" ? state.enrolment_id : null,
  };
}

export function operatorTwoFactorActive(rows = [], operatorId) {
  return operatorTwoFactorStates(rows).get(String(operatorId || "").trim())?.status === "active";
}

// Activation proves the operator's authenticator really holds the secret
// before the factor starts guarding sign-in.
export function activateOperatorEnrolment(
  rows = [],
  { operatorId, code },
  { secret, recordedAt = new Date().toISOString(), timestamp = Date.parse(recordedAt), window = TOTP_DEFAULT_WINDOW } = {},
) {
  const operator = operatorKey(operatorId);
  const state = operatorTwoFactorStates(rows).get(operator);
  if (!state || state.status !== "pending") throw new Error("No pending two-factor enrolment for this operator");
  const payload = openEnrolment(state, secret);
  if (!payload?.secret) throw new Error("Two-factor enrolment cannot be opened with the configured key");
  const verified = verifyTotpCode(payload.secret, code, { timestamp, window });
  if (!verified) throw new Error("The authenticator code was not accepted");
  return {
    recorded_at: recordedAt,
    event: "activated",
    operator_id: operator,
    enrolment_id: state.enrolment_id,
    counter: verified.counter,
  };
}

// Verification at sign-in. Returns { ok:false, reason } rather than throwing so
// a caller can answer with one generic message and never leak which half failed.
export function verifyOperatorTwoFactor(
  rows = [],
  { operatorId, code },
  { secret, recordedAt = new Date().toISOString(), timestamp = Date.parse(recordedAt), window = TOTP_DEFAULT_WINDOW } = {},
) {
  const operator = String(operatorId || "").trim();
  const state = operatorTwoFactorStates(rows).get(operator);
  if (!state || state.status !== "active") return { ok: false, reason: "not_active", events: [] };
  const payload = openEnrolment(state, secret);
  if (!payload?.secret) return { ok: false, reason: "enrolment_unreadable", events: [] };
  const verified = verifyTotpCode(payload.secret, code, { timestamp, window, afterCounter: state.last_counter });
  if (verified) {
    return {
      ok: true,
      method: "totp",
      events: [
        { recorded_at: recordedAt, event: "verified", operator_id: operator, enrolment_id: state.enrolment_id, counter: verified.counter },
      ],
    };
  }
  // Only try recovery codes for input that is not a TOTP-shaped code, so a
  // mistyped authenticator digit never burns a recovery code.
  if (normalizeTotpCode(code)) return { ok: false, reason: "rejected", events: [] };
  if (!normalizeRecoveryCode(code)) return { ok: false, reason: "rejected", events: [] };
  const index = matchRecoveryCode(code, payload.recovery_code_hashes || [], state.used_recovery_indexes);
  if (index < 0) return { ok: false, reason: "rejected", events: [] };
  return {
    ok: true,
    method: "recovery_code",
    events: [
      {
        recorded_at: recordedAt,
        event: "recovery_code_used",
        operator_id: operator,
        enrolment_id: state.enrolment_id,
        code_index: index,
      },
    ],
  };
}

// Disabling is itself a security event: it demands a currently valid factor
// from the operator, or the team-manage capability from someone else.
export function disableOperatorTwoFactor(
  rows = [],
  { operatorId, code, actor, reason = "operator_request", forced = false },
  { secret, recordedAt = new Date().toISOString(), timestamp = Date.parse(recordedAt), window = TOTP_DEFAULT_WINDOW } = {},
) {
  const operator = operatorKey(operatorId);
  const state = operatorTwoFactorStates(rows).get(operator);
  if (!state || state.status === "disabled") throw new Error("This operator has no active two-factor enrolment");
  const events = [];
  if (!forced) {
    if (state.status !== "active") throw new Error("This operator has no active two-factor enrolment");
    const verification = verifyOperatorTwoFactor(rows, { operatorId: operator, code }, { secret, recordedAt, timestamp, window });
    if (!verification.ok) throw new Error("The authenticator code was not accepted");
    events.push(...verification.events);
  }
  events.push({
    recorded_at: recordedAt,
    event: "disabled",
    operator_id: operator,
    enrolment_id: state.enrolment_id,
    actor: String(actor || operator).trim(),
    reason: String(reason || "operator_request").trim(),
    forced: forced === true,
  });
  return events;
}

function containsSecretBearingField(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsSecretBearingField);
  return Object.entries(value).some(([key, nested]) => SECRET_BEARING_FIELDS.has(key) || containsSecretBearingField(nested));
}

export function assertOperatorTwoFactorLedger(rows) {
  for (const row of rows || []) {
    if (!EVENTS.has(row?.event) || !row.operator_id || !row.enrolment_id || !row.recorded_at) {
      throw new Error("Two-factor row is missing routing data");
    }
    const { envelope, ...rest } = row;
    if (containsSecretBearingField(rest)) throw new Error("Two-factor ledger must not store a secret or a code in the clear");
    if (row.event === "enrolment_started") {
      if (!envelope || envelope.algorithm !== "aes-256-gcm" || !envelope.ciphertext) {
        throw new Error("Two-factor enrolment must store an encrypted envelope");
      }
      if (envelope.subject_type !== ENVELOPE_SUBJECT_TYPE) throw new Error("Two-factor envelope has the wrong subject type");
    } else if (envelope) {
      throw new Error("Only an enrolment row may carry an envelope");
    }
  }
  return true;
}
