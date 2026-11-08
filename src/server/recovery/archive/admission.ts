import {
  type Admission,
  admissionDigest,
  demand,
  type Floor,
  offlineAdmission,
  retainedFloor,
  same,
  type TrustRoot,
} from "../../../../gateway/recovery-coordinator-contract";

/** The digest and trust map are caller-owned pins, never fields taken from a supplied tail. */
export function validateOfflineAdmission(input: unknown, selectedDigest: string): Admission {
  const parsed = offlineAdmission.parse(input);
  demand(admissionDigest(parsed) === selectedDigest, "unselected offline admission");
  demand(parsed.sourceCodeSha === parsed.context.releaseSha, "source release differs");
  return parsed;
}
export function validateAuthorityPins(
  admission: Admission,
  floor: Floor,
  roots: readonly TrustRoot[],
) {
  offlineAdmission.parse(admission);
  retainedFloor.parse(floor);
  demand(same(floor.authority, admission.authority), "authority incarnation differs");
  demand(
    Number.isSafeInteger(floor.generation) &&
      floor.generation >= 0 &&
      /^[a-f0-9]{64}$/.test(floor.digest),
    "retained floor missing",
  );
  demand(Array.isArray(roots) && roots.length <= 32, "bounded independent trust map required");
  const pins = new Set<string>();
  for (const root of roots) {
    const pin = `${root.purpose}:${root.subject}:${root.keyId}`;
    demand(
      !pins.has(pin) &&
        /^[A-Za-z0-9_-]{1,128}$/.test(root.keyId) &&
        root.publicKey?.kty === "OKP" &&
        root.publicKey.crv === "Ed25519" &&
        typeof root.publicKey.x === "string" &&
        /^[A-Za-z0-9_-]{43}$/.test(root.publicKey.x) &&
        !root.publicKey.d,
      "invalid or ambiguous public trust root",
    );
    pins.add(pin);
  }
  for (const [purpose, subject] of [
    ["recovery-command", admission.authority.id],
    ["recovery-source", admission.context.sourceInstance],
    ["recovery-copy", admission.context.euR2],
    ["recovery-copy", admission.context.outsideAccount],
    ["recovery-authority", admission.authority.id],
  ])
    demand(
      roots.some((r) => r.purpose === purpose && r.subject === subject),
      "purpose trust missing",
    );
}
/** There is intentionally no environment loader, fixture fallback or production activation. */
export function loadProductionArchive(): never {
  throw new Error("R08 production archive activation is unsupported and unqualified.");
}
