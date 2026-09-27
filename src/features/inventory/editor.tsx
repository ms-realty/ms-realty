"use client";
import {
  areaBases,
  factStates,
  listingPurposes,
  propertyTypes,
  sourceClasses,
} from "@/domain/facts";
import { controlClass } from "@/ui/field";
import type { FormAction, FormState } from "@/ui/form/contract";
import { ActionForm } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import { inventoryCopy, optionLabel } from "./copy";

export type InventoryValues = Record<keyof ReturnType<typeof inventoryCopy>["labels"], string>;
const selects: Partial<Record<keyof InventoryValues, readonly string[]>> = {
  propertyType: propertyTypes,
  purpose: listingPurposes,
  country: ["BG", "GR"],
  priceState: factStates,
  areaState: factStates,
  areaBasis: areaBases,
  bedroomsState: factStates,
  sourceClass: sourceClasses,
  sourceLanguage: ["bg", "en", "ru", "de", "nl", "el", "he"],
};
export function InventoryEditor({
  locale,
  initialState,
  action,
  reference,
}: {
  locale: string;
  initialState: FormState<InventoryValues>;
  action: FormAction<InventoryValues>;
  reference?: string;
}) {
  const copy = inventoryCopy(locale);
  const path = `/${locale}/inventory/${reference ?? "new"}`;
  const fields = Object.keys(copy.labels) as (keyof InventoryValues)[];
  const identity = ["propertyType", "purpose", "country", "region", "settlement", "exactAddress"];
  return (
    <ActionForm
      action={action}
      initialState={initialState}
      permalink={path}
      reconciliation={{
        href: `/${locale}/inventory/operations/${initialState.operationId}`,
        label: copy.operation,
      }}
      labels={copy.labels}
      copy={copy.form}
      submitLabel={reference ? copy.save : copy.create}
    >
      {(form) => (
        <div className="grid gap-5 md:grid-cols-2">
          {fields
            .filter((name) => !reference || !identity.includes(name))
            .map((name) => {
              const field = form.field(name);
              const values = selects[name];
              return values ? (
                <div key={name} className="flex flex-col gap-2">
                  <label htmlFor={field.id} className="text-compact font-semibold">
                    {copy.labels[name]}
                  </label>
                  <select
                    id={field.id}
                    name={name}
                    value={field.value}
                    disabled={field.readOnly}
                    className={controlClass}
                    aria-invalid={Boolean(field.error)}
                    aria-describedby={field.error ? `${field.id}-error` : undefined}
                    onChange={(event) => form.setValue(name, event.target.value)}
                  >
                    {values.map((value) => (
                      <option key={value} value={value}>
                        {optionLabel(value, locale)}
                      </option>
                    ))}
                  </select>
                  {field.readOnly ? <input type="hidden" name={name} value={field.value} /> : null}
                  {field.error ? (
                    <p id={`${field.id}-error`} className="text-error">
                      {field.error}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div
                  key={name}
                  className={
                    name === "description" || name === "sourceReference" || name === "brokerNote"
                      ? "md:col-span-2"
                      : undefined
                  }
                >
                  <FormField
                    {...field}
                    label={copy.labels[name]}
                    multiline={name === "description" || name === "brokerNote"}
                  />
                </div>
              );
            })}
        </div>
      )}
    </ActionForm>
  );
}
