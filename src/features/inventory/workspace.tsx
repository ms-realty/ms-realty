// Operate: one listing, one set of section links. Keep the incumbent token system;
// identity and working/public state precede editing. Each section keeps its own authority.
import type { ReactNode } from "react";
import { workflowCopy } from "@/i18n/workflow-copy";
import { cx } from "@/ui/cx";
import { ChevronStartIcon } from "@/ui/icons";
import { inventoryCopy } from "./copy";
import { inventorySections } from "./decision-contract";

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
}: {
  locale: string;
  reference: string;
  current: string;
}) {
  const labels = workflowCopy(locale, "listingWorkspace");
  return (
    <nav aria-label={labels.navigation} className="border-b border-divider">
      <ul className="flex flex-wrap gap-x-1">
        {listingSections(locale, reference).map((section) => (
          <li key={section.id}>
            <a
              href={section.href}
              aria-current={section.id === current ? "page" : undefined}
              className={listingSectionClass}
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function ListingIdentity({
  locale,
  reference,
  title,
  children,
}: {
  locale: string;
  reference: string;
  title?: string | null;
  children?: ReactNode;
}) {
  const copy = inventoryCopy(locale);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-divider pb-4">
      <div className="flex min-w-0 items-start gap-3">
        <a
          href={`/${locale}/inventory`}
          className="flex min-h-control min-w-control shrink-0 items-center justify-center rounded-control text-action hover:bg-subtle"
          aria-label={copy.back}
        >
          <ChevronStartIcon directional className="size-5" />
        </a>
        <div className="min-w-0 py-1">
          {title ? (
            <p lang="bg" className="font-semibold text-text">
              {title}
            </p>
          ) : null}
          <p className={cx("text-dense text-text-muted", !title && "pt-2")}>
            <bdi>{reference}</bdi>
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}
