import { createHash, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  grants,
  operations,
  parties,
  principals,
  recoveryJournal,
  recoveryJournalHead,
  recoveryOperationReferences,
  recoveryPayloads,
  recoverySource,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { recoveryEntryDigest } from "@/domain/recovery-archive";
import { hashRequest } from "../crypto";
import type { Database, Transaction } from "../db";
import { AppError } from "../errors";
import { findOperation, type OperationInput, runOperation } from "../operations";
import {
  appendAcceptedRecoveryOperation,
  appendRecoveryEvent,
  operationRecoveryTransaction,
  type RecoveryRestriction,
  readCommittedRecoveryBatch,
  withRecoveryTransaction,
} from "./journal";
import {
  closeWriterEpoch,
  emptyRecoveryCursor,
  type RecoveryAdmission,
  sourceContextDigest,
} from "./write-fence";

let t: TestDatabase;
const admission: RecoveryAdmission = {
  writer: "run_operation",
  context: {
    product: "ms-realty",
    environment: "staging",
    releaseSha: "a".repeat(40),
    releaseContextDigest: "b".repeat(64),
    schemaDigest: "c".repeat(64),
    writerRegistryDigest: "d".repeat(64),
    databaseLineage: "synthetic-lineage",
    sourceInstance: "synthetic-source",
    writerEpoch: "synthetic-epoch",
    archiveNamespace: "synthetic-archive",
    euR2: "synthetic-eu",
    outsideAccount: "synthetic-outside",
    encryptionProfileDigest: "e".repeat(64),
  },
};
beforeEach(async () => {
  t = await createTestDatabase();
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await t?.drop();
});

// Test-only admission. Production contains no admission function, route, CLI or config flag.
async function admit(writers = ["run_operation"]) {
  await t.db
    .update(recoverySource)
    .set({
      state: "admitted",
      context: admission.context,
      contextDigest: sourceContextDigest(admission.context),
      admittedWriters: writers,
    })
    .where(eq(recoverySource.key, "source"));
}
function input(overrides: Partial<OperationInput> = {}): OperationInput {
  return {
    actor: { kind: "visitor", id: "synthetic-submission" },
    type: "synthetic.restrict",
    idempotencyKey: randomUUID(),
    requestHash: hashRequest({ command: "synthetic-restriction" }),
    recovery: admission,
    ...overrides,
  };
}
async function fixture() {
  const partyId = randomUUID(),
    principalId = randomUUID(),
    grantId = randomUUID();
  await t.db
    .insert(parties)
    .values({ id: partyId, kind: "person", displayName: "Synthetic recovery fixture" });
  await t.db.insert(principals).values({
    id: principalId,
    partyId,
    kind: "staff",
    issuer: "urn:synthetic:recovery",
    subject: principalId,
    email: `${principalId}@example.test`,
    displayName: "Synthetic recovery fixture",
  });
  await t.db
    .insert(grants)
    .values({ id: grantId, principalId, role: "manager", reason: "Synthetic recovery fixture" });
  const restriction: RecoveryRestriction = {
    kind: "access_revocation",
    decisionId: randomUUID(),
    authorizationDigest: "f".repeat(64),
    principalKind: "staff",
    principalId,
    target: { kind: "grant", id: grantId, version: 1 },
  };
  return {
    grantId,
    restriction,
    async apply(tx: Transaction) {
      await tx.update(grants).set({ revokedAt: new Date() }).where(eq(grants.id, grantId));
      await appendRecoveryEvent(tx, admission.context, restriction);
      return { grantId };
    },
    async revoked() {
      const [row] = await t.db.select().from(grants).where(eq(grants.id, grantId));
      expect(row).toBeDefined();
      return row?.revokedAt != null;
    },
  };
}
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
async function waitBlockedBy(pid: number) {
  await expect
    .poll(
      async () => {
        const rows = await t.sql<
          { pid: number }[]
        >`select pid from pg_stat_activity where ${pid} = any(pg_blocking_pids(pid)) and datname = current_database()`;
        return rows.length;
      },
      { timeout: 3000, interval: 10 },
    )
    .toBeGreaterThan(0);
}
async function assertEmpty() {
  expect(await t.db.select().from(recoveryJournal)).toEqual([]);
  expect(await t.db.select().from(recoveryOperationReferences)).toEqual([]);
  expect(await t.db.select().from(recoveryPayloads)).toEqual([]);
  expect(
    await t.db
      .select({ sequence: recoveryJournalHead.sequence, digest: recoveryJournalHead.digest })
      .from(recoveryJournalHead),
  ).toEqual([emptyRecoveryCursor]);
}

it("R08 starts inactive, leaves ordinary operations unchanged and supplies no implied coverage", async () => {
  expect(await t.db.select().from(recoverySource)).toMatchObject([
    { state: "inactive", context: null, admittedWriters: [], coverageState: "incomplete" },
  ]);
  const fn = vi.fn(async () => "unused");
  await expect(runOperation(t.db, input(), fn)).rejects.toThrow("inactive");
  expect(fn).not.toHaveBeenCalled();
  expect(await t.db.select().from(operations)).toEqual([]);
  await expect(closeWriterEpoch(t.db, admission.context)).rejects.toThrow("inactive");
  const normal = await runOperation(t.db, input({ recovery: undefined }), async () => "ordinary");
  expect(normal.outcome).toBe("ordinary");
  await assertEmpty();
  await expect(t.sql`update recovery_source set coverage_state = 'complete'`).rejects.toMatchObject(
    { code: "23514" },
  );
});

it("R08 commits the restriction, typed bytes and actual succeeded receipt atomically with archive unavailable", async () => {
  await admit();
  const f = await fixture();
  const fetch = vi.fn(async () => {
    throw new Error("synthetic archive outage");
  });
  vi.stubGlobal("fetch", fetch);
  const command = input();
  const first = await runOperation(t.db, command, ({ tx }) => f.apply(tx));
  expect(await f.revoked()).toBe(true);
  const batch = await readCommittedRecoveryBatch(t.db, admission.context);
  expect(batch).toMatchObject({
    from: emptyRecoveryCursor,
    committedThrough: { sequence: 1 },
    pendingArchiveCount: 1,
    coverage: "incomplete",
    currentness: "unknown",
    archiveAcknowledgment: {
      state: "unconfigured",
      euR2VerifiedThrough: null,
      outsideCopyVerifiedThrough: null,
    },
  });
  expect(batch.entries).toHaveLength(1);
  const entry = batch.entries[0];
  expect(entry?.effects.map((e) => e.kind)).toEqual(["access_revocation", "accepted_operation"]);
  expect(entry?.digest).toBe(
    recoveryEntryDigest(batch.contextDigest, {
      sequence: 1,
      previousDigest: emptyRecoveryCursor.digest,
      transactionRef: entry?.transactionRef ?? "",
      effects: entry?.effects ?? [],
    }),
  );
  const [payload] = await t.db.select().from(recoveryPayloads);
  expect(payload?.digest).toBe(
    createHash("sha256")
      .update(payload?.canonicalBody ?? "", "utf8")
      .digest("hex"),
  );
  expect(JSON.parse(payload?.canonicalBody ?? "null")).toEqual([
    "recovery-restriction-v1",
    batch.contextDigest,
    f.restriction,
  ]);
  expect(payload?.byteLength).toBe(Buffer.byteLength(payload?.canonicalBody ?? ""));
  expect(await t.db.select().from(recoveryOperationReferences)).toEqual([
    {
      operationId: first.operationId,
      sequence: 1,
      receiptDigest: entry?.effects[1]?.payloadDigest,
    },
  ]);
  const retry = vi.fn(async () => "must not execute");
  expect(await runOperation(t.db, command, retry)).toEqual({ ...first, replayed: true });
  expect(retry).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(
    (await readCommittedRecoveryBatch(t.db, admission.context)).committedThrough.sequence,
  ).toBe(1);
});

it("R08 rejects a pool, raw nested transaction and expired owned transaction before domain mutation", async () => {
  await admit();
  const f = await fixture();
  await expect(
    appendRecoveryEvent(t.db as unknown as Transaction, admission.context, f.restriction),
  ).rejects.toThrow("active owned transaction");
  await t.db.transaction(async (raw) => {
    const fn = vi.fn(async ({ tx }: { tx: Transaction }) => f.apply(tx));
    await expect(runOperation(raw, input(), fn)).rejects.toThrow("owned outer transaction");
    await expect(appendRecoveryEvent(raw, admission.context, f.restriction)).rejects.toThrow(
      "active owned transaction",
    );
    expect(fn).not.toHaveBeenCalled();
  });
  let escaped: Transaction | undefined;
  await withRecoveryTransaction(t.db, admission, async (tx) => {
    escaped = tx;
  });
  await expect(
    appendRecoveryEvent(escaped as Transaction, admission.context, f.restriction),
  ).rejects.toThrow("active owned transaction");
  expect(await f.revoked()).toBe(false);
  expect(await t.db.select().from(operations)).toEqual([]);
  await assertEmpty();
});

it("R08 rejects wrong epoch/context and unregistered or unadmitted writers before their callback", async () => {
  await admit(["not_registered"]);
  const fn = vi.fn(async () => "unused");
  await expect(withRecoveryTransaction(t.db, admission, fn)).rejects.toThrow("not admitted");
  await expect(
    withRecoveryTransaction(
      t.db,
      { ...admission, writer: "unknown" } as unknown as RecoveryAdmission,
      fn,
    ),
  ).rejects.toThrow();
  await expect(
    withRecoveryTransaction(
      t.db,
      { ...admission, context: { ...admission.context, writerEpoch: "wrong-epoch" } },
      fn,
    ),
  ).rejects.toThrow("context");
  await expect(
    closeWriterEpoch(t.db, { ...admission.context, sourceInstance: "restored-instance" }),
  ).rejects.toThrow("context");
  expect(fn).not.toHaveBeenCalled();
  await assertEmpty();
});

it("R08 rolls back a local write that fails before append", async () => {
  await admit();
  const f = await fixture();
  await expect(
    runOperation(t.db, input(), async ({ tx }) => {
      await tx.update(grants).set({ revokedAt: new Date() }).where(eq(grants.id, f.grantId));
      throw new Error("before append");
    }),
  ).rejects.toThrow("before append");
  expect(await f.revoked()).toBe(false);
  expect(await t.db.select().from(operations)).toEqual([]);
  await assertEmpty();
});

it("R08 failed and unknown operation savepoints retain no applied effect or accepted reference", async () => {
  await admit();
  const f = await fixture();
  for (const code of ["forbidden", "outcome_unknown"] as const) {
    const command = input();
    await expect(
      runOperation(t.db, command, async ({ tx }) => {
        await f.apply(tx);
        throw new AppError(code);
      }),
    ).rejects.toMatchObject({ code });
    expect(
      (await findOperation(t.db, command.actor, command.type, command.idempotencyKey))?.status,
    ).toBe(code === "forbidden" ? "failed" : "outcome_unknown");
    const retry = vi.fn(async () => "unused");
    await expect(runOperation(t.db, command, retry)).rejects.toMatchObject({ code });
    expect(retry).not.toHaveBeenCalled();
  }
  expect(await f.revoked()).toBe(false);
  await assertEmpty();
});

it("R08 rejects non-success receipt references and wrong context append", async () => {
  await admit();
  const f = await fixture();
  const command = input();
  await expect(
    runOperation(t.db, command, async () => {
      throw new AppError("forbidden");
    }),
  ).rejects.toMatchObject({ code: "forbidden" });
  const [row] = await t.db.select().from(operations);
  await expect(
    withRecoveryTransaction(t.db, admission, async (tx) => {
      await tx.update(grants).set({ revokedAt: new Date() }).where(eq(grants.id, f.grantId));
      await expect(appendAcceptedRecoveryOperation(tx, row?.id ?? "")).rejects.toThrow(
        "persisted succeeded",
      );
    }),
  ).rejects.toThrow("failed append");
  await expect(
    withRecoveryTransaction(t.db, admission, async (tx) => {
      await expect(
        appendRecoveryEvent(
          tx,
          { ...admission.context, writerEpoch: "wrong-epoch" },
          f.restriction,
        ),
      ).rejects.toThrow("context differs");
    }),
  ).rejects.toThrow("failed append");
  expect(await f.revoked()).toBe(false);
  await assertEmpty();
});

it("R08 managed nested success yields one envelope only at outer commit", async () => {
  await admit();
  const f = await fixture();
  await withRecoveryTransaction(t.db, admission, async (outer) => {
    const first = await runOperation(outer, input({ recovery: undefined }), ({ tx }) =>
      f.apply(tx),
    );
    const second = await operationRecoveryTransaction(outer, undefined, (nested) =>
      runOperation(nested, input(), async () => "second"),
    );
    expect(first.replayed).toBe(false);
    expect(second.outcome).toBe("second");
    expect((await readCommittedRecoveryBatch(t.db, admission.context)).entries).toEqual([]);
    expect(await t.db.select().from(operations)).toEqual([]);
  });
  const batch = await readCommittedRecoveryBatch(t.db, admission.context);
  expect(batch.entries).toHaveLength(1);
  expect(batch.entries[0]?.effects.map((e) => e.kind)).toEqual([
    "access_revocation",
    "accepted_operation",
    "accepted_operation",
  ]);
  expect(await t.db.select().from(recoveryOperationReferences)).toHaveLength(2);
});

it("R08 discards a rolled-back managed child while preserving its parent's next successful write", async () => {
  await admit();
  const f = await fixture();
  await withRecoveryTransaction(t.db, admission, async (outer) => {
    await expect(
      withRecoveryTransaction(outer, admission, async (sp) => {
        await runOperation(sp, input(), ({ tx }) => f.apply(tx));
        throw new Error("rollback released operation");
      }),
    ).rejects.toThrow("rollback released operation");
    await runOperation(outer, input(), async () => "kept");
  });
  expect(await f.revoked()).toBe(false);
  expect(await t.db.select().from(recoveryPayloads)).toEqual([]);
  expect(await t.db.select().from(operations)).toHaveLength(1);
  expect(
    (await readCommittedRecoveryBatch(t.db, admission.context)).entries[0]?.effects.map(
      (e) => e.kind,
    ),
  ).toEqual(["accepted_operation"]);
});

it.each([false, true])(
  "R08 close waits for the real outer end after successful child release (rollback=%s)",
  async (rollback) => {
    await admit();
    const f = await fixture();
    const entered = deferred<number>(),
      finish = deferred();
    const writer = withRecoveryTransaction(t.db, admission, async (outer) => {
      const [backend] = await outer.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      await runOperation(outer, input(), ({ tx }) => f.apply(tx));
      entered.resolve(backend?.pid ?? 0);
      await finish.promise;
      if (rollback) throw new Error("outer rollback");
    }).then(
      () => "committed",
      (e: Error) => e.message,
    );
    const pid = await entered.promise;
    const closing = closeWriterEpoch(t.db, admission.context);
    try {
      await waitBlockedBy(pid);
      expect((await readCommittedRecoveryBatch(t.db, admission.context)).committedThrough).toEqual(
        emptyRecoveryCursor,
      );
    } finally {
      finish.resolve();
    }
    expect(await writer).toBe(rollback ? "outer rollback" : "committed");
    const closed = await closing;
    expect(closed.receipt.finalHead.sequence).toBe(rollback ? 0 : 1);
    expect(closed).toMatchObject({
      archiveBarrier: null,
      currentness: "unknown",
      receipt: {
        coverage: "incomplete",
        unresolvedWriters: ["domain_writers_uninstrumented", "external_and_unclassified_writers"],
      },
    });
    expect(await f.revoked()).toBe(!rollback);
    if (rollback) {
      expect(await t.db.select().from(operations)).toEqual([]);
      await assertEmpty();
    }
    expect(await closeWriterEpoch(t.db, admission.context)).toEqual(closed);
  },
);

it("R08 a queued writer cannot mutate after close wins the source lock", async () => {
  await admit();
  const f = await fixture();
  const held = deferred<number>(),
    release = deferred();
  const blocker = t.db.transaction(async (tx) => {
    await tx.select().from(recoverySource).for("update");
    const [backend] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    held.resolve(backend?.pid ?? 0);
    await release.promise;
  });
  const pid = await held.promise;
  const closing = closeWriterEpoch(t.db, admission.context);
  const fn = vi.fn(async ({ tx }: { tx: Transaction }) => f.apply(tx));
  let writer: Promise<unknown> | undefined;
  try {
    await waitBlockedBy(pid);
    writer = runOperation(t.db, input(), fn).then(
      () => "wrong success",
      (e: Error) => e.message,
    );
    await expect
      .poll(
        async () =>
          (
            await t.sql`select pid from pg_stat_activity where cardinality(pg_blocking_pids(pid)) > 0 and datname = current_database()`
          ).length,
        { timeout: 3000, interval: 10 },
      )
      .toBeGreaterThanOrEqual(2);
  } finally {
    release.resolve();
  }
  await blocker;
  expect((await closing).receipt.finalHead).toEqual(emptyRecoveryCursor);
  expect(await writer).toBe("Recovery source epoch is closed.");
  expect(fn).not.toHaveBeenCalled();
  expect(await f.revoked()).toBe(false);
  expect(await t.db.select().from(operations)).toEqual([]);
});

it("R08 allocation rolls back even when COMMIT fails after the journal has been flushed", async () => {
  await admit();
  const f = await fixture();
  await t.sql`create table synthetic_commit_guard (id integer, unique (id) deferrable initially deferred)`;
  await expect(
    withRecoveryTransaction(t.db, admission, async (tx) => {
      await runOperation(tx, input(), ({ tx: sp }) => f.apply(sp));
      await tx.execute(sql`insert into synthetic_commit_guard values (1), (1)`);
    }),
  ).rejects.toMatchObject({ code: "23505" });
  expect(await f.revoked()).toBe(false);
  expect(await t.db.select().from(operations)).toEqual([]);
  await assertEmpty();
  await runOperation(t.db, input(), ({ tx }) => f.apply(tx));
  expect(
    (await readCommittedRecoveryBatch(t.db, admission.context)).committedThrough.sequence,
  ).toBe(1);
});

it("R08 concurrent transactions allocate one contiguous ordered envelope apiece", async () => {
  await admit();
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, n) =>
      runOperation(t.db, input(), async ({ tx }) => {
        await tx
          .insert(parties)
          .values({ kind: "person", displayName: `Synthetic concurrent ${n}` });
        return { n };
      }),
    ),
  );
  const first = await readCommittedRecoveryBatch(t.db, admission.context, emptyRecoveryCursor, 4);
  const second = await readCommittedRecoveryBatch(t.db, admission.context, first.through);
  const entries = [...first.entries, ...second.entries];
  expect(entries.map((e) => e.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect(new Set(entries.map((e) => e.transactionRef)).size).toBe(10);
  expect(second.through).toEqual(second.committedThrough);
  expect(
    (await t.db.select().from(recoveryOperationReferences)).map((r) => r.operationId).sort(),
  ).toEqual(results.map((r) => r.operationId).sort());
  await expect(
    readCommittedRecoveryBatch(t.db, admission.context, { sequence: 5, digest: "f".repeat(64) }),
  ).rejects.toThrow("anchor differs");
  await expect(
    readCommittedRecoveryBatch(t.db as unknown as Database, {
      ...admission.context,
      archiveNamespace: "wrong-archive",
    }),
  ).rejects.toThrow("context");
});

