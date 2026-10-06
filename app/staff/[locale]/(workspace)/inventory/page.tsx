// O10 (Figma 11:5103, O10NEEDS 52:4407/52:4456, O10MINE 52:4505/52:4548): capability-scoped
// inventory with search, filters and the All / Needs action / Mine views over the server's
// paged query (inventoryListPage). No manufactured totals or readiness claims: a row's next
// step and its destination come only from recorded states.

import { getDb } from "@/db/client";
import { listingPurposes, propertyTypes } from "@/domain/facts";
import { inventoryCopy, optionLabel } from "@/features/inventory/copy";
import { rowAction, rowDestination } from "@/features/inventory/row-action";
import { requireStaffPage } from "@/server/auth/pages";
import { can } from "@/server/authz";
import { isAppError } from "@/server/errors";
import { inventoryListPage } from "@/server/inventory/queries";
import { buttonClass } from "@/ui/button-class";
import { cx } from "@/ui/cx";
import { controlClass } from "@/ui/field-class";
import { ChevronEndIcon, HomeIcon } from "@/ui/icons";

type Query = { q?: string; view?: string; purpose?: string; type?: string; cursor?: string };
type RawQuery = Record<string, string | string[] | undefined>;
const searchLimit = 200;

/** One value per filter: a repeated parameter (?q=a&q=b) keeps its first value. */
function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<RawQuery>;
}) {
  const { locale } = await params;
  const raw = await searchParams;
  const query: Query = {
    q: scalar(raw.q),
    view: scalar(raw.view),
    purpose: scalar(raw.purpose),
    type: scalar(raw.type),
    cursor: scalar(raw.cursor),
  };
  const session = await requireStaffPage(locale);
  const db = getDb();
  const copy = inventoryCopy(locale);
  const o10 = copy.o10;
  const mayCreate = await can(db, session.actor, "listing.edit");
  const view = query.view === "needs" || query.view === "mine" ? query.view : "all";
  const purpose = listingPurposes.find((value) => value === query.purpose);
  const type = propertyTypes.find((value) => value === query.type);
  // The query accepts at most 200 search characters; longer input is cut there, and said so.
  const typed = query.q?.trim() ?? "";
  const shortened = typed.length > searchLimit;
  const filters = { q: typed.slice(0, searchLimit), purpose, type, view } as const;
  // A cursor from another filter or a stale list fails closed, and a later page that has
  // emptied (rows=[] while matches remain) is not "no results": both restart at page one.
  let restarted = false;
  let page = await inventoryListPage(db, session.actor, {
    ...filters,
    cursor: query.cursor,
  }).catch((error) => {
    if (!query.cursor || !isAppError(error) || error.code !== "validation_failed") throw error;
    restarted = true;
    return inventoryListPage(db, session.actor, filters);
  });
  if (query.cursor && !restarted && page.rows.length === 0 && page.total > 0) {
    restarted = true;
    page = await inventoryListPage(db, session.actor, filters);
  }
  const q = filters.q;
  const money = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
  const known = (state: string, value: string) =>
    state === "known" && value && Number.isFinite(Number(value)) ? Number(value) : null;
  const shown = page.rows.map((row) => {
    const price = known(row.workingDraft.priceState, row.workingDraft.price);
    const area = known(row.workingDraft.areaState, row.workingDraft.area);
    const action = rowAction(row.actions);
    return {
      ...row,
      href: rowDestination(locale, row.listing.reference, action),
      detail: [
        price === null ? null : money.format(price),
        area === null ? null : `${new Intl.NumberFormat(locale).format(area)} m²`,
      ],
      actionLabel: !action
        ? null
        : action.kind === "translation_review"
          ? o10.actions.translation_review.replace("{locale}", action.locale.toUpperCase())
          : o10.actions[action.kind],
    };
  });
  const next = shown.find((item) => item.needsAction);
  const href = (changes: Query) => {
    // A filter change starts from page one; only "Show more" carries a cursor.
    const merged = { ...query, cursor: undefined, ...changes };
    const search = new URLSearchParams(
      Object.entries(merged).filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
    if (merged.view === "all") search.delete("view");
    const text = search.toString();
    return `/${locale}/inventory${text ? `?${text}` : ""}`;
  };
  const empty =
    page.total === 0 && !q && !purpose && !type && view === "all"
      ? copy.empty
      : q || purpose || type
        ? o10.noMatch
        : view === "needs"
          ? o10.noneNeeds
          : o10.noneMine;
  return (
    <div className="flex flex-col gap-6 px-gutter py-6 sm:gap-8 sm:px-gutter-wide sm:py-8">
      <header className="flex flex-col gap-6 sm:gap-8">
        <h1 className="text-heading font-semibold sm:text-title">{copy.inventory}</h1>
        <p className="text-text-muted">{o10.instruction}</p>
      </header>
      <form method="get" className="flex flex-col gap-3">
        {view !== "all" ? <input type="hidden" name="view" value={view} /> : null}
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex min-w-0 flex-1 basis-64 flex-col gap-2">
            <label htmlFor="inventory-search" className="text-dense font-semibold">
              {o10.search}
            </label>
            <input
              id="inventory-search"
              name="q"
              type="search"
              maxLength={searchLimit}
              defaultValue={filters.q}
              aria-describedby="inventory-search-hint"
              className={cx(controlClass, "min-h-12 py-2")}
            />
            <p id="inventory-search-hint" className="sr-only">
              {o10.searchHint}
            </p>
          </div>
          <button type="submit" className={buttonClass("secondary", "min-h-13")}>
            {o10.apply}
          </button>
        </div>
        <details className="group" open={Boolean(purpose || type)}>
          <summary
            className={buttonClass(
              "secondary",
              "w-fit list-none [&::-webkit-details-marker]:hidden",
            )}
          >
            {o10.filters}
          </summary>
          <div className="mt-3 flex flex-wrap items-end gap-4 rounded-control bg-subtle p-4">
            {(
              [
                ["purpose", o10.purpose, listingPurposes, purpose],
                ["type", o10.type, propertyTypes, type],
              ] as const
            ).map(([name, label, values, current]) => (
              <div key={name} className="flex flex-col gap-2">
                <label htmlFor={`inventory-${name}`} className="text-dense font-semibold">
                  {label}
                </label>
                <select
                  id={`inventory-${name}`}
                  name={name}
                  defaultValue={current ?? ""}
                  className={controlClass}
                >
                  <option value="">{o10.any}</option>
                  {values.map((value) => (
                    <option key={value} value={value}>
                      {optionLabel(value, locale)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <button type="submit" className={buttonClass("secondary")}>
              {o10.apply}
            </button>
          </div>
        </details>
      </form>
      <nav aria-label={o10.views}>
        <ul className="grid grid-cols-3 gap-1 rounded-control bg-subtle p-1">
          {(
            [
              ["all", o10.all],
              ["needs", o10.needs],
              ["mine", o10.mine],
            ] as const
          ).map(([id, label]) => (
            <li key={id} className="flex">
              <a
                href={href({ view: id })}
                aria-current={id === view ? "page" : undefined}
                className={cx(
                  "flex min-h-[2.875rem] w-full items-center justify-center rounded-control p-3 text-center text-dense font-semibold no-underline",
                  id === view
                    ? "bg-canvas text-text"
                    : "text-text-muted hover:bg-canvas/60 hover:text-text",
                )}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {shown.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-panel bg-subtle p-6">
          <p>{empty}</p>
          {q || purpose || type ? (
            <a href={href({ q: "", purpose: "", type: "" })} className="text-action underline">
              {o10.clear}
            </a>
          ) : null}
        </div>
      ) : (
        <ul aria-label={o10.list} className="divide-y divide-divider border-b border-divider">
          {shown.map((item) => (
            <li key={item.listing.id}>
              <a
                href={item.href}
                className="flex min-h-19 items-center gap-4 p-4 text-dense text-text no-underline hover:bg-subtle"
              >
                <HomeIcon className="size-5" />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-semibold">
                    <bdi>{item.listing.reference}</bdi> ·{" "}
                    {item.title ? (
                      <span lang="bg">{item.title}</span>
                    ) : (
                      optionLabel(item.property.propertyType, locale)
                    )}
                  </span>
                  <span className="font-medium text-text-muted">
                    {[item.property.settlement, ...item.detail, item.actionLabel]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <ChevronEndIcon directional className="size-5" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {restarted ? <p className="text-dense text-text-muted">{o10.restarted}</p> : null}
      {shortened ? (
        <p role="status" className="text-dense text-text-muted">
          {o10.shortened.replace("{n}", String(searchLimit))}
        </p>
      ) : null}
      {page.total > 0 ? (
        <div className="flex flex-wrap items-center gap-4 text-dense text-text-muted">
          <span>
            {o10.count.replace("{total}", new Intl.NumberFormat(locale).format(page.total))}
          </span>
          {page.nextCursor ? (
            <a href={href({ cursor: page.nextCursor })} className="text-action underline">
              {o10.more}
            </a>
          ) : null}
          {query.cursor && !restarted ? (
            <a href={href({})} className="text-action underline">
              {o10.first}
            </a>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {next ? (
          <a href={next.href} className={buttonClass("primary")}>
            {o10.open.replace("{reference}", next.listing.reference)}
          </a>
        ) : null}
        {mayCreate ? (
          <a href={`/${locale}/inventory/new`} className={buttonClass("tertiary", "text-text")}>
            {copy.create}
          </a>
        ) : null}
      </div>
    </div>
  );
}
