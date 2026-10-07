import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, instant, mutable, reference } from "./columns";
import { principals } from "./identity";
import { properties } from "./inventory";
import { operations } from "./records";

export const keySets = pgTable(
  "key_sets",
  {
    ...mutable(),
    reference: reference(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    keyTag: text("key_tag").notNull(),
    quantity: integer("quantity").notNull(),
    sourceReference: text("source_reference").notNull(),
    state: text("state").notNull().default("stored"),
    storageLabel: text("storage_label"),
    holderId: uuid("holder_id").references(() => principals.id),
    dueAt: instant("due_at"),
  },
  (t) => [
    uniqueIndex("key_sets_tag_unique").on(t.keyTag),
    index("key_sets_due_idx").on(t.state, t.dueAt, t.id),
    check("key_sets_quantity", sql`${t.quantity} between 1 and 50`),
    check(
      "key_sets_custody",
      sql`(
    (${t.state} = 'stored' and length(${t.storageLabel}) > 0 and ${t.storageLabel} is not null and ${t.holderId} is null and ${t.dueAt} is null) or
    (${t.state} = 'checked_out' and ${t.storageLabel} is null and ${t.holderId} is not null and ${t.dueAt} is not null) or
    (${t.state} in ('lost','returned_to_owner') and ${t.storageLabel} is null and ${t.holderId} is null and ${t.dueAt} is null)
  )`,
    ),
  ],
);
export const keyCustodyEvents = pgTable(
  "key_custody_events",
  {
    id: id(),
    keySetId: uuid("key_set_id")
      .notNull()
      .references(() => keySets.id),
    version: integer("version").notNull(),
    state: text("state").notNull(),
    storageLabel: text("storage_label"),
    holderId: uuid("holder_id").references(() => principals.id),
    dueAt: instant("due_at"),
    note: text("note").notNull(),
    recordedById: uuid("recorded_by_id")
      .notNull()
      .references(() => principals.id),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => operations.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("key_custody_events_version_unique").on(t.keySetId, t.version)],
);
