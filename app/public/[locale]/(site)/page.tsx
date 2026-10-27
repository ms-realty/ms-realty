// P01: intent entry using the same approved inventory projection as P02.
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { discoveryCopy } from "@/features/discovery/copy";
import { loadHomeDiscovery } from "@/features/discovery/home-data";
import { ListingGrid } from "@/features/discovery/listing-card";
import { DiscoveryPage } from "@/features/discovery/page";
import { readFilters } from "@/features/discovery/query";
import { SearchForm } from "@/features/discovery/search-form";
import { isRoutableLocale } from "@/i18n/config";
import { publicRouteMetadata } from "@/server/seo/public-metadata";
import { buttonClass } from "@/ui/button-class";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicRouteMetadata((await params).locale, "/");
}
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) notFound();
  const copy = discoveryCopy(locale);
  const data = await loadHomeDiscovery(getDb(), locale);

  return (
    <DiscoveryPage>
      <header className="max-w-reading space-y-5 py-3 md:py-8">
        <p className="text-compact font-semibold">MS Realty</p>
        <h1 className="text-title font-semibold">{copy.homeTitle}</h1>
        <p className="text-body text-text-muted">{copy.homeLead}</p>
      </header>
      <div className="rounded-panel border border-divider bg-surface p-5 shadow-raised md:p-6">
        <SearchForm locale={locale} copy={copy} values={readFilters({})} compact />
      </div>
      <nav aria-label={copy.searchPurpose} className="flex flex-wrap gap-3">
        <a className={buttonClass("secondary")} href={`/${locale}/properties?purpose=sale`}>
          {copy.buy}
        </a>
        <a
          className={buttonClass("secondary")}
          href={`/${locale}/properties?purpose=long_term_rent`}
        >
          {copy.rent}
        </a>
      </nav>
      {(
        [
          ["sale", copy.forSale, data.sales],
          ["long_term_rent", copy.forRent, data.rentals],
        ] as const
      ).map(([purpose, title, result]) => (
        <section key={purpose} className="space-y-5" aria-labelledby={`home-${purpose}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id={`home-${purpose}`} className="text-heading font-semibold">
              {title}
            </h2>
            <a
              className="inline-flex min-h-control items-center font-semibold text-action underline"
              href={`/${locale}/properties?purpose=${purpose}`}
            >
              {purpose === "sale" ? copy.buy : copy.rent}
            </a>
          </div>
          {result?.items.length ? (
            <ListingGrid items={result.items} locale={locale} copy={copy} headingLevel={3} />
          ) : (
            <p className="text-text-muted">{result ? copy.none : copy.failed}</p>
          )}
        </section>
      ))}
      <div className="grid gap-5 border-y border-divider py-7 sm:grid-cols-2">
        {(
          [
            ["sell", copy.sell],
            ["let", copy.let],
          ] as const
        ).map(([path, label]) => (
          <section
            key={path}
            className="flex min-w-0 flex-col items-start gap-3 rounded-panel bg-subtle p-5"
          >
            <h2 className="text-heading font-semibold">{label}</h2>
            <a className={buttonClass("secondary")} href={`/${locale}/${path}`}>
              {copy.ask}
            </a>
          </section>
        ))}
      </div>
      <section className="space-y-4" aria-labelledby="home-areas">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="home-areas" className="text-heading font-semibold">
            {copy.exploreAreas}
          </h2>
          <a className="inline-flex min-h-control items-center underline" href={`/${locale}/areas`}>
            {copy.exploreAreas}
          </a>
        </div>
        {data.areas.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.areas.map((area) => (
              <li key={area.slug}>
                <a
                  className="flex min-h-control items-center justify-between gap-3 rounded-panel border border-divider bg-surface p-4 font-semibold underline underline-offset-4"
                  href={`/${locale}/areas/${area.slug}`}
                >
                  {area.title}
                  <span aria-hidden="true">→</span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      {data.services.length ? (
        <section className="space-y-4" aria-labelledby="home-services">
          <h2 id="home-services" className="text-heading font-semibold">
            {copy.exploreServices}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.services.map((service) => (
              <li key={service.slug}>
                <a
                  className="flex min-h-control items-center rounded-panel border border-divider bg-surface p-4 font-semibold underline"
                  href={`/${locale}/services/${service.slug}`}
                >
                  {service.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </DiscoveryPage>
  );
}
