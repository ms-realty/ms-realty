import type { PublicLocale } from "@/i18n/config";
import { ambiguousFilters, filterNames, filterUrl, type QueryParams, readFilters } from "./query";

/** F02: only the current locale's public search, bounded filters and a query-checked cursor. */
export function safeSearchReturn(locale: PublicLocale, value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > 10000 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    [...value].some((character) => character.charCodeAt(0) < 32)
  )
    return null;
  const url = new URL(value, "https://public.invalid");
  if (url.origin !== "https://public.invalid" || url.pathname !== `/${locale}/properties`)
    return null;
  if (
    [...url.searchParams.keys()].some(
      (key) => !(filterNames as readonly string[]).includes(key) && key !== "cursor",
    )
  )
    return null;
  const params: QueryParams = Object.fromEntries(
    [...new Set(url.searchParams.keys())].map((key) => [
      key,
      url.searchParams.getAll(key).length > 1
        ? url.searchParams.getAll(key)
        : (url.searchParams.get(key) ?? ""),
    ]),
  );
  if (ambiguousFilters(params)) return null;
  const values = readFilters(params);
  if (values.q.length > 100 || Object.values(values).some((field) => field.length > 2000))
    return null;
  const cursor = url.searchParams.get("cursor") || undefined;
  if (cursor && (cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor))) return null;
  if (url.hash && !/^#property-result-MS-\d{5,}$/.test(url.hash)) return null;
  return `${filterUrl(locale, values, cursor)}${url.hash}`;
}

export const resultAnchor = (reference: string) => `property-result-${reference}`;
