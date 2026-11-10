// Butler answers on a published listing page (ADR 0017, ADR 0007, ADR 0011 §5 "Act").
// One question in, one receipt out. The router decides the path: a fixed refusal, the facts tier
// (deterministic sentences from the published facts) or the text tier (one validated model call).
// Nothing a model writes reaches the visitor unless the validator passes it; a rejected or failed
// call shows the fixed "the listing does not say" text with the hand-off. Visitor text and
// listing text are data. The visitor's IP address is used only for the rate-limit bucket key,
// which stores a keyed hash; the receipt holds no IP, cookie or contact detail.
import "server-only";
import { and, desc, eq, gt, isNotNull, lt, or } from "drizzle-orm";
import { butlerAnswers } from "@/db/schema";
import type { PublicLocale } from "@/domain/ids";
import {
  type AnswerOutcome,
  type AnswerTier,
  answerTextRetentionDays,
  maxQuestionLength,
  type QuestionKind,
  type SourceKey,
} from "@/domain/public-answer";
import type { Executor } from "../db";
import { consumeRateLimit, type RateLimitPurpose } from "../rate-limit";
import { billingMode, generationCost, reserveGenerationCost } from "./billing";
import { reservePublicAnswerBudget } from "./budget";
import { type AssistanceConfig, assistanceConfig } from "./config";
import { type Generation, requestGeneration } from "./provider";
import { publicAnswersEnabled, publicTextTierAvailable } from "./public-answer-config";
import { butlerAnswersCopy } from "./public-answer-copy";
import {
  type ActionLabels,
  answerFromFacts,
  injectionText,
  type PublicAnswerSource,
  refusalText,
} from "./public-answer-facts";
import {
  answerSourceTexts,
  publicAnswerInput,
  publicAnswerInstructions,
  publicAnswerJsonSchema,
  publicAnswerOutputTokens,
  publicAnswerPromptVersion,
  publicAnswerSchemaName,
  validatePublicAnswer,
} from "./public-answer-model";
import { routeQuestion } from "./public-answer-router";
import { loadPublicAnswerSource } from "./public-answer-source";

async function withinLimit(
  db: Executor,
  purpose: RateLimitPurpose,
  clientIp: string,
  now: Date,
): Promise<boolean> {
  return (await consumeRateLimit(db, purpose, clientIp, { now })).allowed;
}

export interface AskInput {
  readonly reference: string;
  readonly locale: PublicLocale;
  readonly question: string;
  /** Edge-observed client address; becomes a keyed hash inside the rate-limit bucket only. */
  readonly clientIp: string;
  readonly labels: ActionLabels;
  readonly now?: Date;
}

export interface AskDeps {
  readonly env?: Record<string, string | undefined>;
  readonly config?: AssistanceConfig;
  readonly generate?: typeof requestGeneration;
}

export type AskResult =
  | { readonly kind: "off" }
  | { readonly kind: "not_found" }
  | { readonly kind: "invalid"; readonly reason: "empty" | "too_long" }
  | { readonly kind: "limited"; readonly receiptId: string | null }
  | { readonly kind: "answered"; readonly receiptId: string; readonly outcome: AnswerOutcome };

