// R08 Phase D: recovery-only offline protocol. Existing v1/v2 wire schemas remain authoritative.
import { createHash } from "node:crypto";
import { CompactSign, compactVerify, decodeProtectedHeader, importJWK, type JWK } from "jose";
import { z } from "zod";
import { canonicalJson } from "../src/domain/approval";
import {
  recoveryContext,
  recoveryDigest,
  recoveryPacket,
  recoveryPoint,
} from "../src/domain/recovery-archive";

export const sha = z.string().regex(/^[a-f0-9]{64}$/);
// Leave room for signed envelopes within the native SQLite/transport row bounds.
export const maxMetadataBytes = 1024 * 1024;
export const maxWireBytes = 2 * maxMetadataBytes;
export const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/);
export const cursor = z
  .strictObject({ sequence: z.int().nonnegative(), digest: sha })
  .refine((c) => (c.sequence === 0) === (c.digest === "0".repeat(64)), "Invalid cursor");
export const measurement = z.strictObject({
  sha256: sha,
  size: z
    .int()
    .positive()
    .max(8 * 1024 * 1024),
});
export const destination = z.enum(["euR2", "outsideAccount"]);
export const purposes = [
  "recovery-command",
  "recovery-source",
  "recovery-copy",
  "recovery-authority",
] as const;
export type Purpose = (typeof purposes)[number];
export const authority = z.strictObject({
  id: identifier,
  namespace: identifier,
  incarnation: identifier,
  jurisdiction: z.literal("eu"),
});
export const retainedFloor = z.strictObject({
  authority,
  generation: z.int().nonnegative(),
  digest: sha,
});
export const offlineAdmission = z
  .strictObject({
    kind: z.literal("recovery_archive_offline_admission_v1"),
    activationAuthorized: z.literal(false),
    evidenceClass: z.literal("offline_fixture"),
    context: recoveryContext,
    authority,
    origin: z.url().refine((s) => {
      const u = new URL(s);
      return u.protocol === "https:" && u.origin === s && !u.username && !u.password;
    }),
    sourceCodeSha: z.string().regex(/^[a-f0-9]{40}$/),
    coordinatorCodeDigest: sha,
    anchor: cursor,
    point: recoveryPoint.nullable(),
    limits: z.strictObject({
      maxEntries: z.int().min(1).max(1000),
      maxObjectBytes: z
        .int()
        .min(1024)
        .max(8 * 1024 * 1024),
      maxRanges: z.int().min(1).max(1000),
    }),
    custodyReference: identifier,
    spoolReference: identifier,
  })
  .refine((a) => a.sourceCodeSha === a.context.releaseSha, "source release differs");
