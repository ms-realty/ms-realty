// O02 queue row (Figma 11:4349, mobile 18:2931): inbox icon, identity line, status line and
// chevron, as in the O10 list. Shared by the server-rendered queue and the client search
// results, so it takes already-worded, serializable data (inquiry-row-view.ts).
import { ChevronEndIcon, InboxIcon } from "@/ui/icons";
import { workCopy } from "./copy";
import { CoverageOwner } from "./coverage-owner";

export const inboxScopes = ["all", "unassigned", "mine", "awaiting", "review"] as const;
export type InboxScope = (typeof inboxScopes)[number];

/** `?view=`: one value (a repeated parameter keeps its first), anything else is "all". */
export function parseInboxScope(value: string | string[] | undefined): InboxScope {
  const first = Array.isArray(value) ? value[0] : value;
  return inboxScopes.find((scope) => scope === first) ?? "all";
}

export type InquiryRowView = {
  id: string;
  /** The preferred name as submitted; null when none was given. */
  name: string | null;
  reference: string;
  /** The listing reference from the received context, else the stated purpose. */
  context: { kind: "listing" | "purpose"; value: string } | null;
  /** Null for "received": the received line already says so. */
  state: string | null;
  received: { dateTime: string; label: string };
  language: string | null;
  owner: { name: string | null; needsCoverage: boolean };
};

/** A queue address, the list or an open conversation, that keeps its scope and page. */
export function queueHref(base: string, scope: InboxScope, page = 1) {
  return `${base}?view=${scope}${page > 1 ? `&page=${page}` : ""}`;
}

export function inquiryHref(locale: string, id: string, scope: InboxScope, page = 1) {
  return queueHref(`/${locale}/inquiries/${id}`, scope, page);
}

export function InquiryRow({
  row,
  href,
  current = false,
  locale,
}: {
  row: InquiryRowView;
  href: string;
  /** The conversation open beside the queue. */
  current?: boolean;
  locale: string;
}) {
  const copy = workCopy(locale);
  const detail =
    row.context ?? (row.name ? { kind: "reference" as const, value: row.reference } : null);
  return (
    <li
      id={`inquiry-${row.id}`}
      data-inquiry-id={row.id}
      className="scroll-mt-6 target:bg-selected"
    >
      <a
        href={href}
        aria-current={current ? "page" : undefined}
        className="flex min-h-19 items-center gap-4 p-4 text-dense text-text no-underline hover:bg-subtle aria-[current=page]:bg-selected"
      >
        <InboxIcon className="size-5" />
        <span className="flex min-w-0 flex-1 flex-col gap-1 wrap-anywhere">
          <span className="font-semibold">
            <bdi>{row.name ?? row.reference}</bdi>
            {detail ? (
              <>
                {" · "}
                {detail.kind === "purpose" ? detail.value : <bdi>{detail.value}</bdi>}
              </>
            ) : null}
          </span>
          <span className="font-medium text-text-muted">
            {row.state ? `${row.state} · ` : null}
            <time dateTime={row.received.dateTime}>{row.received.label}</time>
            {row.language ? (
              <>
                {" · "}
                <span className="sr-only">{copy.preferredLocale}: </span>
                {row.language}
              </>
            ) : null}
            {" · "}
            <span className="sr-only">{copy.owner}: </span>
            <CoverageOwner
              name={row.owner.name}
              needsCoverage={row.owner.needsCoverage}
              locale={locale}
              plain
            />
          </span>
        </span>
        <ChevronEndIcon directional className="size-5" />
      </a>
    </li>
  );
}
