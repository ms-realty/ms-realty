// O04, F20, L16: live authorized paging, safe next actions and native private filters.
import "server-only";
import { notFound, unstable_rethrow } from "next/navigation";
import { getDb } from "@/db/client";
import { caseKinds, demandStages, serviceIntakeStages, supplyStages } from "@/domain/case";
import type { Session } from "@/server/auth/sessions";
import { type CaseIndexPage, queryCaseIndex } from "@/server/cases/index-query";
import { isAppError } from "@/server/errors";
import { buttonClass } from "@/ui/button-class";
import { EmptyState } from "@/ui/empty-state";
import { controlClass, fieldClass, labelClass } from "@/ui/field-class";
import { caseCopy } from "./copy";
import { applyCaseDirectoryFilters } from "./directory-actions";
import { caseKindLabel, caseStageLabel, directoryCopy } from "./directory-copy";
import {
  type CaseDirectoryParams,
  type CaseDirectoryValues,
  caseDirectoryHref,
  caseDirectorySearchLimit,
  caseDirectoryState,
} from "./directory-query";
import { CaseDirectoryTable } from "./directory-table";

type Read =
  | { kind: "ready"; page: CaseIndexPage }
  | { kind: "failed" | "invalidPage" | "invalidFilters" | "privateUnavailable" | "legacySearch" };
const linkClass = "font-semibold text-action underline underline-offset-4";