export type Admission = z.infer<typeof offlineAdmission>;
export type Cursor = z.infer<typeof cursor>;
export type Destination = z.infer<typeof destination>;
export const scope = z.strictObject({
  contextDigest: sha,
  purpose: z.enum(["journal_segment", "restrictive_payload", "point_component"]),
  logicalId: identifier,
  plaintext: measurement,
  encryptionProfileDigest: sha,
});
export const prepared = z.strictObject({ scope, scopeDigest: sha, ciphertext: measurement });
export type Prepared = z.infer<typeof prepared>;
export const sourceObservation = z.strictObject({
  contextDigest: sha,
  from: cursor,
  through: cursor,
  committedThrough: cursor,
  entries: z.array(recoveryPacket.shape.segments.element.shape.entries.element).max(1000),
  payloads: z
    .array(
      z.strictObject({
        kind: z.enum([
          "access_revocation",
          "privacy_restriction",
          "deletion_decision",
          "consent_withdrawal",
          "publication_withdrawal",
        ]),
        subjectDigest: sha,
        plaintext: measurement,
      }),
    )
    .max(1000),
  coverage: z.literal("incomplete"),
  currentness: z.literal("unknown"),
  epochState: z.enum(["open", "lost", "unknown"]),
  unresolvedWriters: z.array(identifier).min(1).max(1000),
  unresolvedObjects: z.array(identifier).min(1).max(1000),
  archiveBarrier: z.null(),
});
export type SourceObservation = z.infer<typeof sourceObservation>;
export const copyEvidence = z.strictObject({
  contextDigest: sha,
  scopeDigest: sha,
  ciphertext: measurement,
  destination,
  destinationId: identifier,
  objectKey: z.string().max(512),
  phase: z.enum(["create", "readback"]),
  outcome: z.enum(["created", "precondition_412", "locked_409", "uncertain", "present_identical"]),
  attemptId: identifier,
});
export type CopyEvidence = z.infer<typeof copyEvidence>;
export const command = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("reserve"), source: z.string().max(2 * 1024 * 1024) }),
  z.strictObject({ operation: z.literal("prepare"), descriptor: prepared }),
  z.strictObject({
    operation: z.literal("copy"),
    create: z.string().max(8192),
    readback: z.string().max(8192),
  }),
  z.strictObject({
    operation: z.literal("advance"),
    expected: z.strictObject({ generation: z.int().nonnegative(), digest: sha }),
  }),
]);
export const request = z.strictObject({
  requestId: identifier,
  contextDigest: sha,
  authority,
  command,
});
export type CommandRequest = z.infer<typeof request>;
export const challengeRequest = z.strictObject({
  contextDigest: sha,
  authority,
  challenge: identifier.min(32),
  restoreId: identifier,
  destinationInstance: identifier,
});
export type ChallengeRequest = z.infer<typeof challengeRequest>;
export type TrustRoot = { keyId: string; purpose: Purpose; subject: string; publicKey: JWK };
export type Signer = { keyId: string; privateKey: CryptoKey };
export type Floor = z.infer<typeof retainedFloor>;
export function bytes(value: Uint8Array | string) {
  return {
    sha256: createHash("sha256").update(value).digest("hex"),
    size: typeof value === "string" ? Buffer.byteLength(value) : value.byteLength,
  };
}
export function same(a: unknown, b: unknown) {
  return canonicalJson(a) === canonicalJson(b);
}
export function demand(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(`R08 archive: ${message}`);
}
export function scopeDigest(value: z.infer<typeof scope>) {
  return recoveryDigest("archive-preparation-scope-v1", scope.parse(value));
}
export function admissionDigest(value: Admission) {
  return recoveryDigest("archive-offline-admission-v1", offlineAdmission.parse(value));
}
export async function signEvidence(
  purpose: Purpose,
  subject: string,
  payload: unknown,
  signer: Signer,
) {
  return new CompactSign(Buffer.from(canonicalJson({ purpose, subject, payload })))
    .setProtectedHeader({ alg: "EdDSA", typ: "ms-realty-recovery-v1", kid: signer.keyId })
    .sign(signer.privateKey);
}
export async function verifyEvidence<T>(
  raw: string,
  purpose: Purpose,
  subject: string,
  roots: readonly TrustRoot[],
  schema: z.ZodType<T>,
): Promise<T> {
  demand(typeof raw === "string" && raw.length <= 2 * 1024 * 1024, "evidence exceeds bound");
  const header = decodeProtectedHeader(raw);
  demand(
    Object.keys(header).sort().join() === "alg,kid,typ" &&
      header.alg === "EdDSA" &&
      header.typ === "ms-realty-recovery-v1",
    "evidence algorithm/header differs",
  );
  const root = roots.find(
    (k) => k.keyId === header.kid && k.purpose === purpose && k.subject === subject,
  );
  demand(
    root && root.publicKey.kty === "OKP" && root.publicKey.crv === "Ed25519" && !root.publicKey.d,
    "independent purpose trust root missing",
  );
  const verified = await compactVerify(raw, await importJWK(root.publicKey, "EdDSA"), {
    algorithms: ["EdDSA"],
  });
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(verified.payload);
  const envelope = z
    .strictObject({ purpose: z.literal(purpose), subject: z.literal(subject), payload: schema })
    .parse(JSON.parse(text));
  demand(text === canonicalJson(envelope), "noncanonical authenticated bytes");
  return envelope.payload;
}
export const coordinatorHead = z.strictObject({
  generation: z.int().nonnegative(),
  digest: sha,
  admissionDigest: sha,
  authority,
  selectedThrough: cursor,
  committedThrough: cursor,
  destinationPrefixes: z.strictObject({
    euR2: cursor.nullable(),
    outsideAccount: cursor.nullable(),
  }),
  packet: recoveryPacket.nullable(),
  coverage: z.literal("incomplete"),
  currentness: z.literal("unknown"),
  archiveBarrier: z.null(),
});
export type CoordinatorHead = z.infer<typeof coordinatorHead>;
export const authorityResponse = challengeRequest.extend({ head: coordinatorHead });
