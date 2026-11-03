import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  inspectRecoveryArchive,
  type RecoveryExpectation,
  type RecoveryPacket,
  recoveryDigest,
  recoveryEntryDigest,
  recoverySegmentBytes,
} from "./recovery-archive";

const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const measured = (s: string | Buffer) => ({ sha256: sha(s), size: Buffer.byteLength(s) });
const context: RecoveryExpectation["context"] = {
  product: "ms-realty",
  environment: "staging",
  releaseSha: "a".repeat(40),
  releaseContextDigest: sha("release"),
  schemaDigest: sha("schema"),
  writerRegistryDigest: sha("registry"),
  databaseLineage: "lineage",
  sourceInstance: "primary",
  writerEpoch: "epoch-2",
  archiveNamespace: "isolated-drill",
  euR2: "eu-store",
  outsideAccount: "outside-copy",
  encryptionProfileDigest: sha("test-profile"),
};
const contextDigest = recoveryDigest("context-v1", context);
const genesis = { sequence: 0, digest: "0".repeat(64) };
type Point = RecoveryPacket["point"];
type Copies = RecoveryPacket["pointCopies"]["databaseDump"];
type Batch = RecoveryPacket["segments"][number];

function syntheticObject(plaintext: string | Buffer): Point["databaseDump"] {
  return {
    plaintext: measured(plaintext),
    ciphertext: measured(
      Buffer.concat([Buffer.from("synthetic encrypted object: "), Buffer.from(plaintext)]),
    ),
    encryptionProfileDigest: context.encryptionProfileDigest,
  };
}
function copyRecords(object: Point["databaseDump"]): Copies {
  const records: Copies = { euR2: null, outsideAccount: null };
  for (const destination of ["euR2", "outsideAccount"] as const) {
    records[destination] = {
      destination,
      destinationId: context[destination],
      objectKey: `isolated-drill/sha256/${object.ciphertext.sha256}`,
      createReceiptDigest: sha(`create:${destination}:${object.ciphertext.sha256}`),
      readbackReceiptDigest: sha(`read:${destination}:${object.ciphertext.sha256}`),
      readback: { ...object.ciphertext },
    };
  }
  return records;
}

function makeBatch(from: Point["anchor"], kind: "consent_withdrawal" | "access_revocation"): Batch {
  const fields = {
    sequence: from.sequence + 1,
    previousDigest: from.digest,
    transactionRef: `tx-${from.sequence + 1}`,
    effects: [{ kind, subjectDigest: sha("subject"), payloadDigest: sha(kind) }],
  };
  const digest = recoveryEntryDigest(contextDigest, fields);
  const through = { sequence: fields.sequence, digest };
  const entries = [{ ...fields, digest }];
  const object = syntheticObject(recoverySegmentBytes(contextDigest, from, through, entries));
  return { from, through, entries, archive: { object, copies: copyRecords(object) } };
}

function pinPacket(packet: RecoveryPacket): RecoveryExpectation {
  const pointDigest = recoveryDigest("point-v1", packet.point);
  packet.watermark.copySetDigest = recoveryDigest("copies-v1", [
    packet.pointCopies,
    packet.segments.map((s) => s.archive),
  ]);
  const watermarkDigest = recoveryDigest("watermark-v1", packet.watermark);
  if (packet.barrier) packet.barrier.watermarkDigest = watermarkDigest;
  return {
    context: { ...context },
    pointDigest,
    restoreId: "restore-A",
    destinationInstance: "isolated-A",
    challenge: "challenge-A",
    authorityRead: {
      restoreId: "restore-A",
      destinationInstance: "isolated-A",
      challenge: "challenge-A",
      generation: packet.watermark.generation,
      watermarkDigest,
      barrierDigest: packet.barrier && recoveryDigest("barrier-v1", packet.barrier),
    },
  };
}
function fixture(anchor: Point["anchor"] = genesis) {
  const point: Point = {
    kind: "recovery_point_index_v1",
    contextDigest,
    pointId: "point-1",
    snapshotId: "snapshot-1",
    anchor,
    databaseDump: syntheticObject("dump"),
    databaseManifest: syntheticObject("tables"),
    objectManifest: syntheticObject("objects"),
    configurationManifest: syntheticObject("config"),
  };
  const pointDigest = recoveryDigest("point-v1", point);
  const first = makeBatch(anchor, "consent_withdrawal");
  const last = makeBatch(first.through, "access_revocation");
  const packet: RecoveryPacket = {
    point,
    pointCopies: {
      databaseDump: copyRecords(point.databaseDump),
      databaseManifest: copyRecords(point.databaseManifest),
      objectManifest: copyRecords(point.objectManifest),
      configurationManifest: copyRecords(point.configurationManifest),
    },
    segments: [first, last],
    watermark: {
      kind: "recovery_watermark_v1",
      contextDigest,
      pointDigest,
      generation: 3,
      predecessor: { generation: 2, digest: sha("prior watermark") },
      epochState: "closed",
      committed: last.through,
      destinationPrefixes: { euR2: last.through, outsideAccount: last.through },
      copySetDigest: sha("placeholder"),
      unresolvedWriters: [],
      unresolvedObjects: [],
    },
    barrier: {
      kind: "closed_recovery_epoch_v1",
      contextDigest,
      pointDigest,
      generation: 3,
      watermarkDigest: sha("placeholder"),
      finalHead: last.through,
      writerFenceReceiptDigest: sha("closed source writer"),
      acceptedWriteLedgerDigest: sha("accepted activity"),
      coverageReceiptDigest: sha("synthetic coverage report"),
    },
  };
  return { packet, expected: pinPacket(packet), first, last };
}