export async function CaseDirectoryScreen({
  locale,
  session,
  query = {},
  privateFilterUnavailable = false,
  shortened = false,
}: {
  locale: string;
  session: Session;
  query?: CaseDirectoryParams;
  privateFilterUnavailable?: boolean;
  shortened?: boolean;
}) {
  const copy = directoryCopy(locale);
  const state = caseDirectoryState(query, session.account.id);
  const { values, filtered } = state;
  const view = values.view ?? "all";
  let read: Read;
  if (privateFilterUnavailable) read = { kind: "privateUnavailable" };
  else if (values.q && !values.filter) read = { kind: "legacySearch" };
  else {
    try {
      read = { kind: "ready", page: await queryCaseIndex(getDb(), session, state.input) };
    } catch (error) {
      unstable_rethrow(error);
      if (isAppError(error)) {
        if (["not_found", "forbidden", "unauthenticated"].includes(error.code)) notFound();
        if (error.code === "validation_failed")
          read = { kind: error.fieldErrors?.cursor ? "invalidPage" : "invalidFilters" };
        else read = { kind: "failed" };
      } else read = { kind: "failed" };
      if (read.kind === "failed")
        console.error(
          "[O04] case list unavailable:",
          isAppError(error) ? error.code : error instanceof Error ? error.name : typeof error,
        );
    }
  }
  const href = (changes: CaseDirectoryValues = {}) => caseDirectoryHref(locale, values, changes);
  const clear = caseDirectoryHref(locale, {
    view: view === "mine" || view === "needs" ? view : undefined,
    size: values.size === "10" || values.size === "50" ? values.size : undefined,
  });
  const page = read.kind === "ready" ? read.page : null;
  const waiting = page?.rows.find((row) => row.needsReasons.length);
  const selectedOwner =
    page?.rows.find((row) => row.ownerId === values.owner)?.ownerName ?? copy.selectedOwner;

  return (
    <div className="flex min-w-0 flex-col gap-6 px-gutter py-5 sm:gap-8 sm:px-gutter-wide sm:py-8">
      <header className="space-y-2">
        <h1 className="text-heading font-semibold sm:text-title">{caseCopy(locale).cases}</h1>
        <p className="max-w-prose text-text-muted">{copy.instruction}</p>
      </header>
      <div className="space-y-3">
        <nav aria-label={copy.scope} className="flex flex-wrap gap-2">
          {Object.entries(copy.scopes).map(([scope, label]) =>
            read.kind === "legacySearch" || read.kind === "privateUnavailable" ? (
              <span
                key={scope}
                aria-disabled="true"
                className={buttonClass("secondary", "cursor-default text-text-muted")}
              >
                {label}
              </span>
            ) : (
              <a
                key={scope}
                href={href({ view: scope })}
                aria-current={view === scope ? "page" : undefined}
                className={buttonClass(view === scope ? "primary" : "secondary")}
              >
                {label}
              </a>
            ),
          )}
        </nav>
        <p className="max-w-prose text-dense text-text-muted">
          {view === "needs" ? copy.needsHint : view === "mine" ? copy.mineHint : copy.scopeHint}
        </p>
      </div>
      <search>
        <form action={applyCaseDirectoryFilters.bind(null, locale)} className="space-y-4">
          {values.view ? <input type="hidden" name="view" value={values.view} /> : null}
          {values.partyId ? (
            <>
              <input type="hidden" name="partyId" value={values.partyId} />
              <p className="text-dense text-text-muted">{copy.partyScope}</p>
            </>
          ) : null}
          <TextFilter name="q" label={copy.search} value={values.q} hint={copy.searchHint} />
          <details
            open={filtered || read.kind === "invalidFilters"}
            className="rounded-panel border border-divider p-4"
          >
            <summary className="min-h-control cursor-pointer py-2 font-semibold text-action">
              {copy.filters}
            </summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <TextFilter name="purpose" label={copy.columns.purpose} value={values.purpose} />
              <TextFilter name="party" label={copy.columns.party} value={values.party} />
              <SelectFilter
                name="kind"
                label={copy.columns.kind}
                value={values.kind}
                options={caseKinds.map((kind) => [kind, caseKindLabel(kind, locale)])}
                locale={locale}
              />
              <SelectFilter
                name="stage"
                label={copy.columns.stage}
                value={values.stage}
                options={[
                  ...new Set([...demandStages, ...supplyStages, ...serviceIntakeStages]),
                ].map((stage) => [stage, caseStageLabel(stage, locale)])}
                locale={locale}
              />
              <SelectFilter
                name="disposition"
                label={copy.columns.disposition}
                value={values.disposition}
                options={Object.entries(copy.dispositions)}
                locale={locale}
              />
              <SelectFilter
                name="owner"
                label={copy.columns.owner}
                value={values.owner}
                options={[
                  ["me", copy.ownerMe],
                  ["unassigned", copy.unassigned],
                  ...(values.owner && !["me", "unassigned"].includes(values.owner)
                    ? [[values.owner, selectedOwner] as [string, string]]
                    : []),
                ]}
                locale={locale}
              />
              <TextFilter
                name="nextAction"
                label={copy.columns.nextAction}
                value={values.nextAction}
              />
              <SelectFilter
                name="actionState"
                label={copy.nextActionState}
                value={values.actionState}
                options={Object.entries(copy.actionStates)}
                locale={locale}
              />
              <SelectFilter
                name="size"
                label={copy.rowsPerPage}
                value={values.size ?? "25"}
                options={[
                  ["10", "10"],
                  ["25", "25"],
                  ["50", "50"],
                ]}
                locale={locale}
                allowAny={false}
              />
            </div>
          </details>
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" className={buttonClass("secondary")}>
              {copy.apply}
            </button>
            {filtered || values.filter ? (
              <a href={clear} className={linkClass}>
                {copy.clear}
              </a>
            ) : null}
          </div>
        </form>
      </search>
      {state.shortened || shortened ? (
        <p role="status" className="text-dense text-text-muted">
          {copy.shortened.replace("{n}", String(caseDirectorySearchLimit))}
        </p>
      ) : null}
      {read.kind !== "ready" ? (
        <EmptyState
          kind="failed"
          title={
            read.kind === "failed"
              ? copy.failed
              : read.kind === "invalidPage"
                ? copy.invalidPage
                : read.kind === "privateUnavailable"
                  ? copy.privateUnavailable
                  : read.kind === "legacySearch"
                    ? copy.legacySearch
                    : copy.invalidFilters
          }
          action={
            <a
              href={
                read.kind === "failed"
                  ? href({ cursor: values.cursor })
                  : read.kind === "invalidPage"
                    ? href()
                    : clear
              }
              className={buttonClass("secondary")}
            >
              {read.kind === "failed"
                ? copy.retry
                : read.kind === "invalidPage"
                  ? copy.firstPage
                  : copy.clear}
            </a>
          }
        >
          {read.kind === "failed"
            ? copy.failedDetail
            : read.kind === "invalidPage"
              ? copy.invalidPageDetail
              : read.kind === "privateUnavailable"
                ? copy.privateUnavailableDetail
                : read.kind === "legacySearch"
                  ? copy.legacySearchDetail
                  : copy.invalidFiltersDetail}
        </EmptyState>
      ) : page ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 text-dense">
            <p className="font-semibold tabular-nums">
              {copy.count.replace("{n}", new Intl.NumberFormat(locale).format(page.total))}
            </p>
            {page.rows.length ? (
              <p className="tabular-nums text-text-muted">
                {copy.pageCount.replace("{n}", String(page.rows.length))}
              </p>
            ) : null}
          </div>
          {page.rows.length ? (
            <div className="min-w-0 space-y-4">
              <p className="text-caption text-text-muted">{copy.ordering}</p>
              {waiting ? (
                <a href={`/${locale}/cases/${waiting.id}`} className={linkClass}>
                  {copy.openWaiting}
                </a>
              ) : null}
              <CaseDirectoryTable locale={locale} rows={page.rows} values={values} />
            </div>
          ) : values.cursor && page.total > 0 ? (
            <EmptyState
              kind="filtered"
              title={copy.pageEmpty}
              action={
                <a href={href()} className={linkClass}>
                  {copy.firstPage}
                </a>
              }
            >
              {copy.pageEmptyDetail}
            </EmptyState>
          ) : filtered ? (
            <EmptyState
              kind="filtered"
              title={copy.noMatch}
              criteria={<Criteria values={values} locale={locale} />}
              action={
                <a href={clear} className={linkClass}>
                  {copy.clear}
                </a>
              }
            />
          ) : view !== "all" ? (
            <EmptyState
              kind="filtered"
              title={view === "mine" ? copy.noMine : copy.noNeeds}
              action={
                <a href={href({ view: "all" })} className={linkClass}>
                  {copy.showAll}
                </a>
              }
            />
          ) : (
            <EmptyState
              kind="new"
              title={copy.empty}
              action={
                <a href={`/${locale}/inquiries`} className={linkClass}>
                  {copy.inquiries}
                </a>
              }
            >
              {copy.emptyDetail}
            </EmptyState>
          )}
          {page.rows.length && (values.cursor || page.nextCursor) ? (
            <nav aria-label={copy.pagination} className="flex flex-wrap gap-4">
              {values.cursor ? (
                <a href={href()} className={buttonClass("secondary")}>
                  {copy.firstPage}
                </a>
              ) : null}
              {page.nextCursor ? (
                <a
                  rel="next"
                  href={href({ cursor: page.nextCursor })}
                  className={buttonClass("secondary")}
                >
                  {copy.nextPage}
                </a>
              ) : null}
            </nav>
          ) : null}
        </>
      ) : null}
      <div>
        <a href={`/${locale}/operations`} className={buttonClass("tertiary", "text-text")}>
          {copy.moreTools}
        </a>
      </div>
    </div>
  );
}

