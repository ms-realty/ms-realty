// P01: intent entry using the same approved inventory projection as P02.
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { discoveryCopy } from "@/features/discovery/copy";
import { ListingGrid } from "@/features/discovery/listing-card";
import { DiscoveryPage, discoveryMetadata } from "@/features/discovery/page";
import { readFilters } from "@/features/discovery/query";
import { SearchForm } from "@/features/discovery/search-form";
import { isRoutableLocale } from "@/i18n/config";
import { searchListings } from "@/server/search/search";
import { buttonClass } from "@/ui/button-class";
export const metadata = discoveryMetadata;
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) notFound();
  const copy = discoveryCopy(locale);
  let result: Awaited<ReturnType<typeof searchListings>> | null = null;
  try {
    result = await searchListings(getDb(), {
      locale,
      purpose: "sale",
      pageSize: 3,
      sort: "newest",
    });
  } catch {
    /* Keep the inquiry entry available during a search outage. */
  }

  return (
    <DiscoveryPage>
      <header className="max-w-reading space-y-4">
        <p className="text-compact font-semibold">MS Realty</p>
        <h1 className="text-title font-semibold">{copy.properties}</h1>
        <p className="text-body text-text-muted">{copy.intro}</p>
      </header>
      <SearchForm locale={locale} copy={copy} values={readFilters({})} compact />
      <nav aria-label={copy.purpose} className="flex flex-wrap gap-3">
        <a className={buttonClass("secondary")} href={`/${locale}/properties?purpose=sale`}>
          {copy.buy}
        </a>
        <a
          className={buttonClass("secondary")}
          href={`/${locale}/properties?purpose=long_term_rent`}
        >
          {copy.rent}
        </a>
        <a
          className={buttonClass("secondary")}
          href={`/${locale}/inquire?purpose=seller_consultation`}
        >
          {copy.sell}
        </a>
        <a
          className={buttonClass("secondary")}
          href={`/${locale}/inquire?purpose=landlord_consultation`}
        >
          {copy.let}
        </a>
      </nav>
      {result?.items.length ? (
        <ListingGrid items={result.items} locale={locale} copy={copy} />
      ) : (
        <p>{result ? copy.none : copy.failed}</p>
      )}
      <a className="self-start font-semibold underline" href={`/${locale}/inquire`}>
        {copy.ask}
      </a>
    </DiscoveryPage>
  );
}
