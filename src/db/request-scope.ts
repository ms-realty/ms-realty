import { AsyncLocalStorage } from "node:async_hooks";
import type { Database } from "./client";

// The adapter and Next's server bundle are separate modules. They share the ALS instance,
// never a connection or a mutable current-request variable. Each fetch gets its own store.
const scopeKey = Symbol.for("ms-realty.database-request-scope");
const runtime = globalThis as typeof globalThis & {
  [scopeKey]?: AsyncLocalStorage<Database>;
};
runtime[scopeKey] ??= new AsyncLocalStorage<Database>();
const storage = runtime[scopeKey];

export function withRequestDatabase<T>(database: Database, operation: () => T): T {
  return storage.run(database, operation);
}

export function requestDatabase(): Database | undefined {
  return storage.getStore();
}
