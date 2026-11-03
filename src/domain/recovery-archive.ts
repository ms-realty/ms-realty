// R08 / AT64. Structural contracts only. Adapters authenticate evidence and enforce the writer fence.
import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "./approval";

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/);
const counter = z.int().nonnegative();
const zero = "0".repeat(64);
const destinations = ["euR2", "outsideAccount"] as const;
const destination = z.enum(destinations);
const components = [
  "databaseDump",
  "databaseManifest",
  "objectManifest",
  "configurationManifest",
] as const;

export const recoveryContext = z
  .strictObject({
    product: z.literal("ms-realty"),
    environment: z.enum(["staging", "production"]),
    releaseSha: z.string().regex(/^[a-f0-9]{40}$/),
    releaseContextDigest: sha,
    schemaDigest: sha,
    writerRegistryDigest: sha,
    databaseLineage: id,
    sourceInstance: id,
    writerEpoch: id,
    archiveNamespace: id,
    euR2: id,
    outsideAccount: id,
    encryptionProfileDigest: sha,
  })
  .refine((c) => c.euR2 !== c.outsideAccount, "Distinct destination identities required.");

const cursor = z
  .strictObject({ sequence: counter, digest: sha })
  .refine((c) => (c.sequence === 0) === (c.digest === zero), "Invalid journal anchor.");
type Cursor = z.infer<typeof cursor>;

const bytes = z.strictObject({ sha256: sha, size: z.int().positive() });
const encrypted = z.strictObject({
  plaintext: bytes,
  ciphertext: bytes,
  encryptionProfileDigest: sha,
});
const copy = z.strictObject({
  destination,
  destinationId: id,
  objectKey: z.string().min(1).max(512),
  createReceiptDigest: sha,
  readbackReceiptDigest: sha,
  readback: bytes,
});
const copies = z.strictObject({ euR2: copy.nullable(), outsideAccount: copy.nullable() });
type Copies = z.infer<typeof copies>;
type Destination = (typeof destinations)[number];

export const recoveryPoint = z.strictObject({
  kind: z.literal("recovery_point_index_v1"),
  contextDigest: sha,
  pointId: id,
  snapshotId: id,
  anchor: cursor,
  databaseDump: encrypted,
  databaseManifest: encrypted,
  objectManifest: encrypted,
  configurationManifest: encrypted,
});

const restrictiveKinds = [
  "access_revocation",
  "privacy_restriction",
  "deletion_decision",
  "consent_withdrawal",
  "publication_withdrawal",
] as const;
const entryFields = z.strictObject({
  sequence: z.int().positive(),
  previousDigest: sha,
  transactionRef: id,
  effects: z
    .array(
      z.strictObject({
        kind: z.enum([...restrictiveKinds, "accepted_operation", "external_outcome"]),
        subjectDigest: sha,
        payloadDigest: sha,
      }),
    )
    .min(1),
});
const journalEntry = entryFields.extend({ digest: sha });
// The encrypted object contains the source-schema replay payload. Its measured plaintext
// SHA-256 is the journal's payloadDigest. Public evidence contains only hashes and receipts.
const replayPayload = z.strictObject({
  kind: z.enum(restrictiveKinds),
  subjectDigest: sha,
  object: encrypted,
  copies,
});
const segment = z.strictObject({
  from: cursor,
  through: cursor,
  entries: z.array(journalEntry).min(1),
  // Committed rows can be available while encryption or either copy is pending.
  archive: z
    .strictObject({ object: encrypted, copies, replayPayloads: z.array(replayPayload) })
    .nullable(),
});

