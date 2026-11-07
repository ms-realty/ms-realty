// R08 / AT64: this fence covers explicitly admitted source transactions, never all DB writers.
import "server-only";
import { desc, eq, is } from "drizzle-orm";
import { PostgresJsDatabase, PostgresJsTransaction } from "drizzle-orm/postgres-js";
import { z } from "zod";
import { recoveryJournal, recoveryJournalHead, recoverySource } from "@/db/schema";
import { recoveryContext, recoveryDigest, recoveryEntryDigest } from "@/domain/recovery-archive";
import type { Database, Executor, Transaction } from "../db";

export type RecoverySourceContext = z.infer<typeof recoveryContext>;
export const recoveryAdmission = z.strictObject({
  context: recoveryContext,
  // This identifies the receipt seam only. It does not cover its 214 domain writer scopes.
  writer: z.literal("run_operation"),
});
export type RecoveryAdmission = z.infer<typeof recoveryAdmission>;
export type RecoveryCursor = { sequence: number; digest: string };
export const emptyRecoveryCursor: RecoveryCursor = Object.freeze({
  sequence: 0,
  digest: "0".repeat(64),
});

export function requireRecoveryPool(db: Executor): asserts db is Database {
  if (is(db, PostgresJsTransaction) || !is(db, PostgresJsDatabase))
    throw new Error("Recovery requires an owned outer transaction from a database pool.");
}

export function sourceContextDigest(context: RecoverySourceContext) {
  return recoveryDigest("context-v1", recoveryContext.parse(context));
}

export function requireSourceContext(
  source: typeof recoverySource.$inferSelect | undefined,
  expected: RecoverySourceContext,
) {
  const contextDigest = sourceContextDigest(expected);
  if (!source || source.state === "inactive") throw new Error("Recovery source epoch is inactive.");
  if (
    source.contextDigest !== contextDigest ||
    !source.context ||
    sourceContextDigest(source.context) !== contextDigest ||
    source.coverageState !== "incomplete" ||
    source.unresolvedWriters.length === 0
  )
    throw new Error("Recovery source context or incomplete coverage binding differs.");
  return { source, contextDigest };
}

/** Acquire before domain locks. PostgreSQL retains FOR SHARE through the actual outer commit. */
export async function lockRecoveryWriteFence(tx: Transaction, input: RecoveryAdmission) {
  if (!is(tx, PostgresJsTransaction)) throw new Error("Recovery fence requires a transaction.");
  const admission = recoveryAdmission.parse(input);
  const [row] = await tx
    .select()
    .from(recoverySource)
    .where(eq(recoverySource.key, "source"))
    .for("share");
  const bound = requireSourceContext(row, admission.context);
  if (bound.source.state !== "admitted") throw new Error("Recovery source epoch is closed.");
  if (!bound.source.admittedWriters.includes(admission.writer))
    throw new Error("Recovery writer is not admitted.");
  return bound.contextDigest;
}

export type LocalEpochClosure = {
  kind: "local_recovery_epoch_closure_v1";
  contextDigest: string;
  finalHead: RecoveryCursor;
  coverage: "incomplete";
  admittedWriters: string[];
  unresolvedWriters: string[];
};

/**
 * No route, worker or activation caller exists. Closes only this local admitted seam.
 * This is not the archive's closed barrier: bypass writers and provider outcomes remain unknown.
 */
export async function closeWriterEpoch(db: Database, expected: RecoverySourceContext) {
  requireRecoveryPool(db);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(recoverySource)
      .where(eq(recoverySource.key, "source"))
      .for("update");
    const { source, contextDigest } = requireSourceContext(row, expected);
    const [head] = await tx
      .select()
      .from(recoveryJournalHead)
      .where(eq(recoveryJournalHead.key, "source"));
    if (!head) throw new Error("Recovery journal head is missing.");
    const [last] = await tx
      .select()
      .from(recoveryJournal)
      .orderBy(desc(recoveryJournal.sequence))
      .limit(1);
    if (
      last
        ? last.contextDigest !== contextDigest ||
          last.sequence !== head.sequence ||
          last.digest !== head.digest ||
          recoveryEntryDigest(contextDigest, {
            sequence: last.sequence,
            transactionRef: last.transactionRef,
            previousDigest: last.previousDigest,
            effects: last.effects,
          }) !== last.digest
        : head.sequence !== 0 || head.digest !== emptyRecoveryCursor.digest
    )
      throw new Error("Recovery head differs from the committed journal.");
    const finalHead = { sequence: head.sequence, digest: head.digest };
    const receipt: LocalEpochClosure = {
      kind: "local_recovery_epoch_closure_v1",
      contextDigest,
      finalHead,
      coverage: "incomplete",
      admittedWriters: source.admittedWriters,
      unresolvedWriters: source.unresolvedWriters,
    };
    const receiptDigest = recoveryDigest("local-epoch-closure-v1", receipt);
    if (source.state === "closed") {
      if (
        source.closeReceiptDigest !== receiptDigest ||
        source.closedHead?.sequence !== finalHead.sequence ||
        source.closedHead.digest !== finalHead.digest
      )
        throw new Error("Recovery closed head differs from the committed journal.");
    } else {
      await tx
        .update(recoverySource)
        .set({ state: "closed", closedHead: finalHead, closeReceiptDigest: receiptDigest })
        .where(eq(recoverySource.key, "source"));
    }
    return { receipt, receiptDigest, archiveBarrier: null, currentness: "unknown" as const };
  });
}
