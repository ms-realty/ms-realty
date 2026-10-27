import type { ReactNode } from "react";
import { type RentalFactKey, rentalFact, rentalFactKeys } from "@/domain/rental-facts";
import type { PublicLocale } from "@/i18n/config";
import { factFieldLabel } from "@/i18n/fact-labels";
import { formatDate, formatExactArea, formatMoney, formatNumber } from "@/i18n/format";
import type { PublicFact, PublicListingDetail } from "@/server/listings/view-models";
import { compareCopy } from "./compare-copy";
import { discoveryCopy, propertyFactsCopy } from "./copy";
import { priceText } from "./presentation";

export function propertyFactLabel(key: string, locale: PublicLocale) {
  const labels = propertyFactsCopy(locale);
  const field = key.replace(/^feature\./, "");
  if (field === "total_floors") return labels.floors_total;
  if (Object.hasOwn(labels, field)) return labels[field as keyof typeof labels];
  const rental = key.replace(/^rental\./, "");
  if (key.startsWith("rental.") && Object.hasOwn(labels, rental))
    return labels[rental as keyof typeof labels];
  return factFieldLabel(key, locale);
}

/** Only public-projected scalar values have a generic renderer. Never dump source objects. */
export function publicFactText(item: PublicFact, locale: PublicLocale) {
  const copy = discoveryCopy(locale),
    fact = item.fact;
  if (fact.state !== "known") return copy[fact.state];
  const value = fact.value;
  if (typeof value === "boolean") return compareCopy(locale)[value ? "yes" : "no"];
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value))
    return item.key.startsWith("area.") || fact.unit === "m2"
      ? formatExactArea(locale, value)
      : `${formatNumber(locale, value, { maximumFractionDigits: 20 })}${fact.unit ? ` ${fact.unit}` : ""}`;
  if (
    item.key.startsWith("area.") &&
    value &&
    typeof value === "object" &&
    "value" in value &&
    "unit" in value &&
    value.unit === "m2" &&
    typeof value.value === "number" &&
    Number.isFinite(value.value)
  )
    return formatExactArea(locale, value.value);
  if (Array.isArray(value) && value.every((part) => typeof part === "string"))
    return value.join(" · ");
  return propertyFactsCopy(locale).unreadable;
}

function sourceLanguage(item: PublicFact) {
  const language = item.fact.provenance?.sourceLanguage;
  return language && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language) ? language : undefined;
}