it("R08 admitted context, journal, payloads and operation references cannot be rewritten", async () => {
  await admit();
  const f = await fixture();
  await runOperation(t.db, input(), ({ tx }) => f.apply(tx));
  for (const table of ["recovery_journal", "recovery_payloads", "recovery_operation_references"]) {
    await expect(t.sql.unsafe(`delete from ${table}`)).rejects.toMatchObject({ code: "23001" });
    await expect(t.sql.unsafe(`truncate ${table} cascade`)).rejects.toMatchObject({
      code: "23001",
    });
  }
  await expect(
    t.sql`update recovery_source set admitted_writers = '["unknown"]'`,
  ).rejects.toMatchObject({ code: "P0001" });
  await closeWriterEpoch(t.db, admission.context);
  await expect(
    t.sql`update recovery_source set state = 'admitted', closed_head = null, close_receipt_digest = null`,
  ).rejects.toMatchObject({ code: "P0001" });
  expect((await readCommittedRecoveryBatch(t.db, admission.context)).coverage).toBe("incomplete");
});

it("R08 rechecks a succeeded receipt changed after nested success before committing its reference", async () => {
  await admit();
  const f = await fixture();
  await expect(
    withRecoveryTransaction(t.db, admission, async (outer) => {
      const result = await runOperation(outer, input(), ({ tx }) => f.apply(tx));
      await outer
        .update(operations)
        .set({ outcome: { altered: true } })
        .where(eq(operations.id, result.operationId));
    }),
  ).rejects.toThrow("accepted receipt changed");
  expect(await f.revoked()).toBe(false);
  expect(await t.db.select().from(operations)).toEqual([]);
  await assertEmpty();
});

