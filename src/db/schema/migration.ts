// Legacy URL decisions and the import pipeline (spec F09, F32, §20.4, A71, A72).
import {
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { staffAccounts } from "./accounts";
import { instant, mutable, reference } from "./columns";
import {
  importBatchModeEnum,
  importBatchStateEnum,
  importRowClassificationEnum,
  importRowOutcomeEnum,
  legacyDomainEnum,
  legacyUrlDecisionEnum,
} from "./enums";
import { listings } from "./properties";

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
  createdByStaffId: uuid("created_by_staff_id").references(() => staffAccounts.id),
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
