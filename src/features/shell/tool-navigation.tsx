"use client";

import { useEffect, useState } from "react";
import { cx } from "@/ui/cx";
import { CloseIcon, SearchIcon } from "@/ui/icons";
import { NavLink } from "./nav-link";
import { NavigationIcon } from "./navigation-icons";

export type PageGroup = {
  section: string;
  title: string;
  items: { label: string; href: string; title: string; description: string }[];
};

/** A filter over permitted page links, not a record search or an ARIA application menu. */
export function ToolNavigation({
  groups,
  locale,
  idPrefix,
  level,
  copy,
  scrollable = false,
}: {
  groups: PageGroup[];
  locale: string;
  idPrefix: string;
  level: 1 | 2;
  copy: { search: string; clear: string; empty: string; count: string };
  scrollable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => setEnhanced(true), []);
  const normalized = query.trim().toLocaleLowerCase(locale);
  const visible = groups.flatMap((group) => {
    const items = group.items.filter((item) =>
      `${item.title} ${item.description}`.toLocaleLowerCase(locale).includes(normalized),
    );
    return items.length ? [{ ...group, items }] : [];
  });
  const count = visible.reduce((total, group) => total + group.items.length, 0);
  const Heading = level === 1 ? "h2" : "h3";
  return (
    <div className={cx("flex flex-col gap-4", scrollable && "min-h-0 flex-1")}>
      <div hidden={!enhanced} className="shrink-0">
        <label htmlFor={`${idPrefix}-filter`} className="sr-only">
          {copy.search}
        </label>
        <div className="flex min-h-input items-center gap-3 rounded-control border border-border bg-surface px-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
          <SearchIcon className="text-text-muted" />
          <input
            id={`${idPrefix}-filter`}
            data-page-filter=""
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            maxLength={200}
            aria-controls={`${idPrefix}-pages`}
            autoComplete="off"
            placeholder={copy.search}
            className="min-h-control min-w-0 flex-1 bg-transparent text-body outline-none [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query ? (
            <button
              type="button"
              aria-label={copy.clear}
              className="inline-flex size-control shrink-0 items-center justify-center rounded-control hover:bg-subtle focus-visible:outline-2 focus-visible:outline-focus"
              onClick={() => {
                setQuery("");
                document.getElementById(`${idPrefix}-filter`)?.focus();
              }}
            >
              <CloseIcon />
            </button>
          ) : null}
        </div>
        <p role="status" className="sr-only">
          {normalized ? copy.count.replace("{count}", String(count)) : ""}
        </p>
      </div>
      <div
        id={`${idPrefix}-pages`}
        className={cx(
          "space-y-6 px-1 py-1",
          scrollable && "min-h-0 flex-1 overflow-y-auto overscroll-contain",
        )}
      >
        {visible.map((group) => (
          <nav key={group.section} aria-labelledby={`${idPrefix}-${group.section}`}>
            <Heading
              id={`${idPrefix}-${group.section}`}
              className="mb-2 px-3 text-caption font-semibold text-text-muted"
            >
              {group.title}
            </Heading>
            <ul className="space-y-1">
              {group.items.map((item) => (
                <li key={item.label}>
                  <NavLink
                    href={item.href}
                    prefetch={false}
                    className="flex min-h-control scroll-mt-20 items-center gap-3 rounded-control px-3 py-3 text-text no-underline hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-[current=page]:bg-selected aria-[current=page]:text-action"
                  >
                    <NavigationIcon name={item.label} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5 wrap-anywhere">
                      <span className="text-dense font-semibold">{item.title}</span>
                      <span className="text-caption text-text-muted">{item.description}</span>
                    </span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        {!visible.length ? <p className="px-3 py-6 text-text-muted">{copy.empty}</p> : null}
      </div>
    </div>
  );
}
