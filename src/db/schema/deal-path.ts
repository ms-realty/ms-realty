// The recorded part of a Deal's path and its verified completion (ADR 0013). Early steps are
// derived from existing records and are not stored here.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { dealPathActors } from "../../config/tenant";
import { recordedStepStates } from "../../domain/deal-path";
import { createdAt, id, instant, mutable, sqlList } from "./columns";
import { documentVersions } from "./coordination";
import { principals } from "./identity";
import { cases } from "./work";

/**
 * One step a person records on a Deal, copied from the tenant template when the path was first
 * recorded so a later template edit never rewrites an existing Deal. A note for the client and
 * an internal note are separate fields, never two views of one text.
 */
export const casePathSteps = pgTable(
  "case_path_steps",
  {
    ...mutable(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    /** The template the step came from, e.g. `BG.sale` or `generic.long_term_rent`. */
    template: text("template").notNull(),
    stepKey: text("step_key").notNull(),
    position: integer("position").notNull(),
    actor: text("actor").notNull(),
    evidenceExpected: boolean("evidence_expected").notNull(),
    clientVisible: boolean("client_visible").notNull(),
    state: text("state").notNull().default("pending"),
    /** Calendar dates in the agency's zone. */
    expectedOn: date("expected_on", { mode: "string" }),
    doneOn: date("done_on", { mode: "string" }),
    recordedAt: instant("recorded_at"),
    recordedById: uuid("recorded_by_id").references(() => principals.id),
    clientNote: text("client_note"),
    internalNote: text("internal_note"),
    skipReason: text("skip_reason"),
    evidenceVersionId: uuid("evidence_version_id").references(() => documentVersions.id),
  },
  (t) => [
    uniqueIndex("case_path_steps_key_idx").on(t.caseId, t.stepKey),
    uniqueIndex("case_path_steps_position_idx").on(t.caseId, t.position),
    check("case_path_steps_state", sql`${t.state} in (${sqlList(recordedStepStates)})`),
    check("case_path_steps_actor", sql`${t.actor} in (${sqlList(dealPathActors)})`),
    check("case_path_steps_position", sql`${t.position} >= 0`),
    check(
      "case_path_steps_done",
      sql`${t.state} <> 'done' or (${t.doneOn} is not null and ${t.recordedAt} is not null and ${t.recordedById} is not null)`,
    ),
    check(
      "case_path_steps_skipped",
      sql`${t.state} <> 'skipped' or (${t.skipReason} is not null and ${t.recordedAt} is not null and ${t.recordedById} is not null)`,
    ),
    check(
      "case_path_steps_pending",
      sql`${t.state} <> 'pending' or (${t.doneOn} is null and ${t.skipReason} is null and ${t.evidenceVersionId} is null)`,
    ),
    check(
      "case_path_steps_evidence_done",
      sql`${t.evidenceVersionId} is null or ${t.state} = 'done'`,
    ),
  ],
);

/**
 * The broker's confirmation that a Deal's path is complete: the deed or lease date, an optional
 * registry or deed reference and document. Append-only; a reopened and re-completed Deal adds a
 * row. It is a recorded agency outcome, not a certificate of legal transfer.
 */
export const caseCompletions = pgTable(
  "case_completions",
  {
    id: id(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    template: text("template").notNull(),
    completedOn: date("completed_on", { mode: "string" }).notNull(),
    registryReference: text("registry_reference"),
    evidenceVersionId: uuid("evidence_version_id").references(() => documentVersions.id),
    recordedById: uuid("recorded_by_id")
      .notNull()
      .references(() => principals.id),
    operationId: text("operation_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("case_completions_case_idx").on(t.caseId, t.createdAt)],
);
