"use client";
import { parseServiceEntry } from "@/domain/service-scope";
import { serviceCopy } from "@/features/service-intake/copy";
import type { PublicLocale } from "@/i18n/config";
import { controlClass, labelClass } from "@/ui/field-class";
import type { FormController } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import type { InquiryValues } from "./inquiry-state";
export function InquiryServiceFields({
  form,
  locale,
}: {
  form: FormController<InquiryValues>;
  locale: PublicLocale;
}) {
  const entry = parseServiceEntry(form.values.serviceScope),
    c = serviceCopy(locale);
  const relationship = form.field("serviceRelationship");
  return (
    <fieldset className="min-w-0 space-y-4 rounded-panel border border-divider p-4">
      <legend className="font-semibold">{entry ? c[entry.topic] : c.needs}</legend>
      <input type="hidden" name="serviceScope" value={form.values.serviceScope} />
      <p>{c.boundary}</p>
      <FormField {...form.field("serviceLocation")} label={c.location} required maxLength={200} />
      <FormField
        {...form.field("serviceNeeds")}
        label={c.needs}
        required
        multiline
        maxLength={2000}
      />
      {entry?.topic === "short_stay_consultation" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField {...form.field("serviceFrom")} label={c.from} type="date" required />
          <FormField {...form.field("serviceUntil")} label={c.until} type="date" required />
          <input type="hidden" name="serviceRelationship" value={form.values.serviceRelationship} />
        </div>
      ) : (
        <>
          <label className={labelClass} htmlFor={relationship.id}>
            {c.relationship}
          </label>
          <select {...relationship} className={controlClass} required>
            {Object.entries(c.relationships).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input type="hidden" name="serviceFrom" value={form.values.serviceFrom} />
          <input type="hidden" name="serviceUntil" value={form.values.serviceUntil} />
        </>
      )}
    </fieldset>
  );
}
