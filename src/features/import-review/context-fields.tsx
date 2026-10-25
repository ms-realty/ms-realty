import { areaBases, listingPurposes, propertyTypes } from "@/domain/facts";
import { inventoryCopy, optionLabel } from "@/features/inventory/copy";
import { localeEndonyms, publicLocales } from "@/i18n/config";
import { controlClass, fieldClass, labelClass } from "@/ui/field-class";
import { importExecutionCopy } from "./execution-copy";

/** Native fields: declarations are explicit, validated and included in the sealed plan. */
export function ImportContextFields({ locale, pending }: { locale: string; pending: boolean }) {
  const labels = inventoryCopy(locale).labels,
    copy = importExecutionCopy(locale);
  const choices = {
    country: ["BG", "GR"],
    propertyType: propertyTypes,
    purpose: listingPurposes,
    areaBasis: areaBases,
    sourceLanguage: publicLocales,
  };
  return (
    <fieldset className="grid gap-4 rounded-panel border border-border p-4" disabled={pending}>
      <legend className="px-2 font-semibold">{copy.setup}</legend>
      <p>{copy.setupHint}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(choices).map(([field, values]) => (
          <div className={fieldClass} key={field}>
            <label className={labelClass} htmlFor={`context-${field}`}>
              {labels[field as keyof typeof labels]}
            </label>
            <select
              className={controlClass}
              id={`context-${field}`}
              name={`context.${field}`}
              required
              defaultValue=""
            >
              <option value="">{copy.choose}</option>
              {values.map((value) => (
                <option key={value} value={value}>
                  {field === "sourceLanguage"
                    ? localeEndonyms[value as keyof typeof localeEndonyms]
                    : optionLabel(value, locale)}
                </option>
              ))}
            </select>
          </div>
        ))}
        <div className={fieldClass}>
          <label className={labelClass} htmlFor="context-region">
            {labels.region}
          </label>
          <input
            className={controlClass}
            id="context-region"
            name="context.region"
            required
            maxLength={150}
          />
        </div>
      </div>
    </fieldset>
  );
}
