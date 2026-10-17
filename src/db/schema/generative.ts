// Private working documents and inference checkpoints, never business-action authority.
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  ArtifactProposal,
  ContextSelection,
  PlannerTurn,
  SourcePin,
  WorkspaceBudget,
  WorkspaceConversationTurn,
  WorkspacePlanStep,
  WorkspaceState,
} from "@/domain/generative";
import { workspaceStates } from "@/domain/generative";
import { createdAt, id, instant, mutable, sqlList } from "./columns";
import { principals } from "./identity";

export const generativeSessions = pgTable(
  "generative_sessions",
  {
    ...mutable(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => principals.id),
    goal: text("goal").notNull(),
    locale: text("locale").notNull(),
    selection: jsonb("selection").$type<ContextSelection>().notNull(),
    constraints: jsonb("constraints").$type<string[]>().notNull().default([]),
    questions: jsonb("questions").$type<string[]>().notNull().default([]),
    decisions: jsonb("decisions").$type<string[]>().notNull().default([]),
    plan: jsonb("plan").$type<WorkspacePlanStep[]>().notNull().default([]),
    conversation: jsonb("conversation").$type<WorkspaceConversationTurn[]>().notNull().default([]),
    contextPins: jsonb("context_pins").$type<SourcePin[]>().notNull().default([]),
    contextDigest: text("context_digest").notNull(),
    state: text("state").$type<WorkspaceState>().notNull().default("idle"),
    generation: integer("generation").notNull().default(0),
    activeRunId: uuid("active_run_id"),
    errorCode: text("error_code"),
  },
  (t) => [
    index("generative_sessions_owner_idx").on(t.ownerId, t.updatedAt),
    check("generative_sessions_state", sql`${t.state} in (${sqlList(workspaceStates)})`),
    check("generative_sessions_generation", sql`${t.generation} >= 0`),
    check("generative_sessions_locale", sql`${t.locale} in ('bg','en','ru')`),
  ],
);

export const generativeRuns = pgTable(
  "generative_runs",
  {
    ...mutable(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => generativeSessions.id),
    requestedById: uuid("requested_by_id")
      .notNull()
      .references(() => principals.id),
    generation: integer("generation").notNull(),
    state: text("state").$type<WorkspaceState>().notNull().default("queued"),
    policyDigest: text("policy_digest").notNull(),
    budget: jsonb("budget").$type<WorkspaceBudget>().notNull(),
    contextDigest: text("context_digest").notNull(),
    steps: integer("steps").notNull().default(0),
    contextPins: jsonb("context_pins").$type<SourcePin[]>().notNull().default([]),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    reservedCostMicros: integer("reserved_cost_micros").notNull(),
    actualCostMicros: integer("actual_cost_micros"),
    observedCostMicros: integer("observed_cost_micros").notNull().default(0),
    claimId: uuid("claim_id"),
    claimedAt: instant("claimed_at"),
    startedAt: instant("started_at"),
    errorCode: text("error_code"),
  },
  (t) => [
    index("generative_runs_budget_idx").on(t.createdAt),
    index("generative_runs_actor_idx").on(t.requestedById, t.state),
    check("generative_runs_state", sql`${t.state} in (${sqlList(workspaceStates)})`),
    check(
      "generative_runs_usage",
      sql`${t.steps} >= 0 and ${t.inputTokens} >= 0 and ${t.outputTokens} >= 0 and ${t.reservedCostMicros} >= 0 and ${t.observedCostMicros} >= 0 and (${t.actualCostMicros} is null or ${t.actualCostMicros} >= 0)`,
    ),
  ],
);

export const generativeCheckpoints = pgTable(
  "generative_checkpoints",
  {
    id: id(),
    createdAt: createdAt(),
    runId: uuid("run_id")
      .notNull()
      .references(() => generativeRuns.id),
    step: integer("step").notNull(),
    turn: jsonb("turn").$type<PlannerTurn>().notNull(),
    toolResult: jsonb("tool_result"),
    costMicros: integer("cost_micros").notNull(),
  },
  (t) => [
    uniqueIndex("generative_checkpoints_step_idx").on(t.runId, t.step),
    check("generative_checkpoints_step", sql`${t.step} > 0 and ${t.costMicros} >= 0`),
  ],
);

export const generativeArtifacts = pgTable(
  "generative_artifacts",
  {
    ...mutable(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => generativeSessions.id),
    runId: uuid("run_id").references(() => generativeRuns.id),
    replacesId: uuid("replaces_id"),
    proposal: jsonb("proposal").$type<ArtifactProposal>().notNull(),
    contextDigest: text("context_digest").notNull(),
    contextPins: jsonb("context_pins").$type<SourcePin[]>().notNull(),
    state: text("state")
      .$type<"draft" | "superseded" | "materialized">()
      .notNull()
      .default("draft"),
    materializedById: uuid("materialized_by_id").references(() => principals.id),
    receiptId: uuid("receipt_id"),
    result: jsonb("result").$type<Record<string, unknown>>(),
  },
  (t) => [
    index("generative_artifacts_session_idx").on(t.sessionId, t.createdAt),
    uniqueIndex("generative_artifacts_replaces_idx").on(t.replacesId),
    check("generative_artifacts_state", sql`${t.state} in ('draft','superseded','materialized')`),
    check(
      "generative_artifacts_receipt",
      sql`${t.state} <> 'materialized' or (${t.materializedById} is not null and ${t.receiptId} is not null and ${t.result} is not null)`,
    ),
  ],
);
