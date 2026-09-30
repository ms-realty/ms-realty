// Public search (architecture §10, §12; AT04, AT05, AT07). Parameterized SQL over the per-locale
// projection, joined to the one eligibility subquery, so results, counts, facets and place
// suggestions can only ever contain listings that are public in the requested locale.
//
// Filter semantics mirror src/domain/search/filters.ts (the shared case table in
// src/domain/search/filter-cases.ts runs against both): OR within a facet, AND across facets,
// unknown is never a match, and results that need confirmation appear only when the visitor
// explicitly includes them. Availability is read live from the listing, as presented to the
// visitor (an expired confirmation reads as confirmation required).
import "server-only";
import { and, arrayOverlaps, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import { listingSearchDocuments as doc, listings } from "@/db/schema";
import { canonicalJson } from "@/domain/approval";
import { listingPurposes, propertyTypes } from "@/domain/facts";
import { currencyCodes, type PublicLocale, parseReference, publicLocales } from "@/domain/ids";
import {
  availabilityReviewIntervalDays,
  type CommercialState,
  commercialStates,
} from "@/domain/listing";
import { type SearchCriteria, searchPricePeriod } from "@/domain/search/filters";
import { sha256Hex } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import type { ListingCard, PlaceCount } from "../listings/view-models";
import {
  eligiblePublications,
  loadPlaceChains,
  loadPublishedListings,
  type PlaceNode,
  placeName,
  toCard,
} from "../publication/presentation";

export const defaultPageSize = 24;
export const maxPageSize = 60;
/** Counts above this are reported as an estimate (a lower bound), not an exact number. */
export const exactCountLimit = 10_000;

export const searchSorts = ["relevance", "newest", "price_asc", "price_desc"] as const;
export type SearchSort = (typeof searchSorts)[number];

/** Area bases the projection carries; another basis is never substituted. */
export const searchableAreaBases = ["living", "built", "total", "land"] as const;

/** Commercial states that are still an offer; sold, let and withdrawn are history. */
export const offeredStates: readonly CommercialState[] = [
  "available",
  "confirmation_required",
  "negotiating",
  "reserved_with_recorded_basis",
];

// Input.

const count = z.number().int().min(0).max(1_000_000_000_000);
const range = <T extends z.ZodNumber>(n: T) =>
  z
    .object({ min: n.optional(), max: n.optional() })
    .strict()
    .refine((r) => r.min === undefined || r.max === undefined || r.min <= r.max, "min_above_max");

const searchInput = z
  .object({
    locale: z.enum(publicLocales),
    purpose: z.enum(listingPurposes),
    propertyTypes: z.array(z.enum(propertyTypes)).max(propertyTypes.length).optional(),
    placeIds: z.array(z.uuid()).max(20).optional(),
    availability: z.array(z.enum(commercialStates)).max(commercialStates.length).optional(),
    /** Minor units in `currency`, for the purpose's price period (total or month). */
    price: z
      .object({ currency: z.enum(currencyCodes), min: count.optional(), max: count.optional() })
      .strict()
      .refine((r) => r.min === undefined || r.max === undefined || r.min <= r.max, "min_above_max")
      .optional(),
    bedrooms: range(z.number().int().min(0).max(100)).optional(),
    rooms: range(z.number().int().min(0).max(100)).optional(),
    area: z
      .object({
        basis: z.enum(searchableAreaBases),
        min: z.number().min(0).max(10_000_000).optional(),
        max: z.number().min(0).max(10_000_000).optional(),
      })
      .strict()
      .refine((r) => r.min === undefined || r.max === undefined || r.min <= r.max, "min_above_max")
      .optional(),
    /** Features that must be known to be true. */
    mustHave: z
      .array(z.string().regex(/^[a-z0-9_]{1,40}$/))
      .max(20)
      .optional(),
    /** Explicit opt-in: include listings where a criterion is not known either way. */
    includeUnconfirmed: z.boolean().optional(),
    q: z.string().trim().max(100).optional(),
    sort: z.enum(searchSorts).optional(),
    pageSize: z.number().int().min(1).max(maxPageSize).optional(),
    cursor: z.string().max(512).optional(),
  })
  .strict();

export type SearchInput = z.input<typeof searchInput>;

export interface NormalizedSearch {
  readonly locale: PublicLocale;
  readonly criteria: SearchCriteria;
  readonly q: string | null;
  readonly sort: SearchSort;
  readonly pageSize: number;
  readonly cursor: string | null;
}

function sortedUnique<T extends string>(values: readonly T[] | undefined): T[] | undefined {
  return values?.length ? [...new Set(values)].sort() : undefined;
}

function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "query";
    const code = /^[a-z_]+$/.test(issue.message) ? issue.message : issue.code;
    errors[key] = [...new Set([...(errors[key] ?? []), code])];
  }
  return errors;
}