const watermark = z.strictObject({
  kind: z.literal("recovery_watermark_v2"),
  contextDigest: sha,
  pointDigest: sha,
  generation: z.int().positive(),
  predecessor: z.strictObject({ generation: counter, digest: sha }).nullable(),
  epochState: z.enum(["open", "lost", "unknown", "closed"]),
  committed: cursor,
  destinationPrefixes: z.strictObject({
    euR2: cursor.nullable(),
    outsideAccount: cursor.nullable(),
  }),
  copySetDigest: sha,
  unresolvedWriters: z.array(id),
  unresolvedObjects: z.array(id),
});
const barrier = z.strictObject({
  kind: z.literal("closed_recovery_epoch_v1"),
  contextDigest: sha,
  pointDigest: sha,
  watermarkDigest: sha,
  generation: z.int().positive(),
  finalHead: cursor,
  writerFenceReceiptDigest: sha,
  acceptedWriteLedgerDigest: sha,
  coverageReceiptDigest: sha,
});
export const recoveryPacket = z.strictObject({
  point: recoveryPoint,
  pointCopies: z.strictObject({
    databaseDump: copies,
    databaseManifest: copies,
    objectManifest: copies,
    configurationManifest: copies,
  }),
  segments: z.array(segment),
  watermark,
  barrier: barrier.nullable(),
});

// The caller obtains these pins independently of the packet. A null observation preserves unknown currentness.
export const recoveryExpectation = z.strictObject({
  context: recoveryContext,
  pointDigest: sha,
  restoreId: id,
  destinationInstance: id,
  challenge: id,
  authorityRead: z
    .strictObject({
      restoreId: id,
      destinationInstance: id,
      challenge: id,
      generation: z.int().positive(),
      watermarkDigest: sha,
      barrierDigest: sha.nullable(),
    })
    .nullable(),
});
export type RecoveryPacket = z.infer<typeof recoveryPacket>;
export type RecoveryExpectation = z.infer<typeof recoveryExpectation>;

/** Domain separation and canonical key order are part of the wire format. */
export function recoveryDigest(kind: string, value: unknown): string {
  return createHash("sha256")
    .update(canonicalJson([kind, value]))
    .digest("hex");
}
export function recoveryEntryDigest(
  contextDigest: string,
  fields: z.infer<typeof entryFields>,
): string {
  return recoveryDigest("journal-entry-v1", [sha.parse(contextDigest), entryFields.parse(fields)]);
}
/** The encrypted segment must decrypt to these exact UTF-8 bytes. */
export function recoverySegmentBytes(
  contextDigest: string,
  from: Cursor,
  through: Cursor,
  entries: z.infer<typeof journalEntry>[],
) {
  return Buffer.from(canonicalJson(["journal-segment-v1", contextDigest, from, through, entries]));
}
function requireMatch(condition: boolean, detail: string): asserts condition {
  if (!condition) throw new Error(`Recovery evidence conflict: ${detail}.`);
}
function sameCursor(a: Cursor | null, b: Cursor | null) {
  return a === null || b === null ? a === b : a.sequence === b.sequence && a.digest === b.digest;
}
function bindOnce(bindings: Map<string, string>, identity: string, value: unknown, detail: string) {
  const canonical = canonicalJson(value);
  const prior = bindings.get(identity);
  requireMatch(prior === undefined || prior === canonical, detail);
  bindings.set(identity, canonical);
}
function checkCopies(
  context: RecoveryExpectation["context"],
  object: z.infer<typeof encrypted>,
  records: Copies,
  bindings: Map<string, string>,
  purpose: "point_component" | "journal_segment" | "restrictive_payload",
) {
  requireMatch(
    object.encryptionProfileDigest === context.encryptionProfileDigest,
    "encryption profile",
  );
  requireMatch(
    object.plaintext.sha256 !== object.ciphertext.sha256,
    "cleartext declared as ciphertext",
  );
  for (const content of [object.plaintext, object.ciphertext]) {
    bindOnce(bindings, `bytes/${content.sha256}`, content.size, "conflicting byte length");
  }
  bindOnce(bindings, `format/${object.plaintext.sha256}`, purpose, "conflicting content purpose");
  bindOnce(
    bindings,
    `ciphertext/${object.ciphertext.sha256}`,
    object,
    "conflicting ciphertext binding",
  );
  for (const target of destinations) {
    const record = records[target];
    if (!record) continue;
    // The opaque destination ID resolves to the complete provisioned location outside this contract.
    const key = `${context.archiveNamespace}/sha256/${object.ciphertext.sha256}`;
    requireMatch(
      record.destination === target &&
        record.destinationId === context[target] &&
        record.objectKey === key,
      "immutable copy location",
    );
    requireMatch(
      record.readback.sha256 === object.ciphertext.sha256 &&
        record.readback.size === object.ciphertext.size,
      "ciphertext readback",
    );
    for (const [kind, rawDigest] of [
      ["create", record.createReceiptDigest],
      ["readback", record.readbackReceiptDigest],
    ] as const) {
      bindOnce(
        bindings,
        `receipt/${rawDigest}`,
        [kind, target, record.destinationId, key, object],
        "conflicting receipt binding",
      );
    }
  }
}