/** Question text as stored and read: composed form, single spaces, no control characters. */
export function cleanQuestion(raw: string): string {
  return (
    raw
      .normalize("NFC")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are stripped on purpose.
      .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

interface Receipt {
  readonly tier: AnswerTier;
  readonly outcome: AnswerOutcome;
  readonly kind: QuestionKind;
  readonly answer: string;
  readonly cited: readonly SourceKey[];
  readonly reason?: string;
}

async function writeReceipt(
  db: Executor,
  source: PublicAnswerSource,
  question: string,
  receipt: Receipt,
  now: Date,
): Promise<string> {
  const [row] = await db
    .insert(butlerAnswers)
    .values({
      listingId: source.listingId,
      manifestId: source.manifestId,
      locale: source.locale,
      tier: receipt.tier,
      outcome: receipt.outcome,
      questionKind: receipt.kind,
      question,
      answer: receipt.answer,
      textExpiresAt: new Date(now.getTime() + answerTextRetentionDays * 86_400_000),
      citedSources: [...receipt.cited],
      reason: receipt.reason ?? null,
    })
    .returning({ id: butlerAnswers.id });
  if (!row) throw new Error("Butler answer receipt insert failed");
  return row.id;
}

/** Input bytes are a conservative token bound, as for every other AI task. */
function inputTokenBound(instructions: string, input: unknown): number {
  return (
    Buffer.byteLength(
      JSON.stringify(input) + instructions + JSON.stringify(publicAnswerJsonSchema),
      "utf8",
    ) + 1024
  );
}

const safeCode = (error: unknown): string => {
  const message = error instanceof Error ? error.message : "";
  const code = (error as { code?: unknown } | null)?.code;
  const text = typeof code === "string" ? code : message;
  return /^[a-z0-9_]{1,60}$/.test(text) ? text : "provider_error";
};

async function textTier(
  db: Executor,
  source: PublicAnswerSource,
  question: string,
  config: AssistanceConfig,
  generate: typeof requestGeneration,
  now: Date,
): Promise<AskResult> {
  const copy = butlerAnswersCopy(source.locale);
  const instructions = publicAnswerInstructions(source.locale);
  const input = publicAnswerInput(question, source);
  const mode = billingMode(config);
  // The call is bounded to the answer's own size; the reservation covers exactly that bound.
  const bounded: AssistanceConfig = {
    ...config,
    maxOutputTokens: Math.min(config.maxOutputTokens, publicAnswerOutputTokens),
  };
  const reserved = reserveGenerationCost(
    bounded,
    inputTokenBound(instructions, input),
    bounded.maxOutputTokens,
  );
  // The reservation and its receipt are one transaction under the shared daily-budget lock.
  const reservation = await db.transaction(async (tx) => {
    const within = await reservePublicAnswerBudget(tx, reserved, config.dailyLimitMicros, mode);
    if (!within) {
      const id = await writeReceipt(
        tx,
        source,
        question,
        {
          tier: "none",
          outcome: "limited",
          kind: "other",
          answer: copy.budget,
          cited: [],
          reason: "budget",
        },
        now,
      );
      return { id, limited: true as const };
    }
    const [row] = await tx
      .insert(butlerAnswers)
      .values({
        listingId: source.listingId,
        manifestId: source.manifestId,
        locale: source.locale,
        tier: "text",
        // In flight: counts against the budget and is shown to nobody until it is settled.
        outcome: "rejected",
        questionKind: "other",
        question,
        answer: null,
        reason: "in_flight",
        textExpiresAt: new Date(now.getTime() + answerTextRetentionDays * 86_400_000),
        promptVersion: publicAnswerPromptVersion,
        billingMode: mode,
        reservedCostMicros: reserved,
      })
      .returning({ id: butlerAnswers.id });
    if (!row) throw new Error("Butler answer receipt insert failed");
    return { id: row.id, limited: false as const };
  });
  if (reservation.limited) return { kind: "limited", receiptId: reservation.id };

  const settle = async (values: Partial<typeof butlerAnswers.$inferInsert>) => {
    await db.update(butlerAnswers).set(values).where(eq(butlerAnswers.id, reservation.id));
  };
  let generation: Generation;
  try {
    generation = await generate(
      bounded,
      instructions,
      input,
      publicAnswerJsonSchema,
      publicAnswerSchemaName,
    );
  } catch (error) {
    // The cost of a failed call is unknown; the reservation stays, as for every other task.
    await settle({ outcome: "rejected", reason: safeCode(error), answer: copy.unknown });
    return { kind: "answered", receiptId: reservation.id, outcome: "rejected" };
  }
  let actual: number | null | undefined;
  try {
    actual = generationCost(config, generation);
  } catch {
    actual = undefined;
  }
  const usage = {
    inputTokens: generation.inputTokens,
    outputTokens: generation.outputTokens,
    routing: generation.routing ?? null,
    ...(actual === undefined ? {} : { actualCostMicros: actual }),
  };
  const verdict = validatePublicAnswer(generation.output, answerSourceTexts(source), source.locale);
  switch (verdict.kind) {
    case "answered":
      await settle({
        ...usage,
        outcome: "answered",
        reason: null,
        answer: verdict.text,
        citedSources: [...verdict.cited],
      });
      return { kind: "answered", receiptId: reservation.id, outcome: "answered" };
    case "unknown":
      await settle({ ...usage, outcome: "unknown", reason: "model_unknown", answer: copy.unknown });
      return { kind: "answered", receiptId: reservation.id, outcome: "unknown" };
    case "refused":
      await settle({
        ...usage,
        outcome: "refused",
        reason: `model_refusal_${verdict.refusal}`,
        answer: refusalText(source.locale, verdict.refusal),
      });
      return { kind: "answered", receiptId: reservation.id, outcome: "refused" };
    case "rejected":
      await settle({
        ...usage,
        outcome: "rejected",
        reason: `validation_${verdict.reason}`,
        answer: copy.unknown,
      });
      return { kind: "answered", receiptId: reservation.id, outcome: "rejected" };
  }
}

export async function askAboutListing(
  db: Executor,
  input: AskInput,
  deps: AskDeps = {},
): Promise<AskResult> {
  const env = deps.env ?? process.env;
  if (!publicAnswersEnabled(env)) return { kind: "off" };
  const now = input.now ?? new Date();
  const question = cleanQuestion(input.question);
  if (!question) return { kind: "invalid", reason: "empty" };
  if ([...question].length > maxQuestionLength) return { kind: "invalid", reason: "too_long" };
  if (!(await withinLimit(db, "butler_answer.ip", input.clientIp, now)))
    return { kind: "limited", receiptId: null };
  const source = await loadPublicAnswerSource(db, {
    reference: input.reference,
    locale: input.locale,
    now,
  });
  if (!source) return { kind: "not_found" };
  const copy = butlerAnswersCopy(source.locale);
  const routed = routeQuestion(question);
  const done = async (receipt: Receipt): Promise<AskResult> => ({
    kind: "answered",
    receiptId: await writeReceipt(db, source, question, receipt, now),
    outcome: receipt.outcome,
  });

  if (routed.injection)
    return done({
      tier: "none",
      outcome: "refused",
      kind: "injection",
      answer: injectionText(source.locale),
      cited: [],
      reason: "injection",
    });
  if (routed.refusal)
    return done({
      tier: "none",
      outcome: "refused",
      kind: routed.kind,
      answer: refusalText(source.locale, routed.refusal),
      cited: [],
    });
  if (routed.facts.length > 0) {
    const answer = answerFromFacts(routed.facts, source, input.labels);
    return done({
      tier: "facts",
      outcome: answer.outcome,
      kind: routed.kind,
      answer: answer.text,
      cited: answer.sources,
    });
  }
  // The model reads only what the question's own words could not settle.
  const config = deps.config ?? assistanceConfig(env);
  if (!publicTextTierAvailable(config))
    return done({
      tier: "none",
      outcome: "unknown",
      kind: "other",
      answer: copy.unknown,
      cited: [],
      reason: "text_tier_off",
    });
  if (!(await withinLimit(db, "butler_answer_model.ip", input.clientIp, now)))
    return { kind: "limited", receiptId: null };
  return textTier(db, source, question, config, deps.generate ?? requestGeneration, now);
}

export interface AnswerReceiptView {
  readonly id: string;
  readonly tier: AnswerTier;
  readonly outcome: AnswerOutcome;
  readonly question: string;
  readonly answer: string;
  readonly citedSources: readonly SourceKey[];
}

/** The receipt a visitor was sent back to; only while its text is kept and only for this listing. */
export async function readAnswerReceipt(
  db: Executor,
  input: { id: string; listingId: string; now?: Date },
): Promise<AnswerReceiptView | null> {
  const [row] = await db
    .select()
    .from(butlerAnswers)
    .where(
      and(
        eq(butlerAnswers.id, input.id),
        eq(butlerAnswers.listingId, input.listingId),
        gt(butlerAnswers.textExpiresAt, input.now ?? new Date()),
        isNotNull(butlerAnswers.answer),
        isNotNull(butlerAnswers.question),
      ),
    );
  if (!row?.answer || !row.question) return null;
  // An in-flight text call is not an answer yet.
  if (row.reason === "in_flight") return null;
  return {
    id: row.id,
    tier: row.tier,
    outcome: row.outcome,
    question: row.question,
    answer: row.answer,
    citedSources: row.citedSources,
  };
}

export interface VisitorQuestionRow {
  readonly id: string;
  readonly createdAt: Date;
  readonly outcome: AnswerOutcome;
  readonly tier: AnswerTier;
  readonly question: string | null;
}

/** Staff list: recent questions on one listing, newest first. */
export async function listVisitorQuestions(
  db: Executor,
  listingId: string,
  limit = 20,
): Promise<VisitorQuestionRow[]> {
  const rows = await db
    .select({
      id: butlerAnswers.id,
      createdAt: butlerAnswers.createdAt,
      outcome: butlerAnswers.outcome,
      tier: butlerAnswers.tier,
      question: butlerAnswers.question,
      reason: butlerAnswers.reason,
    })
    .from(butlerAnswers)
    .where(eq(butlerAnswers.listingId, listingId))
    .orderBy(desc(butlerAnswers.createdAt))
    .limit(limit);
  return rows.filter((row) => row.reason !== "in_flight").map(({ reason: _reason, ...row }) => row);
}

/** Clears question and answer text past its retention window; the receipt itself stays. */
export async function pruneAnswerText(db: Executor, now = new Date()): Promise<number> {
  const rows = await db
    .update(butlerAnswers)
    .set({ question: null, answer: null })
    .where(
      and(
        lt(butlerAnswers.textExpiresAt, now),
        or(isNotNull(butlerAnswers.question), isNotNull(butlerAnswers.answer)),
      ),
    )
    .returning({ id: butlerAnswers.id });
  return rows.length;
}
