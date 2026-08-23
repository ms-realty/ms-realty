import crypto from "node:crypto";

// RFC 6238 TOTP over RFC 4226 HOTP, written against node:crypto so the
// workspace gains second-factor authentication without a new dependency.
//
// Fail-closed rules encoded here:
// - A code is only accepted when it is exactly TOTP_DIGITS digits. Anything
//   shorter, longer, padded, or non-numeric is refused before any HMAC runs.
// - Comparison is timing-safe on equal-length buffers.
// - Verification returns the matched counter so the caller can persist it and
//   refuse a replay of the same code inside its own 30-second step.
// - The skew window is capped: a generous window is a brute-force multiplier.

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BASE32_VALUES = new Map([...BASE32_ALPHABET].map((character, index) => [character, index]));
// Recovery-code alphabet without 0/O/1/I/L to survive being read off a screen.
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const RECOVERY_GROUPS = 3;
const RECOVERY_GROUP_LENGTH = 5;

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_ALGORITHM = "sha1";
// One step either side: tolerates ~30s of operator clock drift, no more.
export const TOTP_DEFAULT_WINDOW = 1;
export const TOTP_MAX_WINDOW = 2;
export const TOTP_SECRET_BYTES = 20;
export const RECOVERY_CODE_COUNT = 10;

