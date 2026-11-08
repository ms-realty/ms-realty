import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { recoveryPayloads, recoverySource } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { recoveryDigest } from "@/domain/recovery-archive";
import { appendRecoveryEvent, withRecoveryTransaction } from "../journal";
import { closeWriterEpoch } from "../write-fence";
import { readArchiveSource, readReferencedPayloads, validatePayload } from "./source";
import { type ArchiveFixture, archiveFixture } from "./testing";

let db: TestDatabase, fixture: ArchiveFixture;
beforeEach(async () => {
  db = await createTestDatabase();
  fixture = await archiveFixture();
  await db.db
    .update(recoverySource)
    .set({
      state: "admitted",
      context: fixture.admission.context,
      contextDigest: fixture.contextDigest,
      admittedWriters: ["run_operation"],
    })
    .where(eq(recoverySource.key, "source"));
});
afterEach(async () => {
  await db?.drop();
});
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
it("R08 D01/D28 separate read-only reader sees neither entry nor payload before outer commit", async () => {
  const entered = deferred(),
    release = deferred();
  const restriction = JSON.parse(fixture.payload.canonicalBody)[2];
  const operation = withRecoveryTransaction(
    db.db,
    { writer: "run_operation", context: fixture.admission.context },
    async (tx) => {
      await withRecoveryTransaction(
        tx,
        { writer: "run_operation", context: fixture.admission.context },
        async (nested) => {
          await appendRecoveryEvent(nested, fixture.admission.context, restriction);
        },
      );
      entered.resolve();
      await release.promise;
      return { savedOutcome: "restricted", operationId: "synthetic-operation" };
    },
  );
  await entered.promise;
  try {
    const before = await readArchiveSource(db.db, fixture.admission.context);
    expect(before.observation.entries).toEqual([]);
    expect(before.bodies.size).toBe(0);
  } finally {
    release.resolve();
  }
  const result = await operation,
    beforeHash = recoveryDigest("fixture-outcome", result);
  const after = await readArchiveSource(db.db, fixture.admission.context);
  expect(after.observation.entries).toHaveLength(1);
  expect(after.bodies.get(fixture.payload.digest)?.toString()).toBe(fixture.payload.canonicalBody);
  expect(after.observation.coverage).toBe("incomplete");
  expect(after.observation.archiveBarrier).toBeNull();
  expect(recoveryDigest("fixture-outcome", result)).toBe(beforeHash);
});
it("R08 D02 source identity, committed anchor and transaction handle reject", async () => {
  await expect(
    readArchiveSource(db.db, { ...fixture.admission.context, sourceInstance: "wrong-db-instance" }),
  ).rejects.toThrow("context");
  await expect(
    readArchiveSource(db.db, fixture.admission.context, { sequence: 0, digest: "f".repeat(64) }),
  ).rejects.toThrow("anchor");
  await expect(
    db.db.transaction(async (tx) =>
      readArchiveSource(tx as unknown as typeof db.db, fixture.admission.context),
    ),
  ).rejects.toThrow("pool");
});
it("R08 D03 exact payloads reject metadata/codec substitution and oversized source objects", async () => {
  await withRecoveryTransaction(
    db.db,
    { writer: "run_operation", context: fixture.admission.context },
    async (tx) => {
      await appendRecoveryEvent(
        tx,
        fixture.admission.context,
        JSON.parse(fixture.payload.canonicalBody)[2],
      );
    },
  );
  const [row] = await db.db.select().from(recoveryPayloads);
  expect(row).toBeDefined();
  const observed = await readArchiveSource(db.db, fixture.admission.context);
  const effect = observed.observation.entries[0]?.effects[0];
  if (!row || !effect) throw new Error("fixture absent");
  for (const change of [
    { contextDigest: "f".repeat(64) },
    { byteLength: row.byteLength + 1 },
    { digest: "f".repeat(64) },
    { kind: "privacy_restriction" },
    { subjectDigest: "f".repeat(64) },
    { canonicalBody: "{}" },
    { canonicalBody: `${row.canonicalBody} ` },
  ])
    expect(() =>
      validatePayload(fixture.admission.context, { ...row, ...change }, effect, 1048576),
    ).toThrow();
  await expect(
    readArchiveSource(db.db, fixture.admission.context, fixture.admission.anchor, {
      maxEntries: 10,
      maxObjectBytes: row.byteLength - 1,
    }),
  ).rejects.toThrow("oversized");
  const batch = {
    contextDigest: fixture.contextDigest,
    entries: [{ ...observed.observation.entries[0], transactionRef: randomUUID() }],
  };
  await expect(
    readReferencedPayloads(db.db, fixture.admission.context, batch as never, 1048576),
  ).rejects.toThrow("exact committed");
});
it("R08 D22 local closure retains unknown currentness and unresolved source coverage", async () => {
  const closed = await closeWriterEpoch(db.db, fixture.admission.context);
  expect(closed.archiveBarrier).toBeNull();
  const observed = await readArchiveSource(db.db, fixture.admission.context);
  expect(observed.observation.epochState).toBe("unknown");
  expect(observed.observation.unresolvedWriters.length).toBeGreaterThan(0);
  expect(observed.observation.archiveBarrier).toBeNull();
});
it("R08 D03 missing private body in a deliberately damaged disposable source never becomes recoverable", async () => {
  await withRecoveryTransaction(
    db.db,
    { writer: "run_operation", context: fixture.admission.context },
    async (tx) => {
      await appendRecoveryEvent(
        tx,
        fixture.admission.context,
        JSON.parse(fixture.payload.canonicalBody)[2],
      );
    },
  );
  // Deliberate corruption only in this uniquely named disposable test database.
  await db.sql.unsafe("ALTER TABLE recovery_payloads DISABLE TRIGGER USER");
  await db.db.delete(recoveryPayloads);
  await expect(readArchiveSource(db.db, fixture.admission.context)).rejects.toThrow(
    "payload missing",
  );
});
