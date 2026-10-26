// O28/F32: the legacy batch/row journal is shared; staff review adds a sealed source and
// deliberate subset. It never contains publication authority.
import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { instant, mutable } from "./columns";
import { principals } from "./identity";
import { importBatches } from "./migration";

export const staffImportReviews = pgTable(
  "staff_import_reviews",
  {
    ...mutable(),
    batchId: uuid("batch_id")
      .notNull()
      .unique()
      .references(() => importBatches.id),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => principals.id),
    operationKey: text("operation_key").notNull().unique(),
    sourceText: text("source_text").notNull(),
    sourceSha256: text("source_sha256").notNull(),
    delimiter: text("delimiter").notNull(),
    context: jsonb("context").notNull(),
    planDigest: text("plan_digest").notNull(),
    selection: jsonb("selection"),
    selectionDigest: text("selection_digest"),
    reviewedAt: instant("reviewed_at"),
    cancelledAt: instant("cancelled_at"),
  },
  (t) => [
    index("staff_import_reviews_creator_idx").on(t.createdById, t.createdAt),
    check(
      "staff_import_reviews_digest",
      sql`${t.sourceSha256} ~ '^[a-f0-9]{64}$' and ${t.planDigest} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "staff_import_reviews_delimiter",
      sql`length(${t.delimiter}) = 1 and ascii(${t.delimiter}) in (44,59)`,
    ),
    check(
      "staff_import_reviews_sealed",
      sql`(${t.selection} is null and ${t.selectionDigest} is null and ${t.reviewedAt} is null) or (${t.selection} is not null and ${t.selectionDigest} ~ '^[a-f0-9]{64}$' and ${t.reviewedAt} is not null)`,
    ),
  ],
);
