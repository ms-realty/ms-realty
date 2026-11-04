// R08 / AT64: transaction-owned local journal. No archive, signer or admission adapter.
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, gt, is } from "drizzle-orm";
import { PostgresJsTransaction } from "drizzle-orm/postgres-js";
import { z } from "zod";
import {
  operations,
  recoveryJournal,
  recoveryJournalHead,
  recoveryOperationReferences,
  recoveryPayloads,
  recoverySource,
} from "@/db/schema";
import { canonicalJson } from "@/domain/approval";
import {
  type RecoveryPacket,
  recoveryDigest,
  recoveryEntryDigest,
} from "@/domain/recovery-archive";
import type { Database, Executor, Transaction } from "../db";
import {
  emptyRecoveryCursor,
  lockRecoveryWriteFence,
  type RecoveryAdmission,
  type RecoveryCursor,
  type RecoverySourceContext,
  recoveryAdmission,
  requireRecoveryPool,
  requireSourceContext,
  sourceContextDigest,
} from "./write-fence";

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const decision = { decisionId: z.uuid(), authorizationDigest: sha };
const privacyAnchor = { privacySequence: z.int().positive(), privacyDigest: sha };
const purpose = z.enum(["search_alerts", "marketing", "client_access"]);
/** These codecs represent denials only. Domain wiring and restore semantics remain unqualified. */
export const recoveryRestriction = z.discriminatedUnion("kind", [
  z.strictObject({
    ...decision,
    kind: z.literal("access_revocation"),
    principalKind: z.enum(["staff", "client"]),
    principalId: z.uuid(),
    target: z.strictObject({
      kind: z.enum([
        "grant",
        "session",
        "passkey",
        "invitation",
        "case_participant",
        "document_request",
      ]),
      id: z.uuid(),
      version: z.int().positive(),
    }),
  }),
  z.strictObject({
    ...decision,
    ...privacyAnchor,
    kind: z.literal("privacy_restriction"),
    partyId: z.uuid(),
    purpose,
  }),
  z.strictObject({
    ...decision,
    ...privacyAnchor,
    kind: z.literal("deletion_decision"),
    partyId: z.uuid(),
    requestId: z.uuid(),
    inventoryDigest: sha,
    disposition: z.literal("restrict_pending_erasure"),
  }),
  z.strictObject({
    ...decision,
    kind: z.literal("consent_withdrawal"),
    partyId: z.uuid(),
    subscriptionId: z.uuid(),
    consentEventId: z.uuid(),
    purpose,
  }),
  z.strictObject({
    ...decision,
    kind: z.literal("publication_withdrawal"),
    listingId: z.uuid(),
    generation: z.int().positive(),
    locales: z.array(z.enum(["bg", "en", "ru"])).min(1),
    // The denial covers all destinations; a stale destination-specific grant cannot survive it.
    destinations: z.literal("all"),
  }),
]);
export type RecoveryRestriction = z.infer<typeof recoveryRestriction>;
type Entry = RecoveryPacket["segments"][number]["entries"][number];
type Effect = Entry["effects"][number];
type AcceptedReference = { operationId: string; receiptDigest: string };
type OwnedTransaction = {
  admission: RecoveryAdmission;
  contextDigest: string;
  effects: Effect[];
  accepted: AcceptedReference[];
  active: boolean;
  childOpen: boolean;
  pending: number;
  failed: boolean;
};
const owned = new WeakMap<object, OwnedTransaction>();

function requireOwned(db: Executor, expected?: RecoverySourceContext) {
  const state = owned.get(db);
  if (!is(db, PostgresJsTransaction) || !state?.active || state.childOpen)
    throw new Error("Recovery append requires the active owned transaction or managed savepoint.");
  if (state.failed) throw new Error("Recovery transaction contains a failed append.");
  if (expected && sourceContextDigest(expected) !== state.contextDigest)
    throw new Error("Recovery transaction context differs.");
  return state;
}

