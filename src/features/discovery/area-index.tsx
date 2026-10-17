import Image from "next/image";
import type { ReactNode } from "react";
import type { PublicLocale } from "@/i18n/config";
import { formatNumber } from "@/i18n/format";
import { buttonClass } from "@/ui/button-class";
import { Notice } from "@/ui/notice";
import chevron from "./area-assets/chevron-right.svg";
import folder from "./area-assets/folder.svg";
import { areaCopy } from "./area-copy";
import type { AreaData, AreaLocation } from "./area-data";
import { AreaPhotograph } from "./area-media";
import { discoveryCopy } from "./copy";
import { listingHref, locality } from "./presentation";

export function AreaLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="mx-auto flex max-w-page flex-col gap-6 px-gutter py-5 lg:gap-8 lg:p-20"
      data-screen="P15"
    >
      {children}
    </div>
  );
}

function RowContent({ title, hint }: { title: string; hint: string }) {
  return (
    <>
      <Image src={folder} width={20} height={20} alt="" className="shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col gap-1 text-dense">
        <span className="font-semibold text-text">{title}</span>
        <span className="font-medium text-text-muted">{hint}</span>
      </span>
      <Image src={chevron} width={20} height={20} alt="" className="shrink-0 rtl:-scale-x-100" />
    </>
  );
}

const rowClass = "flex min-h-[76px] items-center gap-4 p-4 no-underline hover:bg-subtle";
export function AreaActionRow({
  href,
  title,
  hint,
}: {
  href: string;
  title: string;
  hint: string;
}) {
  return (
    <li className="border-b border-divider">
      <a href={href} className={rowClass}>
        <RowContent title={title} hint={hint} />
      </a>
    </li>
  );
}

export function areaSearchHref(
  locale: PublicLocale,
  purpose: "sale" | "long_term_rent",
  placeId?: string,
) {
  return `/${locale}/properties?${new URLSearchParams({ purpose, ...(placeId ? { places: placeId } : {}) })}`;
}

function LocationRow({ location, locale }: { location: AreaLocation; locale: PublicLocale }) {
  const copy = areaCopy(locale);
  return (
    <li className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-divider py-4">
      <div className="min-w-0 space-y-1">
        <p className="break-words font-semibold">
          <bdi>{location.name}</bdi>
        </p>
        <p className="text-caption text-text-muted">
          {copy[location.level]} ·{" "}
          <bdi>
            {location.parentName ? `${location.parentName} · ` : ""}
            {location.countryCode}
          </bdi>
        </p>
      </div>
      <div className="flex flex-wrap gap-3 text-caption">
        {location.saleCount ? (
          <a
            className="inline-flex min-h-control items-center gap-1 underline"
            href={areaSearchHref(locale, "sale", location.id)}
          >
            {copy.sale} · {formatNumber(locale, location.saleCount)}
          </a>
        ) : null}
        {location.rentCount ? (
          <a
            className="inline-flex min-h-control items-center gap-1 underline"
            href={areaSearchHref(locale, "long_term_rent", location.id)}
          >
            {copy.long_term_rent} · {formatNumber(locale, location.rentCount)}
          </a>
        ) : null}
      </div>
    </li>
  );
}

