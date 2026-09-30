// P05/P21: retain safe identity when a publication is restricted or withdrawn.
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { ApprovedGallery } from "@/features/discovery/approved-media";
import { discoveryCopy } from "@/features/discovery/copy";
import { Availability, ListingFacts, ListingGrid } from "@/features/discovery/listing-card";
import { LocalActions } from "@/features/discovery/local-selection";
import { mapCopy } from "@/features/discovery/map-copy";
import { DiscoveryPage, discoveryMetadata } from "@/features/discovery/page";
import { listingHref, locality, priceText } from "@/features/discovery/presentation";
import { SearchMap } from "@/features/discovery/search-map";
import { isRoutableLocale } from "@/i18n/config";
import { getPublicListing } from "@/server/listings/detail";
import { publicMapRelease } from "@/server/publication/map-config";
import { buttonClass } from "@/ui/button-class";
import { Notice } from "@/ui/notice";
export const metadata = discoveryMetadata;
export default async function PropertyPage({
  params,
}: {
  params: Promise<{ locale: string; reference: string; slug: string }>;
}) {
  const { locale, reference } = await params;
  if (!isRoutableLocale(locale)) notFound();
  const copy = discoveryCopy(locale);
  let result: Awaited<ReturnType<typeof getPublicListing>>;
  try {
    result = await getPublicListing(getDb(), { reference, locale });
  } catch {
    return (
      <DiscoveryPage>
        <Notice tone="warning" title={copy.failed} />
        <a className="underline" href={`/${locale}/properties`}>
          {copy.back}
        </a>
      </DiscoveryPage>
    );
  }
  if (result.status === "not_found") {
    const source =
      locale === "bg" ? null : await getPublicListing(getDb(), { reference, locale: "bg" });
    if (source?.status !== "listing") notFound();
    return (
      <DiscoveryPage>
        <h1 className="text-title font-semibold">
          <bdi>{source.listing.reference}</bdi>
        </h1>
        <Notice tone="info" title={copy.noTranslation} />
        <a
          className={buttonClass("primary", "self-start")}
          href={listingHref(source.listing, "bg")}
          hrefLang="bg"
        >
          {copy.source}
        </a>
      </DiscoveryPage>
    );
  }
  if (result.status === "unavailable")
    return (
      <DiscoveryPage>
        <h1 className="text-title font-semibold">
          <bdi>{result.reference}</bdi>
        </h1>
        <Notice tone="info" title={copy.unavailable} />
        <a href={`/${locale}/properties?purpose=${result.purpose}`} className="underline">
          {copy.back}
        </a>
        <ListingGrid items={result.alternatives} locale={locale} copy={copy} />
      </DiscoveryPage>
    );
  const listing = result.listing;
  const inquiry = (purpose: "question" | "viewing_request") =>
    `/${locale}/inquire?${new URLSearchParams({ purpose, reference: listing.reference, manifest: listing.manifestId })}`;
  return (
    <DiscoveryPage>
      <a className="self-start underline" href={`/${locale}/properties?purpose=${listing.purpose}`}>
        {copy.back}
      </a>
      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <div className="min-w-0 space-y-6">
          <header className="space-y-3">
            <p className="text-compact text-text-muted">
              <bdi>{listing.reference}</bdi> · {copy[listing.propertyType]}
            </p>
            <h1 className="break-words text-title font-semibold">
              {listing.title || listing.reference}
            </h1>
            <p>{locality(listing)}</p>
            <p className="text-price font-semibold">
              <bdi>{priceText(listing.price, locale, copy)}</bdi>
            </p>
            <Availability listing={listing} locale={locale} copy={copy} />
          </header>
          <ApprovedGallery media={listing.media} unavailable={copy.noPhoto} />
          <ListingFacts listing={listing} locale={locale} copy={copy} />
        </div>
        <aside className="flex min-w-0 flex-col gap-5 self-start rounded-panel border border-border bg-surface p-5 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <p className="font-semibold">{listing.responsibleTeam.label}</p>
          {listing.availability.primaryAction === "request_viewing" ? (
            <a className={buttonClass("primary")} href={inquiry("viewing_request")}>
              {copy.viewing}
            </a>
          ) : null}
          {listing.availability.primaryAction !== "view_similar" ? (
            <a className={buttonClass("secondary")} href={inquiry("question")}>
              {copy.ask}
            </a>
          ) : (
            <a
              href={`/${locale}/properties?purpose=${listing.purpose}`}
              className={buttonClass("primary")}
            >
              {copy.back}
            </a>
          )}
          <LocalActions reference={listing.reference} copy={copy} />
          <p className="text-caption text-text-muted">{copy.localOnly}</p>
        </aside>
        <div className="min-w-0 space-y-6 lg:col-start-1">
          {listing.description ? (
            <p className="max-w-reading whitespace-pre-wrap break-words text-body">
              {listing.description}
            </p>
          ) : null}
          <SearchMap
            locale={locale}
            copy={mapCopy(locale, "listing")}
            release={publicMapRelease()}
            listHref={`/${locale}/properties`}
            items={
              listing.place.mapPoint
                ? [
                    {
                      reference: listing.reference,
                      href: listingHref(listing, locale),
                      label: `${listing.reference} · ${locality(listing)}`,
                      point: listing.place.mapPoint,
                    },
                  ]
                : []
            }
          />
        </div>
      </div>
      {result.alternatives.length ? (
        <ListingGrid items={result.alternatives} locale={locale} copy={copy} />
      ) : null}
    </DiscoveryPage>
  );
}