function replayCoverage(
  context: RecoveryExpectation["context"],
  batch: RecoveryPacket["segments"][number],
  bindings: Map<string, string>,
) {
  const required = new Map<string, { kind: string; subjectDigest: string }>();
  for (const entry of batch.entries) {
    for (const effect of entry.effects) {
      if (effect.kind === "accepted_operation" || effect.kind === "external_outcome") continue;
      const scope = { kind: effect.kind, subjectDigest: effect.subjectDigest };
      bindOnce(
        bindings,
        `restrictive/${effect.payloadDigest}`,
        scope,
        "conflicting replay payload scope",
      );
      required.set(effect.payloadDigest, scope);
    }
  }
  const seen = new Set<string>();
  const available = { euR2: 0, outsideAccount: 0 };
  for (const payload of batch.archive?.replayPayloads ?? []) {
    const digest = payload.object.plaintext.sha256;
    const effect = required.get(digest);
    requireMatch(
      !seen.has(digest) &&
        effect?.kind === payload.kind &&
        effect.subjectDigest === payload.subjectDigest,
      "unreferenced, duplicate or mis-scoped replay payload",
    );
    seen.add(digest);
    checkCopies(context, payload.object, payload.copies, bindings, "restrictive_payload");
    for (const target of destinations) if (payload.copies[target]) available[target]++;
  }
  return {
    euR2: available.euR2 === required.size,
    outsideAccount: available.outsideAccount === required.size,
  };
}

