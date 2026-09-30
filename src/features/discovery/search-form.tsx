import { getDb } from "@/db/client";
import { areaBases, propertyTypes } from "@/domain/facts";
import { currencyCodes } from "@/domain/ids";
import type { PublicLocale } from "@/i18n/config";
import { interpretedFeatureKeys } from "@/server/ai/intent";
import { intentPlaces } from "@/server/ai/intent-source";
import { buttonClass } from "@/ui/button-class";
import { controlClass } from "@/ui/field-class";
import { ChevronDownIcon, FiltersIcon } from "@/ui/icons";
import type { DiscoveryCopy } from "./copy";
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
  const places = compact ? [] : await intentPlaces(getDb()).catch(() => []);
  const selected = (value: string) => value.split(",").filter(Boolean);
  const label = (key: string) =>
    Object.hasOwn(copy, key) ? copy[key as keyof DiscoveryCopy] : `${copy.check}: ${key}`;
  const featureLabel = (key: string) =>
    Object.hasOwn(extra, key) ? extra[key as keyof typeof extra] : `${copy.check}: ${key}`;
  const placeLabel = (id: string) => {
    const place = places.find((candidate) => candidate.id === id);
    return place
      ? locale === "bg"
        ? place.names[0]
        : (place.names[1] ?? place.names[0])
      : copy.failed;
  };
  const range = (min: string, max: string) =>
    [min ? `${extra.minimum} ${min}` : "", max ? `${extra.maximum} ${max}` : ""]
      .filter(Boolean)
      .join(" · ");
  const rules: { label: string; value: string }[] = [];
  if (values.type)
    rules.push({ label: copy.propertyType, value: selected(values.type).map(label).join(", ") });
  if (values.places)
    rules.push({
      label: extra.locations,
      value: selected(values.places).map(placeLabel).join(", "),
    });
  if (values.minPrice || values.maxPrice)
    rules.push({
      label: extra.amount,
      value: `${range(values.minPrice, values.maxPrice)} ${values.currency || "EUR"}`,
    });
  if (values.minBeds || values.maxBeds)
    rules.push({ label: copy.bedrooms, value: range(values.minBeds, values.maxBeds) });
  if (values.minRooms || values.maxRooms)
    rules.push({ label: extra.rooms, value: range(values.minRooms, values.maxRooms) });
  if (values.minArea || values.maxArea)
    rules.push({
      label: label(values.areaBasis || "living"),
      value: `${range(values.minArea, values.maxArea)} m²`,
    });
  if (values.features)
    rules.push({
      label: extra.features,
      value: selected(values.features).map(featureLabel).join(", "),
    });
  if (values.sort && values.sort !== "relevance")
    rules.push({
      label: copy.sort,
      value:
        values.sort === "price_asc"
          ? copy.priceAsc
          : values.sort === "price_desc"
            ? copy.priceDesc
            : label(values.sort),
    });
  if (values.includeUnconfirmed === "1") rules.push({ label: copy.includeUnconfirmed, value: "" });
  return (
    <form
      action={`/${locale}/properties`}
      method="get"
      className="min-w-0 space-y-4 rounded-control border border-border bg-surface p-4 sm:p-5"
    >
      <div className="grid min-w-0 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
        <label className="flex min-w-0 flex-col gap-2">
          <span className="font-semibold">{copy.purpose}</span>
          <select name="purpose" defaultValue={values.purpose || "sale"} className={controlClass}>
            <option value="sale">{copy.buy}</option>
            <option value="long_term_rent">{copy.rent}</option>
            {values.purpose && !["sale", "long_term_rent"].includes(values.purpose) ? (
              <option value={values.purpose}>{label(values.purpose)}</option>
            ) : null}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-2">
          <span className="font-semibold">{copy.query}</span>
          <input name="q" defaultValue={values.q} maxLength={100} className={controlClass} />
        </label>
        <button type="submit" className={buttonClass("primary", "sm:col-span-2 lg:col-span-1")}>
          {copy.search}
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-compact">
        <a
          href={`/${locale}/properties/intent`}
          className="inline-flex min-h-11 items-center underline"
        >
          {extra.title}
        </a>
        {!compact ? (
          <a href={`/${locale}/properties`} className="inline-flex min-h-11 items-center underline">
            {copy.clear}
          </a>
        ) : null}
      </div>
      {!compact && rules.length ? (
        <ul
          aria-label={copy.activeFilters}
          className="flex flex-wrap gap-x-5 gap-y-1 text-compact text-text-muted"
        >
          {rules.map((rule) => (
            <li key={rule.label} className="min-w-0 break-words">
              {rule.label}
              {rule.value ? (
                <>
                  : <bdi>{rule.value}</bdi>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {!compact ? (
        <details
          open={filtersOpen}
          className="group/filters border-t border-border pt-3 [&:not([open])>div]:hidden"
        >
          {/* biome-ignore lint/a11y/useSemanticElements: native summary stays operable without JS; role exposes the disclosure consistently to assistive technology. */}
          <summary
            role="button"
            className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-control text-compact font-semibold text-action [&::-webkit-details-marker]:hidden"
          >
            <FiltersIcon />
            <span>
              {copy.filters}
              {rules.length ? (
                <>
                  {" "}
                  · <bdi>{rules.length}</bdi>
                </>
              ) : null}
            </span>
            <ChevronDownIcon className="ms-auto shrink-0 group-open/filters:rotate-180" />
          </summary>
          <div className="grid min-w-0 gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex min-w-0 flex-col gap-2">
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
            <label className="flex min-w-0 flex-col gap-2">
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
            <label className="flex min-w-0 flex-col gap-2">
              <span>{extra.currency}</span>
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
            <label className="flex min-w-0 flex-col gap-2">
              <span>{copy.minBeds}</span>
              <input
                name="minBeds"
                inputMode="numeric"
                defaultValue={values.minBeds}
                className={controlClass}
              />
            </label>
            {(["maxBeds", "minRooms", "maxRooms"] as const).map((key) => (
              <label key={key} className="flex min-w-0 flex-col gap-2">
                <span>{extra[key]}</span>
                <input
                  name={key}
                  inputMode="numeric"
                  defaultValue={values[key]}
                  className={controlClass}
                />
              </label>
            ))}
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
            <label className="flex min-w-0 flex-col gap-2 sm:col-span-2 lg:col-span-3">
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
            <label className="flex min-w-0 flex-col gap-2">
              <span>{copy.areaBasis}</span>
              <select
                name="areaBasis"
                defaultValue={values.areaBasis || "living"}
                className={controlClass}
              >
                {values.areaBasis && !areaBases.some((value) => value === values.areaBasis) ? (
                  <option value={values.areaBasis}>{label(values.areaBasis)}</option>
                ) : null}
                {areaBases.map((value) => (
                  <option key={value} value={value}>
                    {copy[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-2">
              <span>{copy.minArea}</span>
              <input
                name="minArea"
                inputMode="decimal"
                defaultValue={values.minArea}
                className={controlClass}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-2">
              <span>{copy.maxArea}</span>
              <input
                name="maxArea"
                inputMode="decimal"
                defaultValue={values.maxArea}
                className={controlClass}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-2">
              <span>{copy.sort}</span>
              <select
                name="sort"
                defaultValue={values.sort || "relevance"}
                className={controlClass}
              >
                {values.sort &&
                !["relevance", "newest", "price_asc", "price_desc"].includes(values.sort) ? (
                  <option value={values.sort}>{label(values.sort)}</option>
                ) : null}
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
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="submit" className={buttonClass("secondary")}>
                {copy.apply}
              </button>
            </div>
          </div>
        </details>
      ) : null}
    </form>
  );
}
