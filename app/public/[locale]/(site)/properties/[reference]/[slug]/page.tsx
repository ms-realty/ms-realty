// P05/P21: the listing page. Photographs lead; then price, title, place and the known facts in
// one block, the description, where the home is, and similar homes. The contact actions stay in
// reach: beside the content on desktop, a bottom bar on phones. A restricted or withdrawn
// publication keeps its safe identity.

import { notFound } from "next/navigation";
import { Fragment, type ReactNode } from "react";
import { discoveryCopy } from "@/features/discovery/copy";
import { AvailabilityNote, ListingGrid } from "@/features/discovery/listing-card";
import { CompareToggle, SaveToggle } from "@/features/discovery/local-selection";
import { mapCopy } from "@/features/discovery/map-copy";
import { DiscoveryPage } from "@/features/discovery/page";
import { PhotoGallery } from "@/features/discovery/photo-gallery";
import {
  listingHref,
  locality,
  priceBasisText,
  priceText,
  shownFacts,
} from "@/features/discovery/presentation";
import { SearchMap } from "@/features/discovery/search-map";
import { factFieldLabel } from "@/i18n/fact-labels";
import { formatDate, formatExactArea } from "@/i18n/format";
import { listingStructuredData } from "@/i18n/structured-data";
import { publicMapRelease } from "@/server/publication/map-config";
import {
  normalizePublicListingRoute,
  publicListingMetadata,
  publicListingUrl,
  readPublicSeoListing,
} from "@/server/seo/public-metadata";
import { buttonClass } from "@/ui/button-class";
import { PinIcon } from "@/ui/icons";
import { Notice } from "@/ui/notice";
import { StructuredData } from "@/ui/structured-data";

/** Known yes/no features a visitor may care about; shown only when known to be present. */
const featureKeys = [
  "feature.lift",
  "feature.parking",
  "feature.garden",
  "feature.pool",
  "feature.furnished",
  "feature.step_free_access",
];

