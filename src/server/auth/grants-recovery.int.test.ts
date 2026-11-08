import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import {
  auditEvents,
  grants,
  operations,
  passkeys,
  recoveryJournal,
  recoveryJournalHead,
  recoveryOperationReferences,
  recoveryPayloads,
  recoverySource,
  sessions,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { canonicalJson } from "@/domain/approval";
import { can } from "../authz";
import { hashRequest } from "../crypto";
import type { Transaction } from "../db";
import {
  decodeAccessRecoveryRestriction,
  type GrantRevocationDecision,
} from "../recovery/access-restrictions";
import * as journal from "../recovery/journal";
import {
  closeWriterEpoch,
  emptyRecoveryCursor,
  type RecoveryAdmission,
  sourceContextDigest,
} from "../recovery/write-fence";
import { createClient, createStaff } from "../testing";
import { revokeStaffGrant } from "./grants";
import { createSession, readSession } from "./sessions";

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
    databaseLineage: "synthetic-c1-lineage",
    sourceInstance: "synthetic-c1-source",
    writerEpoch: "synthetic-c1-epoch",
    archiveNamespace: "synthetic-c1-archive",
    euR2: "synthetic-eu",
    outsideAccount: "synthetic-outside",
    encryptionProfileDigest: "e".repeat(64),
  },
};
beforeEach(async () => {
  t = await createTestDatabase();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await t?.drop();
});
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
async function manager() {
  const staff = await createStaff(t.db, { roles: ["manager"] });
  // The command checks active credential count; no ceremony/key provider is under test.
  await t.db.insert(passkeys).values(
    [0, 1].map(() => ({
      principalId: staff.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from("synthetic-count-fixture"),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  return { ...staff, ...(await createSession(t.db, { kind: "staff", id: staff.id })) };
}
async function fixture(kind: "staff" | "client" = "staff") {
  const actor = await manager();
  const target = kind === "staff" ? await createStaff(t.db) : await createClient(t.db);
  const [grant] = await t.db
    .insert(grants)
    .values({
      principalId: target.id,
      capability: "document.review",
      reason: "Synthetic review assignment",
      version: 7,
      ...(kind === "client" ? { recordType: "document", recordId: randomUUID() } : {}),
    })
    .returning();
  if (!grant) throw new Error("Missing synthetic grant");
  const live = await createSession(t.db, { kind, id: target.id });
  return {
    actor,
    target,
    grant,
    live,
    command: {
      operationId: randomUUID(),
      grantId: grant.id,
      expectedRevision: 7,
      reason: "Synthetic assignment has ended",
    },
  };
}

it("R08 C1 leaves ordinary revoke behavior inactive even with raw admission-like fields", async () => {
  const f = await fixture();
  const result = await revokeStaffGrant(t.db, f.actor.session, {
    ...f.command,
    recovery: admission,
    context: admission.context,
    writer: "run_operation",
  });
  expect(result.outcome).toEqual({ grantId: f.grant.id, principalId: f.target.id });
  expect(await readSession(t.db, f.live.token)).toBeNull();
  expect(await t.db.select().from(grants).where(eq(grants.id, f.grant.id))).toMatchObject([
    { version: 8 },
  ]);
  await assertEmpty();
});

it("R08 C1 binds the actual grant and session denials to its accepted operation", async () => {
  const f = await fixture();
  await admit();
  await revokeStaffGrant(t.db, f.actor.session, f.command, admission);
  expect(await t.db.select().from(recoveryPayloads)).toHaveLength(2);
  expect(await t.db.select().from(recoveryJournal)).toHaveLength(1);
});

async function assertEmpty() {
  expect(await t.db.select().from(recoveryJournal)).toEqual([]);
  expect(await t.db.select().from(recoveryPayloads)).toEqual([]);
  expect(await t.db.select().from(recoveryOperationReferences)).toEqual([]);
  expect(
    await t.db
      .select({ sequence: recoveryJournalHead.sequence, digest: recoveryJournalHead.digest })
      .from(recoveryJournalHead),
  ).toEqual([emptyRecoveryCursor]);
}
async function unchanged(f: Awaited<ReturnType<typeof fixture>>) {
  expect(
    await t.db
      .select({ version: grants.version, revokedAt: grants.revokedAt })
      .from(grants)
      .where(eq(grants.id, f.grant.id)),
  ).toEqual([{ version: 7, revokedAt: null }]);
  expect(await readSession(t.db, f.live.token)).not.toBeNull();
  expect(
    await t.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, "access.capability.revoked")),
  ).toEqual([]);
  await assertEmpty();
}
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
async function waitBlockedBy(pid: number, minimum = 1) {
  await expect
    .poll(
      async () =>
        (
          await t.sql`
    select pid from pg_stat_activity where datname = current_database()
      and ${pid} = any(pg_blocking_pids(pid))`
        ).length,
      { timeout: 3000, interval: 10 },
    )
    .toBeGreaterThanOrEqual(minimum);
}

it.each(["staff", "client"] as const)(
  "R08 C1 binds the exact %s grant/session set and native reader denials",
  async (kind) => {
    const f = await fixture(kind);
    const second = await createSession(t.db, { kind, id: f.target.id });
    const prior = await createSession(t.db, { kind, id: f.target.id });
    await t.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, prior.session.id));
    const unrelated = await createSession(t.db, { kind: "staff", id: f.actor.id });
    const beforeSessions = await t.db
      .select({ id: sessions.id, revokedAt: sessions.revokedAt })
      .from(sessions);
    const expectedSessions = [f.live.session.id, second.session.id].sort();
    const resource = f.grant.recordId ? { type: "document", id: f.grant.recordId } : undefined;
    expect(await can(t.db, f.target.actor, "document.review", resource)).toBe(true);
    await admit();
    const result = await revokeStaffGrant(t.db, f.actor.session, f.command, admission);
    const payloads = await t.db.select().from(recoveryPayloads);
    expect(payloads).toHaveLength(3);
    const decoded = payloads.map((row) =>
      decodeAccessRecoveryRestriction(admission.context, row.canonicalBody),
    );
    const persisted = await t.db
      .select({ id: sessions.id, revokedAt: sessions.revokedAt })
      .from(sessions);
    const newlyRevoked = persisted.filter(
      (row) =>
        row.revokedAt &&
        beforeSessions.some((before) => before.id === row.id && before.revokedAt === null),
    );
    expect(newlyRevoked.map((row) => row.id).sort()).toEqual(expectedSessions);
    expect(
      await t.db
        .select({ version: grants.version, revokedAt: grants.revokedAt })
        .from(grants)
        .where(eq(grants.id, f.grant.id)),
    ).toEqual([{ version: 8, revokedAt: expect.any(Date) }]);
    const grant = decoded.find((row) => row.target.kind === "grant");
    expect(grant?.target).toEqual({
      kind: "grant",
      id: f.grant.id,
      observedVersion: 7,
      version: 8,
    });
    expect(
      decoded
        .filter((row) => row.target.kind === "session")
        .map((row) => row.target.id)
        .sort(),
    ).toEqual(expectedSessions);
    const [audit] = await t.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.operationId, result.operationId));
    const [receipt] = await t.db
      .select()
      .from(operations)
      .where(eq(operations.id, result.operationId));
    expect(audit).toMatchObject({
      action: "access.capability.revoked",
      payload: { grantId: f.grant.id, revokedSessions: 2 },
    });
    expect(receipt).toMatchObject({ status: "succeeded", requestHash: hashRequest(f.command) });
    for (let i = 0; i < decoded.length; i++) {
      const entry = decoded[i],
        stored = payloads[i];
      expect(entry).toMatchObject({
        principal: { kind, id: f.target.id },
        decisionId: audit?.id,
        decision: {
          decisionId: audit?.id,
          operationId: result.operationId,
          requestHash: hashRequest(f.command),
          checkedSession: {
            id: f.actor.session.id,
            principalId: f.actor.id,
            principalKind: "staff",
          },
        },
      });
      expect(entry?.authorizationDigest).toBe(
        createHash("sha256")
          .update(canonicalJson(["access-grant-revocation-observation-v2", entry?.decision]))
          .digest("hex"),
      );
      expect(stored?.digest).toBe(
        createHash("sha256")
          .update(stored?.canonicalBody ?? "")
          .digest("hex"),
      );
      for (const secret of [
        f.live.token,
        second.token,
        createHash("sha256").update(f.live.token).digest("hex"),
        f.command.reason,
        f.target.email,
        "tokenHash",
        "publicKey",
        "reverifiedAt",
        "verificationNote",
      ])
        expect(stored?.canonicalBody).not.toContain(secret);
    }
    const [envelope] = await t.db.select().from(recoveryJournal);
    expect(envelope?.effects.map((e) => e.kind)).toEqual([
      "access_revocation",
      "access_revocation",
      "access_revocation",
      "accepted_operation",
    ]);
    expect(await t.db.select().from(recoveryOperationReferences)).toMatchObject([
      { operationId: result.operationId, sequence: 1 },
    ]);
    expect(await can(t.db, f.target.actor, "document.review", resource)).toBe(false);
    expect(await readSession(t.db, f.live.token)).toBeNull();
    expect(await readSession(t.db, second.token)).toBeNull();
    expect(await readSession(t.db, unrelated.token)).not.toBeNull();
    expect(await revokeStaffGrant(t.db, f.actor.session, f.command, admission)).toEqual({
      ...result,
      replayed: true,
    });
    expect(await t.db.select().from(recoveryJournal)).toHaveLength(1);
    await expect(
      revokeStaffGrant(
        t.db,
        f.actor.session,
        { ...f.command, reason: "Different synthetic reason" },
        admission,
      ),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
    await expect(
      revokeStaffGrant(
        t.db,
        f.actor.session,
        { ...f.command, operationId: randomUUID() },
        admission,
      ),
    ).rejects.toMatchObject({ code: "version_conflict" });
    expect(await t.db.select().from(recoveryOperationReferences)).toHaveLength(1);
    expect(await t.db.select().from(recoveryPayloads)).toHaveLength(3);
    await t.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, f.actor.session.id));
    await expect(
      revokeStaffGrant(t.db, f.actor.session, f.command, admission),
    ).rejects.toMatchObject({ code: "unauthenticated" });
    expect(await t.db.select().from(recoveryJournal)).toHaveLength(1);
  },
);

