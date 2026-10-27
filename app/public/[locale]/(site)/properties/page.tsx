// P02/P03/P04/P22: committed URL filters; optional map failure never blocks the list.
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { discoveryCopy } from "@/features/discovery/copy";
import { ListingGrid } from "@/features/discovery/listing-card";
import { mapCopy } from "@/features/discovery/map-copy";
import { DiscoveryPage } from "@/features/discovery/page";
import { listingHref, locality, priceText } from "@/features/discovery/presentation";
import {
  ambiguousFilters,
  filterUrl,
  type QueryParams,
  readFilters,
  searchInput,
} from "@/features/discovery/query";
import { ResultsCompletion } from "@/features/discovery/results-completion";
import { ResultsSort } from "@/features/discovery/results-controls";
import { searchAlertCopy, searchAlertCopyLocale } from "@/features/discovery/search-alert-copy";
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
      <h1 id="discovery-title" tabIndex={-1} className="text-title font-semibold">
        {copy.search}
      </h1>
      <ResultsCompletion
        locale={locale}
        identity={`${result?.queryId ?? "unavailable"}:${typeof query.cursor === "string" ? query.cursor : ""}`}
        message={
          result
            ? copy.resultsUpdated.replace(
                "{count}",
                `${result.count.type === "estimated" ? `${copy.atLeast} ` : ""}${formatNumber(locale, result.count.value)}`,
              )
            : invalid
              ? copy.check
              : copy.failed
        }
        success={Boolean(result)}
        offlineTitle={copy.offlineSearch}
      />
      {result ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
            <h2 id="results-heading" tabIndex={-1} className="text-heading font-semibold">
              {copy.results}: {result.count.type === "estimated" ? `${copy.atLeast} ` : ""}
              {formatNumber(locale, result.count.value)}
            </h2>
            <ResultsSort locale={locale} values={values} copy={copy} />
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {result.items.length ? (
                <a
                  className="inline-flex min-h-control items-center font-semibold text-action underline underline-offset-4"
                  href="#property-results"
                >
                  {mapCopy(locale).list}
                </a>
              ) : null}
              <a
                className="inline-flex min-h-control items-center text-action underline underline-offset-4"
                href={alertSearch(locale, values).publicHref}
                lang={searchAlertCopyLocale(locale)}
                dir={locale === "he" ? "rtl" : "ltr"}
              >
                {searchAlertCopy(locale).entry}
              </a>
            </div>
          </div>
          <p className="text-caption text-text-muted">
            {result.position ? (
              <>
                {copy.pagePosition.replace(
                  "{position}",
                  String(Math.floor(result.position.before / result.pageSize) + 1),
                )}{" "}
                ·{" "}
              </>
            ) : null}
            {copy.shownResults.replace("{count}", formatNumber(locale, result.items.length))}
          </p>
          {!result.items.length ? <p>{result.count.value ? copy.emptyPage : copy.none}</p> : null}
          {result.partial || result.stale ? <Notice tone="warning" title={copy.partial} /> : null}
        </div>
      ) : (
        <Notice tone="warning" title={invalid ? copy.check : copy.failed}>
          <p>{invalid ? copy.invalid : copy.retained}</p>
        </Notice>
      )}
      <SearchForm locale={locale} copy={copy} values={values} filtersOpen={!result} />
      {result ? (
        <>
          <SearchMap
            locale={locale}
            release={publicMapRelease()}
            copy={mapCopy(locale)}
            filters={values}
            items={result.items.flatMap((item) =>
              item.place.mapPoint
                ? [
                    {
                      reference: item.reference,
                      href: listingHref(item, locale),
                      label: `${item.reference} · ${locality(item)} · ${priceText(item.price, locale, copy)}`,
                      price: priceText(item.price, locale, copy).split(" · ")[0],
                      point: item.place.mapPoint,
                    },
                  ]
                : [],
            )}
          >
            {result.items.length ? (
              <section id="property-results" tabIndex={-1} aria-labelledby="results-heading">
                <ListingGrid
                  items={result.items}
                  locale={locale}
                  copy={copy}
                  headingLevel={3}
                  returnTo={filterUrl(
                    locale,
                    values,
                    typeof query.cursor === "string" ? query.cursor : undefined,
                  )}
                />
              </section>
            ) : (
              <div className="space-y-4">
                <a className="underline" href="#property-search">
                  {copy.filters}
                </a>
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
          </SearchMap>
          <nav
            aria-label={copy.results}
            className="flex flex-wrap items-center gap-3"
            data-print-hide=""
          >
            {result.hasPrevious ? (
              <>
                <a
                  className={buttonClass("secondary")}
                  href={`${filterUrl(locale, values)}#results-heading`}
                >
                  {copy.firstPage}
                </a>
                <a
                  className={buttonClass("secondary")}
                  href={`${filterUrl(locale, values, result.previousCursor ?? undefined)}#results-heading`}
                >
                  {copy.previousPage}
                </a>
              </>
            ) : null}
            {result.nextCursor ? (
              <a
                className={buttonClass("secondary")}
                href={`${filterUrl(locale, values, result.nextCursor)}#results-heading`}
              >
                {copy.more}
              </a>
            ) : null}
          </nav>
        </>
      ) : null}
    </DiscoveryPage>
  );
}
