// Synthetic offline test fixtures only. No production caller or bootstrap route.
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { calculateJwkThumbprint, exportJWK, generateKeyPair } from "jose";
import { canonicalJson } from "@/domain/approval";
import { recoveryDigest, recoveryEntryDigest } from "@/domain/recovery-archive";
import {
  type Admission,
  admissionDigest,
  bytes,
  type CommandRequest,
  type CoordinatorHead,
  type Floor,
  type Purpose,
  type Signer,
  type SourceObservation,
  signEvidence,
  type TrustRoot,
} from "../../../../gateway/recovery-coordinator-contract";
import {
  headDigest,
  RecoveryCoordinatorCore,
  type RecoverySqlStorage,
} from "../../../../gateway/recovery-coordinator-core";
import { encodeRecoveryRestriction } from "../journal";
import { type EncryptionProfile, profileDigest } from "./preparation";

export async function archiveFixture() {
  const keys = await generateKeyPair("RSA-OAEP-256", { modulusLength: 2048, extractable: true });
  const exported = await exportJWK(keys.publicKey);
  const publicKey = { kty: "RSA" as const, n: exported.n as string, e: "AQAB" as const };
  const profile: EncryptionProfile = {
    kind: "jose_general_jwe_v1",
    implementation: "jose-6.2.13",
    alg: "RSA-OAEP-256",
    enc: "A256GCM",
    recipients: [{ fingerprint: await calculateJwkThumbprint(publicKey), publicKey }],
  };
  const admission: Admission = {
    kind: "recovery_archive_offline_admission_v1",
    activationAuthorized: false,
    evidenceClass: "offline_fixture",
    context: {
      product: "ms-realty",
      environment: "staging",
      releaseSha: "a".repeat(40),
      releaseContextDigest: recoveryDigest("fixture", "release"),
      schemaDigest: recoveryDigest("fixture", "schema"),
      writerRegistryDigest: recoveryDigest("fixture", "writers"),
      databaseLineage: "synthetic-lineage",
      sourceInstance: "synthetic-source",
      writerEpoch: "synthetic-epoch",
      archiveNamespace: "synthetic-archive",
      euR2: "synthetic-eu",
      outsideAccount: "synthetic-outside",
      encryptionProfileDigest: profileDigest(profile),
    },
    authority: {
      id: "synthetic-authority",
      namespace: "synthetic-namespace",
      incarnation: "synthetic-incarnation",
      jurisdiction: "eu",
    },
    origin: "https://recovery.example.test",
    sourceCodeSha: "a".repeat(40),
    coordinatorCodeDigest: recoveryDigest("fixture", "code"),
    anchor: { sequence: 0, digest: "0".repeat(64) },
    point: null,
    limits: { maxEntries: 100, maxObjectBytes: 1024 * 1024, maxRanges: 100 },
    custodyReference: "synthetic-custody",
    spoolReference: "synthetic-spool",
  };
  const roots: TrustRoot[] = [];
  const signers: Record<string, Signer> = {};
  for (const [name, purpose, subject] of [
    ["command", "recovery-command", admission.authority.id],
    ["source", "recovery-source", admission.context.sourceInstance],
    ["euR2", "recovery-copy", admission.context.euR2],
    ["outsideAccount", "recovery-copy", admission.context.outsideAccount],
    ["authority", "recovery-authority", admission.authority.id],
  ]) {
    const pair = await generateKeyPair("EdDSA", { extractable: true });
    roots.push({
      keyId: `synthetic-${name}`,
      purpose: purpose as Purpose,
      subject: subject as string,
      publicKey: await exportJWK(pair.publicKey),
    });
    signers[name as string] = { keyId: `synthetic-${name}`, privateKey: pair.privateKey };
  }
  const contextDigest = recoveryDigest("context-v1", admission.context);
  const payload = encodeRecoveryRestriction(admission.context, {
    kind: "access_revocation",
    decisionId: randomUUID(),
    authorizationDigest: recoveryDigest("fixture", "authorization"),
    principalKind: "staff",
    principalId: randomUUID(),
    target: { kind: "grant", id: randomUUID(), version: 1 },
  });
  const fields = {
    sequence: 1,
    previousDigest: admission.anchor.digest,
    transactionRef: randomUUID(),
    effects: [
      {
        kind: "access_revocation" as const,
        subjectDigest: payload.subjectDigest,
        payloadDigest: payload.digest,
      },
    ],
  };
  const entry = { ...fields, digest: recoveryEntryDigest(contextDigest, fields) };
  const observation: SourceObservation = {
    contextDigest,
    from: admission.anchor,
    through: { sequence: 1, digest: entry.digest },
    committedThrough: { sequence: 1, digest: entry.digest },
    entries: [entry],
    payloads: [
      {
        kind: "access_revocation",
        subjectDigest: payload.subjectDigest,
        plaintext: bytes(payload.canonicalBody),
      },
    ],
    coverage: "incomplete",
    currentness: "unknown",
    epochState: "open",
    unresolvedWriters: ["unqualified_writers"],
    unresolvedObjects: ["unqualified_point_objects"],
    archiveBarrier: null,
  };
  const headBody = {
    generation: 0,
    admissionDigest: admissionDigest(admission),
    authority: admission.authority,
    selectedThrough: admission.anchor,
    committedThrough: admission.anchor,
    destinationPrefixes: { euR2: admission.anchor, outsideAccount: admission.anchor },
    packet: null,
    coverage: "incomplete" as const,
    currentness: "unknown" as const,
    archiveBarrier: null,
  };
  const head: CoordinatorHead = { ...headBody, digest: headDigest(headBody) };
  const floor: Floor = {
    authority: admission.authority,
    generation: head.generation,
    digest: head.digest,
  };
  const signed = (command: CommandRequest["command"], requestId = randomUUID()) =>
    signEvidence(
      "recovery-command",
      admission.authority.id,
      { requestId, contextDigest, authority: admission.authority, command },
      signers.command as Signer,
    );
  return {
    admission,
    profile,
    decryptKey: keys.privateKey,
    roots,
    signers,
    contextDigest,
    payload,
    observation,
    head,
    floor,
    signed,
  };
}
export type ArchiveFixture = Awaited<ReturnType<typeof archiveFixture>>;
export function sqliteFixture(
  path: string,
  fixture: ArchiveFixture,
  seed = true,
  fault?: (stage: string) => void,
) {
  const db = new DatabaseSync(path);
  const storage: RecoverySqlStorage = {
    sql: {
      exec(query, ...bindings) {
        const rows = db.prepare(query).all(...bindings);
        return { toArray: () => rows };
      },
    },
    transactionSync(fn) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = fn();
        db.exec("COMMIT");
        return result;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
  const core = new RecoveryCoordinatorCore(
    storage,
    fixture.admission,
    fixture.floor,
    fixture.roots,
    fixture.signers.authority as Signer,
    fault,
  );
  if (seed) {
    storage.sql.exec(
      "INSERT INTO archive_head(key,value) VALUES(1,?)",
      canonicalJson(fixture.head),
    );
    storage.sql.exec(
      "INSERT INTO archive_records(kind,key,value) VALUES('head',?,?)",
      "0000000000000000",
      canonicalJson(fixture.head),
    );
  }
  return { db, storage, core };
}
