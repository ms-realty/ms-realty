// Legacy URL decisions, staged imports and reversible merges (architecture §13, §18, AT55,
// AT56, AT57).
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, instant, mutable, reference } from "./columns";
import {
  importBatchModeEnum,
  importBatchStateEnum,
  importRowClassificationEnum,
  importRowOutcomeEnum,
  legacyDomainEnum,
  legacyUrlDecisionEnum,
  mergeSubjectEnum,
} from "./enums";
import { principals } from "./identity";
import { listings } from "./inventory";

/** Evidence-based outcome per legacy URL (data/legacy/url-decisions.json); never guessed. */
export const legacyUrlDecisions = pgTable(
  "legacy_url_decisions",
  {
    ...mutable(),
    domain: legacyDomainEnum("domain").notNull(),
    sourcePath: text("source_path").notNull(),
    sourceQuery: text("source_query").notNull().default(""),
    decision: legacyUrlDecisionEnum("decision").notNull(),
    statusCode: smallint("status_code").notNull(),
    targetPath: text("target_path"),
    listingId: uuid("listing_id").references(() => listings.id),
    listingReference: text("listing_reference"),
    reason: text("reason").notNull(),
    evidence: jsonb("evidence").notNull(),
  },
  (t) => [uniqueIndex("legacy_url_decisions_source_idx").on(t.domain, t.sourcePath, t.sourceQuery)],
);

export const importBatches = pgTable("import_batches", {
  ...mutable(),
  reference: reference(),
  source: text("source").notNull(),
  scope: text("scope").notNull(),
  mode: importBatchModeEnum("mode").notNull(),
  state: importBatchStateEnum("state").notNull().default("staged"),
  /** Source artefact checksum, so a batch can be traced back to its input. */
  sourceSha256: text("source_sha256"),
  fieldMapping: jsonb("field_mapping").notNull().default({}),
  rowCount: integer("row_count").notNull().default(0),
  createdById: uuid("created_by_id").references(() => principals.id),
  startedAt: instant("started_at"),
  finishedAt: instant("finished_at"),
});

export const importRows = pgTable(
  "import_rows",
  {
    ...mutable(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => importBatches.id),
    rowNumber: integer("row_number").notNull(),
    sourceKey: text("source_key").notNull(),
    classification: importRowClassificationEnum("classification").notNull(),
    targetType: text("target_type"),
    targetId: uuid("target_id"),
    /** Field diff against the current version: original, incoming, source, affected surfaces. */
    diff: jsonb("diff").notNull().default({}),
    issues: jsonb("issues").notNull().default([]),
    outcome: importRowOutcomeEnum("outcome").notNull().default("pending"),
    appliedAt: instant("applied_at"),
    errorCode: text("error_code"),
  },
  (t) => [
    uniqueIndex("import_rows_batch_row_idx").on(t.batchId, t.rowNumber),
    index("import_rows_classification_idx").on(t.batchId, t.classification),
  ],
);

/**
 * An approved duplicate merge of two parties or properties. The merged record stays as an
 * alias; the merge never widens anyone's access and can be reversed or split (AT56).
 */
export const mergeRecords = pgTable(
  "merge_records",
  {
    id: id(),
    subject: mergeSubjectEnum("subject").notNull(),
    survivorId: uuid("survivor_id").notNull(),
    mergedId: uuid("merged_id").notNull(),
    reason: text("reason").notNull(),
    /** Private relationships and permission implications reviewed before the merge. */
    review: jsonb("review").notNull().default({}),
    decidedById: uuid("decided_by_id")
      .notNull()
      .references(() => principals.id),
    createdAt: createdAt(),
    reversedAt: instant("reversed_at"),
    reversedById: uuid("reversed_by_id").references(() => principals.id),
  },
  (t) => [
    check("merge_records_distinct", sql`${t.survivorId} <> ${t.mergedId}`),
    index("merge_records_merged_idx").on(t.subject, t.mergedId),
  ],
);