it("R08 a returned effect reference cannot mutate the pending envelope", async () => {
  await admit();
  const f = await fixture();
  await withRecoveryTransaction(t.db, admission, async (tx) => {
    const ref = await appendRecoveryEvent(tx, admission.context, f.restriction);
    ref.kind = "accepted_operation";
    ref.payloadDigest = "1".repeat(64);
  });
  const batch = await readCommittedRecoveryBatch(t.db, admission.context);
  expect(batch.entries[0]?.effects[0]?.kind).toBe("access_revocation");
  expect(batch.entries[0]?.effects[0]?.payloadDigest).not.toBe("1".repeat(64));
});

it("R08 close refuses a head that does not match the last committed envelope", async () => {
  await admit();
  await runOperation(t.db, input(), async () => "synthetic accepted");
  await t.db.update(recoveryJournalHead).set({ digest: "1".repeat(64) });
  await expect(closeWriterEpoch(t.db, admission.context)).rejects.toThrow("committed journal");
  expect(await t.db.select().from(recoverySource)).toMatchObject([{ state: "admitted" }]);
});

it("R08 catching a rejected append cannot commit an unjournalled local restriction", async () => {
  await admit();
  const f = await fixture();
  await expect(
    runOperation(t.db, input(), async ({ tx }) => {
      await tx.update(grants).set({ revokedAt: new Date() }).where(eq(grants.id, f.grantId));
      await appendRecoveryEvent(tx, admission.context, {
        ...f.restriction,
        kind: "access_grant",
      } as unknown as RecoveryRestriction).catch(() => {});
      return { grantId: f.grantId };
    }),
  ).rejects.toThrow("failed append");
  expect(await f.revoked()).toBe(false);
  expect(await t.db.select().from(operations)).toEqual([]);
  await assertEmpty();
});

