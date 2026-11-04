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
  // A private source codec would encode the full scoped restriction. All identities here are synthetic.
  const target = kind === "access_revocation" ? "synthetic-grant" : "synthetic-subscription";
  const replay = syntheticObject(
    JSON.stringify({ schema: "synthetic-v1", kind, target, action: "deny" }),
  );
  const subjectDigest = sha(target);
  const fields = {
    sequence: from.sequence + 1,
    previousDigest: from.digest,
    transactionRef: `tx-${from.sequence + 1}`,
    effects: [{ kind, subjectDigest, payloadDigest: replay.plaintext.sha256 }],
  };
  const digest = recoveryEntryDigest(contextDigest, fields);
  const through = { sequence: fields.sequence, digest };
  const entries = [{ ...fields, digest }];
  const object = syntheticObject(recoverySegmentBytes(contextDigest, from, through, entries));
  return {
    from,
    through,
    entries,
    archive: {
      object,
      copies: copyRecords(object),
      replayPayloads: [{ kind, subjectDigest, object: replay, copies: copyRecords(replay) }],
    },
  };
}

function pinPacket(packet: RecoveryPacket): RecoveryExpectation {
  const pointDigest = recoveryDigest("point-v1", packet.point);
  packet.watermark.copySetDigest = recoveryDigest("copies-v2", [
    packet.pointCopies,
    packet.segments.map((s) => s.archive),
  ]);
  const watermarkDigest = recoveryDigest("watermark-v2", packet.watermark);
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
function replaceTail(packet: RecoveryPacket, tail: Batch) {
  packet.segments[packet.segments.length - 1] = tail;
  packet.watermark.committed = tail.through;
  packet.watermark.destinationPrefixes = { euR2: tail.through, outsideAccount: tail.through };
  if (!packet.barrier) throw Error("missing fixture");
  packet.barrier.finalHead = tail.through;
  return pinPacket(packet);
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
      kind: "recovery_watermark_v2",
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
  it.each(["clear manifest", "rewrapped configuration ciphertext"] as const)(
    "rejects %s as the replay command for a later revocation",
    (substitution) => {
      const { packet, last } = fixture();
      const entry = last.entries[0];
      const effect = entry?.effects[0];
      const archive = last.archive;
      const replay = archive?.replayPayloads[0];
      if (!entry || !effect || !archive || !replay) throw Error("missing fixture");
      replay.object =
        substitution === "clear manifest"
          ? packet.point.configurationManifest
          : syntheticObject(Buffer.from("synthetic encrypted object: config"));
      if (substitution === "rewrapped configuration ciphertext") {
        expect(replay.object.plaintext).toEqual(packet.point.configurationManifest.ciphertext);
      }
      replay.copies = copyRecords(replay.object);
      effect.payloadDigest = replay.object.plaintext.sha256;
      const { digest: _oldDigest, ...fields } = entry;
      entry.digest = recoveryEntryDigest(contextDigest, fields);
      last.through = { sequence: entry.sequence, digest: entry.digest };
      archive.object = syntheticObject(
        recoverySegmentBytes(contextDigest, last.from, last.through, last.entries),
      );
      archive.copies = copyRecords(archive.object);
      expect(() => inspectRecoveryArchive(replaceTail(packet, last), packet)).toThrow(
        /content purpose/,
      );
    },
  );

  it("rejects a known encrypted dump redeclared as a writer-fence artifact", () => {
    const { packet } = fixture();
    if (!packet.barrier) throw Error("missing fixture");
    packet.barrier.writerFenceReceiptDigest = packet.point.databaseDump.ciphertext.sha256;
    expect(() => inspectRecoveryArchive(pinPacket(packet), packet)).toThrow(/receipt binding/);
  });

  it.each([
    "point index",
    "source schema",
    "journal head",
    "journal segment",
    "effect subject",
    "restrictive payload",
    "copy set",
    "predecessor watermark",
    "current watermark",
  ] as const)("rejects %s bytes reused as coverage evidence under fresh pins", (source) => {
    const { packet, first } = fixture();
    const effect = first.entries[0]?.effects[0];
    if (!packet.barrier || !first.archive || !effect || !packet.watermark.predecessor)
      throw Error("missing fixture");
    const identity = {
      "point index": packet.watermark.pointDigest,
      "source schema": context.schemaDigest,
      "journal head": first.through.digest,
      "journal segment": first.archive.object.plaintext.sha256,
      "effect subject": effect.subjectDigest,
      "restrictive payload": effect.payloadDigest,
      "copy set": packet.watermark.copySetDigest,
      "predecessor watermark": packet.watermark.predecessor.digest,
      "current watermark": recoveryDigest("watermark-v2", packet.watermark),
    }[source];
    packet.barrier.coverageReceiptDigest = identity;
    expect(() => inspectRecoveryArchive(pinPacket(packet), packet)).toThrow(/receipt binding/);
  });

  it("rejects one byte-identical plaintext assigned to different named point components", () => {
    const { packet } = fixture();
    packet.point.configurationManifest.plaintext = { ...packet.point.databaseManifest.plaintext };
    const pointDigest = recoveryDigest("point-v1", packet.point);
    packet.watermark.pointDigest = pointDigest;
    if (!packet.barrier) throw Error("missing fixture");
    packet.barrier.pointDigest = pointDigest;
    expect(() => inspectRecoveryArchive(pinPacket(packet), packet)).toThrow(
      /content purpose or scope/,
    );
  });

  it("allows another encrypted copy of the identical typed payload under its original scope", () => {
    const { packet, first } = fixture();
    const tail = makeBatch(first.through, "consent_withdrawal");
    const payload = tail.archive?.replayPayloads[0];
    if (!payload) throw Error("missing fixture");
    payload.object.ciphertext = measured("another synthetic encryption envelope");
    payload.copies = copyRecords(payload.object);
    expect(inspectRecoveryArchive(replaceTail(packet, tail), packet)).toMatchObject({
      evidenceClass: "structural_only",
      commonArchivePrefix: tail.through,
      currentness: "closed_barrier_bound",
      quarantine: "required",
    });
  });

  it("allows the same scoped restrictive object and matching receipts in multiple segments", () => {
    const { packet, first } = fixture();
    const tail = makeBatch(first.through, "consent_withdrawal");
    expect(inspectRecoveryArchive(replaceTail(packet, tail), packet)).toMatchObject({
      commonArchivePrefix: tail.through,
      currentness: "closed_barrier_bound",
      quarantine: "required",
    });
  });

  it("rejects destination watermarks that count restrictive hashes with no replay objects", () => {
    const { packet, last } = fixture();
    for (const batch of packet.segments) {
      if (batch.archive) batch.archive.replayPayloads = [];
    }
    expect(() => inspectRecoveryArchive(pinPacket(packet), packet)).toThrow(/destination prefix/);
    packet.watermark.destinationPrefixes = { euR2: genesis, outsideAccount: genesis };
    expect(inspectRecoveryArchive(pinPacket(packet), packet)).toMatchObject({
      committed: last.through,
      commonArchivePrefix: genesis,
      currentness: "unknown",
      quarantine: "required",
    });
  });

  it.each(["euR2", "outsideAccount"] as const)(
    "holds %s at the first missing replay payload despite later complete copies",
    (target) => {
      const { first, last, packet } = fixture();
      const payload = first.archive?.replayPayloads[0];
      if (!payload) throw Error("missing fixture");
      payload.copies[target] = null;
      packet.watermark.destinationPrefixes[target] = genesis;
      const other = target === "euR2" ? "outsideAccount" : "euR2";
      expect(inspectRecoveryArchive(pinPacket(packet), packet)).toMatchObject({
        committed: last.through,
        destinationPrefixes: { [target]: genesis, [other]: last.through },
        commonArchivePrefix: genesis,
        currentness: "unknown",
        quarantine: "required",
      });
    },
  );

  it.each(["kind", "subject", "ciphertext", "digest", "extra object"] as const)(
    "rejects substituted replay payload %s",
    (fault) => {
      const { packet, first } = fixture();
      const archive = first.archive;
      const payload = archive?.replayPayloads[0];
      if (!archive || !payload) throw Error("missing fixture");
      switch (fault) {
        case "kind":
          payload.kind = "deletion_decision";
          break;
        case "subject":
          payload.subjectDigest = sha("wrong party");
          break;
        case "ciphertext":
          payload.object.ciphertext.sha256 = sha("wrong ciphertext");
          break;
        case "digest":
          payload.object.plaintext.sha256 = sha("wrong payload");
          break;
        case "extra object":
          archive.replayPayloads.push(structuredClone(payload));
          break;
      }
      expect(() => inspectRecoveryArchive(pinPacket(packet), packet)).toThrow();
    },
  );

  it.each(["conflicting length", "cleartext copy"] as const)(
    "rejects a newly pinned %s",
    (fault) => {
      const { packet } = fixture();
      const { databaseDump: dump, configurationManifest: config } = packet.point;
      if (fault === "conflicting length") {
        config.plaintext = { sha256: dump.plaintext.sha256, size: dump.plaintext.size + 1 };
      } else {
        config.ciphertext = { ...config.plaintext };
        packet.pointCopies.configurationManifest = copyRecords(config);
      }
      const pointDigest = recoveryDigest("point-v1", packet.point);
      packet.watermark.pointDigest = pointDigest;
      if (!packet.barrier) throw Error("missing fixture");
      packet.barrier.pointDigest = pointDigest;
      expect(() => inspectRecoveryArchive(pinPacket(packet), packet)).toThrow(
        fault === "conflicting length" ? /byte length/ : /cleartext/,
      );
    },
  );

  it("rejects a storage creation receipt redeclared as the source writer fence", () => {
    const { packet } = fixture();
    const stored = packet.pointCopies.databaseDump.euR2;
    if (!stored || !packet.barrier) throw Error("missing fixture");
    packet.barrier.writerFenceReceiptDigest = stored.createReceiptDigest;
    expect(() => inspectRecoveryArchive(pinPacket(packet), packet)).toThrow(/receipt binding/);
  });

  it.each(["acceptedWriteLedgerDigest", "coverageReceiptDigest"] as const)(
    "requires a separate typed reference for %s",
    (purpose) => {
      const { packet } = fixture();
      if (!packet.barrier) throw Error("missing fixture");
      packet.barrier[purpose] = packet.barrier.writerFenceReceiptDigest;
      expect(() => inspectRecoveryArchive(pinPacket(packet), packet)).toThrow(/receipt binding/);
    },
  );

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
