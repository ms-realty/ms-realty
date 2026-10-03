// Ed25519 signatures on evidence artifacts (architecture §21.3). The signed bytes are the
// canonical JSON of the artifact without its `signature` member. Only public keys are ever read
// from the repository; the private key stays with the operator who signs.
import { createHash, createPublicKey, type KeyObject, sign, verify } from "node:crypto";
import type { EvidenceArtifact, GatePolicy } from "./schemas";

/** JSON with object keys sorted at every level, so equal values give equal bytes. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Digest(data: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(data).digest("hex")}`;
}

function signedBytes(artifact: EvidenceArtifact): Buffer {
  const { signature: _signature, ...unsigned } = artifact;
  return Buffer.from(canonicalJson(unsigned), "utf8");
}

/** Signs an artifact; for operator tooling and tests, with a key held outside the repository. */
export function signEvidence(
  artifact: EvidenceArtifact,
  privateKey: KeyObject,
  keyId: string,
): EvidenceArtifact {
  const value = sign(null, signedBytes(artifact), privateKey).toString("base64");
  return { ...artifact, signature: { algorithm: "ed25519", keyId, value } };
}

export type SignatureCheck = "valid" | "unsigned" | "untrusted_key" | "invalid_signature";

/**
 * Whether the artifact carries a valid signature by a policy key trusted for its type. A key
 * that is not listed, or listed for other evidence types, is untrusted.
 */
export function checkSignature(artifact: EvidenceArtifact, policy: GatePolicy): SignatureCheck {
  const signature = artifact.signature;
  if (!signature) return "unsigned";
  const trusted = policy.trustedKeys.find(
    (key) => key.keyId === signature.keyId && key.evidenceTypes.includes(artifact.type),
  );
  if (!trusted) return "untrusted_key";
  try {
    const key = createPublicKey({
      key: Buffer.from(trusted.publicKey, "base64"),
      format: "der",
      type: "spki",
    });
    if (key.asymmetricKeyType !== "ed25519") return "untrusted_key";
    const ok = verify(null, signedBytes(artifact), key, Buffer.from(signature.value, "base64"));
    return ok ? "valid" : "invalid_signature";
  } catch {
    return "invalid_signature";
  }
}
