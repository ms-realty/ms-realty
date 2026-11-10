// "Ask about this home" (ADR 0017). One self-contained block for the public listing page:
//   <ButlerAnswers listing={listing} locale={locale} query={butlerParam} />
// With the brand switch or the environment kill switch off it renders nothing, and the page is
// the inquiry form alone. It reads only what the listing page itself shows.

import { butlerLevels } from "@/config/tenant";
import { getDb } from "@/db/client";
import type { PublicLocale } from "@/domain/ids";
import { maxQuestionLength } from "@/domain/public-answer";
import { publicAnswersEnabled } from "@/server/ai/public-answer-config";
import { butlerAnswersCopy } from "@/server/ai/public-answer-copy";
import { suggestedQuestions } from "@/server/ai/public-answer-facts";
import { loadPublicAnswerSource } from "@/server/ai/public-answer-source";
import { AskForm } from "./ask-form";
import { notePanel, panelForQuery } from "./panel";

export async function ButlerAnswers({
  reference,
  locale,
  butler,
}: {
  reference: string;
  locale: PublicLocale;
  /** The page's `butler` query parameter after a post without JavaScript. */
  butler?: string | string[] | undefined;
}) {
  if (butlerLevels.publicAnswers !== "act" || !publicAnswersEnabled()) return null;
  const db = getDb();
  const source = await loadPublicAnswerSource(db, { reference, locale }).catch(() => null);
  if (!source) return null;
  const copy = butlerAnswersCopy(locale);
  const listing = {
    reference: source.reference,
    manifestId: source.manifestId,
    listingId: source.listingId,
  };
  const param = typeof butler === "string" ? butler : undefined;
  const initial = await panelForQuery(db, locale, listing, param).catch(() => null);
  const suggestions = suggestedQuestions(source).map((kind) => copy.suggest[kind]);
  return (
    <section
      id="ask-butler"
      aria-labelledby="ask-butler-heading"
      className="flex max-w-reading min-w-0 flex-col gap-4 border-t border-divider pt-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id="ask-butler-heading" className="text-section font-semibold">
          {copy.heading}
        </h2>
        <p className="text-compact text-text-muted">{copy.intro}</p>
      </div>
      <AskForm
        action={`/${locale}/butler/answer`}
        reference={source.reference}
        manifestId={source.manifestId}
        maxLength={maxQuestionLength}
        copy={{
          label: copy.label,
          hint: copy.hint,
          submit: copy.submit,
          pending: copy.pending,
          suggestions: copy.suggestions,
          answerLabel: copy.answerLabel,
          asked: copy.asked,
          handoff: copy.handoff,
          handoffNote: copy.handoffNote,
        }}
        suggestions={suggestions}
        initial={initial}
        failed={notePanel(locale, listing, "failed")}
      />
    </section>
  );
}
