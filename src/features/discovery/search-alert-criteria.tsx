import { getDb } from "@/db/client";
import type { PublicLocale } from "@/i18n/config";
import { formatExactArea, formatMoney, formatNumber } from "@/i18n/format";
import { intentPlaces } from "@/server/ai/intent-source";
import { discoveryCopy } from "./copy";
import { intentCopy } from "./intent-copy";
import { searchAlertCopy, searchAlertCopyLocale } from "./search-alert-copy";
import type { AlertSearch } from "./search-alert-state";

export async function SearchAlertCriteria({
  locale,
  search,
  title,
}: {
  locale: PublicLocale;
  search: Pick<AlertSearch, "normalized">;
  /** A heading in the page locale; the default heading is bg/en-only copy. */
  title?: string;
}) {
  const c = discoveryCopy(locale),
    extra = intentCopy(locale),
    copy = searchAlertCopy(locale);
  const { criteria, q } = search.normalized;
  const price = criteria.price;
  const places = criteria.placeIds?.length ? await intentPlaces(getDb()).catch(() => []) : [];
  const label = (key: string) => (Object.hasOwn(c, key) ? c[key as keyof typeof c] : key);
  const feature = (key: string) =>
    Object.hasOwn(extra, key) ? extra[key as keyof typeof extra] : key;
  const range = (value: { min?: number; max?: number }, format: (n: number) => string) =>
    [
      value.min === undefined ? null : `${extra.minimum} ${format(value.min)}`,
      value.max === undefined ? null : `${extra.maximum} ${format(value.max)}`,
    ]
      .filter(Boolean)
      .join(" · ");
  const rows = [
    [c.purpose, criteria.purpose === "sale" ? c.buy : c.rent],
    ...(q ? [[c.search, q]] : []),
    ...(criteria.propertyTypes
      ? [[c.propertyType, criteria.propertyTypes.map(label).join(", ")]]
      : []),
    ...(criteria.placeIds
      ? [
          [
            extra.locations,
            criteria.placeIds
              .map((id) => {
                const place = places.find((p) => p.id === id);
                return place
                  ? locale === "bg"
                    ? place.names[0]
                    : (place.names[1] ?? place.names[0])
                  : id;
              })
              .join(", "),
          ],
        ]
      : []),
    ...(price ? [[extra.amount, range(price, (n) => formatMoney(locale, n, price.currency))]] : []),
    ...(criteria.bedrooms
      ? [[c.bedrooms, range(criteria.bedrooms, (n) => formatNumber(locale, n))]]
      : []),
    ...(criteria.rooms
      ? [[extra.rooms, range(criteria.rooms, (n) => formatNumber(locale, n))]]
      : []),
    ...(criteria.area
      ? [[label(criteria.area.basis), range(criteria.area, (n) => formatExactArea(locale, n))]]
      : []),
    ...(criteria.mustHave ? [[extra.features, criteria.mustHave.map(feature).join(", ")]] : []),
  ];
  return (
    <section
      className="min-w-0 space-y-4 rounded-panel bg-subtle p-5 [overflow-wrap:anywhere]"
      aria-label={title ?? copy.criteria}
    >
      {title ? (
        <h2 className="text-heading font-semibold">{title}</h2>
      ) : (
        <h2 className="text-heading font-semibold" lang={searchAlertCopyLocale(locale)} dir="ltr">
          {copy.criteria}
        </h2>
      )}
      <dl className="grid gap-3">
        {rows.map(([key, value]) => (
          <div key={key}>
            <dt className="text-dense text-text-muted">{key}</dt>
            <dd dir="auto">{value}</dd>
          </div>
        ))}
      </dl>
      <p lang={searchAlertCopyLocale(locale)} dir="ltr">
        {copy.source}: <bdi>{search.normalized.locale.toUpperCase()}</bdi>
      </p>
      <p>
        {criteria.includeNeedsConfirmation ? (
          c.includeUnconfirmed
        ) : (
          <span lang={searchAlertCopyLocale(locale)} dir="ltr">
            {copy.unknown}
          </span>
        )}
      </p>
    </section>
  );
}