it.each(["stale_revision", "stale_session", "revoked_session", "authority"] as const)(
  "R08 C1 preserves %s denial without applied history",
  async (failure) => {
    const f = await fixture();
    await admit();
    if (failure === "stale_revision") f.command.expectedRevision = 6;
    if (failure === "stale_session")
      await t.db
        .update(sessions)
        .set({ reverifiedAt: new Date(Date.now() - 360_000) })
        .where(eq(sessions.id, f.actor.session.id));
    if (failure === "revoked_session")
      await t.db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.id, f.actor.session.id));
    if (failure === "authority")
      await t.db
        .update(grants)
        .set({ revokedAt: new Date() })
        .where(eq(grants.principalId, f.actor.id));
    const code = {
      stale_revision: "version_conflict",
      stale_session: "step_up_required",
      revoked_session: "unauthenticated",
      authority: "forbidden",
    }[failure];
    await expect(
      revokeStaffGrant(t.db, f.actor.session, f.command, admission),
    ).rejects.toMatchObject({ code });
    await unchanged(f);
    const receipts = await t.db.select().from(operations);
    if (failure === "stale_revision") {
      expect(receipts).toMatchObject([{ status: "failed", outcome: { code } }]);
      await expect(
        revokeStaffGrant(t.db, f.actor.session, f.command, admission),
      ).rejects.toMatchObject({ code });
      expect(await t.db.select().from(operations)).toHaveLength(1);
    } else expect(receipts).toEqual([]);
  },
);