it("R08 a caught acceptance failure rolls back its child while the healthy parent can continue", async () => {
  await admit();
  const f = await fixture();
  await withRecoveryTransaction(t.db, admission, async (outer) => {
    await expect(
      withRecoveryTransaction(outer, admission, async (sp) => {
        await f.apply(sp);
        await appendAcceptedRecoveryOperation(sp, randomUUID()).catch(() => {});
        return "success-looking child";
      }),
    ).rejects.toThrow("failed append");
    await runOperation(outer, input(), async () => "healthy parent");
  });
  expect(await f.revoked()).toBe(false);
  expect(await t.db.select().from(recoveryPayloads)).toEqual([]);
  const batch = await readCommittedRecoveryBatch(t.db, admission.context);
  expect(batch.entries).toHaveLength(1);
  expect(batch.entries[0]?.effects.map((e) => e.kind)).toEqual(["accepted_operation"]);
  expect(await t.db.select().from(operations)).toHaveLength(1);
});

it.each(["restrictive", "accepted"] as const)(
  "R08 caught retained-ancestor %s append poisons the actual runOperation child",
  async (kind) => {
    await admit();
    const f = await fixture();
    await expect(
      withRecoveryTransaction(t.db, admission, (outer) =>
        runOperation(outer, input(), async ({ tx, operationId }) => {
          await tx.update(grants).set({ revokedAt: new Date() }).where(eq(grants.id, f.grantId));
          await (kind === "restrictive"
            ? appendRecoveryEvent(outer, admission.context, f.restriction)
            : appendAcceptedRecoveryOperation(outer, operationId)
          ).catch(() => {});
          return { denialSaved: true };
        }),
      ),
    ).rejects.toThrow("failed append");
    expect(await f.revoked()).toBe(false);
    expect(await t.db.select().from(operations)).toEqual([]);
    await assertEmpty();
  },
);