/** Validates a search and returns the filters as applied, defaults included. */
export function normalizeSearch(input: unknown): NormalizedSearch {
  const parsed = searchInput.safeParse(input);
  if (!parsed.success) {
    throw new AppError("validation_failed", { fieldErrors: fieldErrorsOf(parsed.error) });
  }
  const v = parsed.data;
  const propertyTypes = sortedUnique(v.propertyTypes);
  const placeIds = sortedUnique(v.placeIds?.map((id) => id.toLowerCase()));
  const mustHave = sortedUnique(v.mustHave);
  const criteria: SearchCriteria = {
    purpose: v.purpose,
    ...(propertyTypes ? { propertyTypes } : {}),
    ...(placeIds ? { placeIds } : {}),
    // Sold, let and withdrawn listings are history, not offers: shown only when asked for.
    availability: sortedUnique(v.availability) ?? [...offeredStates].sort(),
    ...(v.price ? { price: v.price } : {}),
    ...(v.bedrooms ? { bedrooms: v.bedrooms } : {}),
    ...(v.rooms ? { rooms: v.rooms } : {}),
    ...(v.area ? { area: v.area } : {}),
    ...(mustHave ? { mustHave } : {}),
    includeNeedsConfirmation: v.includeUnconfirmed === true,
  };
  return {
    locale: v.locale,
    criteria,
    q: v.q ? v.q : null,
    sort: v.sort ?? "relevance",
    pageSize: v.pageSize ?? defaultPageSize,
    cursor: v.cursor ?? null,
  };
}

/** Identity of the query (not the page): cursors and stale replies are checked against it. */
export function queryIdOf(search: NormalizedSearch): string {
  const { cursor: _cursor, ...identity } = search;
  return sha256Hex(canonicalJson(identity)).slice(0, 24);
}

// Cursor: bound to the query identity; carries the sort key of the last row and what the first
// page saw, so a changed inventory is flagged instead of presented as an immutable snapshot.

