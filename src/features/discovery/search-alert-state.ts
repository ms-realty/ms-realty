import type { PublicLocale } from "@/i18n/config";
import { AppError } from "@/server/errors";
import { normalizeSearch } from "@/server/search/search";
import { criteriaFilters } from "./intent-query";
import { ambiguousFilters, filterUrl, type QueryParams, readFilters, searchInput } from "./query";

/** P10 carries every committed criterion, including the explicit unknown-fact policy. */
export function alertSearch(locale: PublicLocale, query: QueryParams) {
  if (query.context !== undefined || ambiguousFilters(query))
    throw new AppError("validation_failed");
  const normalized = normalizeSearch(searchInput(locale, readFilters(query)));
  const filters = {
    ...criteriaFilters(normalized.criteria),
    q: normalized.q ?? "",
    sort: normalized.sort,
  };
  const searchHref = filterUrl(locale, filters);
  const queryString = searchHref.slice(searchHref.indexOf("?"));
  return {
    normalized,
    filters,
    searchHref,
    publicHref: `/${locale}/search-alerts${queryString}`,
    clientHref: `/${locale}/preferences/search-alerts${queryString}`,
    input: searchInput(locale, filters),
  };
}
export type AlertSearch = ReturnType<typeof alertSearch>;
export type SearchAlertValues = {
  contactMethodId: string;
  frequency: string;
  timezone: string;
  confirmed: string;
  proof: string;
};
