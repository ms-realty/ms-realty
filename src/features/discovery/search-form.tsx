import { getDb } from "@/db/client";
import { currencyCodes } from "@/domain/ids";
import type { PublicLocale } from "@/i18n/config";
import { interpretedFeatureKeys } from "@/server/ai/intent";
import { intentPlaces } from "@/server/ai/intent-source";
import { buttonClass } from "@/ui/button-class";
import { controlClass } from "@/ui/field-class";
import type { DiscoveryCopy } from "./copy";
import { intentCopy } from "./intent-copy";
import type { Filters } from "./query";

export async function SearchForm({
  locale,
  copy,
  values,
  compact = false,
}: {
  locale: PublicLocale;
  copy: DiscoveryCopy;
  values: Filters;
  compact?: boolean;
}) {
  const extra = intentCopy(locale);
  const places = compact ? [] : await intentPlaces(getDb()).catch(() => []);
  return (
    <form
      action={`/${locale}/properties`}
      method="get"
      className="grid gap-4 rounded-control border border-border bg-surface p-5 sm:grid-cols-2 lg:grid-cols-3"
    >
      <label className="flex flex-col gap-2">
        <span className="font-semibold">{copy.purpose}</span>
        <select name="purpose" defaultValue={values.purpose || "sale"} className={controlClass}>
          <option value="sale">{copy.buy}</option>
          <option value="long_term_rent">{copy.rent}</option>
        </select>
      </label>
      <label className="flex flex-col gap-2 sm:col-span-2">
        <span className="font-semibold">{copy.query}</span>
        <input name="q" defaultValue={values.q} maxLength={100} className={controlClass} />
      </label>
      {!compact ? (
        <>
          <label className="flex flex-col gap-2">
            <span>
              {extra.minimum} · {extra.amount}
            </span>
            <input
              name="minPrice"
              inputMode="decimal"
              defaultValue={values.minPrice}
              className={controlClass}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span>
              {extra.maximum} · {extra.amount}
            </span>
            <input
              name="maxPrice"
              inputMode="decimal"
              defaultValue={values.maxPrice}
              className={controlClass}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span>{extra.currency}</span>
            <select
              name="currency"
              defaultValue={values.currency || "EUR"}
              className={controlClass}
            >
              {currencyCodes.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span>{copy.minBeds}</span>
            <input
              name="minBeds"
              inputMode="numeric"
              defaultValue={values.minBeds}
              className={controlClass}
            />
          </label>
          {(["maxBeds", "minRooms", "maxRooms"] as const).map((key) => (
            <label key={key} className="flex flex-col gap-2">
              <span>{extra[key]}</span>
              <input
                name={key}
                inputMode="numeric"
                defaultValue={values[key]}
                className={controlClass}
              />
            </label>
          ))}
          <fieldset className="space-y-2 sm:col-span-2 lg:col-span-3">
            <legend className="font-semibold">
              {copy.propertyType} · {copy.anyType}
            </legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {(
                [
                  "apartment",
                  "house",
                  "plot",
                  "commercial",
                  "hotel",
                  "development",
                  "other",
                ] as const
              ).map((value) => (
                <label key={value} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    name="type"
                    value={value}
                    defaultChecked={values.type.split(",").includes(value)}
                    className="size-5 accent-action"
                  />
                  {copy[value]}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-2 sm:col-span-2 lg:col-span-3">
            <legend className="font-semibold">{extra.features}</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {[
                ...new Set([
                  ...interpretedFeatureKeys,
                  ...values.features.split(",").filter(Boolean),
                ]),
              ].map((key) => (
                <label key={key} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    name="features"
                    value={key}
                    defaultChecked={values.features.split(",").includes(key)}
                    className="size-5 accent-action"
                  />
                  {extra[key as keyof typeof extra] ?? copy.check}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
            <span>{extra.locations}</span>
            <select
              name="places"
              multiple
              size={Math.max(2, Math.min(5, places.length))}
              defaultValue={values.places ? values.places.split(",") : []}
              className={controlClass}
            >
              {places.map((place) => (
                <option key={place.id} value={place.id}>
                  {locale === "bg" ? place.names[0] : (place.names[1] ?? place.names[0])}
                </option>
              ))}
              {values.places
                .split(",")
                .filter((id) => id && !places.some((p) => p.id === id))
                .map((id) => (
                  <option key={id} value={id}>
                    {copy.failed}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span>{copy.areaBasis}</span>
            <select
              name="areaBasis"
              defaultValue={values.areaBasis || "living"}
              className={controlClass}
            >
              {(["living", "built", "total", "land"] as const).map((value) => (
                <option key={value} value={value}>
                  {copy[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span>{copy.minArea}</span>
            <input
              name="minArea"
              inputMode="decimal"
              defaultValue={values.minArea}
              className={controlClass}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span>{copy.maxArea}</span>
            <input
              name="maxArea"
              inputMode="decimal"
              defaultValue={values.maxArea}
              className={controlClass}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span>{copy.sort}</span>
            <select name="sort" defaultValue={values.sort || "relevance"} className={controlClass}>
              <option value="relevance">{copy.relevance}</option>
              <option value="newest">{copy.newest}</option>
              <option value="price_asc">{copy.priceAsc}</option>
              <option value="price_desc">{copy.priceDesc}</option>
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-3 sm:col-span-2">
            <input
              type="checkbox"
              name="includeUnconfirmed"
              value="1"
              defaultChecked={values.includeUnconfirmed === "1"}
              className="size-5 accent-action"
            />
            {copy.includeUnconfirmed}
          </label>
        </>
      ) : null}
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-3">
        <button type="submit" className={buttonClass("primary")}>
          {compact ? copy.search : copy.apply}
        </button>
        <a href={`/${locale}/properties/intent`} className="underline">
          {extra.title}
        </a>
        {!compact ? (
          <a href={`/${locale}/properties`} className="underline">
            {copy.clear}
          </a>
        ) : null}
      </div>
    </form>
  );
}