function rentalValue(
  listing: PublicListingDetail,
  key: RentalFactKey,
  locale: PublicLocale,
): ReactNode {
  const copy = discoveryCopy(locale),
    item = listing.facts.find((fact) => fact.key === key);
  const record = item?.fact;
  // Conflicting public facts intentionally contain no private evidence candidates.
  if (record && record.state !== "known") return copy[record.state];
  const result = rentalFact(
    {
      purpose: "long_term_rent",
      facts: record ? { [key]: { state: record.state, value: record.value } } : {},
    },
    key,
  );
  if (result.state !== "known") return copy[result.state];
  if (!result.readable) return propertyFactsCopy(locale).unreadable;
  const value = result.values[0];
  if (typeof value === "string")
    return key === "rental.available_from" ? (
      <time dateTime={value}>{formatDate(locale, value, { timeZone: "UTC", now: 0 })}</time>
    ) : (
      <bdi lang={item ? sourceLanguage(item) : undefined} dir="auto">
        {value}
      </bdi>
    );
  if (!value || typeof value !== "object") return propertyFactsCopy(locale).unreadable;
  return (
    <>
      <bdi>
        {formatMoney(locale, value.amountMinor, value.currency)}
        {value.period === "month" ? ` ${copy.perMonth}` : ""}
      </bdi>
      {"inclusions" in value && value.inclusions.length ? (
        <ul
          className="mt-2 list-disc space-y-1 ps-5"
          lang={item ? sourceLanguage(item) : undefined}
          dir="auto"
        >
          {value.inclusions.map((text, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Ordered source inclusions may repeat and contain no component state.
            <li key={`${index}-${text}`}>{text}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

export function PropertyFacts({
  listing,
  locale,
}: {
  listing: PublicListingDetail;
  locale: PublicLocale;
}) {
  const copy = discoveryCopy(locale),
    labels = propertyFactsCopy(locale);
  const groups = [
    "price",
    "space",
    "building",
    "condition",
    "access",
    "facilities",
    "planning",
  ] as const;
  const rentalOpen =
    listing.purpose === "long_term_rent"
      ? rentalFactKeys
          .filter((key) => {
            const state = listing.facts.find((fact) => fact.key === key)?.fact.state ?? "unknown";
            return ["unknown", "not_supplied", "conflicting"].includes(state);
          })
          .map((key) => ({
            key,
            state: listing.facts.find((fact) => fact.key === key)?.fact.state ?? "unknown",
          }))
      : [];
  const questions = [...listing.toConfirm, ...rentalOpen];
  return (
    <div className="space-y-8" data-property-facts>
      <section aria-labelledby="property-details-heading" className="space-y-5">
        <h2 id="property-details-heading" className="text-heading font-semibold">
          {labels.facts}
        </h2>
        {groups.map((group) => {
          const items = listing.facts.filter(
            (item) => item.group === group && !item.key.startsWith("rental."),
          );
          if (!items.length) return null;
          return (
            <section key={group} className="min-w-0 space-y-3" aria-labelledby={`facts-${group}`}>
              <h3 id={`facts-${group}`} className="text-dense font-semibold">
                {labels[group]}
              </h3>
              <dl className="grid gap-x-6 gap-y-4 border-t border-divider pt-3 sm:grid-cols-2">
                {items.map((item) => (
                  <div key={item.key} className="min-w-0 space-y-1 wrap-anywhere">
                    <dt className="text-compact text-text-muted">
                      {propertyFactLabel(item.key, locale)}
                    </dt>
                    <dd className="whitespace-pre-wrap">
                      <bdi lang={sourceLanguage(item)} dir="auto">
                        {item.key === "price"
                          ? priceText(listing.price, locale, copy)
                          : publicFactText(item, locale)}
                      </bdi>
                    </dd>
                    {item.key === "price" &&
                    listing.price.state === "known" &&
                    listing.price.value.inclusions?.length ? (
                      <dd>
                        <ul
                          className="list-disc space-y-1 ps-5"
                          lang={sourceLanguage(item)}
                          dir="auto"
                        >
                          {listing.price.value.inclusions.map((text, index) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: Exact ordered source inclusions may repeat and contain no component state.
                            <li key={`${index}-${text}`}>{text}</li>
                          ))}
                        </ul>
                      </dd>
                    ) : null}
                    <dd className="text-caption text-text-muted">{copy[item.verification]}</dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </section>
      {listing.purpose === "long_term_rent" ? (
        <section aria-labelledby="rental-terms-heading" className="space-y-4">
          <h2 id="rental-terms-heading" className="text-heading font-semibold">
            {labels.rental}
          </h2>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {rentalFactKeys.map((key) => {
              const item = listing.facts.find((fact) => fact.key === key);
              return (
                <div key={key} className="min-w-0 space-y-1 wrap-anywhere">
                  <dt className="text-compact text-text-muted">{propertyFactLabel(key, locale)}</dt>
                  <dd className="whitespace-pre-wrap">{rentalValue(listing, key, locale)}</dd>
                  {item ? (
                    <dd className="text-caption text-text-muted">{copy[item.verification]}</dd>
                  ) : null}
                </div>
              );
            })}
          </dl>
        </section>
      ) : null}
      {questions.length ? (
        <section
          className="space-y-3 rounded-panel border border-divider bg-subtle p-5"
          aria-labelledby="facts-to-confirm"
        >
          <h2 id="facts-to-confirm" className="text-heading font-semibold">
            {labels.confirm}
          </h2>
          <p className="text-compact text-text-muted">{labels.confirmLead}</p>
          <ul className="list-disc space-y-2 ps-5">
            {questions.map((item) => (
              <li key={item.key}>
                {propertyFactLabel(item.key, locale)}:{" "}
                {item.state === "known" ? copy.notConfirmed : copy[item.state]}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
