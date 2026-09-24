// The database handle services accept: the pool or an open transaction. Services take it as a
// parameter so a caller can compose several of them into one transaction.
import "server-only";
import type { Database } from "@/db/client";

export type { Database };
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Executor = Database | Transaction;

/** Runs `fn` in a transaction, or a savepoint when `db` is already a transaction. */
export function inTransaction<T>(db: Executor, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(fn);
}
