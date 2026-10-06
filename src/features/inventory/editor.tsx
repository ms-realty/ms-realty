"use client";
import type { ReactNode } from "react";
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
type Field = keyof InventoryValues;
const selects: Partial<Record<Field, readonly string[]>> = {
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
const identity: Field[] = [
  "propertyType",
  "purpose",
  "country",
  "region",
  "settlement",
  "exactAddress",
];
const textFields: Field[] = ["title", "description"];

/**
 * One Server Action and one draft. `create` shows every field (O11). An existing listing
 * splits the draft into the O12 Text and Facts tabs; the other tab's values travel as hidden
 * fields, so either save keeps the whole draft. A blank required source is shown on Text too.
 */
export function InventoryEditor({
  locale,
  initialState,
  action,
  reference,
  view = "create",
  secondaryActions,
  footer,
}: {
  locale: string;
  initialState: FormState<InventoryValues>;
  action: FormAction<InventoryValues>;
  reference?: string;
  view?: "create" | "text" | "facts";
  secondaryActions?: ReactNode;
  footer?: ReactNode;
}) {
  const copy = inventoryCopy(locale);
  const path = `/${locale}/inventory/${reference ?? "new"}${view === "facts" ? "?tab=facts" : ""}`;
  const labels =
    view === "text"
      ? {
          ...copy.labels,
          title: copy.o12.titleLabel,
          description: copy.o12.descriptionLabel,
        }
      : copy.labels;
  const all = (Object.keys(copy.labels) as Field[]).filter(
    (name) => view === "create" || !identity.includes(name),
  );
  return (
    <ActionForm
      action={action}
      initialState={initialState}
      permalink={path}
      reconciliation={{
        href: `/${locale}/inventory/operations/${initialState.operationId}`,
        label: copy.operation,
      }}
      labels={labels}
      copy={copy.form}
      layout={view === "create" ? "reading" : "full"}
      submitLabel={
        view === "text" ? copy.o12.saveText : view === "facts" ? copy.o12.saveFacts : copy.create
      }
      secondaryActions={secondaryActions}
    >
      {(form) => {
        const shown = (name: Field) =>
          view !== "text" ||
          textFields.includes(name) ||
          (name === "sourceReference" && (!form.values.sourceReference || form.field(name).error));
        const visible = all.filter((name) =>
          view === "facts" ? !textFields.includes(name) : true,
        );
        return (
          <>
            <div className={view === "text" ? "flex flex-col gap-6" : "grid gap-5 sm:grid-cols-2"}>
              {visible.filter(shown).map((name) => {
                const field = form.field(name);
                const values = selects[name];
                return values ? (
                  <div key={name} className="flex flex-col gap-2">
                    <label htmlFor={field.id} className="text-compact font-semibold">
                      {labels[name]}
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
                    {field.readOnly ? (
                      <input type="hidden" name={name} value={field.value} />
                    ) : null}
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
                        ? "sm:col-span-2"
                        : undefined
                    }
                  >
                    <FormField
                      {...field}
                      label={labels[name]}
                      hint={
                        view === "text" && name === "sourceReference"
                          ? copy.o12.sourceMissing
                          : undefined
                      }
                      multiline={name === "description" || name === "brokerNote"}
                      rows={name === "description" && view === "text" ? 6 : undefined}
                    />
                  </div>
                );
              })}
            </div>
            {all
              .filter((name) => !(visible.includes(name) && shown(name)))
              .map((name) => (
                <input key={name} type="hidden" name={name} value={form.values[name] ?? ""} />
              ))}
            {footer}
          </>
        );
      }}
    </ActionForm>
  );
}
