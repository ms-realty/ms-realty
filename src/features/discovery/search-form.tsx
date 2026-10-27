import { getDb } from "@/db/client";
import { propertyTypes } from "@/domain/facts";
import { currencyCodes } from "@/domain/ids";
import type { PublicLocale } from "@/i18n/config";
import { factFieldLabel } from "@/i18n/fact-labels";
import { interpretedFeatureKeys } from "@/server/ai/intent";
import { intentPlaces } from "@/server/ai/intent-source";
import { searchableAreaBases } from "@/server/search/search";
import { buttonClass } from "@/ui/button-class";
import { controlClass, labelClass } from "@/ui/field-class";
import { CloseIcon } from "@/ui/icons";
import { appliedCriteria } from "./applied-criteria";
import type { DiscoveryCopy } from "./copy";
import { FilterEditor } from "./filter-editor";
import { intentCopy } from "./intent-copy";
import type { Filters } from "./query";

export async function SearchForm({
  locale,
  copy,
  values,
  compact = false,
  filtersOpen = false,
}: {
  locale: PublicLocale;
  copy: DiscoveryCopy;
  values: Filters;
  compact?: boolean;
  filtersOpen?: boolean;
}) {
  const extra = intentCopy(locale);
  const places = await intentPlaces(getDb()).catch(() => []);
  const queryHint = `discovery-query-${locale}-${compact ? "home" : "results"}`;
  const selected = (value: string) => value.split(",").filter(Boolean);
  const label = (key: string) => {
    const value = Object.hasOwn(copy, key) ? copy[key as keyof DiscoveryCopy] : undefined;
    return typeof value === "string" ? value : copy.check;
  };
  const featureLabel = (key: string) =>
    Object.hasOwn(extra, key)
      ? extra[key as keyof typeof extra]
      : factFieldLabel(`feature.${key}`, locale);
  const placeLabel = (id: string) => {
    const place = places.find((candidate) => candidate.id === id);
    return (
      (place
        ? locale === "bg"
          ? place.names[0]
          : (place.names[1] ?? place.names[0])
        : copy.failed) || copy.failed
    );
  };
  const range = (min: string, max: string) =>
    [min ? `${extra.minimum} ${min}` : "", max ? `${extra.maximum} ${max}` : ""]
      .filter(Boolean)
      .join(" · ");
  const rules = appliedCriteria(locale, values, {
    query: copy.query,
    mapArea: copy.mapArea,
    propertyType: copy.propertyType,
    places: extra.locations,
    price: extra.amount,
    bedrooms: copy.bedrooms,
    rooms: extra.rooms,
    area: label(values.areaBasis || "living"),
    features: extra.features,
    sort: copy.sort,
    unconfirmed: copy.includeUnconfirmed,
    place: placeLabel,
    feature: featureLabel,
    range,
    label: (value) =>
      value === "price_asc"
        ? copy.priceAsc
        : value === "price_desc"
          ? copy.priceDesc
          : label(value),
  });
  return (
    <form
      id={compact ? "home-property-search" : "property-search"}
      tabIndex={-1}
      action={`/${locale}/properties`}
      method="get"
      className="min-w-0 space-y-4 rounded-control border border-border bg-surface p-4 sm:p-5"
    >
      <div
        className={
          compact
            ? "grid min-w-0 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_auto]"
            : "grid min-w-0 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]"
        }
      >
        <label className="flex min-w-0 flex-col gap-2">
          <span className={labelClass}>{copy.searchPurpose}</span>
          <select name="purpose" defaultValue={values.purpose || "sale"} className={controlClass}>
            <option value="sale">{copy.buy}</option>
            <option value="long_term_rent">{copy.rent}</option>
            {values.purpose && !["sale", "long_term_rent"].includes(values.purpose) ? (
              <option value={values.purpose}>{label(values.purpose)}</option>
            ) : null}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-2">
          <span className={labelClass}>{copy.query}</span>
          <input
            name="q"
            type="search"
            enterKeyHint="search"
            list={`${queryHint}-places`}
            placeholder={copy.searchPlaceholder}
            aria-describedby={queryHint}
            defaultValue={values.q}
            maxLength={100}
            className={controlClass}
          />
          <datalist id={`${queryHint}-places`}>
            {places.slice(0, 100).map((place) => (
              <option key={place.id} value={placeLabel(place.id)} />
            ))}
          </datalist>
        </label>
        {compact ? (
          <label className="flex min-w-0 flex-col gap-2">
            <span className={labelClass}>
              {copy.maxPrice} · {copy.rent}: {copy.perMonth}
            </span>
            <input
              name="maxPrice"
              inputMode="decimal"
              defaultValue={values.maxPrice}
              className={controlClass}
            />
            <input type="hidden" name="currency" value={values.currency || "EUR"} />
          </label>
        ) : null}
        <button
          type="submit"
          className={buttonClass("primary", "sm:col-span-2 lg:col-span-1 lg:min-h-input")}
        >
          {copy.search}
        </button>
      </div>
      <p id={queryHint} className="max-w-reading text-caption text-text-muted">
        {copy.searchHint}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-compact">
        <a
          href={`/${locale}/properties/intent`}
          className="inline-flex min-h-11 items-center underline"
        >
          {extra.title}
        </a>
        {!compact &&
        (filtersOpen ||
          rules.length > 0 ||
          values.q ||
          (values.purpose && values.purpose !== "sale")) ? (
          <a href={`/${locale}/properties`} className="inline-flex min-h-11 items-center underline">
            {copy.clear}
          </a>
        ) : null}
      </div>
      {!compact && rules.length ? (
        <ul
          aria-label={copy.activeFilters}
          id="active-search-criteria"
          className="flex flex-wrap gap-x-5 gap-y-1 text-compact text-text-muted"
        >
          {rules.map((rule) => (
            <li key={rule.id} className="min-w-0 break-words">
              <a
                href={rule.href}
                aria-label={copy.removeCriterion.replace(
                  "{names}",
                  `${rule.label}${rule.value ? `: ${rule.value}` : ""}`,
                )}
                className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-control border border-divider bg-subtle px-3 py-2 text-caption no-underline hover:border-action hover:text-action"
              >
                <span>
                  {rule.label}
                  {rule.value ? (
                    <>
                      : <bdi>{rule.value}</bdi>
                    </>
                  ) : null}
                </span>
                <CloseIcon className="size-4" />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {!compact ? (
        <FilterEditor
          action={`/${locale}/properties`}
          copy={copy}
          values={values}
          activeCount={rules.length}
          filtersOpen={filtersOpen}
        >
          <div className="grid min-w-0 gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex min-w-0 flex-col gap-2 sm:col-span-2 lg:col-span-3">
              <span className={labelClass}>{extra.locations}</span>
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
            <label className="flex min-w-0 flex-col gap-2">
              <span className={labelClass}>
                {extra.minimum} · {extra.amount}
              </span>
              <input
                name="minPrice"
                inputMode="decimal"
                defaultValue={values.minPrice}
                className={controlClass}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-2">
              <span className={labelClass}>
                {extra.maximum} · {extra.amount}
              </span>
              <input
                name="maxPrice"
                inputMode="decimal"
                defaultValue={values.maxPrice}
                className={controlClass}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-2">
              <span className={labelClass}>{extra.currency}</span>
              <select
                name="currency"
                defaultValue={values.currency || "EUR"}
                className={controlClass}
              >
                {values.currency && !currencyCodes.some((value) => value === values.currency) ? (
                  <option value={values.currency}>{values.currency}</option>
                ) : null}
                {currencyCodes.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="min-w-0 space-y-2 sm:col-span-2 lg:col-span-3">
              <legend className="font-semibold">
                {copy.propertyType} · {copy.anyType}
              </legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {[...new Set([...propertyTypes, ...selected(values.type)])].map((value) => (
                  <label key={value} className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      name="type"
                      value={value}
                      defaultChecked={values.type.split(",").includes(value)}
                      className="size-5 accent-action"
                    />
                    {label(value)}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex min-w-0 flex-col gap-2">
              <span className={labelClass}>{copy.minBeds}</span>
              <input
                name="minBeds"
                inputMode="numeric"
                defaultValue={values.minBeds}
                className={controlClass}
              />
            </label>
            {(["maxBeds", "minRooms", "maxRooms"] as const).map((key) => (
              <label key={key} className="flex min-w-0 flex-col gap-2">
                <span className={labelClass}>{extra[key]}</span>
                <input
                  name={key}
                  inputMode="numeric"
                  defaultValue={values[key]}
                  className={controlClass}
                />
              </label>
            ))}
            <label className="flex min-w-0 flex-col gap-2">
              <span className={labelClass}>{copy.areaBasis}</span>
              <select
                name="areaBasis"
                defaultValue={values.areaBasis || "living"}
                className={controlClass}
              >
                {values.areaBasis &&
                !searchableAreaBases.some((value) => value === values.areaBasis) ? (
                  <option value={values.areaBasis}>{label(values.areaBasis)}</option>
                ) : null}
                {searchableAreaBases.map((value) => (
                  <option key={value} value={value}>
                    {copy[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-2">
              <span className={labelClass}>{copy.minArea}</span>
              <input
                name="minArea"
                inputMode="decimal"
                defaultValue={values.minArea}
                className={controlClass}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-2">
              <span className={labelClass}>{copy.maxArea}</span>
              <input
                name="maxArea"
                inputMode="decimal"
                defaultValue={values.maxArea}
                className={controlClass}
              />
            </label>
            <fieldset className="min-w-0 space-y-2 sm:col-span-2 lg:col-span-3">
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
                    {featureLabel(key)}
                  </label>
                ))}
              </div>
            </fieldset>
            <input type="hidden" name="sort" value={values.sort || "relevance"} />
            {values.mapBounds ? (
              <input type="hidden" name="mapBounds" value={values.mapBounds} />
            ) : null}
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
          </div>
        </FilterEditor>
      ) : null}
    </form>
  );
}
