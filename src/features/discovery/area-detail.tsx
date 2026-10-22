import type { PublicLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import type { ApprovedArea } from "@/server/content/public";
import { buttonClass } from "@/ui/button-class";
import { Notice } from "@/ui/notice";
import { areaCopy } from "./area-copy";
import type { AreaInventory } from "./area-data";
import { AreaLayout, areaSearchHref } from "./area-index";
import { discoveryCopy } from "./copy";
import { ListingGrid } from "./listing-card";

export function AreaDetail({
  locale,
  area,
  inventory,
  sourceAvailable = false,
  failed = false,
  slug,
}: {
  locale: PublicLocale;
  area: ApprovedArea | null;
  inventory: AreaInventory | null;
  sourceAvailable?: boolean;
  failed?: boolean;
  slug: string;
}) {
  const copy = areaCopy(locale),
    discovery = discoveryCopy(locale);
  const inquiry = new URLSearchParams();
  if (area)
    inquiry.set(
      "contentReference",
      JSON.stringify({ kind: "area", slug: area.slug, versionId: area.version.id }),
    );
  const boundPlace = area?.geography[0];
  return (
    <AreaLayout>
      <a href={`/${locale}/areas`} className="self-start underline">
        {copy.title}
      </a>
      <header className="space-y-3">
        <h1 className="break-words text-heading font-semibold lg:text-title">
          {area?.title ?? copy.title}
        </h1>
        {area?.geography.length ? (
          <p className="break-words text-caption text-text-muted">
            {area.geography.map((place) => `${copy[place.level]}: ${place.name}`).join(" · ")}
          </p>
        ) : null}
      </header>
      {area ? (
        <article lang={area.locale} className="max-w-reading space-y-6">
          {area.paragraphs.length > 5 ? (
            <nav aria-label={copy.contents}>
              <ol className="flex flex-wrap gap-x-4 gap-y-1">
                {area.paragraphs.map((_paragraph, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: contents belong to this immutable approved edition and have no client state.
                  <li key={`section-${index + 1}`}>
                    <a
                      className="inline-flex min-h-control items-center underline"
                      href={`#area-section-${index + 1}`}
                    >
                      {copy.section} {index + 1}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
          {area.paragraphs.map((paragraph, index) => (
            <p
              id={`area-section-${index + 1}`}
              // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs belong to this immutable approved edition and have no client state.
              key={`paragraph-${index + 1}`}
              className="scroll-mt-24 whitespace-pre-wrap break-words"
            >
              {paragraph}
            </p>
          ))}
          <dl className="space-y-2 border-t border-divider pt-4 text-caption text-text-muted">
            <div>
              <dt className="font-semibold">{copy.scope}</dt>
              <dd className="break-words">
                {area.reviewScope} · {area.jurisdiction}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">{discovery.confirmedAt}</dt>
              <dd>
                <time dateTime={area.reviewedAt}>{formatDateTime(locale, area.reviewedAt)}</time>
              </dd>
            </div>
          </dl>
        </article>
      ) : (
        <Notice
          tone={failed ? "warning" : "info"}
          title={failed ? discovery.failed : locale !== "bg" ? copy.noTranslation : copy.noGuides}
          action={
            failed ? (
              <a href={`/${locale}/areas/${encodeURIComponent(slug)}`} className="underline">
                {copy.refresh}
              </a>
            ) : undefined
          }
        />
      )}
      {sourceAvailable ? (
        <a
          href={`/bg/areas/${encodeURIComponent(slug)}`}
          hrefLang="bg"
          className={buttonClass("secondary", "self-start")}
        >
          {copy.source}
        </a>
      ) : null}
      {area ? (
        <section className="space-y-4" aria-labelledby="area-inventory">
          <h2 id="area-inventory" className="text-subheading font-semibold">
            {copy.browse}
            {boundPlace ? (
              <>
                {" "}
                · <bdi>{boundPlace.name}</bdi>
              </>
            ) : null}
          </h2>
          {!boundPlace || !inventory ? (
            <Notice tone="info" title={copy.noBinding} />
          ) : inventory.failed ? (
            <Notice
              tone="warning"
              title={discovery.failed}
              action={
                <a href={`/${locale}/areas/${area.slug}`} className="underline">
                  {copy.refresh}
                </a>
              }
            />
          ) : inventory.items.length ? (
            <ListingGrid items={inventory.items} locale={locale} copy={discovery} />
          ) : (
            <Notice tone="info" title={copy.noInventory} />
          )}
          {boundPlace ? (
            <div className="flex flex-wrap gap-3">
              <a
                className={buttonClass("secondary")}
                href={areaSearchHref(locale, "sale", boundPlace.id)}
              >
                {copy.sale}
              </a>
              <a
                className={buttonClass("secondary")}
                href={areaSearchHref(locale, "long_term_rent", boundPlace.id)}
              >
                {copy.long_term_rent}
              </a>
            </div>
          ) : null}
        </section>
      ) : null}
      <a
        href={`/${locale}/inquire${inquiry.size ? `?${inquiry}` : ""}`}
        className={buttonClass("primary", "self-start")}
      >
        {copy.contact}
      </a>
    </AreaLayout>
  );
}