describe("R08 / AT64 recovery archive contracts", () => {
  it("roots a journal window at the actual nonzero snapshot cursor", () => {
    const anchor = { sequence: 17, digest: sha("prior verified snapshot head") };
    const { packet, expected, last } = fixture(anchor);
    expect(inspectRecoveryArchive(expected, packet).commonArchivePrefix).toEqual(last.through);
    const first = packet.segments[0];
    if (!first) throw Error("missing fixture");
    first.from = { ...anchor, digest: sha("different snapshot head") };
    expect(() => inspectRecoveryArchive(expected, packet)).toThrow(/segment anchor/);
  });

  it("rejects one destination's raw receipt reused as evidence for the other", () => {
    const { packet } = fixture();
    const { euR2, outsideAccount } = packet.pointCopies.databaseDump;
    if (!euR2 || !outsideAccount) throw Error("missing fixture");
    outsideAccount.readbackReceiptDigest = euR2.readbackReceiptDigest;
    expect(() => inspectRecoveryArchive(pinPacket(packet), packet)).toThrow(/conflicting receipt/);
  });

  it("rejects two different plaintext components assigned to the same immutable ciphertext", () => {
    const { packet } = fixture();
    const config = packet.point.configurationManifest;
    config.ciphertext = packet.point.databaseDump.ciphertext;
    const records = copyRecords(config);
    for (const target of ["euR2", "outsideAccount"] as const) {
      const copy = records[target];
      if (!copy) throw Error("missing fixture");
      copy.createReceiptDigest = sha(`other-create-${target}`);
      copy.readbackReceiptDigest = sha(`other-read-${target}`);
    }
    packet.pointCopies.configurationManifest = records;
    const pointDigest = recoveryDigest("point-v1", packet.point);
    packet.watermark.pointDigest = pointDigest;
    if (!packet.barrier) throw Error("missing fixture");
    packet.barrier.pointDigest = pointDigest;
    expect(() => inspectRecoveryArchive(pinPacket(packet), packet)).toThrow(
      /conflicting ciphertext/,
    );
  });

  it("binds both destinations and a closed barrier while preserving quarantine and the evidence class", () => {
    const { packet, expected, last } = fixture();
    expect(inspectRecoveryArchive(expected, packet)).toEqual({
      evidenceClass: "structural_only",
      committed: last.through,
      commonArchivePrefix: last.through,
      destinationPrefixes: { euR2: last.through, outsideAccount: last.through },
      currentness: "closed_barrier_bound",
      quarantine: "required",
    });
  });

  it.each(["open", "lost", "unknown"] as const)(
    "keeps the current head unknown for a %s writer even with every copy",
    (epoch) => {
      const { packet, last } = fixture();
      packet.watermark.epochState = epoch;
      packet.barrier = null;
      expect(inspectRecoveryArchive(pinPacket(packet), packet)).toMatchObject({
        committed: last.through,
        commonArchivePrefix: last.through,
        currentness: "unknown",
      });
    },
  );
  it("keeps a local revocation committed across archive outage and rejects an inflated copy watermark", () => {
    const { packet, first, last } = fixture();
    last.archive = null;
    expect(() => inspectRecoveryArchive(pinPacket(packet), packet)).toThrow(/destination prefix/);
    packet.watermark.destinationPrefixes = { euR2: first.through, outsideAccount: first.through };
    expect(inspectRecoveryArchive(pinPacket(packet), packet)).toMatchObject({
      committed: last.through,
      commonArchivePrefix: first.through,
      currentness: "unknown",
    });
  });
  it("does not skip a missing first segment readback when the following segment has an outside copy", () => {
    const { packet, first, last } = fixture();
    if (!first.archive) throw Error("missing fixture");
    first.archive.copies.outsideAccount = null;
    packet.watermark.destinationPrefixes.outsideAccount = genesis;
    expect(inspectRecoveryArchive(pinPacket(packet), packet)).toMatchObject({
      destinationPrefixes: { euR2: last.through, outsideAccount: genesis },
      commonArchivePrefix: genesis,
      currentness: "unknown",
    });
  });
  it("does not establish a snapshot anchor at a destination missing the configuration object", () => {
    const { packet, last } = fixture();
    packet.pointCopies.configurationManifest.euR2 = null;
    packet.watermark.destinationPrefixes.euR2 = null;
    expect(inspectRecoveryArchive(pinPacket(packet), packet)).toMatchObject({
      destinationPrefixes: { euR2: null, outsideAccount: last.through },
      commonArchivePrefix: null,
      currentness: "unknown",
    });
  });

  it.each([
    "truncate",
    "reorder",
    "tamper entry",
    "bad anchor",
    "bad ciphertext",
    "wrong destination",
    "wrong key",
    "wrong plaintext",
    "unknown source",
  ] as const)("rejects %s", (fault) => {
    const { packet, expected, first } = fixture();
    if (!first.archive || !first.entries[0] || !packet.pointCopies.databaseDump.euR2)
      throw Error("missing fixture");
    switch (fault) {
      case "truncate":
        packet.segments.pop();
        break;
      case "reorder":
        packet.segments.reverse();
        break;
      case "tamper entry":
        first.entries[0].transactionRef = "replacement";
        break;
      case "bad anchor":
        first.from = first.through;
        break;
      case "bad ciphertext":
        packet.pointCopies.databaseDump.euR2.readback.size++;
        break;
      case "wrong destination":
        packet.pointCopies.databaseDump.euR2.destinationId = context.outsideAccount;
        break;
      case "wrong key":
        packet.pointCopies.databaseDump.euR2.objectKey = "other-namespace/value";
        break;
      case "wrong plaintext":
        first.archive.object.plaintext.sha256 = sha("other bytes");
        break;
      case "unknown source":
        expected.context.sourceInstance = "restored-copy";
        break;
    }
    expect(() => inspectRecoveryArchive(expected, packet)).toThrow();
  });

  it.each([
    "releaseSha",
    "databaseLineage",
    "writerEpoch",
    "euR2",
    "writerRegistryDigest",
    "schemaDigest",
  ] as const)("rejects a packet from another %s", (field) => {
    const { expected, packet } = fixture();
    expected.context[field] = expected.context[field].replace(/.$/, (s) => (s === "a" ? "b" : "a"));
    expect(() => inspectRecoveryArchive(expected, packet)).toThrow();
  });

  it("rejects a truncated package that recomputes its own internally consistent head and receipt pins", () => {
    const { packet, expected, first } = fixture();
    packet.segments.pop();
    packet.watermark.committed = first.through;
    packet.watermark.destinationPrefixes = { euR2: first.through, outsideAccount: first.through };
    if (!packet.barrier) throw Error("missing fixture");
    packet.barrier.finalHead = first.through;
    pinPacket(packet);
    expect(() => inspectRecoveryArchive(expected, packet)).toThrow(/current authority watermark/);
  });
  it.each(["absent read", "absent barrier", "unknown writer", "unknown object"] as const)(
    "keeps currentness unknown with %s",
    (fault) => {
      const { packet } = fixture();
      if (fault === "absent barrier") packet.barrier = null;
      if (fault === "unknown writer") packet.watermark.unresolvedWriters = ["legacy-import"];
      if (fault === "unknown object") packet.watermark.unresolvedObjects = ["pending-upload"];
      const expected = pinPacket(packet);
      if (fault === "absent read") expected.authorityRead = null;
      expect(inspectRecoveryArchive(expected, packet).currentness).toBe("unknown");
    },
  );
  it.each([
    "challenge",
    "restore",
    "destination",
    "primary destination",
    "generation",
    "barrier",
    "fence",
    "predecessor",
  ] as const)("rejects a substituted %s binding", (fault) => {
    const { packet, expected, first } = fixture();
    if (!expected.authorityRead || !packet.barrier || !packet.watermark.predecessor)
      throw Error("missing fixture");
    switch (fault) {
      case "challenge":
        expected.challenge = "fresh-B";
        break;
      case "restore":
        expected.restoreId = "restore-B";
        break;
      case "destination":
        expected.destinationInstance = "isolated-B";
        break;
      case "primary destination":
        expected.authorityRead.destinationInstance = expected.destinationInstance =
          context.sourceInstance;
        break;
      case "generation":
        expected.authorityRead.generation++;
        break;
      case "barrier":
        expected.authorityRead.barrierDigest = null;
        break;
      case "fence":
        packet.barrier.finalHead = first.through;
        break;
      case "predecessor":
        packet.watermark.predecessor.generation = 1;
        break;
    }
    expect(() => inspectRecoveryArchive(expected, packet)).toThrow();
  });
});
