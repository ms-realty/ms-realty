/** biome-ignore-all lint/a11y/noRedundantRoles: explicit roles preserve table semantics when narrow-screen CSS changes table display. */
import type { ReactNode } from "react";
import { formatDateTime } from "@/i18n/format";
import type { CaseIndexRow } from "@/server/cases/index-query";
import { workCopy } from "../work/copy";
import { coverageCopy } from "../work/coverage-copy";
import { caseCopy } from "./copy";
import { caseKindLabel, caseStageLabel, directoryCopy } from "./directory-copy";
import { type CaseDirectoryValues, caseDirectoryHref } from "./directory-query";

const cellClass = "min-w-0 px-4 py-3 align-top wrap-anywhere lg:table-cell";
const linkClass = "font-semibold text-action underline underline-offset-4";

/** O04: one semantic table, prioritized as complete, labeled summaries on narrow screens. */
export function CaseDirectoryTable({
  locale,
  rows,
  values,
}: {
  locale: string;
  rows: readonly CaseIndexRow[];
  values: CaseDirectoryValues;
}) {
  const copy = directoryCopy(locale);
  return (
    <section
      aria-label={copy.list}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the overflow region must be keyboard-scrollable.
      tabIndex={0}
      className="max-w-full overflow-x-auto"
    >
      <table role="table" className="block w-full table-fixed border-collapse text-dense lg:table">
        <caption className="sr-only">{copy.list}</caption>
        <thead role="rowgroup" className="sr-only lg:not-sr-only lg:table-header-group">
          <tr role="row" className="border-b border-divider text-start">
            {Object.entries(copy.columns).map(([key, name]) => (
              <th
                key={key}
                role="columnheader"
                scope="col"
                className="px-4 py-3 text-start font-semibold"
              >
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup" className="block lg:table-row-group">
          {rows.map((row) => (
            <tr
              key={row.id}
              role="row"
              className="grid grid-cols-2 items-start border-b border-divider py-2 hover:bg-subtle lg:table-row lg:py-0"
            >
              <th
                role="rowheader"
                scope="row"
                className={`${cellClass} col-span-2 text-start font-normal`}
              >
                <a href={`/${locale}/cases/${row.id}`} className={linkClass}>
                  <bdi>{row.title}</bdi>
                </a>
                <p className="mt-1 font-medium text-text-muted">
                  <bdi>{row.reference}</bdi>
                </p>
              </th>
              <Cell label={copy.columns.party} className="order-3">
                <bdi>{row.partyLabel ?? copy.noParty}</bdi>
              </Cell>
              <Cell label={copy.columns.kind} className="order-4">
                {caseKindLabel(row.kind, locale)}
              </Cell>
              <Cell label={copy.columns.stage} className="order-5">
                {caseStageLabel(row.stage, locale)}
              </Cell>
              <Cell label={copy.columns.disposition} className="order-6">
                <span className={row.disposition === "active" ? "" : "font-semibold"}>
                  {copy.dispositions[row.disposition]}
                </span>
              </Cell>
              <Cell label={copy.columns.owner} className="order-7 col-span-2">
                {row.ownerId ? (
                  <a
                    href={caseDirectoryHref(locale, values, { owner: row.ownerId })}
                    className={linkClass}
                  >
                    <Owner row={row} locale={locale} />
                  </a>
                ) : (
                  <Owner row={row} locale={locale} />
                )}
              </Cell>
              <Cell label={copy.columns.nextAction} className="order-2 col-span-2">
                <NextAction row={row} locale={locale} />
              </Cell>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Cell({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className: string;
}) {
  return (
    <td role="cell" className={`${cellClass} ${className}`}>
      <span className="mb-1 block text-caption font-semibold text-text-muted lg:hidden">
        {label}
      </span>
      {children}
    </td>
  );
}

/** Only the authorized projection supplies action text, timing and attention reasons. */
function NextAction({ row, locale }: { row: CaseIndexRow; locale: string }) {
  const copy = directoryCopy(locale);
  const instant = row.nextAction ? row.dueAt : row.reviewAt;
  return (
    <div className="space-y-1">
      <p>
        {row.nextAction ? (
          <bdi>{row.nextAction}</bdi>
        ) : row.waitingOn ? (
          <>
            {copy.waitingOn}: <bdi>{row.waitingOn}</bdi>
          </>
        ) : row.nextActionState === "restricted" || row.disposition === "closed" ? (
          copy.actionStates[row.nextActionState]
        ) : (
          copy.noAction
        )}
      </p>
      {row.nextAction || row.waitingOn ? (
        <p className="font-medium text-text-muted">{copy.actionStates[row.nextActionState]}</p>
      ) : null}
      {instant ? (
        <p className="text-text-muted">
          {row.nextAction ? copy.dueAt : copy.reviewAt}:{" "}
          <time dateTime={instant.toISOString()} className="tabular-nums">
            {formatDateTime(locale === "bg" || locale === "ru" ? locale : "en", instant)}
          </time>
        </p>
      ) : null}
      {row.needsReasons.length ? (
        <ul className="space-y-1 font-semibold">
          {row.needsReasons.map((reason) => (
            <li key={reason}>{copy.attentionReasons[reason]}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Owner({ row, locale }: { row: CaseIndexRow; locale: string }) {
  if (row.needsCoverage && row.disposition !== "closed") {
    const copy = coverageCopy(locale);
    return (
      <>
        {copy.title}
        {row.ownerName ? ` · ${copy.owner}: ${row.ownerName}` : null}
      </>
    );
  }
  return (
    <>
      {caseCopy(locale).owned}: {row.ownerName ?? workCopy(locale).noOwner}
    </>
  );
}