it.each(["pool", "expired", "raw_child"] as const)(
  "R08 caught %s handle rejection poisons the calling operation for both append APIs",
  async (misuse) => {
    await admit();
    const f = await fixture();
    let expired!: Transaction;
    await withRecoveryTransaction(t.db, admission, async (tx) => {
      expired = tx;
    });
    for (const kind of ["restrictive", "accepted"] as const) {
      await expect(
        runOperation(t.db, input(), async ({ tx, operationId }) => {
          await tx.update(grants).set({ revokedAt: new Date() }).where(eq(grants.id, f.grantId));
          const attempt = async (wrong: Transaction) => {
            await (kind === "restrictive"
              ? appendRecoveryEvent(wrong, admission.context, f.restriction)
              : appendAcceptedRecoveryOperation(wrong, operationId)
            ).catch(() => {});
          };
          if (misuse === "raw_child") await tx.transaction(attempt);
          else await attempt(misuse === "pool" ? (t.db as unknown as Transaction) : expired);
          return { denialSaved: true };
        }),
      ).rejects.toThrow("failed append");
      expect(await f.revoked()).toBe(false);
      expect(await t.db.select().from(operations)).toEqual([]);
      await assertEmpty();
    }
  },
);

it("R08 a genuine child rollback contains ancestor-handle poison and leaves its parent usable", async () => {
  await admit();
  const denied = await fixture(),
    kept = await fixture();
  await withRecoveryTransaction(t.db, admission, async (outer) => {
    await expect(
      runOperation(outer, input(), async ({ tx }) => {
        await tx.update(grants).set({ revokedAt: new Date() }).where(eq(grants.id, denied.grantId));
        await appendRecoveryEvent(outer, admission.context, denied.restriction).catch(() => {});
        return "must roll back";
      }),
    ).rejects.toThrow("failed append");
    await runOperation(outer, input({ recovery: undefined }), ({ tx }) => kept.apply(tx));
  });
  expect(await denied.revoked()).toBe(false);
  expect(await kept.revoked()).toBe(true);
  expect(await t.db.select().from(operations)).toHaveLength(1);
  expect(await t.db.select().from(recoveryPayloads)).toHaveLength(1);
  const batch = await readCommittedRecoveryBatch(t.db, admission.context);
  expect(batch.entries).toHaveLength(1);
  expect(batch.entries[0]?.effects.map((e) => e.kind)).toEqual([
    "access_revocation",
    "accepted_operation",
  ]);
});