it("R08 C1 retains the last usable manager and can revoke self only after another is usable", async () => {
  const actor = await manager();
  const [grant] = await t.db.select().from(grants).where(eq(grants.principalId, actor.id));
  if (!grant) throw new Error("Missing manager grant");
  await admit();
  const command = {
    operationId: randomUUID(),
    grantId: grant.id,
    expectedRevision: grant.version,
    reason: "Synthetic manager handover",
  };
  await expect(revokeStaffGrant(t.db, actor.session, command, admission)).rejects.toMatchObject({
    code: "transition_denied",
  });
  expect(await can(t.db, actor.actor, "access.grant")).toBe(true);
  expect(await readSession(t.db, actor.token)).not.toBeNull();
  expect(await t.db.select().from(operations)).toMatchObject([{ status: "failed" }]);
  await assertEmpty();
  await manager();
  await revokeStaffGrant(t.db, actor.session, { ...command, operationId: randomUUID() }, admission);
  expect(await readSession(t.db, actor.token)).toBeNull();
  expect(await t.db.select().from(recoveryOperationReferences)).toHaveLength(1);
});

it.each(["missing", "epoch", "registry", "writer"] as const)(
  "R08 C1 fails closed for %s producer context inside an owned scope even when caught",
  async (failure) => {
    const f = await fixture();
    await admit();
    const wrong =
      failure === "missing"
        ? undefined
        : failure === "writer"
          ? { ...admission, writer: "other" }
          : {
              ...admission,
              context: {
                ...admission.context,
                ...(failure === "epoch"
                  ? { writerEpoch: "other" }
                  : { writerRegistryDigest: "0".repeat(64) }),
              },
            };
    await expect(
      journal.withRecoveryTransaction(t.db, admission, async (tx) => {
        await revokeStaffGrant(tx, f.actor.session, f.command, wrong as RecoveryAdmission).catch(
          () => {},
        );
      }),
    ).rejects.toThrow("failed append");
    await unchanged(f);
    expect(await t.db.select().from(operations)).toEqual([]);
  },
);

