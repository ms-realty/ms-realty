// Restricted, source-bound drafting evidence. Acceptance never authorizes sending or publication.
import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { instant, mutable } from "./columns";
import { publicLocaleEnum } from "./enums";
import { principals } from "./identity";

export const assistanceRuns = pgTable(
  "assistance_runs",
  {
    ...mutable(),
    requestedById: uuid("requested_by_id")
      .notNull()
      .references(() => principals.id),
    task: text("task").notNull(),
    sourceType: text("source_type").notNull(),
    targetLocale: publicLocaleEnum("target_locale"),
    sourceId: uuid("source_id").notNull(),
    sourceVersion: integer("source_version").notNull(),
    sourceDigest: text("source_digest").notNull(),
    sourceSnapshot: jsonb("source_snapshot").notNull(),
    promptVersion: text("prompt_version").notNull(),
    schemaVersion: text("schema_version").notNull(),
    model: text("model").notNull(),
    state: text("state").notNull().default("queued"),
    output: jsonb("output"),
    validation: jsonb("validation").notNull().default({}),
    errorCode: text("error_code"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    reservedCostMicros: integer("reserved_cost_micros").notNull().default(0),
    actualCostMicros: integer("actual_cost_micros"),
    generatedAt: instant("generated_at"),
    reviewedAt: instant("reviewed_at"),
    reviewedById: uuid("reviewed_by_id").references(() => principals.id),
    jobId: text("job_id"),
  },
  (t) => [
    check(
      "assistance_runs_task",
      sql`${t.task} in ('inquiry_summary', 'reply_draft', 'task_draft', 'locale.draft', 'intake.extract')`,
    ),
    check(
      "assistance_runs_task_source",
      sql`(${t.task} = 'locale.draft' and ${t.sourceType} = 'listing_revision' and ${t.targetLocale} is not null and ${t.targetLocale} <> 'bg') or (${t.task} = 'intake.extract' and ${t.sourceType} = 'property_fact_revision' and ${t.targetLocale} is null) or (${t.task} in ('inquiry_summary','reply_draft','task_draft') and ${t.sourceType} = 'inquiry' and ${t.targetLocale} is null)`,
    ),
    check(
      "assistance_runs_state",
      sql`${t.state} in ('queued', 'running', 'draft', 'failed', 'stale', 'rejected', 'accepted')`,
    ),
    check("assistance_runs_source_version", sql`${t.sourceVersion} > 0`),
    check(
      "assistance_runs_usage",
      sql`${t.inputTokens} >= 0 and ${t.outputTokens} >= 0 and ${t.reservedCostMicros} >= 0 and (${t.actualCostMicros} is null or ${t.actualCostMicros} >= 0)`,
    ),
    check(
      "assistance_runs_review",
      sql`${t.state} not in ('accepted', 'rejected') or (${t.reviewedById} is not null and ${t.reviewedAt} is not null)`,
    ),
    index("assistance_runs_actor_idx").on(t.requestedById, t.createdAt),
    index("assistance_runs_source_idx").on(t.sourceType, t.sourceId, t.sourceVersion),
  ],
);
