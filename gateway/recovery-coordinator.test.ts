import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  inspectRecoveryArchive,
  type RecoveryPacket,
  recoveryDigest,
  recoveryEntryDigest,
  recoveryExpectation,
} from "../src/domain/recovery-archive";
import {
  type ArchiveFixture,
  archiveFixture,
  sqliteFixture,
} from "../src/server/recovery/archive/testing";
import {
  admissionDigest,
  bytes,
  type CommandRequest,
  coordinatorHead,
  type Prepared,
  type Signer,
  type SourceObservation,
  scopeDigest,
  signEvidence,
  verifyEvidence,
} from "./recovery-coordinator-contract";
import { headDigest } from "./recovery-coordinator-core";

let f: ArchiveFixture, dir: string, local: ReturnType<typeof sqliteFixture>;
beforeEach(async () => {
  f = await archiveFixture();
  dir = await mkdtemp(join(tmpdir(), "msr-r08-core-"));
  local = sqliteFixture(join(dir, "authority.sqlite"), f);
});
afterEach(async () => {
  local.db.close();
  await rm(dir, { recursive: true, force: true });
});
async function execute(command: CommandRequest["command"]) {
  return local.core.execute(await f.signed(command));
}
async function reserve(o = f.observation) {
  return execute({
    operation: "reserve",
    source: await signEvidence(
      "recovery-source",
      f.admission.context.sourceInstance,
      o,
      f.signers.source as Signer,
    ),
  });
}
async function prepareAll() {
  const objects: Prepared[] = [];
  for (const s of local.core.expectedScopes()) {
    const p: Prepared = {
      scope: s,
      scopeDigest: scopeDigest(s),
      ciphertext:
        s.purpose === "point_component"
          ? (f.admission.point as RecoveryPacket["point"])[s.logicalId as "databaseDump"].ciphertext
          : bytes(`synthetic ciphertext ${s.logicalId}`),
    };
    await execute({ operation: "prepare", descriptor: p });
    objects.push(p);
  }
  return objects;
}
async function copied(p: Prepared, target = "euR2" as "euR2" | "outsideAccount") {
  const base = {
    contextDigest: f.contextDigest,
    scopeDigest: p.scopeDigest,
    ciphertext: p.ciphertext,
    destination: target,
    destinationId: f.admission.context[target],
    objectKey: `${f.admission.context.archiveNamespace}/sha256/${p.ciphertext.sha256}`,
    attemptId: randomUUID(),
  };
  const signer = f.signers[target] as Signer;
  return execute({
    operation: "copy",
    create: await signEvidence(
      "recovery-copy",
      base.destinationId,
      { ...base, phase: "create", outcome: "created" },
      signer,
    ),
    readback: await signEvidence(
      "recovery-copy",
      base.destinationId,
      { ...base, phase: "readback", outcome: "present_identical" },
      signer,
    ),
  });
}
async function advance() {
  const head = local.core.readHead();
  return coordinatorHead.parse(
    await execute({
      operation: "advance",
      expected: { generation: head.generation, digest: head.digest },
    }),
  );
}
it("R08 D02/D03 rejects wrong source identity/chain/payload coverage before reservation", async () => {
  for (const altered of [
    { ...f.observation, contextDigest: "b".repeat(64) },
    { ...f.observation, payloads: [] },
    { ...f.observation, through: { sequence: 1, digest: "f".repeat(64) } },
    {
      ...f.observation,
      entries: [{ ...f.observation.entries[0], previousDigest: "a".repeat(64) }],
    },
  ])
    await expect(reserve(altered as SourceObservation)).rejects.toThrow();
  expect(local.core.expectedScopes()).toEqual([]);
  expect(local.core.readHead()).toEqual(f.head);
});
it("R08 D04/D19 selects only one range at a cursor and rejects different segmentation", async () => {
  const secondFields = {
    sequence: 2,
    previousDigest: f.observation.through.digest,
    transactionRef: randomUUID(),
    effects: [
      {
        kind: "accepted_operation" as const,
        subjectDigest: recoveryDigest("fixture", "concurrent-subject"),
        payloadDigest: recoveryDigest("fixture", "concurrent-receipt"),
      },
    ],
  };
  const secondEntry = {
    ...secondFields,
    digest: recoveryEntryDigest(f.contextDigest, secondFields),
  };
  const through = { sequence: 2, digest: secondEntry.digest };
  const first = reserve();
  const second = reserve({
    ...f.observation,
    through,
    committedThrough: through,
    entries: [...f.observation.entries, secondEntry],
  });
  const results = await Promise.allSettled([first, second]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const scopes = local.core.expectedScopes();
  expect(scopes).toHaveLength(2);
  const descriptor = (await prepareAll())[0] as Prepared;
  await expect(
    execute({
      operation: "prepare",
      descriptor: { ...descriptor, ciphertext: bytes("different ciphertext") },
    }),
  ).rejects.toThrow("immutable prepared conflict");
});
it("R08 D19 changed context/profile/point/destination, sequence fork and regressed predecessor never mutate state", async () => {
  await reserve();
  const descriptors = await prepareAll();
  const selected = descriptors[0] as Prepared;
  for (const change of [
    { contextDigest: "f".repeat(64) },
    { encryptionProfileDigest: "f".repeat(64) },
    { purpose: "point_component", logicalId: "databaseDump" },
  ]) {
    const scope = { ...selected.scope, ...change } as Prepared["scope"];
    await expect(
      execute({
        operation: "prepare",
        descriptor: {
          ...selected,
          scope,
          scopeDigest: scopeDigest(scope),
        },
      }),
    ).rejects.toThrow();
  }
  const changed = { ...f.observation.entries[0], transactionRef: randomUUID() };
  const { digest: _digest, ...fields } = changed;
  const entry = { ...fields, digest: recoveryEntryDigest(f.contextDigest, fields as never) };
  await expect(
    reserve({
      ...f.observation,
      entries: [entry] as never,
      through: { sequence: 1, digest: entry.digest },
      committedThrough: { sequence: 1, digest: entry.digest },
    }),
  ).rejects.toThrow("range already selected");
  const accepted = await advance();
  for (const expected of [
    { generation: 0, digest: f.head.digest },
    { generation: accepted.generation, digest: "f".repeat(64) },
  ])
    await expect(execute({ operation: "advance", expected })).rejects.toThrow("predecessor");
  expect(local.core.readHead()).toEqual(accepted);
});
it("R08 D14/D20 rejects counterfeit copy purpose and request-supplied roots", async () => {
  await reserve();
  const p = (await prepareAll())[0] as Prepared;
  const raw = await signEvidence(
    "recovery-copy",
    f.admission.context.euR2,
    {
      contextDigest: f.contextDigest,
      scopeDigest: p.scopeDigest,
      ciphertext: p.ciphertext,
      destination: "euR2",
      destinationId: f.admission.context.euR2,
      objectKey: `${f.admission.context.archiveNamespace}/sha256/${p.ciphertext.sha256}`,
      phase: "create",
      outcome: "created",
      attemptId: randomUUID(),
    },
    f.signers.command as Signer,
  );
  await expect(execute({ operation: "copy", create: raw, readback: raw })).rejects.toThrow(
    "authentication",
  );
  await expect(
    local.core.execute(
      await signEvidence(
        "recovery-command",
        f.admission.authority.id,
        {
          requestId: randomUUID(),
          contextDigest: f.contextDigest,
          authority: f.admission.authority,
          command: { operation: "advance", expected: { generation: 0, digest: f.head.digest } },
          roots: f.roots,
        },
        f.signers.command as Signer,
      ),
    ),
  ).rejects.toThrow();
  expect(local.core.readHead()).toEqual(f.head);
});
it("R08 D27 source count cap rejects an otherwise valid chain without partial reservation", async () => {
  let through = f.observation.through;
  const entries = [...f.observation.entries];
  for (let sequence = 2; sequence <= f.admission.limits.maxEntries + 1; sequence++) {
    const fields = {
      sequence,
      previousDigest: through.digest,
      transactionRef: randomUUID(),
      effects: [
        {
          kind: "accepted_operation" as const,
          subjectDigest: recoveryDigest("fixture-subject", sequence),
          payloadDigest: recoveryDigest("fixture-receipt", sequence),
        },
      ],
    };
    const entry = { ...fields, digest: recoveryEntryDigest(f.contextDigest, fields) };
    entries.push(entry);
    through = { sequence, digest: entry.digest };
  }
  await expect(
    reserve({ ...f.observation, entries, through, committedThrough: through }),
  ).rejects.toThrow("bound");
  expect(local.core.expectedScopes()).toEqual([]);
  expect(local.core.readHead()).toEqual(f.head);
  entries.pop();
  const last = entries.at(-1);
  if (!last) throw new Error("fixture absent");
  through = { sequence: last.sequence, digest: last.digest };
  await reserve({ ...f.observation, entries, through, committedThrough: through });
  expect(local.core.expectedScopes()).toHaveLength(2);
});
it("R08 D13/D14/D15/D23 contiguous prefixes stop at required replay gaps, no point means no watermark", async () => {
  await reserve();
  const fields = {
    sequence: 2,
    previousDigest: f.observation.through.digest,
    transactionRef: randomUUID(),
    effects: [
      {
        kind: "accepted_operation" as const,
        subjectDigest: recoveryDigest("fixture", "second-subject"),
        payloadDigest: recoveryDigest("fixture", "second-receipt"),
      },
    ],
  };
  const entry = { ...fields, digest: recoveryEntryDigest(f.contextDigest, fields) };
  const through = { sequence: 2, digest: entry.digest };
  await reserve({
    ...f.observation,
    from: f.observation.through,
    through,
    committedThrough: through,
    entries: [entry],
    payloads: [],
  });
  const descriptors = await prepareAll();
  for (const p of descriptors.filter((p) => p.scope.purpose === "journal_segment")) await copied(p);
  expect((await advance()).destinationPrefixes).toEqual({
    euR2: f.admission.anchor,
    outsideAccount: f.admission.anchor,
  });
  await copied(descriptors.find((p) => p.scope.purpose === "restrictive_payload") as Prepared);
  const result = await advance();
  expect(result.destinationPrefixes).toEqual({ euR2: through, outsideAccount: f.admission.anchor });
  expect(result.packet).toBeNull();
  expect(result.currentness).toBe("unknown");
  expect(result.archiveBarrier).toBeNull();
});
it("R08 D15/D24 actual components gate each prefix and a synthetic closed packet stays structural/quarantined", async () => {
  local.db.close();
  await rm(join(dir, "authority.sqlite"));
  const component = (name: string) => ({
    plaintext: bytes(`plaintext-${name}`),
    ciphertext: bytes(`ciphertext-${name}`),
    encryptionProfileDigest: f.admission.context.encryptionProfileDigest,
  });
  f.admission.point = {
    kind: "recovery_point_index_v1",
    contextDigest: f.contextDigest,
    pointId: "synthetic-point",
    snapshotId: "synthetic-snapshot",
    anchor: f.admission.anchor,
    databaseDump: component("dump"),
    databaseManifest: component("database"),
    objectManifest: component("objects"),
    configurationManifest: component("configuration"),
  };
  const { digest: _digest, ...body } = f.head;
  body.admissionDigest = admissionDigest(f.admission);
  f.head = { ...body, digest: headDigest(body) };
  f.floor.digest = f.head.digest;
  local = sqliteFixture(join(dir, "authority.sqlite"), f);
  await reserve();
  const descriptors = await prepareAll();
  for (const p of descriptors.filter((p) => p.scope.logicalId !== "configurationManifest"))
    await copied(p);
  expect((await advance()).packet?.watermark.destinationPrefixes.euR2).toBeNull();
  await copied(descriptors.find((p) => p.scope.logicalId === "configurationManifest") as Prepared);
  const result = await advance();
  expect(result.packet?.watermark.destinationPrefixes).toEqual({
    euR2: f.observation.through,
    outsideAccount: null,
  });
  expect(result.packet?.barrier).toBeNull();
  expect(result.packet?.watermark.unresolvedWriters.length).toBeGreaterThan(0);
  for (const descriptor of descriptors) await copied(descriptor, "outsideAccount");
  const both = await advance();
  if (!both.packet) throw new Error("synthetic point packet missing");
  expect(both.packet.watermark.destinationPrefixes).toEqual({
    euR2: f.observation.through,
    outsideAccount: f.observation.through,
  });
  // This separately labeled synthetic fixture is never returned by the coordinator.
  const synthetic = structuredClone(both.packet);
  synthetic.watermark.epochState = "closed";
  synthetic.watermark.unresolvedWriters = [];
  synthetic.watermark.unresolvedObjects = [];
  synthetic.barrier = {
    kind: "closed_recovery_epoch_v1",
    contextDigest: f.contextDigest,
    pointDigest: synthetic.watermark.pointDigest,
    watermarkDigest: recoveryDigest("watermark-v2", synthetic.watermark),
    generation: synthetic.watermark.generation,
    finalHead: f.observation.through,
    writerFenceReceiptDigest: recoveryDigest("synthetic-fence", "fixture-only"),
    acceptedWriteLedgerDigest: recoveryDigest("synthetic-accepted", "fixture-only"),
    coverageReceiptDigest: recoveryDigest("synthetic-coverage", "fixture-only"),
  };
  const authorityRead = {
    restoreId: "synthetic-restore",
    destinationInstance: "synthetic-isolated",
    challenge: randomUUID(),
    generation: synthetic.watermark.generation,
    watermarkDigest: synthetic.barrier.watermarkDigest,
    barrierDigest: recoveryDigest("barrier-v1", synthetic.barrier),
  };
  const authenticated = await verifyEvidence(
    await signEvidence(
      "recovery-authority",
      f.admission.authority.id,
      authorityRead,
      f.signers.authority as Signer,
    ),
    "recovery-authority",
    f.admission.authority.id,
    f.roots,
    recoveryExpectation.shape.authorityRead,
  );
  expect(
    inspectRecoveryArchive(
      {
        context: f.admission.context,
        pointDigest: synthetic.watermark.pointDigest,
        restoreId: authorityRead.restoreId,
        destinationInstance: authorityRead.destinationInstance,
        challenge: authorityRead.challenge,
        authorityRead: authenticated,
      },
      synthetic,
    ),
  ).toMatchObject({
    evidenceClass: "structural_only",
    currentness: "closed_barrier_bound",
    quarantine: "required",
  });
  expect(local.core.readHead()).toEqual(both);
  expect(both.currentness).toBe("unknown");
  expect(both.archiveBarrier).toBeNull();
});
it("R08 D16/D18 exact lost-ACK request is idempotent across reopening and changed request ID conflicts", async () => {
  await reserve();
  const expected = { generation: f.head.generation, digest: f.head.digest };
  const id = randomUUID(),
    raw = await f.signed({ operation: "advance", expected }, id);
  const competitor = await f.signed({ operation: "advance", expected });
  const results = await Promise.allSettled([
    local.core.execute(raw),
    local.core.execute(competitor),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  local.db.close();
  local = sqliteFixture(join(dir, "authority.sqlite"), f, false);
  const winner = results[0]?.status === "fulfilled" ? raw : competitor;
  expect(await local.core.execute(winner)).toEqual(local.core.readHead());
  if (winner === raw)
    await expect(
      local.core.execute(
        await f.signed(
          {
            operation: "advance",
            expected: { generation: 1, digest: local.core.readHead().digest },
          },
          id,
        ),
      ),
    ).rejects.toThrow("request ID changed");
  else await expect(local.core.execute(raw)).rejects.toThrow("CAS predecessor conflict");
});
for (const stage of ["after_next_state", "after_terminal_receipt", "after_head_update"])
  it(`R08 D17 rollback is atomic at ${stage}`, async () => {
    await reserve();
    local.db.close();
    local = sqliteFixture(join(dir, "authority.sqlite"), f, false, (s) => {
      if (s === stage) throw new Error("injected crash");
    });
    await expect(advance()).rejects.toThrow("injected crash");
    expect(local.core.readHead()).toEqual(f.head);
    expect(
      local.storage.sql
        .exec("SELECT * FROM archive_records WHERE kind='head' AND key='0000000000000001'")
        .toArray(),
    ).toEqual([]);
  });
it("R08 D21 recreated or rolled-back authority never bootstraps/reset automatically", async () => {
  await reserve();
  await advance();
  const accepted = local.core.readHead();
  f.floor = {
    authority: f.admission.authority,
    generation: accepted.generation,
    digest: accepted.digest,
  };
  local.db.close();
  local = sqliteFixture(join(dir, "missing.sqlite"), f, false);
  expect(() => local.core.readHead()).toThrow("authority missing");
  local.storage.sql.exec("INSERT INTO archive_head(key,value) VALUES(1,?)", JSON.stringify(f.head));
  expect(() => local.core.readHead()).toThrow("floor");
});
it("R08 D22 rejects local closure and clearing unresolved writers; D26 denies new capabilities", async () => {
  await expect(
    reserve({
      ...f.observation,
      unresolvedWriters: [],
      epochState: "closed",
      archiveBarrier: { kind: "local_recovery_epoch_closure_v1" },
    } as unknown as SourceObservation),
  ).rejects.toThrow();
  for (const operation of [
    "delete",
    "close",
    "route",
    "activate",
    "sql",
    "shell",
    "publish",
    "replay",
    "reopen",
    "retention",
    "send",
  ])
    await expect(
      local.core.execute(await f.signed({ operation } as unknown as CommandRequest["command"])),
    ).rejects.toThrow();
  expect(local.core.readHead()).toEqual(f.head);
});
