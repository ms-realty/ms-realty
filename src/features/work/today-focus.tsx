// O01 focus state (the Today page of Figma 10:285 desktop and 14:4354 mobile, narrowed to one
// queue): /{locale}/today?queue=translation-reviews&after=<cursor> pages the translation
// reviews the person may review, 30 at a time and oldest first, past the rows Today shows. The
// only read is the server's listTranslationReviews, which rechecks grants on every page and
// binds its opaque cursor to the actor and the queue. A cursor it refuses is a link that is no
// longer valid, never a failure or an empty list; a read that failed is Today's failed state,
// never an empty one. Plain links only, so every state works without JavaScript.
import "server-only";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/db/client";
import type { Session } from "@/server/auth/sessions";
import type { Executor } from "@/server/db";
import { isAppError } from "@/server/errors";
import { listTranslationReviews } from "@/server/work/queries";
import { buttonClass } from "@/ui/button-class";
import { ChevronEndIcon, ChevronStartIcon } from "@/ui/icons";
import { Notice } from "@/ui/notice";
import { workCopy } from "./copy";
import { todayCopy } from "./today-copy";
import { accessErrors, TranslationRow, translationReviewsHref } from "./today-screen";

/** listTranslationReviews with the status Today gives every queue it reads. */
export async function readTranslationReviews(db: Executor, session: Session, after?: string) {
  try {
    return { status: "ready" as const, ...(await listTranslationReviews(db, session, after)) };
  } catch (error) {
    unstable_rethrow(error);
    if (isAppError(error)) {
      // A cursor the server will not continue: malformed, stale, or another person's or queue's.
      if (error.code === "validation_failed" && after !== undefined)
        return { status: "invalid_cursor" as const };
      if (accessErrors.includes(error.code)) throw error;
    }
    // Name the failure class only: rows never reach a log line.
    console.error(
      "[O01] Translation reviews unavailable:",
      isAppError(error) ? error.code : error instanceof Error ? error.name : typeof error,
    );
    return { status: "unavailable" as const };
  }
}

export async function TranslationReviewsScreen({
  locale,
  session,
  after,
  now = new Date(),
}: {
  locale: string;
  session: Session;
  /** The opaque cursor from the previous page's "Next page" link. */
  after?: string;
  now?: Date;
}) {
  const t = todayCopy(locale);
  const page = await readTranslationReviews(getDb(), session, after);
  const title = t.groups.translationReviews;
  const first = translationReviewsHref(locale);
  const lead =
    page.status === "unavailable"
      ? t.leadFailed
      : page.status === "invalid_cursor"
        ? null
        : page.total
          ? t.focus.lead.replace("{n}", new Intl.NumberFormat(locale).format(page.total))
          : t.focus.empty;
  // Nothing after the previous page any more, though the cursor itself was valid.
  const ended = page.status === "ready" && after !== undefined && !page.rows.length;
  const state =
    page.status === "unavailable"
      ? "failed"
      : page.status === "invalid_cursor"
        ? "invalid-link"
        : ended
          ? "ended"
          : page.rows.length
            ? "ready"
            : "empty";
  return (
    <div
      className="mx-auto flex min-w-0 max-w-page flex-col gap-6 break-words p-gutter sm:gap-8 sm:p-gutter-wide"
      data-today-focus="translation-reviews"
      data-today-state={state}
    >
      <header className="flex flex-col gap-6 sm:gap-8">
        <div className="flex flex-col gap-2">
          <a
            href={`/${locale}/today`}
            className="flex min-h-control w-fit items-center gap-2 text-dense font-semibold text-text no-underline hover:text-action"
          >
            <ChevronStartIcon directional className="text-text-muted" />
            {t.focus.back}
          </a>
          <h1 className="text-heading font-semibold sm:text-title">{title}</h1>
        </div>
        {lead ? <p className="text-text-muted">{lead}</p> : null}
      </header>
      {/* Failed and refused-link states sit under the header as Today's failed state does
          (Figma O01 · Error); the list keeps Today's primary column width. */}
      {page.status === "unavailable" ? (
        <div className="flex flex-col items-start gap-4">
          <Notice tone="error" className="w-full">
            {t.queueFailed}
          </Notice>
          <a href={translationReviewsHref(locale, after)} className={buttonClass("primary")}>
            {t.reload}
          </a>
        </div>
      ) : page.status === "invalid_cursor" || ended ? (
        <div className="flex flex-col items-start gap-4">
          <Notice tone="info" className="w-full">
            {ended ? t.focus.emptyLater : t.focus.invalid}
          </Notice>
          <a href={first} className={buttonClass("primary")}>
            {t.focus.first}
          </a>
        </div>
      ) : page.rows.length ? (
        <div className="grid min-w-0 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_23.1875rem]">
          <div className="flex min-w-0 flex-col items-start gap-6">
            {after !== undefined ? (
              <p className="text-dense text-text-muted">{t.focus.later}</p>
            ) : null}
            <ul aria-label={title} className="flex w-full flex-col gap-4">
              {page.rows.map((item) => (
                <TranslationRow key={item.id} locale={locale} item={item} now={now} />
              ))}
            </ul>
            {after !== undefined || page.nextCursor ? (
              <nav aria-label={t.focus.pages} className="flex flex-wrap items-center gap-3">
                {after !== undefined ? (
                  <a href={first} className={buttonClass("tertiary", "text-text")}>
                    {t.focus.first}
                  </a>
                ) : null}
                {page.nextCursor ? (
                  <a
                    href={translationReviewsHref(locale, page.nextCursor)}
                    className={buttonClass("secondary", "text-text")}
                  >
                    {workCopy(locale).next}
                    <ChevronEndIcon directional />
                  </a>
                ) : null}
              </nav>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