it.each(["inactive", "closed", "source", "registry", "unadmitted"] as const)(
  "R08 C1 rejects %s source admission before domain changes",
  async (failure) => {
    const f = await fixture();
    if (failure !== "inactive") await admit(failure === "unadmitted" ? ["other"] : undefined);
    if (failure === "closed") await closeWriterEpoch(t.db, admission.context);
    const recovery = {
      ...admission,
      context: {
        ...admission.context,
        ...(failure === "source" ? { sourceInstance: "other" } : {}),
        ...(failure === "registry" ? { writerRegistryDigest: "0".repeat(64) } : {}),
      },
    };
    await expect(revokeStaffGrant(t.db, f.actor.session, f.command, recovery)).rejects.toThrow();
    await unchanged(f);
    expect(await t.db.select().from(operations)).toEqual([]);
  },
);

it.each([
  ["grant_update", "grants", "after update", "new.revoked_at is not null"],
  ["session_update", "sessions", "after update", "new.revoked_at is not null"],
  ["decision_record", "audit_events", "after insert", "new.action = 'access.capability.revoked'"],
  [
    "first_append",
    "recovery_payloads",
    "before insert",
    "(select count(*) from recovery_payloads) > 0",
  ],
  ["journal_flush", "recovery_journal", "before insert", "true"],
])("R08 C1 rolls back failure at %s", async (_name, table, position, condition) => {
  const f = await fixture();
  await admit();
  // Fixed local test trigger positions; no application fault switch or runtime adapter.
  await t.sql.unsafe(`create function synthetic_c1_fail() returns trigger language plpgsql as $$ begin
    if ${condition} then raise exception 'synthetic C1 rollback position'; end if; return new; end $$`);
  await t.sql.unsafe(
    `create trigger synthetic_c1_guard ${position} on ${table} for each row execute function synthetic_c1_fail()`,
  );
  await expect(revokeStaffGrant(t.db, f.actor.session, f.command, admission)).rejects.toThrow();
  await unchanged(f);
  expect(await t.db.select().from(operations)).toEqual([]);
});

it("R08 C1 rolls back an actual deferred COMMIT failure after journal flush", async () => {
  const f = await fixture();
  await admit();
  await t.sql`create table synthetic_c1_commit (id integer unique deferrable initially deferred)`;
  await expect(
    journal.withRecoveryTransaction(t.db, admission, async (tx) => {
      await revokeStaffGrant(tx, f.actor.session, f.command, admission);
      await tx.execute(sql`insert into synthetic_c1_commit values (1), (1)`);
    }),
  ).rejects.toMatchObject({ code: "23505" });
  await unchanged(f);
  expect(await t.db.select().from(operations)).toEqual([]);
});

