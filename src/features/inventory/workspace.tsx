// Operate: one listing, one set of section links. Keep the incumbent token system;
// identity and working/public state precede editing. Each section keeps its own authority.
import type { ReactNode } from "react";
import { workflowCopy } from "@/i18n/workflow-copy";
import { cx } from "@/ui/cx";
import { ChevronStartIcon } from "@/ui/icons";
import { inventoryCopy } from "./copy";
import { inventorySections } from "./decision-contract";
import { LeaveControl } from "./leave-control";

export function listingSections(locale: string, reference: string) {
  const copy = inventoryCopy(locale);
  const labels = workflowCopy(locale, "listingWorkspace");
  const path = `/${locale}/inventory/${reference}`;
  return [
    { id: "text", href: path, label: copy.o12.text },
    { id: "facts", href: `${path}?tab=facts`, label: copy.o12.facts },
    { id: "media", href: `${path}/media`, label: copy.o12.photos },
    { id: "documents", href: `${path}/documents`, label: labels.documents },
    { id: "evidence", href: `${path}/evidence`, label: labels.evidence },
    {
      id: "translations",
      href: `${path}?tab=review#${inventorySections.locales}`,
      label: labels.translations,
    },
    { id: "review", href: `${path}?tab=review`, label: labels.review },
  ];
}

export const listingSectionClass =
  "inline-flex min-h-control items-center justify-center border-b-2 border-transparent px-3 py-3 text-dense font-semibold no-underline text-text-muted hover:bg-subtle hover:text-text aria-[current=page]:border-action aria-[current=page]:text-action";

export function ListingNavigation({
  locale,
  reference,
  current,
  formId,
}: {
  locale: string;
  reference: string;
  current: string;
  formId?: string;
}) {
  const labels = workflowCopy(locale, "listingWorkspace");
  return (
    <nav
      aria-label={labels.navigation}
      className="flex flex-wrap items-start border-b border-divider"
    >
      {listingSections(locale, reference)
        .filter((section) => ["text", "media", "review"].includes(section.id))
        .map((section) => (
          <LeaveControl
            key={section.id}
            href={section.href}
            formId={formId}
            current={section.id === (current === "facts" ? "text" : current)}
            className={listingSectionClass}
          >
            {section.id === "text"
              ? labels.listing
              : section.id === "review"
                ? labels.reviewShort
                : section.label}
          </LeaveControl>
        ))}
      <details className="group open:basis-full">
        <summary
          className={`${listingSectionClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
        >
          {labels.more}
        </summary>
        <ul className="mb-3 flex flex-wrap gap-1 rounded-control bg-subtle p-2">
          {listingSections(locale, reference)
            .filter((section) => ["documents", "evidence", "translations"].includes(section.id))
            .map((section) => (
              <li key={section.id}>
                <LeaveControl
                  href={section.href}
                  formId={formId}
                  current={section.id === current}
                  className={listingSectionClass}
                >
                  {section.label}
                </LeaveControl>
              </li>
            ))}
        </ul>
      </details>
    </nav>
  );
}

export function ListingIdentity({
  locale,
  reference,
  title,
  meta,
  heading = false,
  summary,
  children,
}: {
  locale: string;
  reference: string;
  title?: string | null;
  meta?: string | null;
  heading?: boolean;
  summary?: ReactNode;
  children?: ReactNode;
}) {
  const copy = inventoryCopy(locale);
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-divider pb-4">
      <div className="flex min-w-0 items-start gap-3">
        <a
          href={`/${locale}/inventory`}
          className="flex min-h-control min-w-control shrink-0 items-center justify-center rounded-control text-action hover:bg-subtle"
          aria-label={copy.back}
        >
          <ChevronStartIcon directional className="size-5" />
        </a>
        <div className="min-w-0 py-1">
          {heading ? (
            <h1 lang={title ? "bg" : undefined} className="text-heading font-semibold text-text">
              {title || reference}
            </h1>
          ) : title ? (
            <p lang="bg" className="font-semibold text-text">
              {title}
            </p>
          ) : null}
          <p className={cx("text-dense text-text-muted", !title && "pt-2")}>
            <bdi>{reference}</bdi>
            {meta ? <> · {meta}</> : null}
          </p>
          {summary ? <p className="mt-1 text-dense text-text-muted">{summary}</p> : null}
        </div>
      </div>
      {children}
    </header>
  );
}
