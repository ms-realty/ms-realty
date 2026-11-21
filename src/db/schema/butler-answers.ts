// Receipts of Butler answers on public listing pages (ADR 0017). One row per question asked:
// what Butler read, which tier answered, what the visitor was shown and what it cost. No IP
// address, cookie or contact detail is stored; the question and answer text are cleared after
// `answerTextRetentionDays` (src/domain/public-answer.ts) and the rest of the receipt stays.
import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import type { AiBillingMode } from "@/domain/generative";
import type { AnswerOutcome, AnswerTier, QuestionKind, SourceKey } from "@/domain/public-answer";
import { createdAt, id, instant } from "./columns";
import { publicLocaleEnum } from "./enums";
import { listings } from "./inventory";

export const butlerAnswers = pgTable(
  "butler_answers",
  {
    id: id(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    /** The active manifest the answer was built from. */
    manifestId: uuid("manifest_id").notNull(),
    locale: publicLocaleEnum("locale").notNull(),
    tier: text("tier").$type<AnswerTier>().notNull(),
    outcome: text("outcome").$type<AnswerOutcome>().notNull(),
    questionKind: text("question_kind").$type<QuestionKind>().notNull(),
    /** The visitor's question; null once the retention window has passed. */
    question: text("question"),
    /** The text the visitor was shown; null once the retention window has passed. */
    answer: text("answer"),
    textExpiresAt: instant("text_expires_at").notNull(),
    citedSources: jsonb("cited_sources").$type<SourceKey[]>().notNull().default([]),
    /** Why a model answer was not shown, or which limit stopped the question. */
    reason: text("reason"),
    promptVersion: text("prompt_version"),
    /** Bounded routing facts of the model call (requested router, model, provider, ids). */
    routing: jsonb("routing"),
    billingMode: text("billing_mode").$type<AiBillingMode>(),
    reservedCostMicros: integer("reserved_cost_micros"),
    actualCostMicros: integer("actual_cost_micros"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: createdAt(),
  },
  (t) => [
    check("butler_answers_tier", sql`${t.tier} in ('facts', 'text', 'none')`),
    check(
      "butler_answers_outcome",
      sql`${t.outcome} in ('answered', 'unknown', 'refused', 'rejected', 'limited')`,
    ),
    check("butler_answers_question_length", sql`char_length(${t.question}) <= 300`),
    check("butler_answers_answer_length", sql`char_length(${t.answer}) <= 1200`),
    check(
      "butler_answers_model",
      sql`(${t.tier} = 'text') = (${t.promptVersion} is not null) and (${t.tier} = 'text' or (${t.billingMode} is null and ${t.reservedCostMicros} is null and ${t.actualCostMicros} is null))`,
    ),
    check(
      "butler_answers_billing",
      sql`${t.billingMode} is null or (${t.billingMode} = 'metered_usd' and ${t.reservedCostMicros} >= 0 and (${t.actualCostMicros} is null or ${t.actualCostMicros} >= 0)) or (${t.billingMode} = 'chatgpt_subscription' and ${t.reservedCostMicros} is null and ${t.actualCostMicros} is null)`,
    ),
    index("butler_answers_listing_idx").on(t.listingId, t.createdAt),
    index("butler_answers_text_expiry_idx")
      .on(t.textExpiresAt)
      .where(sql`${t.question} is not null or ${t.answer} is not null`),
    index("butler_answers_metered_day_idx")
      .on(t.createdAt)
      .where(sql`${t.billingMode} = 'metered_usd'`),
  ],
);