interface Cursor {
  readonly query: string;
  readonly key: readonly [string, string, string];
  readonly total: number;
  readonly asOf: string;
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(value: string, queryId: string): Cursor {
  const invalid = () => new AppError("validation_failed", { fieldErrors: { cursor: ["invalid"] } });
  let cursor: Cursor;
  try {
    cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
  } catch {
    throw invalid();
  }
  const [k1, k2, id] = Array.isArray(cursor?.key) ? cursor.key : [];
  if (
    typeof k1 !== "string" ||
    !/^-?\d+(\.\d+)?$/.test(k1) ||
    typeof k2 !== "string" ||
    !/^-?\d+(\.\d+)?$/.test(k2) ||
    typeof id !== "string" ||
    !z.uuid().safeParse(id).success ||
    typeof cursor.total !== "number" ||
    Number.isNaN(Date.parse(String(cursor.asOf)))
  ) {
    throw invalid();
  }
  if (cursor.query !== queryId) {
    throw new AppError("validation_failed", { fieldErrors: { cursor: ["query_changed"] } });
  }
  return cursor;
}

// SQL.

const MATCH = 2;
const UNCONFIRMED = 1;

/** The availability a visitor is shown, as SQL: available needs a confirmation under policy. */
function presentedAvailability(now: Date): SQL {
  const days = sql.join(
    Object.entries(availabilityReviewIntervalDays).map(
      ([purpose, d]) => sql`when ${purpose} then ${d}::int`,
    ),
    sql` `,
  );
  const fresh = sql`(${listings.availabilityConfirmedAt} is not null
    and ${listings.freshnessState} <> 'conflicting'
    and ${listings.availabilityConfirmedAt} + make_interval(days => case ${listings.purpose}::text ${days} end)
      > ${now.toISOString()}::timestamptz)`;
  return sql`(case when ${listings.commercialState} = 'available' and not ${fresh}
    then 'confirmation_required' else ${listings.commercialState}::text end)`;
}

function inRange(column: SQL | AnyPgColumn, r: { min?: number; max?: number }): SQL {
  return sql`(${r.min === undefined ? sql`true` : sql`${column} >= ${r.min}`}
    and ${r.max === undefined ? sql`true` : sql`${column} <= ${r.max}`})`;
}

/** 2 match · 1 needs confirmation · 0 no match, like filters.ts for a numeric fact. */
function numberCheck(
  state: AnyPgColumn,
  value: AnyPgColumn,
  r: { min?: number; max?: number },
): SQL {
  return sql`(case when ${state} = 'known' and ${value} is not null
      then (case when ${inRange(value, r)} then ${MATCH} else 0 end)
    when ${state} = 'not_applicable' then 0 else ${UNCONFIRMED} end)`;
}

const areaColumns = {
  living: [doc.livingAreaState, doc.livingArea],
  built: [doc.builtAreaState, doc.builtArea],
  total: [doc.totalAreaState, doc.totalArea],
  land: [doc.landAreaState, doc.landArea],
} as const;

function comparablePrice(criteria: SearchCriteria): SQL {
  const currency = criteria.price?.currency ?? "EUR";
  return sql`(${doc.priceState} = 'known' and ${doc.priceAmountMinor} is not null
    and ${doc.pricePeriod} = ${searchPricePeriod[criteria.purpose]}
    and ${doc.priceCurrency} = ${currency})`;
}

/** The criteria that can be unknown, each classified 2/1/0 in SQL. */
function factChecks(criteria: SearchCriteria): { name: string; check: SQL }[] {
  const checks: { name: string; check: SQL }[] = [];
  const { price } = criteria;
  if (price) {
    // A missing price is never zero; no period or currency is reinterpreted.
    checks.push({
      name: "price",
      check: sql`(case when ${doc.priceState} = 'known' and ${doc.priceAmountMinor} is not null
          then (case when ${doc.pricePeriod} <> ${searchPricePeriod[criteria.purpose]}
                       or ${doc.priceCurrency} <> ${price.currency} then ${UNCONFIRMED}
                     when ${inRange(sql`${doc.priceAmountMinor}`, price)} then ${MATCH} else 0 end)
        when ${doc.priceState} = 'not_applicable' then 0 else ${UNCONFIRMED} end)`,
    });
  }
  if (criteria.bedrooms) {
    checks.push({
      name: "bedrooms",
      check: numberCheck(doc.bedroomsState, doc.bedrooms, criteria.bedrooms),
    });
  }
  if (criteria.rooms) {
    checks.push({ name: "rooms", check: numberCheck(doc.roomsState, doc.rooms, criteria.rooms) });
  }
  if (criteria.area) {
    const basis = criteria.area.basis as (typeof searchableAreaBases)[number];
    const [state, value] = areaColumns[basis];
    checks.push({
      name: `area.${basis}`,
      check: sql`(case when ${state} = 'known' and ${value} is not null
          then (case when ${inRange(sql`${value}`, criteria.area)} then ${MATCH} else 0 end)
        when ${state} = 'not_applicable' then 0 else ${UNCONFIRMED} end)`,
    });
  }
  for (const key of criteria.mustHave ?? []) {
    // Only a known true satisfies a must-have; a feature never recorded is unknown, not false.
    checks.push({
      name: `feature.${key}`,
      check: sql`(case ${doc.features}->>${key} when 'true' then ${MATCH} when 'false' then 0
        when 'not_applicable' then 0 else ${UNCONFIRMED} end)`,
    });
  }
  return checks;
}

function textCondition(q: string | null): SQL | undefined {
  if (!q) return undefined;
  // An exact stable reference wins over any text match.
  const reference = parseReference(q);
  if (reference?.kind === "listing") return eq(doc.reference, reference.reference);
  return sql`(${doc.searchVector} @@ plainto_tsquery('simple', immutable_unaccent(${q}))
    or word_similarity(lower(immutable_unaccent(${q})), lower(immutable_unaccent(${doc.searchText}))) >= 0.5)`;
}

interface Plan {
  readonly where: (options?: { withoutPropertyTypes?: boolean }) => SQL | undefined;
  readonly rank: SQL;
  readonly unconfirmed: SQL;
}

function plan(search: NormalizedSearch, now: Date): Plan {
  const { criteria } = search;
  const checks = factChecks(criteria);
  const include = criteria.includeNeedsConfirmation === true;
  const availability = criteria.availability ?? offeredStates;
  const where = (options: { withoutPropertyTypes?: boolean } = {}) =>
    and(
      eq(doc.locale, search.locale),
      eq(doc.purpose, criteria.purpose),
      criteria.propertyTypes && !options.withoutPropertyTypes
        ? inArray(doc.propertyType, [...criteria.propertyTypes])
        : undefined,
      criteria.placeIds ? arrayOverlaps(doc.placeIds, [...criteria.placeIds]) : undefined,
      sql`${presentedAvailability(now)} in (${sql.join(
        availability.map((s) => sql`${s}`),
        sql`, `,
      )})`,
      textCondition(search.q),
      ...checks.map(({ check }) => (include ? sql`${check} > 0` : sql`${check} = ${MATCH}`)),
    );
  const rank = checks.length
    ? sql`(case when least(${sql.join(
        checks.map((c) => c.check),
        sql`, `,
      )}) = ${MATCH} then 0 else 1 end)`
    : sql`0`;
  const unconfirmed = checks.length
    ? sql`array_remove(array[${sql.join(
        checks.map((c) => sql`case when ${c.check} = ${UNCONFIRMED} then ${c.name}::text end`),
        sql`, `,
      )}]::text[], null)`
    : sql`'{}'::text[]`;
  return { where, rank, unconfirmed };
}

function sortKeys(search: NormalizedSearch, rank: SQL, activatedAt: SQL): [SQL, SQL] {
  const comparable = comparablePrice(search.criteria);
  switch (search.sort) {
    // Default: exact criteria fit first, then the most recently confirmed availability.
    case "relevance":
      return [rank, sql`-coalesce(extract(epoch from ${listings.availabilityConfirmedAt}), 0)`];
    case "newest":
      return [sql`0`, sql`-extract(epoch from ${activatedAt})`];
    // Prices that cannot be compared (unknown, other period or currency) sort last.
    case "price_asc":
      return [
        sql`(case when ${comparable} then 0 else 1 end)`,
        sql`(case when ${comparable} then ${doc.priceAmountMinor} else 0 end)`,
      ];
    case "price_desc":
      return [
        sql`(case when ${comparable} then 0 else 1 end)`,
        sql`(case when ${comparable} then -${doc.priceAmountMinor} else 0 end)`,
      ];
  }
}

// Search.

export interface SearchResultItem extends ListingCard {
  /** needs_confirmation only when the visitor included unconfirmed results. */
  readonly match: "match" | "needs_confirmation";
  /** Criteria this listing could not be shown to satisfy because a value is not known. */
  readonly unconfirmed: readonly string[];
}

export interface SearchResponse {
  /** Identity of this query (filters, sort, locale, page size), for ignoring stale replies. */
  readonly queryId: string;
  readonly locale: PublicLocale;
  /** The filters as applied, defaults included (availability defaults to offered states). */
  readonly criteria: SearchCriteria;
  readonly q: string | null;
  readonly sort: SearchSort;
  readonly pageSize: number;
  readonly items: readonly SearchResultItem[];
  /** Opaque, bound to `queryId`; null on the last page. */
  readonly nextCursor: string | null;
  /** `estimated` is a lower bound above the exact-count limit. */
  readonly count: { readonly value: number; readonly type: "exact" | "estimated" };
  /** Each count is what selecting that type alone would return with the other filters. */
  readonly facets: {
    readonly propertyType: readonly { readonly value: string; readonly count: number }[];
  };
  /** ISO 8601 instant the results were read at. */
  readonly sourceTimestamp: string;
  /** Some requested scope could not be served; the results are incomplete. */
  readonly partial: boolean;
  /** Inventory changed since the first page: offer a refresh rather than a snapshot. */
  readonly stale: boolean;
}

export async function searchListings(
  db: Executor,
  input: unknown,
  options: { readonly now?: Date } = {},
): Promise<SearchResponse> {
  const now = options.now ?? new Date();
  const search = normalizeSearch(input);
  const queryId = queryIdOf(search);
  const cursor = search.cursor ? decodeCursor(search.cursor, queryId) : null;
  const eligible = eligiblePublications(db, search.locale);
  const { where, rank, unconfirmed } = plan(search, now);
  const [k1, k2] = sortKeys(search, rank, sql`${eligible.activatedAt}`);
  // Share this statement's eligible, filtered projection across page, facets and freshness.
  // Keep all selective criteria inside the CTE except property type, which facets ignore.
  // This is not a publication cache: hydration below rechecks current publication and consent.
  const base = db.$with("matching").as(
    db
      .select({
        listingId: doc.listingId,
        propertyType: doc.propertyType,
        activatedAt: sql<Date>`${eligible.activatedAt}`.as("activated_at"),
        k1: sql<string>`(${k1})::numeric`.as("k1"),
        k2: sql<string>`(${k2})::numeric`.as("k2"),
        rank: sql<number>`${rank}`.as("rank"),
        unconfirmed: sql<string[]>`${unconfirmed}`.as("unconfirmed"),
      })
      .from(doc)
      .innerJoin(
        eligible,
        and(eq(eligible.listingId, doc.listingId), eq(eligible.manifestId, doc.manifestId)),
      )
      .innerJoin(listings, eq(listings.id, doc.listingId))
      .where(where({ withoutPropertyTypes: true })),
  );
  const selectedTypes = search.criteria.propertyTypes
    ? inArray(base.propertyType, [...search.criteria.propertyTypes])
    : undefined;
  const pageQuery = db
    .select({
      listingId: base.listingId,
      k1: base.k1,
      k2: base.k2,
      rank: base.rank,
      unconfirmed: base.unconfirmed,
    })
    .from(base)
    .where(
      and(
        selectedTypes,
        cursor
          ? sql`(${base.k1}, ${base.k2}, ${base.listingId}) >
              (${cursor.key[0]}::numeric, ${cursor.key[1]}::numeric, ${cursor.key[2]}::uuid)`
          : undefined,
      ),
    )
    .orderBy(base.k1, base.k2, base.listingId)
    .limit(search.pageSize + 1)
    .as("search_page");
  const facetQuery = db
    .select({ value: base.propertyType, count: sql<number>`count(*)::int`.as("count") })
    .from(base)
    .groupBy(base.propertyType)
    .as("search_facets");
  type MatchRow = {
    listingId: string;
    k1: string;
    k2: string;
    rank: number;
    unconfirmed: string[];
  };
  type FacetRow = { value: (typeof propertyTypes)[number]; count: number };
  const [projection] = await db
    .with(base)
    .select({
      // Preserve numeric cursor keys as text; JSON numbers would round precise sort keys.
      rows: sql<MatchRow[]>`coalesce((select json_agg(json_build_object(
      'listingId', ${pageQuery.listingId}, 'k1', ${pageQuery.k1}::text,
      'k2', ${pageQuery.k2}::text, 'rank', ${pageQuery.rank},
      'unconfirmed', ${pageQuery.unconfirmed}
    ) order by ${pageQuery.k1}, ${pageQuery.k2}, ${pageQuery.listingId})
      from ${pageQuery}), '[]'::json)`,
      facets: sql<FacetRow[]>`coalesce((select json_agg(json_build_object(
      'value', ${facetQuery.value}, 'count', ${facetQuery.count}
    )) from ${facetQuery}), '[]'::json)`,
      latestAt: cursor
        ? sql<string | null>`(select max(${base.activatedAt})::text from ${base}
          where ${selectedTypes ?? sql`true`})`
        : sql<null>`null`,
    })
    .from(sql`(select 1) as search_response`);
  if (!projection) throw new Error("Search projection returned no row");
  const { rows, facets: facetRows } = projection;
  // Facets already count the eligible set with every filter except property type. Summing
  // only selected types gives the same total without a second full eligibility scan. Keep
  // the capped cursor/count contract: above the limit we still expose only a lower bound.
  const total = Math.min(
    exactCountLimit + 1,
    facetRows.reduce(
      (n, facet) =>
        !search.criteria.propertyTypes || search.criteria.propertyTypes.includes(facet.value)
          ? n + facet.count
          : n,
      0,
    ),
  );

  const page = rows.slice(0, search.pageSize);
  const published = await loadPublishedListings(
    db,
    { ids: page.map((r) => r.listingId) },
    search.locale,
  );
  const byId = new Map(published.map((p) => [p.listingId, p]));
  const items = page.flatMap((row): SearchResultItem[] => {
    // A listing withdrawn between the two reads is left out and the page flagged stale.
    const listing = byId.get(row.listingId);
    if (!listing) return [];
    return [
      {
        ...toCard(listing, now),
        match: Number(row.rank) === 0 ? "match" : "needs_confirmation",
        unconfirmed: row.unconfirmed,
      },
    ];
  });

  let stale = items.length !== page.length;
  if (cursor) {
    const latestAt = projection.latestAt ? new Date(projection.latestAt) : new Date(0);
    stale ||= total !== cursor.total || latestAt > new Date(cursor.asOf);
  }
  const last = page.at(-1);
  const nextCursor =
    rows.length > search.pageSize && last
      ? encodeCursor({
          query: queryId,
          key: [String(last.k1), String(last.k2), last.listingId],
          total: cursor?.total ?? total,
          asOf: cursor?.asOf ?? now.toISOString(),
        })
      : null;

  const { cursor: _cursor, ...applied } = search;
  return {
    queryId,
    ...applied,
    items,
    nextCursor,
    count: {
      value: Math.min(total, exactCountLimit),
      type: total > exactCountLimit ? "estimated" : "exact",
    },
    facets: {
      propertyType: facetRows
        .map((f) => ({ value: f.value, count: f.count }))
        .sort((a, b) => a.value.localeCompare(b.value)),
    },
    sourceTimestamp: now.toISOString(),
    partial: false,
    stale,
  };
}

/**
 * Places a search can be narrowed to, with how many offered public listings each holds in the
 * locale. Built from the same eligible projection, so an unpublished listing adds nothing.
 */
export async function listSearchPlaces(
  db: Executor,
  input: { readonly locale: PublicLocale; readonly purpose?: SearchCriteria["purpose"] },
  options: { readonly now?: Date } = {},
): Promise<PlaceCount[]> {
  const now = options.now ?? new Date();
  const eligible = eligiblePublications(db, input.locale);
  const place = sql<string>`unnest(${doc.placeIds})`;
  const rows = await db
    .select({ placeId: place, count: sql<number>`count(*)::int` })
    .from(doc)
    .innerJoin(
      eligible,
      and(eq(eligible.listingId, doc.listingId), eq(eligible.manifestId, doc.manifestId)),
    )
    .innerJoin(listings, eq(listings.id, doc.listingId))
    .where(
      and(
        eq(doc.locale, input.locale),
        input.purpose ? eq(doc.purpose, input.purpose) : undefined,
        sql`${presentedAvailability(now)} in (${sql.join(
          offeredStates.map((s) => sql`${s}`),
          sql`, `,
        )})`,
      ),
    )
    .groupBy(place);
  const counts = new Map(rows.map((r) => [r.placeId, r.count]));
  const chains = await loadPlaceChains(db, [...counts.keys()]);
  const places: PlaceCount[] = [];
  for (const [id, n] of counts) {
    const [node, parent] = chains.get(id) ?? [];
    if (!node || (node.level !== "settlement" && node.level !== "municipality")) continue;
    places.push({
      ...placeName(node, input.locale),
      countryCode: node.countryCode,
      parentName: parent ? placeName(parent as PlaceNode, input.locale).name : null,
      count: n,
    });
  }
  return places.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, input.locale));
}
