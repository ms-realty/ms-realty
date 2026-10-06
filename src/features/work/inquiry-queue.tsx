import "server-only";
// O02 queue (L08): scopes → records with intent, language, age and owner → the selected
// conversation. The list page shows it beside a prompt to open a conversation; an open
// conversation (O03) shows it as a column on wide screens only, below which the queue and
// the conversation are separate routes. A failed read says so and never reads as "no work".

import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/db/client";
import type { Session } from "@/server/auth/sessions";
import { listInbox } from "@/server/work/queries";
import { buttonClass } from "@/ui/button-class";
import { cx } from "@/ui/cx";
import { EmptyState } from "@/ui/empty-state";
import { InfoIcon } from "@/ui/icons";
import { SkipLink } from "@/ui/skip-link";
import { workCopy } from "./copy";
import {
  type InboxScope,
  InquiryRow,
  type InquiryRowView,
  inboxScopes,
  inquiryHref,
  queueHref,
} from "./inquiry-row";
import { inquiryRowView } from "./inquiry-row-view";
import { InquirySearch } from "./inquiry-search";
import { searchInquiriesAction } from "./inquiry-search-action";

export type QueueRead = { ok: true; rows: InquiryRowView[]; hasMore: boolean } | { ok: false };
/** The open conversation's column (O03), the queue column's skip-link target. */
export const conversationId = "conversation";

const pageLink = "min-h-control font-semibold text-link underline underline-offset-4";

export async function InquiryQueue({
  locale,
  session,
  scope,
  page,
  selectedId,
}: {
  locale: string;
  session: Session;
  scope: InboxScope;
  page: number;
  selectedId?: string;
}) {
  let read: QueueRead;
  try {
    // Every queue scope is a view the read service accepts (a type error otherwise).
    const queue = await listInbox(getDb(), session, scope, page);
    const now = new Date();
    read = {
      ok: true,
      rows: queue.rows.map((row) => inquiryRowView(row, locale, now)),
      hasMore: queue.hasMore,
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("O02 inquiry queue read failed", error);
    read = { ok: false };
  }
  return (
    <InquiryQueueView
      locale={locale}
      scope={scope}
      page={page}
      selectedId={selectedId}
      read={read}
    />
  );
}

export function InquiryQueueView({
  locale,
  scope,
  page,
  selectedId,
  read,
}: {
  locale: string;
  scope: InboxScope;
  page: number;
  selectedId?: string;
  read: QueueRead;
}) {
  const copy = workCopy(locale);
  const text = copy.queue;
  const nested = Boolean(selectedId);
  const base = selectedId ? `/${locale}/inquiries/${selectedId}` : `/${locale}/inquiries`;
  const Heading = nested ? "h3" : "h2";
  const search = (
    <InquirySearch
      action={searchInquiriesAction.bind(null, locale)}
      permalink={`${queueHref(base, scope, page)}#inquiry-search`}
      locale={locale}
      scope={scope}
      page={page}
      selectedId={selectedId}
      clearHref={queueHref(base, scope, page)}
      nested={nested}
    >
      <nav aria-label={text.views}>
        <ul className="grid grid-cols-6 gap-1 rounded-control bg-subtle p-1 sm:grid-cols-5 lg:grid-cols-6">
          {inboxScopes.map((key, index) => (
            <li
              key={key}
              className={
                index < 3
                  ? "col-span-2 flex sm:col-span-1 lg:col-span-2"
                  : "col-span-3 flex sm:col-span-1 lg:col-span-3"
              }
            >
              <a
                href={queueHref(base, key)}
                // Beside an open conversation the scope is current, but it is not this page.
                aria-current={key === scope ? (nested ? "true" : "page") : undefined}
                className={cx(
                  "flex min-h-[2.875rem] w-full items-center justify-center rounded-control px-2 py-3 text-center text-dense font-semibold no-underline wrap-anywhere",
                  key === scope
                    ? "bg-canvas text-text"
                    : "text-text-muted hover:bg-canvas/60 hover:text-text",
                )}
              >
                {copy.scopes[key]}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {!read.ok ? (
        <EmptyState
          kind="failed"
          title={text.failed}
          headingLevel={nested ? 3 : 2}
          action={
            <a href={queueHref(base, scope, page)} className={buttonClass("secondary")}>
              {text.retry}
            </a>
          }
        >
          <p>{text.failedNote}</p>
        </EmptyState>
      ) : read.rows.length ? (
        <ul aria-label={text.list} className="divide-y divide-divider border-b border-divider">
          {read.rows.map((row) => (
            <InquiryRow
              key={row.id}
              row={row}
              locale={locale}
              href={inquiryHref(locale, row.id, scope, page)}
              current={row.id === selectedId}
            />
          ))}
        </ul>
      ) : page > 1 ? (
        // A later page can empty while earlier ones still hold work: not "nothing to do".
        <div className="flex flex-col items-start gap-3 rounded-panel bg-subtle p-6">
          <p>{text.pageEmpty}</p>
          <a href={queueHref(base, scope)} className="text-action underline">
            {text.firstPage}
          </a>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-panel bg-subtle p-6">
          <Heading className="text-subheading font-semibold">{copy.scopeEmpty[scope]}</Heading>
          <p className="text-text-muted">{copy.scopeEmptyNotes[scope]}</p>
          {scope === "unassigned" ? (
            <a href={`/${locale}/coverage`} className={buttonClass("secondary")}>
              {text.checkCoverage}
            </a>
          ) : null}
        </div>
      )}
      {read.ok && (page > 1 || read.hasMore) ? (
        <nav aria-label={text.pages} className="flex flex-wrap gap-6">
          {page > 1 ? (
            <a className={pageLink} href={queueHref(base, scope, page - 1)}>
              {copy.previous}
            </a>
          ) : null}
          {read.hasMore ? (
            <a className={pageLink} href={queueHref(base, scope, page + 1)}>
              {copy.next}
            </a>
          ) : null}
        </nav>
      ) : null}
    </InquirySearch>
  );
  if (nested)
    return (
      <section
        data-inquiry-queue
        aria-labelledby="inquiry-queue-heading"
        className="hidden min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:p-1.5"
      >
        {/* The queue precedes the conversation; keyboard users can pass its rows at once. */}
        <SkipLink targetId={conversationId}>{text.skip}</SkipLink>
        <h2 id="inquiry-queue-heading" className="text-subheading font-semibold">
          {copy.inbox}
        </h2>
        {search}
      </section>
    );
  return (
    <>
      {search}
      {read.ok && read.rows.length ? (
        <p className="flex items-start gap-3 rounded-control bg-subtle p-4 text-dense">
          <InfoIcon className="mt-px size-5 shrink-0" />
          {text.open}
        </p>
      ) : null}
    </>
  );
}