/** An unregistered transaction cannot be adopted after it may already have taken domain locks. */
export async function withRecoveryTransaction<T>(
  db: Executor,
  input: RecoveryAdmission,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const admission = recoveryAdmission.parse(input);
  const parent = owned.get(db);
  if (parent) {
    requireOwned(db, admission.context);
    if (parent.admission.writer !== admission.writer || parent.pending !== 0)
      throw new Error("Recovery nested writer or pending append differs.");
    parent.childOpen = true;
  } else {
    requireRecoveryPool(db);
  }
  let child: OwnedTransaction | undefined;
  try {
    const result = await db.transaction(async (tx) => {
      const contextDigest = parent?.contextDigest ?? (await lockRecoveryWriteFence(tx, admission));
      const state: OwnedTransaction = {
        admission,
        contextDigest,
        effects: [],
        accepted: [],
        active: true,
        childOpen: false,
        pending: 0,
        failed: false,
      };
      child = state;
      owned.set(tx, state);
      try {
        const result = await fn(tx);
        if (state.failed) throw new Error("Recovery transaction contains a failed append.");
        if (state.pending !== 0 || state.childOpen)
          throw new Error("Recovery transaction has unfinished append or savepoint work.");
        // A savepoint never flushes. Only the owner of the true PostgreSQL transaction does.
        if (!parent) await flushJournal(tx, state);
        return result;
      } finally {
        state.active = false;
        owned.delete(tx);
      }
    });
    if (parent && child) {
      // RELEASE succeeded. A rolled-back child never contributes references to its parent.
      parent.effects.push(...child.effects);
      parent.accepted.push(...child.accepted);
    }
    return result;
  } finally {
    if (parent) parent.childOpen = false;
  }
}

/** Optional seam for runOperation. Absent admission retains existing runtime behavior. */
export function operationRecoveryTransaction<T>(
  db: Executor,
  admission: RecoveryAdmission | undefined,
  fn: (tx: Transaction) => Promise<T>,
) {
  const inherited = owned.get(db)?.admission;
  if (admission || inherited)
    return withRecoveryTransaction(db, admission ?? (inherited as RecoveryAdmission), fn);
  return db.transaction(fn);
}

export function encodeRecoveryRestriction(
  context: RecoverySourceContext,
  input: RecoveryRestriction,
) {
  const contextDigest = sourceContextDigest(context);
  const restriction = recoveryRestriction.parse(input);
  const canonicalBody = canonicalJson(["recovery-restriction-v1", contextDigest, restriction]);
  const digest = createHash("sha256").update(canonicalBody, "utf8").digest("hex");
  // The complete restrictive scope is committed, including decision/version and privacy anchor.
  const subjectDigest = recoveryDigest("restriction-subject-v1", [contextDigest, restriction]);
  return {
    contextDigest,
    kind: restriction.kind,
    subjectDigest,
    digest,
    canonicalBody,
    byteLength: Buffer.byteLength(canonicalBody, "utf8"),
  };
}

/** Stages a typed denial and persists its recoverable body in the same owned transaction. */
export async function appendRecoveryEvent(
  tx: Transaction,
  expected: RecoverySourceContext,
  input: RecoveryRestriction,
) {
  const state = requireOwned(tx);
  state.pending += 1;
  try {
    const payload = encodeRecoveryRestriction(expected, input);
    if (payload.contextDigest !== state.contextDigest)
      throw new Error("Recovery transaction context differs.");
    await tx.insert(recoveryPayloads).values(payload).onConflictDoNothing();
    const [stored] = await tx
      .select()
      .from(recoveryPayloads)
      .where(eq(recoveryPayloads.digest, payload.digest));
    if (
      !stored ||
      stored.canonicalBody !== payload.canonicalBody ||
      stored.contextDigest !== payload.contextDigest ||
      stored.subjectDigest !== payload.subjectDigest ||
      stored.kind !== payload.kind ||
      stored.byteLength !== payload.byteLength
    )
      throw new Error("Recovery payload binding differs.");
    const effect: Effect = {
      kind: payload.kind,
      subjectDigest: payload.subjectDigest,
      payloadDigest: payload.digest,
    };
    state.effects.push(effect);
    return { ...effect };
  } catch (error) {
    state.failed = true;
    throw error;
  } finally {
    state.pending -= 1;
  }
}

/** Only a persisted succeeded receipt can become an accepted-operation reference. */
export async function appendAcceptedRecoveryOperation(tx: Transaction, operationId: string) {
  const state = requireOwned(tx);
  state.pending += 1;
  try {
    const receiptDigest = await acceptedReceiptDigest(tx, state.contextDigest, operationId);
    state.accepted.push({ operationId, receiptDigest });
    state.effects.push({
      kind: "accepted_operation",
      subjectDigest: recoveryDigest("accepted-operation-subject-v1", [
        state.contextDigest,
        operationId,
      ]),
      payloadDigest: receiptDigest,
    });
  } catch (error) {
    state.failed = true;
    throw error;
  } finally {
    state.pending -= 1;
  }
}

async function acceptedReceiptDigest(tx: Transaction, contextDigest: string, operationId: string) {
  const [row] = await tx
    .select()
    .from(operations)
    .where(eq(operations.id, z.uuid().parse(operationId)));
  if (row?.status !== "succeeded" || !row.completedAt)
    throw new Error("Recovery accepted operation requires a persisted succeeded receipt.");
  return recoveryDigest("accepted-operation-v1", {
    contextDigest,
    operationId: row.id,
    actorKind: row.actorKind,
    actorId: row.actorId,
    operationType: row.operationType,
    requestHash: row.requestHash,
    expectedRevision: row.expectedRevision,
    status: row.status,
    outcome: row.outcome,
    resultType: row.resultType,
    resultId: row.resultId,
    completedAt: row.completedAt.toISOString(),
  });
}

