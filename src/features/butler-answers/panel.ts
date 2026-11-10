// Server side of the "Ask about this home" block (ADR 0017): turns a receipt or an ask result into
// what the page shows. Shared by the listing page (no-JavaScript round trip) and the JSON reply
// to the enhanced form, so both render the same words.
import "server-only";
import { isUuid, type PublicLocale } from "@/domain/ids";
import { maxQuestionLength, type SourceKey } from "@/domain/public-answer";
import { type AskResult, readAnswerReceipt } from "@/server/ai/public-answer";
import { butlerAnswersCopy, butlerAnswerText, fill } from "@/server/ai/public-answer-copy";
import { readApprovedContent } from "@/server/content/public";
import type { Executor } from "@/server/db";

export interface AnswerPanel {
  /** What the visitor asked; absent for a note that is not about one question. */
  readonly question: string | null;
  /** The answer, or the note that explains why there is none. */
  readonly text: string;
  readonly kind: "answer" | "note";
  readonly sourceLine: string | null;
  /** The existing inquiry form for this listing, with the question prefilled. */
  readonly handoffHref: string;
}

export interface PanelListing {
  readonly reference: string;
  readonly manifestId: string;
}

export function handoffHref(locale: PublicLocale, listing: PanelListing, question?: string | null) {
  const query = new URLSearchParams({
    purpose: "question",
    reference: listing.reference,
    manifest: listing.manifestId,
  });
  if (question) query.set("question", question.slice(0, maxQuestionLength));
  return `/${locale}/inquire?${query}`;
}

async function sourceLine(
  db: Executor,
  locale: PublicLocale,
  reference: string,
  cited: readonly SourceKey[],
): Promise<string | null> {
  if (cited.length === 0) return null;
  const copy = butlerAnswersCopy(locale).sources;
  const guide = cited.find((key) => key.startsWith("area:"));
  if (guide) {
    const content = await readApprovedContent(db, "area", guide.slice(5), locale).catch(() => null);
    return content ? fill(copy.area, { title: content.title }) : copy.description;
  }
  if (cited.includes("listing.description") || cited.includes("listing.title"))
    return copy.description;
  if (cited.every((key) => key === "agency.contact")) return copy.agency;
  return fill(copy.listing, { reference });
}

const notes = {
  limited: "limited",
  budget: "budget",
  failed: "failed",
  empty: "empty",
  long: "tooLong",
} as const;
export type NoteCode = keyof typeof notes;

export function notePanel(
  locale: PublicLocale,
  listing: PanelListing,
  code: NoteCode,
  question?: string | null,
): AnswerPanel {
  const copy = butlerAnswersCopy(locale);
  const key = notes[code];
  const text =
    key === "tooLong" ? butlerAnswerText(locale, "tooLong", { max: maxQuestionLength }) : copy[key];
  return {
    question: question ?? null,
    text,
    kind: "note",
    sourceLine: null,
    // A visitor who typed nothing or too much has nothing to hand off yet.
    handoffHref: handoffHref(
      locale,
      listing,
      code === "empty" || code === "long" ? null : question,
    ),
  };
}

/** The panel for the `butler` query parameter of the page after a no-JavaScript post. */
export async function panelForQuery(
  db: Executor,
  locale: PublicLocale,
  listing: PanelListing & { listingId: string },
  param: string | undefined,
): Promise<AnswerPanel | null> {
  if (!param) return null;
  if (param === "limited" || param === "empty" || param === "long" || param === "failed")
    return notePanel(locale, listing, param);
  if (!isUuid(param)) return null;
  const receipt = await readAnswerReceipt(db, { id: param, listingId: listing.listingId });
  if (!receipt) return null;
  const budget = receipt.outcome === "limited";
  if (budget) return notePanel(locale, listing, "budget", receipt.question);
  return {
    question: receipt.question,
    text: receipt.answer,
    kind: "answer",
    sourceLine:
      receipt.outcome === "answered"
        ? await sourceLine(db, locale, listing.reference, receipt.citedSources)
        : null,
    handoffHref: handoffHref(locale, listing, receipt.question),
  };
}

/** The panel for the result of asking now (the enhanced form's reply). */
export async function panelForResult(
  db: Executor,
  locale: PublicLocale,
  listing: PanelListing & { listingId: string },
  result: AskResult,
  question: string,
): Promise<AnswerPanel | null> {
  switch (result.kind) {
    case "off":
    case "not_found":
      return null;
    case "invalid":
      return notePanel(locale, listing, result.reason === "empty" ? "empty" : "long", question);
    case "limited":
      return result.receiptId
        ? panelForQuery(db, locale, listing, result.receiptId)
        : notePanel(locale, listing, "limited", question);
    case "answered":
      return panelForQuery(db, locale, listing, result.receiptId);
  }
}
