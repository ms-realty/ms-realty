// O10 (Figma 11:5103, O10NEEDS 52:4407/52:4456, O10MINE 52:4505/52:4548): capability-scoped
// inventory with search, filters and the All / Needs action / Mine views over the server's
// paged query (inventoryListPage). No manufactured totals or readiness claims: a row's next
// step and its destination come only from recorded states.

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { mediaAssets, mediaRelations } from "@/db/schema";
import { listingPurposes, propertyTypes } from "@/domain/facts";
import { inventoryCopy, optionLabel } from "@/features/inventory/copy";
import { rowAction, rowDestination } from "@/features/inventory/row-action";
import { InventoryThumbnail } from "@/features/inventory/thumbnail";
import { PermissionState } from "@/features/shell/permission-state";
import { workflowCopy } from "@/i18n/workflow-copy";
import { requireStaffPage } from "@/server/auth/pages";
import { can } from "@/server/authz";
import { isAppError } from "@/server/errors";
import { inventoryListPage } from "@/server/inventory/queries";
import { buttonClass } from "@/ui/button-class";
import { cx } from "@/ui/cx";
import { controlClass, labelClass } from "@/ui/field-class";
import { ChevronDownIcon, ChevronEndIcon, PlusIcon, SearchIcon } from "@/ui/icons";

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
  const workspace = workflowCopy(locale, "listingWorkspace");
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
  let page: Awaited<ReturnType<typeof inventoryListPage>>;
  try {
    page = await inventoryListPage(db, session.actor, {
      ...filters,
      cursor: query.cursor,
    }).catch((error) => {
      if (!query.cursor || !isAppError(error) || error.code !== "validation_failed") throw error;
      restarted = true;
      return inventoryListPage(db, session.actor, filters);
    });
  } catch (error) {
    // No listing.read scope (a member without grants yet): say so instead of crashing (M-003).
    if (isAppError(error) && error.code === "forbidden")
      return (
        <PermissionState
          locale={locale}
          title={copy.inventory}
          about={o10.about}
          session={session}
        />
      );
    throw error;
  }
  if (query.cursor && !restarted && page.rows.length === 0 && page.total > 0) {
    restarted = true;
    page = await inventoryListPage(db, session.actor, filters);
  }
  // Resolve media access independently from listing.read. A list preview never widens the
  // private file endpoint's capability boundary, and unsafe originals are never requested.
  const previewListings = (
    await Promise.all(
      page.rows.map(async (row) =>
        (await can(db, session.actor, "media.manage", {
          type: "listing",
          id: row.listing.id,
          propertyId: row.property.id,
        }))
          ? row.listing.id
          : null,
      ),
    )
  ).filter((id): id is string => Boolean(id));
  const previews = previewListings.length
    ? await db
        .select({ listingId: mediaRelations.listingId, id: mediaAssets.id })
        .from(mediaRelations)
        .innerJoin(mediaAssets, eq(mediaAssets.id, mediaRelations.mediaAssetId))
        .where(
          and(
            inArray(mediaRelations.listingId, previewListings),
            isNull(mediaRelations.removedAt),
            eq(mediaRelations.hidden, false),
            eq(mediaAssets.scan, "clean"),
            eq(mediaAssets.processing, "ready"),
          ),
        )
        .orderBy(asc(mediaRelations.position))
    : [];
  const previewByListing = new Map<string, string>();
  for (const preview of previews)
    if (!previewByListing.has(preview.listingId))
      previewByListing.set(preview.listingId, preview.id);
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
    <div className="flex flex-col gap-4 px-gutter py-5 sm:gap-6 sm:px-gutter-wide sm:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-heading font-semibold sm:text-title">{workspace.directoryTitle}</h1>
        {mayCreate ? (
          <a href={`/${locale}/inventory/new`} className={buttonClass("primary")}>
            <PlusIcon className="size-5" />
            {copy.create}
          </a>
        ) : null}
      </header>
      <form method="get" className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
        {view !== "all" ? <input type="hidden" name="view" value={view} /> : null}
        <div className="min-w-0">
          <label htmlFor="inventory-search" className="sr-only">
            {o10.search}
          </label>
          <input
            id="inventory-search"
            name="q"
            type="search"
            maxLength={searchLimit}
            defaultValue={filters.q}
            placeholder={o10.searchHint}
            aria-describedby="inventory-search-hint"
            className={controlClass}
          />
          <p id="inventory-search-hint" className="sr-only">
            {o10.searchHint}
          </p>
        </div>
        <button type="submit" className={buttonClass("secondary", "min-h-input px-3")}>
          <SearchIcon className="size-5" />
          <span className="sr-only">{o10.apply}</span>
        </button>
        <details className="group contents" open={Boolean(purpose || type)}>
          <summary
            className={buttonClass(
              "secondary",
              "min-h-input list-none px-3 [&::-webkit-details-marker]:hidden",
            )}
          >
            {o10.filters}
            <ChevronDownIcon className="size-4 shrink-0 group-open:rotate-180" />
          </summary>
          <div className="col-span-3 grid gap-3 rounded-control bg-subtle p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            {(
              [
                ["purpose", o10.purpose, listingPurposes, purpose],
                ["type", o10.type, propertyTypes, type],
              ] as const
            ).map(([name, label, values, current]) => (
              <div key={name} className="grid min-w-0 gap-2">
                <label htmlFor={`inventory-${name}`} className={labelClass}>
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
        <ul className="flex flex-wrap gap-x-4 border-b border-divider">
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
                  "flex min-h-control items-center justify-center border-b-2 p-3 text-center text-dense font-semibold no-underline",
                  id === view
                    ? "border-action text-action"
                    : "border-transparent text-text-muted hover:bg-subtle hover:text-text",
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
        <div>
          <div
            aria-hidden="true"
            className="hidden grid-cols-[minmax(0,1fr)_10rem_12rem] gap-5 border-b border-divider px-3 pb-3 text-caption font-semibold text-text-muted xl:grid"
          >
            <span>{o10.list}</span>
            <span>{workspace.facts}</span>
            <span>{workspace.nextAction}</span>
          </div>
          <ul aria-label={o10.list} className="divide-y divide-divider border-b border-divider">
            {shown.map((item) => {
              const preview = previewByListing.get(item.listing.id);
              return (
                <li key={item.listing.id}>
                  <a
                    href={item.href}
                    className="group grid min-w-0 gap-x-5 gap-y-3 py-4 text-dense text-text no-underline hover:bg-subtle sm:px-3 xl:grid-cols-[minmax(0,1fr)_10rem_12rem] xl:items-center"
                  >
                    <span className="flex min-w-0 items-start gap-3 sm:gap-4">
                      <InventoryThumbnail
                        source={
                          preview ? `/api/files/private/media/${preview}?preview=1` : undefined
                        }
                        label={workspace.noPhoto}
                      />
                      <span className="grid min-w-0 gap-1">
                        <span lang="bg" className="font-semibold group-hover:text-action">
                          {item.title || optionLabel(item.property.propertyType, locale)}
                        </span>
                        <span className="text-text-muted">
                          {[item.property.settlement, optionLabel(item.listing.purpose, locale)]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        <span className="break-words text-caption text-text-muted">
                          <bdi>{item.listing.reference}</bdi> ·{" "}
                          {optionLabel(item.listing.editorialState, locale)}
                        </span>
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-x-3 gap-y-1 font-medium tabular-nums xl:grid xl:gap-1">
                      {item.detail.filter(Boolean).map((value) => (
                        <span key={value}>{value}</span>
                      ))}
                    </span>
                    <span className="flex min-w-0 items-center justify-between gap-3">
                      <span
                        className={
                          item.needsAction ? "font-semibold text-action" : "text-text-muted"
                        }
                      >
                        {item.actionLabel || workspace.noAction}
                      </span>
                      <ChevronEndIcon directional className="size-5 shrink-0 text-text-muted" />
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
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
      </div>
    </div>
  );
}
