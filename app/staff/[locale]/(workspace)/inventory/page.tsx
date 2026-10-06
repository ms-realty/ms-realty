// O10 (Figma 11:5103, O10NEEDS 52:4407/52:4456, O10MINE 52:4505/52:4548): capability-scoped
// inventory with search, filters and the All / Needs action / Mine views. No manufactured
// totals or readiness claims: a row's next step comes only from recorded states.

import { getDb } from "@/db/client";
import { listingPurposes, propertyTypes } from "@/domain/facts";
import { inventoryCopy, optionLabel } from "@/features/inventory/copy";
import { listingAction } from "@/features/inventory/needs-action";
import { requireStaffPage } from "@/server/auth/pages";
import { can } from "@/server/authz";
import { inventoryList } from "@/server/inventory/commands";
import { draftSchema } from "@/server/inventory/contracts";
import { buttonClass } from "@/ui/button-class";
import { cx } from "@/ui/cx";
import { controlClass } from "@/ui/field-class";
import { ChevronEndIcon, HomeIcon } from "@/ui/icons";

type Query = { q?: string; view?: string; purpose?: string; type?: string };
type RawQuery = Record<string, string | string[] | undefined>;

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
  };
  const session = await requireStaffPage(locale);
  const db = getDb();
  const copy = inventoryCopy(locale);
  const o10 = copy.o10;
  // ponytail: filters the 200 most recently updated readable listings that inventoryList
  // returns; move search to a server query if the inventory outgrows that window.
  const rows = await inventoryList(db, session.actor);
  const mayCreate = await can(db, session.actor, "listing.edit");
  const view = query.view === "needs" || query.view === "mine" ? query.view : "all";
  const q = (query.q ?? "").trim().toLocaleLowerCase(locale);
  const purpose = listingPurposes.find((value) => value === query.purpose);
  const type = propertyTypes.find((value) => value === query.type);
  const money = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
  const items = rows.map(({ listing, property }) => {
    const draft = draftSchema.safeParse(listing.draft);
    const known = (state: string | undefined, value: string | undefined) =>
      state === "known" && value && Number.isFinite(Number(value)) ? Number(value) : null;
    const price = draft.success ? known(draft.data.priceState, draft.data.price) : null;
    const area = draft.success ? known(draft.data.areaState, draft.data.area) : null;
    return {
      listing,
      property,
      title: draft.success && draft.data.title ? draft.data.title : null,
      action: listingAction(listing),
      detail: [
        price === null ? null : money.format(price),
        area === null ? null : `${new Intl.NumberFormat(locale).format(area)} m²`,
      ],
    };
  });
  const shown = items.filter(
    (item) =>
      (view !== "needs" || item.action) &&
      (view !== "mine" || item.listing.responsibleBrokerId === session.actor.id) &&
      (!purpose || item.listing.purpose === purpose) &&
      (!type || item.property.propertyType === type) &&
      (!q ||
        [item.listing.reference, item.title ?? "", item.property.settlement].some((text) =>
          text.toLocaleLowerCase(locale).includes(q),
        )),
  );
  const next = shown.find((item) => item.action);
  const href = (changes: Query) => {
    const merged = { ...query, ...changes };
    const search = new URLSearchParams(
      Object.entries(merged).filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
    if (merged.view === "all") search.delete("view");
    const text = search.toString();
    return `/${locale}/inventory${text ? `?${text}` : ""}`;
  };
  const empty =
    rows.length === 0
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
              defaultValue={query.q ?? ""}
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
                href={`/${locale}/inventory/${item.listing.reference}`}
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
                    {[
                      item.property.settlement,
                      ...item.detail,
                      item.action ? o10.actions[item.action] : null,
                    ]
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
      <div className="flex flex-wrap items-center gap-3">
        {next ? (
          <a
            href={`/${locale}/inventory/${next.listing.reference}`}
            className={buttonClass("primary")}
          >
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