export function AreaIndex({ locale, data }: { locale: PublicLocale; data: AreaData }) {
  const copy = areaCopy(locale),
    discovery = discoveryCopy(locale),
    guide = data.guides.find((area) => area.geography[0]) ?? data.guides[0];
  const featured = data.featured;
  const browse = areaSearchHref(locale, featured?.purpose ?? "sale", guide?.geography[0]?.id);
  const viewing =
    featured?.availability.primaryAction === "request_viewing"
      ? `/${locale}/inquire?${new URLSearchParams({ purpose: "viewing_request", reference: featured.reference, manifest: featured.manifestId })}`
      : browse;
  return (
    <AreaLayout>
      <h1 className="text-heading font-semibold lg:text-title">{copy.title}</h1>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col items-start gap-6" aria-labelledby="area-intro">
          <h2 id="area-intro" className="break-words text-heading font-semibold lg:text-title">
            {guide ? (
              <a
                href={`/${locale}/areas/${guide.slug}`}
                className="text-text no-underline hover:underline"
              >
                {guide.title}
              </a>
            ) : (
              copy.headline
            )}
          </h2>
          <p className="whitespace-pre-wrap break-words text-body text-text-muted">
            {guide?.paragraphs[0] ?? copy.intro}
          </p>
          {data.contentFailed ? (
            <Notice
              tone="warning"
              title={discovery.failed}
              action={
                <a href={`/${locale}/areas`} className="underline">
                  {copy.refresh}
                </a>
              }
            />
          ) : !data.guides.length ? (
            <Notice tone="info" title={locale === "bg" ? copy.noGuides : copy.noTranslation} />
          ) : null}
          {data.sourceAvailable ? (
            <a
              href="/bg/areas"
              hrefLang="bg"
              className="inline-flex min-h-control items-center underline"
            >
              {copy.source}
            </a>
          ) : null}
          <div className="flex flex-col items-start gap-3 lg:flex-row lg:flex-wrap">
            <a href={`/${locale}/contact`} className={buttonClass("primary")}>
              {copy.contact}
            </a>
            <a href={browse} className={buttonClass("tertiary", "text-text")}>
              {copy.browse}
            </a>
          </div>
        </section>
        <figure className="flex min-w-0 flex-col gap-5">
          {featured ? (
            <a
              href={listingHref(featured, locale)}
              aria-label={`${featured.reference} · ${featured.title ?? locality(featured)}`}
            >
              <AreaPhotograph media={featured.cover} unavailable={copy.noPhotograph} />
            </a>
          ) : (
            <AreaPhotograph
              media={null}
              unavailable={data.inventoryFailed ? discovery.failed : copy.noPhotograph}
            />
          )}
          {featured ? (
            <figcaption className="space-y-1 break-words text-caption font-medium text-text-muted">
              <p>
                {featured.cover?.kind === "photo" ? `${copy.photograph} · ` : ""}
                <a href={listingHref(featured, locale)}>
                  <bdi>{featured.reference}</bdi>
                </a>{" "}
                · <bdi>{locality(featured)}</bdi>
              </p>
              {featured.cover?.kind === "photo" && featured.cover.caption ? (
                <p>{featured.cover.caption}</p>
              ) : null}
              {featured.cover?.kind === "photo" && featured.cover.modificationDisclosure ? (
                <p>{featured.cover.modificationDisclosure}</p>
              ) : null}
            </figcaption>
          ) : null}
        </figure>
      </div>
      <section className="space-y-4" aria-labelledby="area-everyday">
        <h2 id="area-everyday" className="text-subheading font-semibold">
          {copy.everyday}
        </h2>
        <ul className="flex flex-col gap-4">
          <li className="border-b border-divider">
            <details>
              <summary
                className={`${rowClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
              >
                <RowContent title={copy.places} hint={copy.placesHint} />
              </summary>
              <div className="space-y-6 px-4 pb-6" id="area-guides">
                <section className="space-y-3" aria-labelledby="approved-area-guides">
                  <h3 id="approved-area-guides" className="text-subheading font-semibold">
                    {copy.guides}
                  </h3>
                  {data.guides.length ? (
                    <ul className="divide-y divide-divider">
                      {data.guides.map((area) => (
                        <li key={area.version.id}>
                          <a
                            className="flex min-h-control flex-col gap-1 py-3"
                            href={`/${locale}/areas/${area.slug}`}
                          >
                            <span className="break-words font-semibold">{area.title}</span>
                            {area.geography.length ? (
                              <span className="text-caption text-text-muted">
                                {area.geography
                                  .map((place) => `${copy[place.level]}: ${place.name}`)
                                  .join(" · ")}
                              </span>
                            ) : null}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
                <section className="space-y-3" aria-labelledby="area-locations">
                  <h3 id="area-locations" className="text-subheading font-semibold">
                    {copy.inventory}
                  </h3>
                  {data.inventoryFailed ? (
                    <Notice
                      tone="warning"
                      title={discovery.failed}
                      action={
                        <a href={`/${locale}/areas`} className="underline">
                          {copy.refresh}
                        </a>
                      }
                    />
                  ) : data.locations.length ? (
                    <ul>
                      {data.locations.map((location) => (
                        <LocationRow key={location.id} location={location} locale={locale} />
                      ))}
                    </ul>
                  ) : (
                    <Notice tone="info" title={copy.noLocations} />
                  )}
                </section>
              </div>
            </details>
          </li>
          <AreaActionRow href={`/${locale}/contact`} title={copy.access} hint={copy.accessHint} />
          <AreaActionRow href={viewing} title={copy.visit} hint={copy.visitHint} />
        </ul>
      </section>
    </AreaLayout>
  );
}