/** Validates an ordered window from the independently pinned point. Every result stays quarantined. */
export function inspectRecoveryArchive(expectedInput: unknown, packetInput: unknown) {
  const expected = recoveryExpectation.parse(expectedInput);
  const packet = recoveryPacket.parse(packetInput);
  const { point, pointCopies, segments, watermark: mark } = packet;
  requireMatch(
    expected.destinationInstance !== expected.context.sourceInstance,
    "isolated restore destination",
  );
  const contextDigest = recoveryDigest("context-v1", expected.context);
  const pointDigest = recoveryDigest("point-v1", point);
  requireMatch(
    pointDigest === expected.pointDigest && point.contextDigest === contextDigest,
    "expected recovery point",
  );
  requireMatch(
    mark.contextDigest === contextDigest && mark.pointDigest === pointDigest,
    "watermark context",
  );
  requireMatch(
    mark.generation === 1
      ? mark.predecessor === null
      : mark.predecessor?.generation === mark.generation - 1,
    "watermark predecessor",
  );

  // A destination's prefix starts only once it contains every required component of the pinned point.
  const prefixes: Record<Destination, Cursor | null> = {
    euR2: point.anchor,
    outsideAccount: point.anchor,
  };
  const bindings = new Map<string, string>();
  for (const component of components) {
    checkCopies(
      expected.context,
      point[component],
      pointCopies[component],
      bindings,
      "point_component",
    );
    for (const target of destinations) {
      if (!pointCopies[component][target]) prefixes[target] = null;
    }
  }

  const transactions = new Set<string>();
  let head = point.anchor;
  for (const batch of segments) {
    requireMatch(sameCursor(batch.from, head), "segment anchor");
    for (const { digest, ...fields } of batch.entries) {
      requireMatch(
        fields.sequence === head.sequence + 1 && fields.previousDigest === head.digest,
        "journal continuity",
      );
      requireMatch(!transactions.has(fields.transactionRef), "duplicate transaction envelope");
      requireMatch(recoveryEntryDigest(contextDigest, fields) === digest, "journal entry digest");
      transactions.add(fields.transactionRef);
      head = { sequence: fields.sequence, digest };
    }
    requireMatch(sameCursor(batch.through, head), "segment head");
    const recoverable = replayCoverage(expected.context, batch, bindings);
    if (!batch.archive) continue;
    const encoded = recoverySegmentBytes(contextDigest, batch.from, batch.through, batch.entries);
    const { object, copies: stored } = batch.archive;
    requireMatch(
      object.plaintext.size === encoded.length &&
        object.plaintext.sha256 === createHash("sha256").update(encoded).digest("hex"),
      "segment plaintext",
    );
    checkCopies(expected.context, object, stored, bindings, "journal_segment");
    for (const target of destinations) {
      if (stored[target] && recoverable[target] && sameCursor(prefixes[target], batch.from))
        prefixes[target] = head;
    }
  }
  requireMatch(sameCursor(mark.committed, head), "committed head");
  for (const target of destinations) {
    requireMatch(
      sameCursor(mark.destinationPrefixes[target], prefixes[target]),
      "destination prefix",
    );
  }
  const copySetDigest = recoveryDigest("copies-v2", [
    pointCopies,
    segments.map((batch) => batch.archive),
  ]);
  requireMatch(mark.copySetDigest === copySetDigest, "copy receipt set");
  const watermarkDigest = recoveryDigest("watermark-v2", mark);
  const seal = packet.barrier;
  if (seal) {
    requireMatch(
      mark.epochState === "closed" &&
        seal.watermarkDigest === watermarkDigest &&
        seal.generation === mark.generation,
      "closed epoch",
    );
    requireMatch(
      seal.contextDigest === contextDigest &&
        seal.pointDigest === pointDigest &&
        sameCursor(seal.finalHead, head),
      "final source fence",
    );
    for (const purpose of [
      "writerFenceReceiptDigest",
      "acceptedWriteLedgerDigest",
      "coverageReceiptDigest",
    ] as const) {
      bindOnce(
        bindings,
        `receipt/${seal[purpose]}`,
        [purpose, contextDigest, pointDigest, mark.generation, head],
        "conflicting receipt binding",
      );
    }
  }
  const observed = expected.authorityRead;
  if (observed) {
    requireMatch(
      observed.restoreId === expected.restoreId &&
        observed.destinationInstance === expected.destinationInstance &&
        observed.challenge === expected.challenge,
      "fresh authority read context",
    );
    requireMatch(
      observed.generation === mark.generation && observed.watermarkDigest === watermarkDigest,
      "current authority watermark",
    );
    requireMatch(
      observed.barrierDigest === (seal ? recoveryDigest("barrier-v1", seal) : null),
      "current authority barrier",
    );
  }
  const { euR2, outsideAccount } = prefixes;
  const common =
    euR2 && outsideAccount
      ? euR2.sequence < outsideAccount.sequence
        ? euR2
        : outsideAccount
      : null;
  const coherentClosedBarrier =
    seal !== null &&
    observed !== null &&
    sameCursor(common, head) &&
    mark.unresolvedWriters.length === 0 &&
    mark.unresolvedObjects.length === 0;
  return {
    evidenceClass: "structural_only" as const,
    committed: head,
    destinationPrefixes: prefixes,
    commonArchivePrefix: common,
    currentness: coherentClosedBarrier ? ("closed_barrier_bound" as const) : ("unknown" as const),
    quarantine: "required" as const,
  };
}
