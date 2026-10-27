import type { PublicLocale } from "@/i18n/config";
import { buttonClass } from "@/ui/button-class";
import { controlClass, labelClass } from "@/ui/field-class";
import type { DiscoveryCopy } from "./copy";
import { type Filters, filterNames } from "./query";

/** UI14: independent native sort commits the existing criteria and starts a fresh page. */
export function ResultsSort({
  locale,
  values,
  copy,
}: {
  locale: PublicLocale;
  values: Filters;
  copy: DiscoveryCopy;
}) {
  return (
    <form
      action={`/${locale}/properties#results-heading`}
      method="get"
      className="flex min-w-0 flex-wrap items-end gap-2"
      data-print-hide=""
    >
      {filterNames
        .filter((key) => key !== "sort" && values[key])
        .map((key) => (
          <input key={key} type="hidden" name={key} value={values[key]} />
        ))}
      <label className="flex min-w-0 flex-col gap-1">
        <span className={labelClass}>{copy.sort}</span>
        <select name="sort" defaultValue={values.sort || "relevance"} className={controlClass}>
          {values.sort &&
          !["relevance", "newest", "price_asc", "price_desc"].includes(values.sort) ? (
            <option value={values.sort}>{copy.check}</option>
          ) : null}
          <option value="relevance">{copy.relevance}</option>
          <option value="newest">{copy.newest}</option>
          <option value="price_asc">{copy.priceAsc}</option>
          <option value="price_desc">{copy.priceDesc}</option>
        </select>
      </label>
      <button type="submit" className={buttonClass("secondary", "min-h-input")}>
        {copy.apply}
      </button>
    </form>
  );
}