it("R08 C1 publishes no inner success before the true outer commit and outer abort removes everything", async () => {
  const f = await fixture();
  await admit();
  await expect(
    journal.withRecoveryTransaction(t.db, admission, async (outer) => {
      await revokeStaffGrant(outer, f.actor.session, f.command, admission);
      await unchanged(f); // Separate pool connection cannot observe the released savepoint.
      expect(await t.db.select().from(operations)).toEqual([]);
      throw new Error("synthetic outer abort");
    }),
  ).rejects.toThrow("synthetic outer abort");
  await unchanged(f);
});

it("R08 C1 discards a managed child abort and commits only a healthy sibling in one envelope", async () => {
  const f = await fixture(),
    sibling = await fixture();
  await admit();
  await journal.withRecoveryTransaction(t.db, admission, async (outer) => {
    await expect(
      journal.withRecoveryTransaction(outer, admission, async (child) => {
        await revokeStaffGrant(child, f.actor.session, f.command, admission);
        throw new Error("synthetic child abort");
      }),
    ).rejects.toThrow("synthetic child abort");
    await revokeStaffGrant(outer, sibling.actor.session, sibling.command, admission);
  });
  expect(await readSession(t.db, f.live.token)).not.toBeNull();
  expect(await readSession(t.db, sibling.live.token)).toBeNull();
  expect(await t.db.select().from(recoveryJournal)).toHaveLength(1);
  expect(await t.db.select().from(recoveryOperationReferences)).toHaveLength(1);
  const payloads = await t.db.select().from(recoveryPayloads);
  expect(payloads).toHaveLength(2);
  expect(
    payloads.every(
      (row) =>
        decodeAccessRecoveryRestriction(admission.context, row.canonicalBody).principal.id ===
        sibling.target.id,
    ),
  ).toBe(true);
});

it.each([false, true])(
  "R08 C1 closure waits for the command's true outer end (abort=%s)",
  async (abort) => {
    const f = await fixture();
    await admit();
    const entered = deferred<number>(),
      release = deferred();
    const writer = journal
      .withRecoveryTransaction(t.db, admission, async (outer) => {
        const [backend] = await outer.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
        await revokeStaffGrant(outer, f.actor.session, f.command, admission);
        entered.resolve(backend?.pid ?? 0);
        await release.promise;
        if (abort) throw new Error("synthetic outer abort");
      })
      .then(
        () => "committed",
        (error: Error) => error.message,
      );
    const pid = await entered.promise;
    const closing = closeWriterEpoch(t.db, admission.context);
    try {
      await waitBlockedBy(pid);
      const waits = await t.sql`select wait_event_type, query from pg_stat_activity
      where ${pid} = any(pg_blocking_pids(pid)) and datname = current_database()`;
      expect(waits).toMatchObject([{ wait_event_type: "Lock" }]);
      expect(waits.some((row) => row.query.includes('"recovery_source"'))).toBe(true);
      await unchanged(f);
    } finally {
      release.resolve();
    }
    expect(await writer).toBe(abort ? "synthetic outer abort" : "committed");
    const closed = await closing;
    expect(closed.receipt.finalHead.sequence).toBe(abort ? 0 : 1);
    expect(closed.currentness).toBe("unknown");
    expect(closed.archiveBarrier).toBeNull();
    if (abort) await unchanged(f);
    else expect(await readSession(t.db, f.live.token)).toBeNull();
  },
);

