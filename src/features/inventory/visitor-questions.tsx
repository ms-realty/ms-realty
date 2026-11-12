// What visitors asked Butler on this listing's public page, with the outcome of each (ADR 0017).
// Read-only; it sits in the listing's secondary area so a recurring "the listing does not say"
// becomes a prompt to complete the listing text or facts.
import { getDb } from "@/db/client";
import { answerTextRetentionDays } from "@/domain/public-answer";
import { formatDateTime } from "@/i18n/format";
import { listVisitorQuestions } from "@/server/ai/public-answer";
import { fill, visitorQuestionsCopy } from "@/server/ai/public-answer-copy";

export async function VisitorQuestions({
  locale,
  listingId,
}: {
  locale: string;
  listingId: string;
}) {
  const rows = await listVisitorQuestions(getDb(), listingId, 10).catch(() => null);
  if (rows === null) return null;
  const copy = visitorQuestionsCopy(locale);
  const dateLocale = locale === "bg" || locale === "ru" ? locale : "en";
  const unanswered = rows.some((row) => row.outcome === "unknown");
  return (
    <section
      aria-labelledby="visitor-questions-heading"
      className="grid gap-3 border-t border-divider pt-4"
    >
      <h2 id="visitor-questions-heading" className="text-dense font-semibold">
        {copy.heading}
      </h2>
      <p className="text-caption text-text-muted">
        {fill(copy.about, { days: answerTextRetentionDays })}
      </p>
      {rows.length === 0 ? (
        <p className="text-dense">{copy.empty}</p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((row) => (
            <li key={row.id} className="grid gap-1 text-dense">
              <p className="break-words">
                {row.question ? <bdi dir="auto">{row.question}</bdi> : copy.expired}
              </p>
              <p className="text-caption text-text-muted">
                {copy.outcomes[row.outcome]},{" "}
                {formatDateTime(dateLocale, row.createdAt.toISOString())}
              </p>
            </li>
          ))}
        </ul>
      )}
      {unanswered ? <p className="text-caption text-text-muted">{copy.hint}</p> : null}
    </section>
  );
}
