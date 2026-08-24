import test from "node:test";
import assert from "node:assert/strict";
import {
  TOTP_MAX_WINDOW,
  base32Decode,
  base32Encode,
  createRecoveryCodeHashes,
  generateRecoveryCodes,
  generateTotpSecret,
  matchRecoveryCode,
  normalizeTotpCode,
  totpCode,
  totpProvisioningUri,
  verifyTotpCode,
} from "../lib/totp.mjs";

// RFC 6238 Appendix B, SHA-1 rows. The shared secret is the ASCII string
// "12345678901234567890"; base32 of those bytes is the value below.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"));
const RFC_VECTORS = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
  [20000000000, "65353130"],
];

test("TOTP matches the RFC 6238 SHA-1 test vectors", () => {
  assert.equal(RFC_SECRET, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  for (const [seconds, expected] of RFC_VECTORS) {
    assert.equal(totpCode(RFC_SECRET, { timestamp: seconds * 1000, digits: 8 }), expected, `T=${seconds}`);
  }
});

test("base32 round-trips arbitrary bytes and refuses non-base32 input", () => {
  for (const size of [1, 5, 10, 20, 32]) {
    const bytes = Buffer.from(Array.from({ length: size }, (_, index) => (index * 37 + 11) % 256));
    assert.deepEqual(base32Decode(base32Encode(bytes)), bytes);
  }
  assert.deepEqual(base32Decode("gezdgnbv"), base32Decode("GEZDGNBV"));
  assert.deepEqual(base32Decode("GEZDGNBV===="), base32Decode("GEZDGNBV"));
  assert.throws(() => base32Decode("not-base32!"), /RFC 4648 base32/);
  assert.throws(() => base32Decode(""), /RFC 4648 base32/);
});

test("verification accepts the current step and one step of skew, and nothing wider", () => {
  const secret = generateTotpSecret();
  const now = Date.parse("2026-08-23T12:00:45.000Z");
  assert.ok(verifyTotpCode(secret, totpCode(secret, { timestamp: now }), { timestamp: now }));
  assert.ok(verifyTotpCode(secret, totpCode(secret, { timestamp: now - 30_000 }), { timestamp: now }));
  assert.ok(verifyTotpCode(secret, totpCode(secret, { timestamp: now + 30_000 }), { timestamp: now }));
  assert.equal(verifyTotpCode(secret, totpCode(secret, { timestamp: now - 90_000 }), { timestamp: now }), null);
  assert.equal(verifyTotpCode(secret, totpCode(secret, { timestamp: now + 90_000 }), { timestamp: now }), null);
  // A caller cannot widen the window past the cap.
  assert.equal(
    verifyTotpCode(secret, totpCode(secret, { timestamp: now + 300_000 }), { timestamp: now, window: 50 }),
    null,
  );
  assert.ok(
    verifyTotpCode(secret, totpCode(secret, { timestamp: now + TOTP_MAX_WINDOW * 30_000 }), { timestamp: now, window: 50 }),
  );
});

test("verification refuses malformed codes and replays of a spent counter", () => {
  const secret = generateTotpSecret();
  const now = Date.parse("2026-08-23T12:00:45.000Z");
  const code = totpCode(secret, { timestamp: now });
  for (const bad of ["", null, undefined, "12345", "1234567", "abcdef", `${code} extra`, { code }]) {
    assert.equal(verifyTotpCode(secret, bad, { timestamp: now }), null, `refuses ${JSON.stringify(bad)}`);
  }
  assert.equal(normalizeTotpCode("123 456"), "123456");
  assert.equal(normalizeTotpCode("12a456"), "");

  const first = verifyTotpCode(secret, code, { timestamp: now });
  assert.ok(first);
  // Same code, same window, already spent: refused.
  assert.equal(verifyTotpCode(secret, code, { timestamp: now, afterCounter: first.counter }), null);
  const later = now + 60_000;
  assert.ok(verifyTotpCode(secret, totpCode(secret, { timestamp: later }), { timestamp: later, afterCounter: first.counter }));
});

test("the provisioning URI carries the issuer, account and parameters", () => {
  const uri = totpProvisioningUri({ secret: "GEZDGNBV", issuer: "MS Realty", account: "ivan@example.test" });
  assert.match(uri, /^otpauth:\/\/totp\/MS%20Realty:ivan%40example\.test\?/);
  const parameters = new URL(uri).searchParams;
  assert.equal(parameters.get("secret"), "GEZDGNBV");
  assert.equal(parameters.get("issuer"), "MS Realty");
  assert.equal(parameters.get("algorithm"), "SHA1");
  assert.equal(parameters.get("digits"), "6");
  assert.equal(parameters.get("period"), "30");
  assert.throws(() => totpProvisioningUri({ secret: "", issuer: "MS Realty", account: "ivan" }), /requires a secret/);
});

test("recovery codes are unique, hashed with per-code salts, and single use", () => {
  const codes = generateRecoveryCodes(10);
  assert.equal(new Set(codes).size, 10);
  assert.ok(codes.every((code) => /^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(code)));
  // No visually ambiguous characters.
  assert.ok(codes.every((code) => !/[OIL01]/.test(code)));

  const hashes = createRecoveryCodeHashes(codes);
  assert.equal(new Set(hashes.map((entry) => entry.salt)).size, 10);
  assert.ok(hashes.every((entry) => !codes.some((code) => entry.hash.includes(code))));

  assert.equal(matchRecoveryCode(codes[3], hashes, []), 3);
  // Formatting is forgiving; the value is not.
  assert.equal(matchRecoveryCode(codes[3].replace(/-/g, "").toLowerCase(), hashes, []), 3);
  assert.equal(matchRecoveryCode(codes[3], hashes, [3]), -1);
  assert.equal(matchRecoveryCode("AAAAA-BBBBB-CCCCC", hashes, []), -1);
  assert.equal(matchRecoveryCode("", hashes, []), -1);
});

test("secret generation refuses a weak size", () => {
  assert.throws(() => generateTotpSecret(8), /at least 16 bytes/);
  assert.equal(base32Decode(generateTotpSecret()).length, 20);
  assert.throws(() => generateRecoveryCodes(2), /between 4 and 20/);
});
