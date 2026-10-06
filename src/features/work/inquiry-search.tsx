"use client";
// O02 search above the queue (Figma "Търсене в разговори"). It posts the term to a Server
// Action with useActionState, so the same form works as a native POST before JavaScript; the
// term stays in the request body and this form's input, never in a URL or link. Results
// replace the server-rendered queue (children) until "Back to the queue" reloads it.

import { type ReactNode, useActionState, useEffect, useRef } from "react";
import { buttonClass } from "@/ui/button-class";
import { cx } from "@/ui/cx";
import { controlClass } from "@/ui/field-class";
import { SearchIcon } from "@/ui/icons";
import { workCopy } from "./copy";
import { type InboxScope, InquiryRow, inquiryHref } from "./inquiry-row";
import {
  type InquirySearchState,
  initialInquirySearch,
  searchTermLimit,
} from "./inquiry-search-state";

const pageButton = "min-h-control font-semibold text-link underline underline-offset-4";

export function InquirySearch({
  action,
  permalink,
  locale,
  scope,
  page,
  selectedId,
  clearHref,
  nested = false,
  children,
  aside,
}: {
  action: (state: InquirySearchState, data: FormData) => Promise<InquirySearchState>;
  /** This page's own address (scope and page kept) plus #inquiry-search; never the term. */
  permalink: string;
  locale: string;
  scope: InboxScope;
  page: number;
  /** The conversation open beside the queue, if any. */
  selectedId?: string;
  clearHref: string;
  /** Inside the conversation page's queue column, whose own heading is an h2. */
  nested?: boolean;
  /** The queue as the server rendered it; results replace it. */
  children: ReactNode;
  /** Why the queue lists nothing, beside it; it says nothing about search results. */
  aside?: ReactNode;
}) {
  const copy = workCopy(locale);
  const text = copy.queue;
  const [state, formAction, pending] = useActionState(action, initialInquirySearch, permalink);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const { outcome } = state;
  const Heading = nested ? "h3" : "h2";

  useEffect(() => {
    if (state.responseId === initialInquirySearch.responseId) return;
    if (state.outcome.kind === "invalid") input.current?.focus();
    if (state.outcome.kind === "results") heading.current?.focus();
  }, [state]);

  useEffect(() => {
    // Desktop split: show the open conversation's row inside the scrolling queue column,
    // without moving the page itself.
    const column = root.current?.closest<HTMLElement>("[data-inquiry-queue]");
    const row = column?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!column || !row) return;
    const area = column.getBoundingClientRect();
    const box = row.getBoundingClientRect();
    if (box.top < area.top || box.bottom > area.bottom)
      column.scrollTop += box.top - area.top - area.height / 3;
  }, []);

  const message = outcome.kind === "invalid" || outcome.kind === "failed" ? outcome.message : null;
  return (
    <>
      <div ref={root} className="flex min-w-0 flex-col gap-4">
        <search id="inquiry-search" className="scroll-mt-6">
          <form
            action={formAction}
            noValidate
            aria-busy={pending}
            // Keep the submitted term in the field: React resets uncontrolled fields after an action.
            onReset={(event) => event.preventDefault()}
            className="flex flex-col gap-2"
          >
            <label htmlFor="inquiry-search-q" className="text-dense font-semibold">
              {text.search}
            </label>
            {/* The field keeps the design's full width; the submit is a compact icon button. */}
            <div className="flex gap-2">
              <input
                ref={input}
                id="inquiry-search-q"
                name="q"
                type="search"
                maxLength={searchTermLimit}
                defaultValue={state.q}
                aria-invalid={outcome.kind === "invalid" || undefined}
                aria-describedby={cx(
                  "inquiry-search-hint",
                  message !== null && "inquiry-search-message",
                )}
                className={cx(controlClass, "min-h-12 min-w-0 flex-1 py-2")}
              />
              <button type="submit" className={buttonClass("secondary", "min-h-12 px-3")}>
                <SearchIcon />
                <span className="sr-only">{text.searchSubmit}</span>
              </button>
            </div>
            <p id="inquiry-search-hint" className="sr-only">
              {text.searchHint}
            </p>
            {message !== null ? (
              <p
                id="inquiry-search-message"
                role={outcome.kind === "failed" ? "alert" : undefined}
                className="text-dense font-semibold text-error"
              >
                {message}
              </p>
            ) : null}
          </form>
        </search>
        {outcome.kind === "results" ? (
          <section
            aria-labelledby="inquiry-search-results"
            aria-busy={pending}
            className="flex min-w-0 flex-col gap-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <Heading
                id="inquiry-search-results"
                ref={heading}
                tabIndex={-1}
                className="text-subheading font-semibold"
              >
                {text.results}
              </Heading>
              <a href={clearHref} className="text-dense text-action underline">
                {text.clearSearch}
              </a>
            </div>
            {outcome.rows.length ? (
              <ul
                aria-label={text.results}
                className="divide-y divide-divider border-b border-divider"
              >
                {outcome.rows.map((row) => (
                  <InquiryRow
                    key={row.id}
                    row={row}
                    locale={locale}
                    href={inquiryHref(locale, row.id, scope, page)}
                    current={row.id === selectedId}
                  />
                ))}
              </ul>
            ) : (
              <p className="rounded-panel bg-subtle p-6">{text.noResults}</p>
            )}
            {outcome.page > 1 || outcome.hasMore ? (
              // Later result pages are POSTed too: the term rides in this hidden field, not a link.
              <form action={formAction} className="flex flex-wrap gap-6 py-2">
                <input type="hidden" name="q" value={state.q} />
                {outcome.page > 1 ? (
                  <button type="submit" name="page" value={outcome.page - 1} className={pageButton}>
                    {copy.previous}
                  </button>
                ) : null}
                {outcome.hasMore ? (
                  <button type="submit" name="page" value={outcome.page + 1} className={pageButton}>
                    {copy.next}
                  </button>
                ) : null}
              </form>
            ) : null}
          </section>
        ) : (
          children
        )}
      </div>
      {outcome.kind === "results" ? null : aside}
    </>
  );
}
