"use client";

import { type ReactNode, useId } from "react";
import { cx } from "./cx";
import { ArrowDownIcon, ArrowUpIcon, SortIcon } from "./icons";

export type SortDirection = "ascending" | "descending";
export type TableSort = { column: string; direction: SortDirection };

export type TableColumn = {
  key: string;
  label: string;
  isSortable?: boolean;
  /** Numbers align to the end and use tabular figures. */
  isNumeric?: boolean;
};

export type TableRow = { id: string } & Record<string, ReactNode>;

export type TableProps = {
  caption: string;
  columns: TableColumn[];
  rows: TableRow[];
  /** Column whose cells name each row (rendered as row headers). */
  rowHeader: string;
  sort?: TableSort;
  onSortChange?: (sort: TableSort) => void;
  /** Visible caption, or visually hidden when a heading already names the table. */
  hideCaption?: boolean;
};

/**
 * Data table with real headers. Wide tables scroll inside their own focusable region so the
 * page never scrolls sideways.
 */
export function Table({
  caption,
  columns,
  rows,
  rowHeader,
  sort,
  onSortChange,
  hideCaption,
}: TableProps) {
  const captionId = useId();
  return (
    <section
      aria-labelledby={captionId}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be keyboard-scrollable.
      tabIndex={0}
      className="max-w-full overflow-x-auto rounded-card border border-divider bg-surface"
    >
      <table className="w-full min-w-max border-collapse text-start text-operational">
        <caption
          id={captionId}
          className={cx(
            "px-4 pt-3 pb-2 text-start font-semibold text-text",
            hideCaption && "sr-only",
          )}
        >
          {caption}
        </caption>
        <thead className="bg-subtle">
          <tr>
            {columns.map((column) => {
              const direction = sort?.column === column.key ? sort.direction : undefined;
              const SortStateIcon =
                direction === "ascending"
                  ? ArrowUpIcon
                  : direction === "descending"
                    ? ArrowDownIcon
                    : SortIcon;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={column.isSortable ? (direction ?? "none") : undefined}
                  className={cx(
                    "border-b border-border px-4 py-2 font-semibold text-text",
                    column.isNumeric ? "text-end" : "text-start",
                  )}
                >
                  {column.isSortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() =>
                        onSortChange({
                          column: column.key,
                          direction: direction === "ascending" ? "descending" : "ascending",
                        })
                      }
                      className={cx(
                        "-mx-2 inline-flex min-h-control cursor-pointer items-center gap-1 rounded-control px-2 font-semibold hover:bg-selected",
                        column.isNumeric && "flex-row-reverse",
                      )}
                    >
                      {column.label}
                      <SortStateIcon
                        className={cx("size-4", direction ? "text-action" : "text-text-muted")}
                      />
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-divider last:border-b-0">
              {columns.map((column) => {
                const Cell = column.key === rowHeader ? "th" : "td";
                return (
                  <Cell
                    key={column.key}
                    scope={Cell === "th" ? "row" : undefined}
                    className={cx(
                      "px-4 py-2.5 align-top text-text",
                      Cell === "th" ? "font-semibold" : "font-normal",
                      column.isNumeric ? "text-end tabular-nums" : "text-start",
                    )}
                  >
                    {row[column.key]}
                  </Cell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
