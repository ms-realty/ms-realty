import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, instant, mutable, reference } from "./columns";
import { principals } from "./identity";
import { operations } from "./records";

export const complaints = pgTable(
  "complaints",
  {
    ...mutable(),
    reference: reference(),
    channel: text("channel").notNull(),
    sourceReference: text("source_reference").notNull(),
    description: text("description").notNull(),
    receivedAt: instant("received_at").notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => principals.id),
    dueAt: instant("due_at").notNull(),
    state: text("state").notNull().default("open"),
    outcome: text("outcome").notNull().default(""),
    resolvedAt: instant("resolved_at"),
  },
  (t) => [
    index("complaints_queue_idx").on(t.state, t.dueAt, t.id),
    check("complaints_state", sql`${t.state} in ('open','reviewing','waiting','resolved')`),
    check(
      "complaints_channel",
      sql`${t.channel} in ('email','phone','in_person','website','other')`,
    ),
    check("complaints_due", sql`${t.dueAt} >= ${t.receivedAt}`),
    check(
      "complaints_resolution",
      sql`(${t.state} = 'resolved' and ${t.resolvedAt} is not null and length(${t.outcome}) >= 10) or (${t.state} <> 'resolved' and ${t.resolvedAt} is null)`,
    ),
  ],
);
export const complaintReviews = pgTable(
  "complaint_reviews",
  {
    id: id(),
    complaintId: uuid("complaint_id")
      .notNull()
      .references(() => complaints.id),
    version: integer("version").notNull(),
    state: text("state").notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => principals.id),
    dueAt: instant("due_at").notNull(),
    note: text("note").notNull(),
    outcome: text("outcome").notNull(),
    reviewedById: uuid("reviewed_by_id")
      .notNull()
      .references(() => principals.id),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => operations.id),
    createdAt: createdAt(),
  },
  (t) => [index("complaint_reviews_record_idx").on(t.complaintId, t.version)],
);