it.each(["restrictive", "accepted"] as const)(
  "R08 foreign-root %s misuse poisons both live owned scopes",
  async (kind) => {
    await admit();
    const first = await fixture(),
      second = await fixture();
    const historical = await runOperation(
      t.db,
      input({ recovery: undefined }),
      async () => "historical",
    );
    const captured = deferred<Transaction>(),
      release = deferred();
    const other = withRecoveryTransaction(t.db, admission, async (tx) => {
      captured.resolve(tx);
      await release.promise;
    }).then(
      () => "wrong success",
      (e: Error) => e.message,
    );
    const foreign = await captured.promise;
    let caller: unknown;
    try {
      caller = await runOperation(t.db, input(), async ({ tx }) => {
        await tx.update(grants).set({ revokedAt: new Date() }).where(eq(grants.id, first.grantId));
        await foreign
          .update(grants)
          .set({ revokedAt: new Date() })
          .where(eq(grants.id, second.grantId));
        await (kind === "restrictive"
          ? appendRecoveryEvent(foreign, admission.context, second.restriction)
          : appendAcceptedRecoveryOperation(foreign, historical.operationId)
        ).catch(() => {});
        return "must roll back";
      }).then(
        () => "wrong success",
        (e: Error) => e.message,
      );
    } finally {
      release.resolve();
    }
    expect(caller).toContain("failed append");
    expect(await other).toContain("failed append");
    expect(await first.revoked()).toBe(false);
    expect(await second.revoked()).toBe(false);
    expect(await t.db.select().from(operations)).toHaveLength(1);
    await assertEmpty();
  },
);

