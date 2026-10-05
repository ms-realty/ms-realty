// P02/P03/P04/P22: committed URL filters; optional map failure never blocks the list.
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { discoveryCopy } from "@/features/discovery/copy";
import { ListingGrid } from "@/features/discovery/listing-card";
import { mapCopy } from "@/features/discovery/map-copy";
import { DiscoveryPage } from "@/features/discovery/page";
import { listingHref, locality } from "@/features/discovery/presentation";
import {
  ambiguousFilters,
  filterUrl,
  type QueryParams,
  readFilters,
  searchInput,
} from "@/features/discovery/query";
import { alertSearch } from "@/features/discovery/search-alert-state";
import { SearchForm } from "@/features/discovery/search-form";
import { SearchMap } from "@/features/discovery/search-map";
import { isRoutableLocale } from "@/i18n/config";
import { formatNumber } from "@/i18n/format";
import { AppError, isAppError } from "@/server/errors";
import { publicMapRelease } from "@/server/publication/map-config";
import { type SearchResponse, searchListings } from "@/server/search/search";
import { publicRouteMetadata } from "@/server/seo/public-metadata";
import { buttonClass } from "@/ui/button-class";
import { Notice } from "@/ui/notice";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicRouteMetadata((await params).locale, "/properties");
}
export default async function PropertiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<QueryParams>;
}) {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) notFound();
  const copy = discoveryCopy(locale),
    query = await searchParams,
    values = readFilters(query);
  let result: SearchResponse | null = null;
  let invalid = false;
  try {
    if (ambiguousFilters(query)) throw new AppError("validation_failed");
    result = await searchListings(
      getDb(),
      searchInput(locale, values, typeof query.cursor === "string" ? query.cursor : undefined),
    );
  } catch (error) {
    invalid = isAppError(error) && error.code === "validation_failed";
  }
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">{copy.search}</h1>
      {result ? (
        <div className="space-y-2">
          <h2 id="results-heading" tabIndex={-1} className="text-heading font-semibold">
            {copy.results}: {result.count.type === "estimated" ? `${copy.atLeast} ` : ""}
            {formatNumber(locale, result.count.value)}
          </h2>
          {!result.items.length ? <p>{copy.none}</p> : null}
          {result.partial || result.stale ? <Notice tone="warning" title={copy.partial} /> : null}
        </div>
      ) : (
        <Notice tone="warning" title={invalid ? copy.check : copy.failed}>
          <p>{invalid ? copy.invalid : copy.retained}</p>
        </Notice>
      )}
      <SearchForm locale={locale} copy={copy} values={values} filtersOpen={!result} />
      {result ? (
        <a
          className={buttonClass("secondary", "self-start")}
          href={alertSearch(locale, values).publicHref}
        >
          {copy.alertEntry}
        </a>
      ) : null}
      {result ? (
        <>
          <SearchMap
            locale={locale}
            release={publicMapRelease()}
            copy={mapCopy(locale)}
            items={result.items.flatMap((item) =>
              item.place.mapPoint
                ? [
                    {
                      reference: item.reference,
                      href: listingHref(item, locale),
                      label: `${item.reference} · ${locality(item)}`,
                      point: item.place.mapPoint,
                    },
                  ]
                : [],
            )}
          />
          {result.items.length ? (
            <section id="property-results" tabIndex={-1} aria-labelledby="results-heading">
              <ListingGrid items={result.items} locale={locale} copy={copy} />
            </section>
          ) : (
            <div className="space-y-4">
              <a className="underline" href={`/${locale}/inquire`}>
                {copy.ask}
              </a>
              {locale !== "bg" ? (
                <p>
                  <a className="underline" href={filterUrl("bg", values)} hrefLang="bg">
                    {copy.source}
                  </a>
                </p>
              ) : null}
            </div>
          )}
          {result.nextCursor ? (
            <a
              className={buttonClass("secondary", "self-start")}
              href={filterUrl(locale, values, result.nextCursor)}
            >
              {copy.more}
            </a>
          ) : null}
        </>
      ) : null}
    </DiscoveryPage>
  );
}