export function base32Encode(buffer) {
  const bytes = Buffer.from(buffer);
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(value) {
  const normalized = String(value || "")
    .toUpperCase()
    .replace(/=+$/, "")
    .replace(/\s+/g, "");
  if (!normalized || [...normalized].some((character) => !BASE32_VALUES.has(character))) {
    throw new Error("TOTP secret must be RFC 4648 base32");
  }
  let bits = 0;
  let value32 = 0;
  const bytes = [];
  for (const character of normalized) {
    value32 = (value32 << 5) | BASE32_VALUES.get(character);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value32 >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(bytes = TOTP_SECRET_BYTES) {
  const size = Number(bytes);
  if (!Number.isInteger(size) || size < 16) throw new Error("TOTP secret must be at least 16 bytes");
  return base32Encode(crypto.randomBytes(size));
}

export function totpCounter(timestamp = Date.now(), stepSeconds = TOTP_STEP_SECONDS) {
  const milliseconds = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
  if (!Number.isFinite(milliseconds)) throw new Error("TOTP timestamp must be a number or ISO string");
  return Math.floor(Math.floor(milliseconds / 1000) / stepSeconds);
}

export function totpCodeForCounter(secret, counter, { digits = TOTP_DIGITS, algorithm = TOTP_ALGORITHM } = {}) {
  if (!Number.isInteger(counter) || counter < 0) throw new Error("TOTP counter must be a non-negative integer");
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac(algorithm, base32Decode(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export function totpCode(secret, { timestamp = Date.now(), stepSeconds = TOTP_STEP_SECONDS, ...options } = {}) {
  return totpCodeForCounter(secret, totpCounter(timestamp, stepSeconds), options);
}

export function normalizeTotpCode(value, digits = TOTP_DIGITS) {
  // Operators paste codes with a space in the middle; nothing else is tolerated.
  const code = String(value ?? "").replace(/\s+/g, "");
  return new RegExp(`^\\d{${digits}}$`).test(code) ? code : "";
}

function timingSafeCodeMatch(actual, expected) {
  const left = Buffer.from(actual, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

// Returns { counter } on success and null on every failure. `afterCounter`
// carries the last counter this operator already spent, so a code that is
// still inside its valid window cannot be replayed.
export function verifyTotpCode(
  secret,
  code,
  {
    timestamp = Date.now(),
    window = TOTP_DEFAULT_WINDOW,
    stepSeconds = TOTP_STEP_SECONDS,
    digits = TOTP_DIGITS,
    algorithm = TOTP_ALGORITHM,
    afterCounter = null,
  } = {},
) {
  const normalized = normalizeTotpCode(code, digits);
  if (!normalized) return null;
  const skew = Number.isInteger(window) ? Math.max(0, Math.min(window, TOTP_MAX_WINDOW)) : TOTP_DEFAULT_WINDOW;
  let current;
  try {
    current = totpCounter(timestamp, stepSeconds);
  } catch {
    return null;
  }
  const floor = Number.isInteger(afterCounter) ? afterCounter : null;
  let matched = null;
  // Constant number of HMACs regardless of where (or whether) the match lands.
  for (let offset = -skew; offset <= skew; offset += 1) {
    const counter = current + offset;
    if (counter < 0) continue;
    let candidate;
    try {
      candidate = totpCodeForCounter(secret, counter, { digits, algorithm });
    } catch {
      return null;
    }
    if (timingSafeCodeMatch(normalized, candidate) && matched === null) matched = counter;
  }
  if (matched === null) return null;
  if (floor !== null && matched <= floor) return null;
  return { counter: matched };
}

export function totpProvisioningUri({ secret, issuer, account, digits = TOTP_DIGITS, stepSeconds = TOTP_STEP_SECONDS, algorithm = TOTP_ALGORITHM }) {
  const issuerLabel = String(issuer || "").trim();
  const accountLabel = String(account || "").trim();
  if (!secret || !issuerLabel || !accountLabel) throw new Error("Provisioning URI requires a secret, issuer, and account");
  const label = `${encodeURIComponent(issuerLabel)}:${encodeURIComponent(accountLabel)}`;
  const parameters = new URLSearchParams({
    secret: String(secret),
    issuer: issuerLabel,
    algorithm: String(algorithm).toUpperCase(),
    digits: String(digits),
    period: String(stepSeconds),
  });
  return `otpauth://totp/${label}?${parameters.toString()}`;
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT) {
  const total = Number(count);
  if (!Number.isInteger(total) || total < 4 || total > 20) throw new Error("Recovery code count must be between 4 and 20");
  return Array.from({ length: total }, () => {
    const groups = [];
    for (let group = 0; group < RECOVERY_GROUPS; group += 1) {
      let text = "";
      for (let index = 0; index < RECOVERY_GROUP_LENGTH; index += 1) {
        text += RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)];
      }
      groups.push(text);
    }
    return groups.join("-");
  });
}

export function normalizeRecoveryCode(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

// A generated recovery code already carries ~74 bits of entropy, so the KDF is
// defence in depth rather than the thing standing between an attacker and the
// account. N is kept modest because verification scans up to RECOVERY_CODE_COUNT
// hashes and a slow scan is its own denial of service.
const RECOVERY_SCRYPT = Object.freeze({ N: 4096, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

export function hashRecoveryCode(code, salt) {
  const normalized = normalizeRecoveryCode(code);
  if (normalized.length < RECOVERY_GROUPS * RECOVERY_GROUP_LENGTH) throw new Error("Recovery code is too short");
  return crypto.scryptSync(normalized, String(salt), 32, RECOVERY_SCRYPT).toString("hex");
}

export function createRecoveryCodeHashes(codes) {
  return codes.map((code) => {
    const salt = crypto.randomBytes(16).toString("hex");
    return { salt, hash: hashRecoveryCode(code, salt) };
  });
}

// Returns the index of the matching recovery code, or -1. Already-spent
// indexes are skipped so a used code stays used.
export function matchRecoveryCode(code, hashes = [], usedIndexes = []) {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) return -1;
  const spent = new Set(usedIndexes);
  for (const [index, entry] of hashes.entries()) {
    if (spent.has(index) || !entry?.salt || !entry?.hash) continue;
    let candidate;
    try {
      candidate = hashRecoveryCode(normalized, entry.salt);
    } catch {
      return -1;
    }
    const left = Buffer.from(candidate, "hex");
    const right = Buffer.from(String(entry.hash), "hex");
    if (left.length === right.length && crypto.timingSafeEqual(left, right)) return index;
  }
  return -1;
}