/** Fills `{name}` placeholders with nodes, keeping the sentence order of each language. */
function fillParts(template: string, values: Record<string, ReactNode>) {
  return template.split(/(\{\w+\})/).map((part, index) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1];
    // biome-ignore lint/suspicious/noArrayIndexKey: template parts are fixed for one render.
    return <Fragment key={index}>{key && key in values ? values[key] : part}</Fragment>;
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; reference: string; slug: string }>;
}) {
  return publicListingMetadata(await params);
}
export default async function PropertyPage({
  params,
}: {
  params: Promise<{ locale: string; reference: string; slug: string }>;
}) {
  const { locale, reference, slug } = normalizePublicListingRoute(await params);
  const copy = discoveryCopy(locale);
  let result: Awaited<ReturnType<typeof readPublicSeoListing>>;
  let source: Awaited<ReturnType<typeof readPublicSeoListing>> | null = null;
  try {
    result = await readPublicSeoListing(reference, locale);
    if (result.status === "not_found" && locale !== "bg")
      source = await readPublicSeoListing(reference, "bg");
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
  const structured = listingStructuredData(
    listing,
    await publicListingUrl(locale, reference, slug),
  );
  const inquiry = (purpose: "question" | "viewing_request") =>
    `/${locale}/inquire?${new URLSearchParams({ purpose, reference: listing.reference, manifest: listing.manifestId })}`;
  const title = listing.title || listing.reference;
  const action = listing.availability.primaryAction;
  const basis = priceBasisText(listing.price, copy);
  const facts = shownFacts(listing, locale, copy);
  const land = listing.facts.find((f) => f.key === "area.land")?.fact;
  const landArea =
    land?.state === "known" &&
    listing.area.state === "known" &&
    listing.area.value.basis !== "land" &&
    typeof (land.value as { value?: unknown })?.value === "number"
      ? formatExactArea(locale, (land.value as { value: number }).value)
      : null;
  const features = listing.facts
    .filter((f) => featureKeys.includes(f.key) && f.fact.state === "known" && f.fact.value === true)
    .map((f) => factFieldLabel(f.key, locale));
  const paragraphs = (listing.description ?? "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  const confirmed = listing.availability.confirmedAt;
  const contact =
    action === "view_similar" ? (
      <a
        href={`/${locale}/properties?purpose=${listing.purpose}`}
        className={buttonClass("primary", "flex-1 px-3 whitespace-nowrap")}
      >
        {copy.back}
      </a>
    ) : (
      <>
        {action === "request_viewing" ? (
          <a
            className={buttonClass("primary", "flex-1 px-3 whitespace-nowrap")}
            href={inquiry("viewing_request")}
          >
            {copy.viewing}
          </a>
        ) : null}
        <a
          className={buttonClass(
            action === "request_viewing" ? "secondary" : "primary",
            "flex-1 px-3 whitespace-nowrap",
          )}
          href={inquiry("question")}
        >
          {copy.askQuestion}
        </a>
      </>
    );
  return (
    <DiscoveryPage>
      <StructuredData value={structured} />
      <div className="-mb-4 flex items-center justify-between gap-4">
        <a
          className="inline-flex min-h-control items-center text-compact text-action underline underline-offset-4"
          href={`/${locale}/properties?purpose=${listing.purpose}`}
        >
          {copy.back}
        </a>
        <div className="flex items-center gap-3 lg:hidden">
          <CompareToggle reference={listing.reference} copy={copy} />
          <SaveToggle reference={listing.reference} copy={copy} />
        </div>
      </div>
      <PhotoGallery media={listing.media} title={title} locale={locale} copy={copy} />
      <div className="grid gap-x-12 gap-y-8 pb-24 lg:grid-cols-[minmax(0,1fr)_20rem] lg:pb-0">
        <div className="min-w-0 space-y-8">
          <header className="space-y-2">
            <p className="text-page font-semibold" data-price>
              <bdi>{priceText(listing.price, locale, copy)}</bdi>
            </p>
            {basis ? <p className="text-compact text-text-muted">{basis}</p> : null}
            <h1 className="break-words text-heading font-semibold">{title}</h1>
            <p className="flex items-center gap-1.5 text-compact text-text-muted">
              <PinIcon className="size-4 shrink-0" />
              {locality(listing)}
            </p>
            <AvailabilityNote listing={listing} copy={copy} />
          </header>
          <dl
            className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-divider py-5 sm:grid-cols-3"
            data-listing-facts
          >
            {facts.map((fact) => (
              <div key={fact.key} data-fact={fact.key}>
                <dt className="text-caption text-text-muted">{fact.label}</dt>
                <dd className="font-semibold">
                  <bdi>{fact.value}</bdi>
                </dd>
              </div>
            ))}
            {landArea ? (
              <div data-fact="land">
                <dt className="text-caption text-text-muted">{copy.land}</dt>
                <dd className="font-semibold">
                  <bdi>{landArea}</bdi>
                </dd>
              </div>
            ) : null}
          </dl>
          {features.length ? (
            <p className="-mt-4 text-compact" data-fact="features">
              {features.join(", ")}
            </p>
          ) : null}
          {paragraphs.length ? (
            <section aria-labelledby="about-heading" className="space-y-3">
              <h2 id="about-heading" className="text-subheading font-semibold">
                {copy.about}
              </h2>
              <div className="max-w-reading space-y-4 break-words text-body">
                {paragraphs.map((paragraph, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs have no identity of their own and never reorder.
                  <p key={index} className="whitespace-pre-line">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ) : null}
          {/* Reserved: another branch mounts "Ask about this home" here. Keep the id. */}
          <div id="ask-about-this-home" data-slot="ask-about-this-home" />
          <section aria-labelledby="location-heading" className="space-y-3">
            <h2 id="location-heading" className="text-subheading font-semibold">
              {copy.location}
            </h2>
            <p className="flex items-center gap-1.5">
              <PinIcon className="size-4 shrink-0 text-text-muted" />
              {locality(listing)}
            </p>
            {listing.place.mapPoint ? (
              <SearchMap
                locale={locale}
                copy={mapCopy(locale, "listing")}
                release={publicMapRelease()}
                listHref={`/${locale}/properties`}
                items={[
                  {
                    reference: listing.reference,
                    href: listingHref(listing, locale),
                    label: `${listing.reference}, ${locality(listing)}`,
                    point: listing.place.mapPoint,
                  },
                ]}
              />
            ) : null}
          </section>
          <p className="text-caption text-text-muted" data-reference-line>
            {fillParts(confirmed ? copy.referenceLine : copy.referenceOnly, {
              reference: <bdi key="reference">{listing.reference}</bdi>,
              date: confirmed ? (
                <time key="date" dateTime={confirmed}>
                  {formatDate(locale, confirmed)}
                </time>
              ) : null,
            })}
          </p>
        </div>
        <aside
          aria-label={listing.responsibleTeam.label}
          className="hidden min-w-0 flex-col gap-3 self-start rounded-panel border border-border bg-surface p-5 lg:sticky lg:top-6 lg:flex"
        >
          <p className="font-semibold">{listing.responsibleTeam.label}</p>
          <div className="flex flex-col gap-3">{contact}</div>
          <div className="flex items-center justify-between gap-3 border-t border-divider pt-3">
            <CompareToggle reference={listing.reference} copy={copy} />
            <SaveToggle reference={listing.reference} copy={copy} />
          </div>
        </aside>
      </div>
      {result.alternatives.length ? (
        <section aria-labelledby="similar-heading" className="space-y-4">
          <h2 id="similar-heading" className="text-heading font-semibold">
            {action === "view_similar" ? copy.back : copy.similar}
          </h2>
          <ListingGrid items={result.alternatives} locale={locale} copy={copy} />
        </section>
      ) : null}
      {/* Phones: the contact actions stay in reach at the bottom of the screen. */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 flex gap-3 border-t border-border bg-surface px-gutter py-3 lg:hidden"
        data-contact-bar
      >
        {contact}
      </div>
    </DiscoveryPage>
  );
}