/** Called by the owned transaction only, never a worker/savepoint/domain callback. */
async function flushJournal(tx: Transaction, state: OwnedTransaction) {
  if (state.effects.length === 0) return;
  for (const ref of state.accepted) {
    if (
      (await acceptedReceiptDigest(tx, state.contextDigest, ref.operationId)) !== ref.receiptDigest
    )
      throw new Error("Recovery accepted receipt changed before the outer commit.");
  }
  const [head] = await tx
    .select()
    .from(recoveryJournalHead)
    .where(eq(recoveryJournalHead.key, "source"))
    .for("update");
  if (!head || head.sequence >= Number.MAX_SAFE_INTEGER)
    throw new Error("Recovery journal head is missing or exhausted.");
  const fields = {
    sequence: head.sequence + 1,
    previousDigest: head.digest,
    transactionRef: randomUUID(),
    effects: state.effects,
  };
  const digest = recoveryEntryDigest(state.contextDigest, fields);
  await tx
    .insert(recoveryJournal)
    .values({ ...fields, contextDigest: state.contextDigest, digest });
  for (const ref of state.accepted)
    await tx.insert(recoveryOperationReferences).values({ ...ref, sequence: fields.sequence });
  await tx
    .update(recoveryJournalHead)
    .set({ sequence: fields.sequence, digest })
    .where(eq(recoveryJournalHead.key, "source"));
}

export function hasRecoveryTransaction(tx: Transaction) {
  return owned.has(tx);
}

/** Reads only committed rows through a separate pool transaction; never an in-memory buffer. */
export async function readCommittedRecoveryBatch(
  db: Database,
  expected: RecoverySourceContext,
  anchor: RecoveryCursor = emptyRecoveryCursor,
  limit = 100,
) {
  requireRecoveryPool(db);
  z.int().min(1).max(1000).parse(limit);
  z.strictObject({ sequence: z.int().nonnegative(), digest: sha }).parse(anchor);
  return db.transaction(
    async (tx) => {
      const [source] = await tx
        .select()
        .from(recoverySource)
        .where(eq(recoverySource.key, "source"));
      const { contextDigest } = requireSourceContext(source, expected);
      const [head] = await tx
        .select()
        .from(recoveryJournalHead)
        .where(eq(recoveryJournalHead.key, "source"));
      if (!head || anchor.sequence > head.sequence)
        throw new Error("Recovery anchor exceeds the committed head.");
      const [prior] =
        anchor.sequence === 0
          ? []
          : await tx
              .select()
              .from(recoveryJournal)
              .where(eq(recoveryJournal.sequence, anchor.sequence));
      if (
        anchor.sequence === 0
          ? anchor.digest !== emptyRecoveryCursor.digest
          : !prior || prior.digest !== anchor.digest || prior.contextDigest !== contextDigest
      )
        throw new Error("Recovery committed anchor differs.");
      const rows = await tx
        .select()
        .from(recoveryJournal)
        .where(
          and(
            eq(recoveryJournal.contextDigest, contextDigest),
            gt(recoveryJournal.sequence, anchor.sequence),
          ),
        )
        .orderBy(asc(recoveryJournal.sequence))
        .limit(limit);
      let through = anchor;
      const entries: Entry[] = rows.map((row) => {
        const { sequence, transactionRef, effects, previousDigest, digest } = row;
        const fields = { sequence, transactionRef, effects, previousDigest };
        if (
          sequence !== through.sequence + 1 ||
          previousDigest !== through.digest ||
          recoveryEntryDigest(contextDigest, fields) !== digest
        )
          throw new Error("Recovery committed journal continuity differs.");
        through = { sequence, digest };
        return { ...fields, digest };
      });
      if (
        (entries.length < limit && through.sequence !== head.sequence) ||
        (through.sequence === head.sequence && through.digest !== head.digest)
      )
        throw new Error("Recovery committed journal head differs.");
      return {
        contextDigest,
        from: anchor,
        through,
        entries,
        committedThrough: { sequence: head.sequence, digest: head.digest },
        archiveAcknowledgment: {
          state: "unconfigured" as const,
          euR2VerifiedThrough: null,
          outsideCopyVerifiedThrough: null,
        },
        pendingArchiveCount: head.sequence,
        coverage: "incomplete" as const,
        currentness: "unknown" as const,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
