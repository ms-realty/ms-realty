// Column helpers shared by every table. Mutable aggregates carry a uuid key, an optimistic
// concurrency version and created/updated instants; immutable records omit version/updated_at.
import { sql } from "drizzle-orm";
import { customType, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const id = () => uuid("id").primaryKey().defaultRandom();

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const mutable = () => ({
  id: id(),
  version: integer("version").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const instant = (name: string) => timestamp(name, { withTimezone: true });

/** Human reference such as MS-00100 or RQ-2026-000042 (see src/domain/ids.ts). */
export const reference = () => text("reference").notNull().unique();

export const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });
export const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
  // postgres.js returns a Buffer; expose a plain Uint8Array.
  fromDriver: (value) => new Uint8Array(value),
});

/** SQL list literal of domain constants, for check constraints that must not drift. */
export function sqlList(values: readonly string[]) {
  return sql.raw(values.map((v) => `'${v.replaceAll("'", "''")}'`).join(", "));
}