it("R08 C1 cannot mutate if closure wins the fence, with both database waits observed", async () => {
  const f = await fixture();
  await admit();
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
  let writer: Promise<string> | undefined;
  try {
    await waitBlockedBy(pid);
    writer = revokeStaffGrant(t.db, f.actor.session, f.command, admission).then(
      () => "unexpected success",
      (error: Error) => error.message,
    );
    await expect
      .poll(
        async () =>
          (
            await t.sql`select pid from pg_stat_activity
      where cardinality(pg_blocking_pids(pid)) > 0 and datname = current_database()`
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
  await unchanged(f);
  expect(await t.db.select().from(operations)).toEqual([]);
});

it("R08 C1 repeats current authority after waiting for the staff-management lock", async () => {
  const f = await fixture();
  await admit();
  const held = deferred<number>(),
    release = deferred();
  const blocker = t.db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('staff-capability-management', 0))`,
    );
    const [backend] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    held.resolve(backend?.pid ?? 0);
    await release.promise;
  });
  const pid = await held.promise;
  const writer = revokeStaffGrant(t.db, f.actor.session, f.command, admission).then(
    () => "unexpected success",
    (error: { code: string }) => error.code,
  );
  try {
    await waitBlockedBy(pid);
    await t.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, f.actor.session.id));
  } finally {
    release.resolve();
  }
  await blocker;
  expect(await writer).toBe("unauthenticated");
  await unchanged(f);
  expect(await t.db.select().from(operations)).toMatchObject([
    { status: "failed", outcome: { code: "unauthenticated" } },
  ]);
});

it.each([
  "version",
  "target_id",
  "principal_kind",
  "session_kind",
  "session_id",
  "session_version",
  "duplicate_session",
  "operation",
  "request_hash",
  "audit",
  "checked_actor",
] as const)(
  "R08 C1 rejects malformed %s against actual rows and poisons a caught append",
  async (failure) => {
    const f = await fixture();
    await admit();
    const append = journal.appendGrantRevocationRecovery;
    const rejected = vi.fn();
    vi.spyOn(journal, "appendGrantRevocationRecovery").mockImplementation(
      async (tx, context, body) => {
        let invalid: unknown = body;
        switch (failure) {
          case "version":
            invalid = { ...body, grant: { ...body.grant, observedVersion: 8, version: 9 } };
            break;
          case "target_id":
            invalid = { ...body, grant: { ...body.grant, id: randomUUID() } };
            break;
          case "principal_kind":
            invalid = { ...body, targetPrincipal: { ...body.targetPrincipal, kind: "client" } };
            break;
          case "session_kind":
            invalid = {
              ...body,
              revokedSessions: body.revokedSessions.map((row) => ({
                ...row,
                principalKind: "client",
              })),
            };
            break;
          case "session_id":
            invalid = {
              ...body,
              revokedSessions: body.revokedSessions.map((row) => ({ ...row, id: randomUUID() })),
            };
            break;
          case "session_version":
            invalid = {
              ...body,
              revokedSessions: body.revokedSessions.map((row) => ({ ...row, version: 1 })),
            };
            break;
          case "duplicate_session":
            invalid = {
              ...body,
              revokedSessions: [...body.revokedSessions, ...body.revokedSessions],
            };
            break;
          case "operation":
            invalid = { ...body, operationId: randomUUID() };
            break;
          case "request_hash":
            invalid = { ...body, requestHash: "0".repeat(64) };
            break;
          case "audit":
            invalid = { ...body, decisionId: randomUUID() };
            break;
          case "checked_actor":
            invalid = {
              ...body,
              checkedSession: { ...body.checkedSession, id: f.live.session.id },
            };
            break;
        }
        await append(tx, context, invalid as GrantRevocationDecision).catch(rejected);
      },
    );
    await expect(revokeStaffGrant(t.db, f.actor.session, f.command, admission)).rejects.toThrow(
      "failed append",
    );
    expect(rejected).toHaveBeenCalledOnce();
    await unchanged(f);
    expect(await t.db.select().from(operations)).toEqual([]);
  },
);

it.each(["pool", "raw_child", "ancestor", "expired"] as const)(
  "R08 C1 rejects a caught %s append handle without committing domain writes",
  async (failure) => {
    const f = await fixture();
    await admit();
    let expired!: Transaction;
    await journal.withRecoveryTransaction(t.db, admission, async (tx) => {
      expired = tx;
    });
    const append = journal.appendGrantRevocationRecovery;
    await expect(
      journal.withRecoveryTransaction(t.db, admission, async (outer) => {
        vi.spyOn(journal, "appendGrantRevocationRecovery").mockImplementation(
          async (tx, context, body) => {
            const attempt = (handle: Transaction) => append(handle, context, body).catch(() => {});
            if (failure === "raw_child") await tx.transaction(attempt);
            else
              await attempt(
                failure === "ancestor"
                  ? outer
                  : failure === "expired"
                    ? expired
                    : (t.db as unknown as Transaction),
              );
          },
        );
        await revokeStaffGrant(outer, f.actor.session, f.command, admission);
      }),
    ).rejects.toThrow("failed append");
    await unchanged(f);
    expect(await t.db.select().from(operations)).toEqual([]);
  },
);

it("R08 C1 cannot adopt a raw transaction or open a foreign pool from an owned callback", async () => {
  const f = await fixture();
  await admit();
  await expect(
    t.db.transaction((tx) => revokeStaffGrant(tx, f.actor.session, f.command, admission)),
  ).rejects.toThrow("owned outer transaction");
  const otherSql = postgres(t.url, { max: 1, onnotice: () => {} });
  const other = drizzle(otherSql, { schema });
  try {
    await expect(
      journal.withRecoveryTransaction(t.db, admission, async (outer) => {
        await outer.update(grants).set({ revokedAt: new Date() }).where(eq(grants.id, f.grant.id));
        await revokeStaffGrant(other, f.actor.session, f.command, admission).catch(() => {});
      }),
    ).rejects.toThrow("failed append");
  } finally {
    await otherSql.end();
  }
  await unchanged(f);
});

it("R08 C1 rejects a detached append from the released command child and poisons the live outer scope", async () => {
  const f = await fixture();
  await admit();
  const append = journal.appendGrantRevocationRecovery;
  const release = deferred();
  let late!: Promise<unknown>;
  vi.spyOn(journal, "appendGrantRevocationRecovery").mockImplementation(
    async (tx, context, body) => {
      await append(tx, context, body);
      late = release.promise
        .then(() => append(tx, context, body))
        .catch((error: Error) => error.message);
    },
  );
  await expect(
    journal.withRecoveryTransaction(t.db, admission, async (outer) => {
      await revokeStaffGrant(outer, f.actor.session, f.command, admission);
      release.resolve();
      expect(await late).toContain("active owned transaction");
    }),
  ).rejects.toThrow("failed append");
  await unchanged(f);
  expect(await t.db.select().from(operations)).toEqual([]);
});

it("R08 C1 refuses insufficient scoped authority before making a receipt", async () => {
  const f = await fixture();
  await admit();
  const checkedId = randomUUID(),
    otherId = randomUUID();
  await t.db
    .update(grants)
    .set({ revokedAt: new Date() })
    .where(and(eq(grants.principalId, f.actor.id), eq(grants.role, "manager")));
  await t.db.insert(grants).values(
    ["access.grant", "document.review"].map((capability) => ({
      principalId: f.actor.id,
      capability: capability as "access.grant" | "document.review",
      recordType: "document",
      recordId: checkedId,
      reason: "Synthetic scoped authority",
    })),
  );
  await t.db
    .update(grants)
    .set({ recordType: "document", recordId: otherId })
    .where(eq(grants.id, f.grant.id));
  await expect(revokeStaffGrant(t.db, f.actor.session, f.command, admission)).rejects.toMatchObject(
    { code: "forbidden" },
  );
  await unchanged(f);
  expect(await t.db.select().from(operations)).toEqual([]);
});

it("R08 C1 keeps an admitted source dormant for ordinary calls and records no invented sessions", async () => {
  const f = await fixture();
  await admit();
  await revokeStaffGrant(t.db, f.actor.session, f.command);
  await assertEmpty();
  const other = await fixture();
  await t.db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.id, other.live.session.id));
  await revokeStaffGrant(t.db, other.actor.session, other.command, admission);
  const payloads = await t.db.select().from(recoveryPayloads);
  expect(payloads).toHaveLength(1);
  expect(
    decodeAccessRecoveryRestriction(admission.context, payloads[0]?.canonicalBody ?? ""),
  ).toMatchObject({
    target: { kind: "grant" },
    decision: { revokedSessions: [] },
  });
});
