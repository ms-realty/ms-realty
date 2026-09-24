import { Button } from "./button";
import { cx } from "./cx";
import { ChevronEndIcon, ChevronStartIcon } from "./icons";
import { Link } from "./link";

export type PaginationProps = {
  label: string;
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
  previousLabel: string;
  nextLabel: string;
  /** Accessible name for a numbered page link, e.g. (3) => "Page 3". */
  pageLabel: (page: number) => string;
};

function pagesToShow(page: number, pageCount: number): Array<number | "gap"> {
  const wanted = new Set([1, pageCount, page - 1, page, page + 1]);
  const pages = [...wanted].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const result: Array<number | "gap"> = [];
  for (const p of pages) {
    const last = result.at(-1);
    if (typeof last === "number" && p - last > 1) result.push("gap");
    result.push(p);
  }
  return result;
}

const pageLinkClass =
  "inline-flex min-h-control min-w-control items-center justify-center gap-1 rounded-control px-3 font-semibold no-underline data-hovered:bg-selected";

/** Numbered pages as real links, so every page has a URL. */
export function Pagination({
  label,
  page,
  pageCount,
  hrefFor,
  previousLabel,
  nextLabel,
  pageLabel,
}: PaginationProps) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap items-center gap-1 text-compact">
        {page > 1 ? (
          <li>
            <Link href={hrefFor(page - 1)} className={pageLinkClass}>
              <ChevronStartIcon directional className="size-4" />
              {previousLabel}
            </Link>
          </li>
        ) : null}
        {pagesToShow(page, pageCount).map((p, index, all) =>
          p === "gap" ? (
            <li
              key={`gap-after-${all[index - 1]}`}
              aria-hidden="true"
              className="px-2 text-text-muted"
            >
              …
            </li>
          ) : (
            <li key={p}>
              <Link
                href={hrefFor(p)}
                aria-label={pageLabel(p)}
                aria-current={p === page ? "page" : undefined}
                className={cx(
                  pageLinkClass,
                  "tabular-nums",
                  p === page && "border-2 border-action bg-selected text-text visited:text-text",
                )}
              >
                {p}
              </Link>
            </li>
          ),
        )}
        {page < pageCount ? (
          <li>
            <Link href={hrefFor(page + 1)} className={pageLinkClass}>
              {nextLabel}
              <ChevronEndIcon directional className="size-4" />
            </Link>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}

export type LoadMoreProps = {
  /** e.g. "Showing 24 of 131 properties". */
  statusLabel: string;
  label: string;
  pendingLabel: string;
  isPending?: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
};

export function LoadMore({
  statusLabel,
  label,
  pendingLabel,
  isPending,
  hasMore,
  onLoadMore,
}: LoadMoreProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <p className="text-compact text-text-muted" aria-live="polite">
        {statusLabel}
      </p>
      {hasMore ? (
        <Button
          variant="secondary"
          isPending={isPending}
          pendingLabel={pendingLabel}
          onPress={onLoadMore}
        >
          {label}
        </Button>
      ) : null}
    </div>
  );
}
