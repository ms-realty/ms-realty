import type { ReactNode } from "react";
import type { PublicLocale } from "@/i18n/config";
import { formatNumber } from "@/i18n/format";
import type { PublicListingDetail, PublicListingResult } from "@/server/listings/view-models";
import { buttonClass } from "@/ui/button-class";
import { ApprovedMedia } from "./approved-media";
import { compareCopy } from "./compare-copy";
import type { DiscoveryCopy } from "./copy";
import { Availability } from "./listing-card";
import { RemoveComparison } from "./local-selection";
import { listingHref, locality, priceText, scalarFact } from "./presentation";

export type ComparisonItem = { reference: string; result: PublicListingResult | null };
export function comparisonSelection(value: unknown): {
  references: string[];
  correction: string[] | null;
} {
  if (value === undefined || value === "") return { references: [], correction: null };
  if (typeof value !== "string" || value.length > 4096) return { references: [], correction: [] };
  const references = value.split(",");
  if (
    references.length > 3 ||
    new Set(references).size !== references.length ||
    references.some((reference) => !/^MS-\d{5,}$/.test(reference))
  )
    return { references: [], correction: references.length <= 8 ? references : [] };
  return { references, correction: null };
}
export function ComparisonCorrection({
  entries,
  locale,
  copy,
}: {
  entries: readonly string[];
  locale: PublicLocale;
  copy: DiscoveryCopy;
}) {
  const labels = compareCopy(locale);
  return (
    <section className="space-y-4">
      <p role="status">{labels.correction}</p>
      <ul className="space-y-3">
        {entries.map((entry, index) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: Repeated URL entries need their position; this correction list has no component state.
            key={`${index}-${entry}`}
            className="flex min-w-0 flex-wrap items-center gap-3 wrap-anywhere"
          >
            <bdi>{entry || copy.unknown}</bdi>
            <a
              className={buttonClass("secondary", "wrap-anywhere")}
              href={`/${locale}/compare?${new URLSearchParams({ references: entries.filter((_, itemIndex) => itemIndex !== index).join(",") })}`}
            >
              {copy.remove} <bdi>{entry || copy.unknown}</bdi>
            </a>
          </li>
        ))}
      </ul>
      <a className={buttonClass("secondary")} href={`/${locale}/compare?references=`}>
        {labels.clear}
      </a>
    </section>
  );
}
export function Comparison({
  items,
  locale,
  copy,
}: {
  items: readonly ComparisonItem[];
  locale: PublicLocale;
  copy: DiscoveryCopy;
}) {
  const labels = compareCopy(locale);
  if (!items.length) return <p>{labels.empty}</p>;
  const columns =
    items.length === 1
      ? "grid-cols-1 lg:grid-cols-[11rem_minmax(0,1fr)]"
      : items.length === 2
        ? "grid-cols-2 lg:grid-cols-[11rem_repeat(2,minmax(0,1fr))]"
        : "grid-cols-3 lg:grid-cols-[11rem_repeat(3,minmax(0,1fr))]";
  const rowClass = `grid ${columns} gap-x-1 sm:gap-x-3 lg:gap-x-4`;
  const available =
    items.every(
      ({ reference, result }) =>
        result?.status === "listing" &&
        reference === result.listing.reference &&
        result.listing.availability.primaryAction !== "view_similar",
    ) && items.length <= 3;
  const selection = items.flatMap(({ result }) =>
    result?.status === "listing"
      ? [{ reference: result.listing.reference, observedManifestId: result.listing.manifestId }]
      : [],
  );
  const collectiveHref = `/${locale}/inquire?${new URLSearchParams({ purpose: "question", selection: JSON.stringify(selection) })}`;
  const unavailable = (item: ComparisonItem) => (item.result ? copy.unavailable : copy.failed);
  const rows: { key: string; label: string; value: (listing: PublicListingDetail) => ReactNode }[] =
    [
      {
        key: "price",
        label: labels.price,
        value: (listing) => (
          <>
            <bdi>{priceText(listing.price, locale, copy)}</bdi>
            {listing.price.state === "known" && listing.price.value.period === "total" ? (
              <span className="block font-normal text-text-muted">{labels.total}</span>
            ) : null}
          </>
        ),
      },
      {
        key: "area",
        label: copy.area,
        value: (listing) =>
          listing.area.state === "known" ? (
            <>
              <bdi>
                {formatNumber(locale, listing.area.value.value, { maximumFractionDigits: 20 })}
              </bdi>{" "}
              <span className="inline-block whitespace-nowrap" data-unit="area">
                m²
              </span>
              <span className="block font-normal text-text-muted">
                {copy[listing.area.value.basis]}
              </span>
            </>
          ) : (
            copy[listing.area.state]
          ),
      },
      {
        key: "bedrooms",
        label: copy.bedrooms,
        value: (listing) => scalarFact(listing.bedrooms, locale, copy),
      },
      { key: "location", label: labels.location, value: locality },
      {
        key: "lift",
        label: labels.lift,
        value: (listing) => {
          const fact = listing.facts.find((item) => item.key === "feature.lift")?.fact;
          return !fact
            ? copy.unknown
            : fact.state !== "known"
              ? copy[fact.state]
              : fact.value === true
                ? labels.yes
                : fact.value === false
                  ? labels.no
                  : copy.unknown;
        },
      },
      {
        key: "availability",
        label: labels.availability,
        value: (listing) => {
          const state = listing.availability.presented;
          return state === "let" ? copy.letStatus : copy[state];
        },
      },
    ];
  return (
    <div className="min-w-0 space-y-6">
      <p className="text-text-muted">
        {labels.selected}: {formatNumber(locale, items.length)} · {labels.lead}
      </p>
      <table aria-label={labels.title} className="block w-full min-w-0 text-dense">
        <thead className="block">
          <tr className={`${rowClass} pb-4`}>
            <th
              scope="col"
              className="sr-only text-start font-normal lg:not-sr-only lg:pt-2 lg:text-text-muted"
            >
              {labels.property}
            </th>
            {items.map((item) => {
              const listing = item.result?.status === "listing" ? item.result.listing : null;
              return (
                <th
                  key={item.reference}
                  scope="col"
                  id={`compare-${item.reference}`}
                  className="min-w-0 space-y-2 text-start font-normal wrap-anywhere"
                >
                  <ApprovedMedia media={listing?.cover ?? null} unavailable={copy.noPhoto} />
                  <p className="font-semibold">
                    <bdi>{item.reference}</bdi>
                  </p>
                  {listing ? (
                    <p className="hidden font-normal lg:block">
                      <a className="underline" href={listingHref(listing, locale)}>
                        {listing.title || item.reference}
                      </a>
                    </p>
                  ) : (
                    <p>{unavailable(item)}</p>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="block">
          {rows.map((row) => (
            <tr key={row.key} className={`${rowClass} border-t border-divider py-3`}>
              <th
                scope="row"
                id={`compare-${row.key}`}
                className="sr-only text-start font-normal lg:not-sr-only lg:text-text-muted"
              >
                {row.label}
              </th>
              {items.map((item) => (
                <td
                  key={item.reference}
                  headers={`compare-${row.key} compare-${item.reference}`}
                  aria-label={item.result?.status === "listing" ? undefined : unavailable(item)}
                  className="min-w-0 space-y-1 font-semibold wrap-anywhere [&_[data-family]]:max-w-full"
                >
                  <span aria-hidden="true" className="block font-normal text-text-muted lg:hidden">
                    {row.label}
                  </span>
                  {item.result?.status === "listing" ? (
                    row.value(item.result.listing)
                  ) : (
                    <span aria-hidden="true">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid gap-5 lg:grid-cols-3">
        {items.map((item) => (
          <section
            key={item.reference}
            className="min-w-0 space-y-3 wrap-anywhere"
            aria-label={item.reference}
          >
            {item.result?.status === "listing" ? (
              <>
                <h2 className="font-semibold lg:hidden">
                  <a className="underline" href={listingHref(item.result.listing, locale)}>
                    {item.result.listing.title || item.reference}
                  </a>
                </h2>
                <Availability listing={item.result.listing} locale={locale} copy={copy} />
              </>
            ) : (
              <h2 className="font-semibold">
                <bdi>{item.reference}</bdi>
              </h2>
            )}
            {item.result?.status === "listing" &&
            item.result.listing.availability.primaryAction !== "view_similar" ? (
              <a
                className={buttonClass("secondary", "w-full wrap-anywhere")}
                aria-label={`${copy.ask} · ${item.reference}`}
                href={`/${locale}/inquire?${new URLSearchParams({ purpose: "question", reference: item.reference, manifest: item.result.listing.manifestId, comparisonReferences: items.map((other) => other.reference).join(",") })}`}
              >
                {copy.ask}
              </a>
            ) : null}
            <RemoveComparison
              reference={item.reference}
              remaining={items
                .filter((other) => other.reference !== item.reference)
                .map((other) => other.reference)}
              locale={locale}
              copy={copy}
            />
          </section>
        ))}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {available ? (
          <a className={buttonClass("primary", "wrap-anywhere")} href={collectiveHref}>
            {labels.collective}
          </a>
        ) : (
          <p role="status" className="max-w-reading text-warning">
            {labels.blocked}
          </p>
        )}
        <a className={buttonClass("secondary")} href={`/${locale}/properties`}>
          {labels.change}
        </a>
      </div>
    </div>
  );
}