function TextFilter({
  name,
  label,
  value,
  hint,
}: {
  name: string;
  label: string;
  value?: string;
  hint?: string;
}) {
  return (
    <div className={fieldClass}>
      <label htmlFor={`case-${name}`} className={labelClass}>
        {label}
      </label>
      <input
        id={`case-${name}`}
        name={name}
        type={name === "q" ? "search" : "text"}
        maxLength={caseDirectorySearchLimit}
        defaultValue={value ?? ""}
        aria-describedby={hint ? `case-${name}-hint` : undefined}
        className={controlClass}
      />
      {hint ? (
        <p id={`case-${name}-hint`} className="sr-only">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function SelectFilter({
  name,
  label,
  value,
  options,
  locale,
  allowAny = true,
}: {
  name: string;
  label: string;
  value?: string;
  options: [string, string][];
  locale: string;
  allowAny?: boolean;
}) {
  const copy = directoryCopy(locale);
  const invalid = Boolean(value && !options.some(([key]) => key === value));
  return (
    <div className={fieldClass}>
      <label htmlFor={`case-${name}`} className={labelClass}>
        {label}
      </label>
      <select
        id={`case-${name}`}
        name={name}
        defaultValue={value ?? ""}
        className={controlClass}
        aria-invalid={invalid || undefined}
      >
        {allowAny ? <option value="">{copy.any}</option> : null}
        {invalid ? <option value={value}>{copy.invalidChoice}</option> : null}
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

function Criteria({ values, locale }: { values: CaseDirectoryValues; locale: string }) {
  const copy = directoryCopy(locale);
  const labels = { q: copy.search, ...copy.columns, actionState: copy.nextActionState };
  return (
    <>
      {Object.entries(values)
        .filter(([key]) => key in labels)
        .map(([key, value]) => (
          <span
            key={key}
            className="max-w-full rounded-control bg-subtle px-2 py-0.5 text-dense wrap-anywhere"
          >
            {labels[key as keyof typeof labels]}:{" "}
            <bdi>
              {key === "kind"
                ? caseKindLabel(value, locale)
                : key === "stage"
                  ? caseStageLabel(value, locale)
                  : key === "disposition"
                    ? (copy.dispositions[value as keyof typeof copy.dispositions] ??
                      copy.invalidChoice)
                    : key === "actionState"
                      ? (copy.actionStates[value as keyof typeof copy.actionStates] ??
                        copy.invalidChoice)
                      : key === "owner"
                        ? value === "me"
                          ? copy.ownerMe
                          : value === "unassigned"
                            ? copy.unassigned
                            : copy.selectedOwner
                        : value}
            </bdi>
          </span>
        ))}
      {values.partyId ? <span>{copy.partyScope}</span> : null}
    </>
  );
}