it.each(["explicit", "legacy_operation"] as const)(
  "R08 a managed callback cannot start a separate root via %s pool use",
  async (mode) => {
    await admit();
    const f = await fixture();
    const extra = vi.fn(async () => "independent command");
    await expect(
      runOperation(t.db, input(), async ({ tx }) => {
        await tx.update(grants).set({ revokedAt: new Date() }).where(eq(grants.id, f.grantId));
        await (mode === "explicit"
          ? withRecoveryTransaction(t.db, admission, extra)
          : runOperation(t.db, input({ recovery: undefined }), extra)
        ).catch(() => {});
        return "must roll back";
      }),
    ).rejects.toThrow("failed append");
    expect(extra).not.toHaveBeenCalled();
    expect(await f.revoked()).toBe(false);
    expect(await t.db.select().from(operations)).toEqual([]);
    await assertEmpty();
  },
);

it.each(["append", "new_root"] as const)(
  "R08 detached expired child cannot %s while its owned ancestor remains live",
  async (mode) => {
    await admit();
    const f = await fixture();
    const release = deferred();
    const extra = vi.fn(async () => "independent command");
    let detached!: Promise<void>;
    await expect(
      withRecoveryTransaction(t.db, admission, async (outer) => {
        await withRecoveryTransaction(outer, admission, async (child) => {
          detached = (async () => {
            await release.promise;
            await outer
              .update(grants)
              .set({ revokedAt: new Date() })
              .where(eq(grants.id, f.grantId));
            await (mode === "append"
              ? appendRecoveryEvent(child, admission.context, f.restriction)
              : withRecoveryTransaction(t.db, admission, extra)
            ).catch(() => {});
          })();
        });
        release.resolve();
        await detached;
      }),
    ).rejects.toThrow("failed append");
    expect(extra).not.toHaveBeenCalled();
    expect(await f.revoked()).toBe(false);
    await assertEmpty();
  },
);

it("R08 a callback detached from a completed root cannot later start another root", async () => {
  await admit();
  const release = deferred();
  let detached!: Promise<unknown>;
  const extra = vi.fn(async () => "independent command");
  await withRecoveryTransaction(t.db, admission, async () => {
    detached = (async () => {
      await release.promise;
      return runOperation(t.db, input({ recovery: undefined }), extra);
    })().then(
      () => "wrong success",
      (e: Error) => e.message,
    );
  });
  release.resolve();
  expect(await detached).toContain("active owned transaction");
  expect(extra).not.toHaveBeenCalled();
  expect(await t.db.select().from(operations)).toEqual([]);
  await assertEmpty();
  // Independent entry outside that asynchronous scope still follows the unchanged legacy path.
  expect(
    (await runOperation(t.db, input({ recovery: undefined }), async () => "ordinary")).outcome,
  ).toBe("ordinary");
  await assertEmpty();
});

