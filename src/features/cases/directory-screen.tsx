// O04 cases index (Figma 14:1847 desktop, 14:4522 mobile; ux-spec §O04, L16): search by case
// number or title over listCases, then one row per visible case with its type, purpose, stage,
// disposition and accountable owner. Search and every state are GET links or forms, so the
// page works without JavaScript.
//
// listCases returns no owner id, needs-action flag, party, next action, cursor or total, so the
// Figma's Mine / Needs action views, Filters, pagination and "open the case waiting for action"
// are left out rather than computed from its capped page of 50.
import "server-only";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/db/client";
import type { Session } from "@/server/auth/sessions";
import { listCases } from "@/server/cases/queries";
import { isAppError } from "@/server/errors";
import { buttonClass } from "@/ui/button-class";
import { cx } from "@/ui/cx";
import { EmptyState } from "@/ui/empty-state";
import { controlClass } from "@/ui/field-class";
import { ChevronEndIcon, FolderIcon } from "@/ui/icons";
import { workCopy } from "../work/copy";
import { coverageCopy } from "../work/coverage-copy";
import { caseCopy } from "./copy";
import { caseKindLabel, caseStageLabel, directoryCopy } from "./directory-copy";
import { lifecycleCopy } from "./lifecycle-copy";

// listCases searches the first 120 characters and returns at most 50 rows, newest update first
// (src/server/cases/queries.ts); the page states both limits instead of hiding them.
const searchLimit = 120;
const rowLimit = 50;

export async function CaseDirectoryScreen({
  locale,
  session,
  search = "",
}: {
  locale: string;
  session: Session;
  search?: string;
}) {
  const copy = directoryCopy(locale);
  const c = caseCopy(locale);
  const typed = search.trim();
  const q = typed.slice(0, searchLimit);
  // A failed read is its own state; it never renders as an empty list.
  const rows = await listCases(getDb(), session, q).catch((error: unknown) => {
    unstable_rethrow(error);
    console.error(
      "[O04] case list unavailable:",
      isAppError(error) ? error.code : error instanceof Error ? error.name : typeof error,
    );
    return null;
  });
  const href = (term: string) =>
    `/${locale}/cases${term ? `?${new URLSearchParams({ q: term })}` : ""}`;
  const link = "font-semibold text-action underline underline-offset-4";

  return (
    <div className="flex flex-col gap-6 px-gutter py-5 sm:gap-8 sm:px-gutter-wide sm:py-8">
      <header className="flex flex-col gap-6 sm:gap-8">
        <h1 className="text-heading font-semibold sm:text-title">{c.cases}</h1>
        <p className="text-text-muted">{copy.instruction}</p>
      </header>
      <search>
        {/* Figma: the button sits under the field on phones and beside it on wider screens. */}
        <form method="get" className="flex flex-col items-start gap-4 sm:flex-row sm:items-end">
          <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-1">
            <label htmlFor="case-search" className="text-dense font-semibold">
              {copy.search}
            </label>
            <input
              id="case-search"
              name="q"
              type="search"
              maxLength={searchLimit}
              defaultValue={q}
              aria-describedby="case-search-hint"
              // UI06 search on O04: 52 px on the canvas fill, level with the 52 px button.
              className={cx(controlClass, "min-h-13! bg-canvas! py-2")}
            />
            <p id="case-search-hint" className="sr-only">
              {copy.searchHint}
            </p>
          </div>
          <button type="submit" className={buttonClass("secondary", "sm:min-h-13")}>
            {copy.apply}
          </button>
        </form>
      </search>
      {typed.length > searchLimit ? (
        <p role="status" className="text-dense text-text-muted">
          {copy.shortened.replace("{n}", String(searchLimit))}
        </p>
      ) : null}
      {rows === null ? (
        <EmptyState
          kind="failed"
          title={copy.failed}
          action={
            <a href={href(q)} className={buttonClass("secondary")}>
              {copy.retry}
            </a>
          }
        >
          {copy.failedDetail}
        </EmptyState>
      ) : rows.length === 0 ? (
        q ? (
          <EmptyState
            kind="filtered"
            title={copy.noMatch}
            criteria={
              <span className="max-w-full rounded-control bg-subtle px-2 py-0.5 text-dense wrap-anywhere">
                {copy.search}: <bdi>{q}</bdi>
              </span>
            }
            action={
              <a href={href("")} className={link}>
                {copy.clear}
              </a>
            }
          />
        ) : (
          <EmptyState
            kind="new"
            title={copy.empty}
            action={
              <a href={`/${locale}/inquiries`} className={link}>
                {copy.inquiries}
              </a>
            }
          >
            {copy.emptyDetail}
          </EmptyState>
        )
      ) : (
        <>
          <ul aria-label={copy.list} className="divide-y divide-divider border-b border-divider">
            {rows.map((row) => (
              <li key={row.id}>
                <a
                  href={`/${locale}/cases/${row.id}`}
                  className="flex min-h-19 items-center gap-4 p-4 text-dense text-text no-underline hover:bg-subtle"
                >
                  <FolderIcon className="size-5 text-text-muted" />
                  {/* The spaces between the lines keep them apart in the link's accessible name. */}
                  <span className="flex min-w-0 flex-1 flex-col gap-1 wrap-anywhere">
                    <span className="font-semibold">
                      <bdi>{row.reference}</bdi> · {caseKindLabel(row.kind, locale)}
                    </span>{" "}
                    <span className="font-medium text-text-muted">
                      <bdi>{row.title}</bdi> · {caseStageLabel(row.stage, locale)}
                    </span>{" "}
                    <span className="font-medium text-text-muted">
                      {row.disposition !== "active" ? (
                        <>
                          <span className="font-semibold text-text">
                            {row.disposition === "paused"
                              ? lifecycleCopy(locale).pause
                              : lifecycleCopy(locale).closed}
                          </span>
                          {" · "}
                        </>
                      ) : null}
                      <Owner row={row} locale={locale} />
                    </span>
                  </span>
                  <ChevronEndIcon directional className="size-5 text-text-muted" />
                </a>
              </li>
            ))}
          </ul>
          <p className="text-dense text-text-muted">
            {rows.length >= rowLimit
              ? copy.bounded
              : copy.count.replace("{n}", new Intl.NumberFormat(locale).format(rows.length))}
          </p>
        </>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <a href={`/${locale}/operations`} className={buttonClass("tertiary", "text-text")}>
          {copy.moreTools}
        </a>
      </div>
    </div>
  );
}

/** The accountable broker, or agency coverage when that owner is no longer available. */
function Owner({
  row,
  locale,
}: {
  row: { ownerName: string | null; needsCoverage: boolean; disposition: string };
  locale: string;
}) {
  if (row.needsCoverage && row.disposition !== "closed") {
    const coverage = coverageCopy(locale);
    return (
      <>
        {coverage.title}
        {row.ownerName ? ` · ${coverage.owner}: ${row.ownerName}` : null}
      </>
    );
  }
  return (
    <>
      {caseCopy(locale).owned}: {row.ownerName ?? workCopy(locale).noOwner}
    </>
  );
}