it("R08 receipt lock spans journal-head wait and the true outer COMMIT", async () => {
  await admit();
  const original = await runOperation(
    t.db,
    input({ recovery: undefined }),
    async () => "original succeeded receipt",
  );
  await t.sql`create function synthetic_commit_pause() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(614937); return new; end; $$`;
  await t.sql`create constraint trigger synthetic_commit_pause after insert on recovery_journal deferrable initially deferred for each row execute function synthetic_commit_pause()`;
  const commitReady = deferred<number>(),
    releaseCommit = deferred(),
    headReady = deferred<number>(),
    releaseHead = deferred(),
    recorderReady = deferred<number>();
  const commitHolder = t.db.transaction(async (tx) => {
    const [row] = await tx.execute<{ pid: number }>(
      sql`select pg_backend_pid() as pid, pg_advisory_xact_lock(614937)`,
    );
    commitReady.resolve(row?.pid ?? 0);
    await releaseCommit.promise;
  });
  const commitPid = await commitReady.promise;
  const headHolder = t.db.transaction(async (tx) => {
    await tx.select().from(recoveryJournalHead).for("update");
    const [row] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    headReady.resolve(row?.pid ?? 0);
    await releaseHead.promise;
  });
  const headPid = await headReady.promise;
  const recorder = withRecoveryTransaction(t.db, admission, async (tx) => {
    const [row] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    recorderReady.resolve(row?.pid ?? 0);
    await appendAcceptedRecoveryOperation(tx, original.operationId);
  });
  const recorderPid = await recorderReady.promise;
  const blockedUpdate = () =>
    t.sql.begin(async (tx) => {
      await tx`set local lock_timeout = '100ms'`;
      await tx`update operations set status = 'failed', outcome = '{"code":"forbidden"}'::jsonb where id = ${original.operationId}`;
    });
  try {
    await waitBlockedBy(headPid);
    await expect(blockedUpdate()).rejects.toMatchObject({ code: "55P03" });
    releaseHead.resolve();
    await headHolder;
    await waitBlockedBy(commitPid);
    const [activity] = await t.sql`select query from pg_stat_activity where pid = ${recorderPid}`;
    expect(activity?.query.toLowerCase()).toContain("commit");
    await expect(blockedUpdate()).rejects.toMatchObject({ code: "55P03" });
  } finally {
    releaseHead.resolve();
    releaseCommit.resolve();
    await headHolder;
    await commitHolder;
    await recorder;
  }
  const [committed] = await t.db
    .select()
    .from(operations)
    .where(eq(operations.id, original.operationId));
  expect(committed?.status).toBe("succeeded");
  expect(await t.db.select().from(recoveryOperationReferences)).toHaveLength(1);
  // A later uninstrumented mutation is not prevented or qualified as complete coverage.
  await blockedUpdate();
  expect((await readCommittedRecoveryBatch(t.db, admission.context)).coverage).toBe("incomplete");
});

it.each(["restrictive", "accepted"] as const)(
  "R08 detached %s append after callback return cannot enter the final envelope",
  async (kind) => {
    await admit();
    const f = await fixture();
    const headReady = deferred<number>(),
      releaseHead = deferred(),
      releaseAppend = deferred();
    const holder = t.db.transaction(async (tx) => {
      await tx.select().from(recoveryJournalHead).for("update");
      const [row] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      headReady.resolve(row?.pid ?? 0);
      await releaseHead.promise;
    });
    const headPid = await headReady.promise;
    let detached!: Promise<unknown>;
    const writer = withRecoveryTransaction(t.db, admission, async (outer) => {
      const saved = await runOperation(outer, input(), ({ tx }) => f.apply(tx));
      detached = (async () => {
        await releaseAppend.promise;
        return kind === "restrictive"
          ? appendRecoveryEvent(outer, admission.context, f.restriction)
          : appendAcceptedRecoveryOperation(outer, saved.operationId);
      })().then(
        () => "wrong success",
        (e: Error) => e.message,
      );
    }).then(
      () => "wrong success",
      (e: Error) => e.message,
    );
    try {
      await waitBlockedBy(headPid);
      releaseAppend.resolve();
      expect(await detached).toContain("active owned transaction");
    } finally {
      releaseAppend.resolve();
      releaseHead.resolve();
      await holder;
    }
    expect(await writer).toContain("failed append");
    expect(await f.revoked()).toBe(false);
    expect(await t.db.select().from(operations)).toEqual([]);
    await assertEmpty();
  },
);
