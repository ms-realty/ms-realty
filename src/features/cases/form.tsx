"use client";
import { isCurrencyCode } from "@/domain/ids";
import { isInstantInput } from "@/domain/time";
import { isPublicLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { DateTimeField } from "@/ui/date-time-field";
import { controlClass, errorClass, fieldClass, labelClass } from "@/ui/field-class";
import type { FormAction, FormState, FormValues } from "@/ui/form/contract";
import { ActionForm } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import { MoneyField } from "@/ui/money-field";
import { workCopy } from "../work/copy";
export type WorkflowField = {
  name: string;
  label: string;
  type?:
    | "textarea"
    | "text"
    | "datetime-local"
    | "number"
    | "money"
    | "checkbox"
    | "checkbox-group"
    | "select"
    | "hidden";
  hint?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  /** The declared ISO currency field; changing it never converts the entered amount. */
  currencyField?: string;
};
export function WorkflowForm({
  locale,
  initialState,
  fields,
  action,
  path,
  nativeIdentity,
  status,
  submit,
  pendingReferenceCookie,
  disclosure,
}: {
  locale: string;
  initialState: FormState<FormValues>;
  fields: WorkflowField[];
  action: FormAction<FormValues>;
  path: string;
  nativeIdentity?: string;
  status: { href: string; label: string };
  submit: string;
  pendingReferenceCookie?: string;
  disclosure?: string;
}) {
  return (
    <ActionForm
      formatValue={(name, value) =>
        fields.some((field) => field.name === name && field.type === "datetime-local") &&
        isInstantInput(value)
          ? formatDateTime(isPublicLocale(locale) ? locale : "bg", value, { zoneLabel: true })
          : value
      }
      action={action}
      initialState={initialState}
      permalink={path}
      nativeIdentity={nativeIdentity}
      reconciliation={status}
      pendingReferenceCookie={pendingReferenceCookie}
      disclosure={disclosure}
      copy={workCopy(locale).form}
      labels={Object.fromEntries(fields.map((field) => [field.name, field.label]))}
      submitLabel={submit}
    >
      {(form) => (
        <>
          {fields.map((definition) => {
            const field = form.field(definition.name);
            if (definition.type === "hidden")
              return <input key={field.name} type="hidden" name={field.name} value={field.value} />;
            if (definition.type === "money") {
              const currency = form.values[definition.currencyField ?? "currency"] ?? "";
              return (
                <MoneyField
                  key={field.name}
                  {...field}
                  locale={isPublicLocale(locale) ? locale : "bg"}
                  currency={isCurrencyCode(currency) ? currency : undefined}
                  label={definition.label}
                  hint={definition.hint}
                  required={definition.required}
                  onValueChange={(value) => form.setValue(field.name, value)}
                />
              );
            }
            if (definition.type === "datetime-local")
              return (
                <DateTimeField
                  key={field.name}
                  {...field}
                  locale={isPublicLocale(locale) ? locale : "bg"}
                  label={definition.label}
                  hint={definition.hint}
                  required={definition.required}
                  onValueChange={(value) => form.setValue(field.name, value)}
                />
              );
            const errorId = field.error ? `${field.id}-error` : undefined;
            const hintId = definition.hint ? `${field.id}-hint` : undefined;
            const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
            if (definition.type === "checkbox-group") {
              const selected = field.value.split("\n").filter(Boolean);
              return (
                <fieldset
                  key={field.name}
                  id={field.id}
                  tabIndex={-1}
                  className={fieldClass}
                  aria-invalid={Boolean(field.error) || undefined}
                  aria-describedby={describedBy}
                  disabled={field.readOnly}
                >
                  <legend className="font-semibold">{definition.label}</legend>
                  {definition.hint ? <p id={hintId}>{definition.hint}</p> : null}
                  {definition.options?.map((option) => (
                    <label key={option.value} className="flex min-h-control items-center gap-3">
                      <input
                        type="checkbox"
                        name={field.name}
                        value={option.value}
                        checked={selected.includes(option.value)}
                        onChange={(e) =>
                          form.setValue(
                            field.name,
                            (e.target.checked
                              ? [...selected, option.value]
                              : selected.filter((value) => value !== option.value)
                            ).join("\n"),
                          )
                        }
                        aria-invalid={Boolean(field.error) || undefined}
                        className="size-5"
                      />
                      {option.label}
                    </label>
                  ))}
                  {field.error ? (
                    <p id={errorId} className={errorClass}>
                      {field.error}
                    </p>
                  ) : null}
                </fieldset>
              );
            }
            if (definition.type === "select")
              return (
                // Linux WebKit lets long native option text escape a flex item even when
                // the select's border box fits. Normal block flow preserves native UI.
                <div
                  key={field.name}
                  className="group min-w-0 w-full space-y-2"
                  data-invalid={field.error ? "true" : undefined}
                >
                  <label htmlFor={field.id} className={`block ${labelClass}`}>
                    {definition.label}
                  </label>
                  <select
                    id={field.id}
                    name={field.name}
                    value={field.value}
                    disabled={field.readOnly}
                    onChange={(e) => form.setValue(field.name, e.target.value)}
                    className={`${controlClass} min-w-0 max-w-full overflow-hidden text-ellipsis`}
                    aria-invalid={Boolean(field.error) || undefined}
                    aria-describedby={describedBy}
                    required={definition.required}
                  >
                    {definition.options?.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {definition.hint ? <p id={hintId}>{definition.hint}</p> : null}
                  {field.error ? (
                    <p id={errorId} className={errorClass}>
                      {field.error}
                    </p>
                  ) : null}
                </div>
              );
            if (definition.type === "checkbox")
              return (
                <div key={field.name} className={fieldClass}>
                  <label htmlFor={field.id} className="flex items-start gap-3">
                    <input
                      id={field.id}
                      name={field.name}
                      type="checkbox"
                      value="true"
                      checked={field.value === "true"}
                      disabled={field.readOnly}
                      onChange={(e) => form.setValue(field.name, e.target.checked ? "true" : "")}
                      className="mt-1 size-5 shrink-0"
                      aria-invalid={Boolean(field.error) || undefined}
                      aria-describedby={describedBy}
                      required={definition.required}
                    />
                    {definition.label}
                  </label>
                  {definition.hint ? <p id={hintId}>{definition.hint}</p> : null}
                  {field.error ? (
                    <p id={errorId} className={errorClass}>
                      {field.error}
                    </p>
                  ) : null}
                </div>
              );
            return definition.type === "textarea" ? (
              <FormField
                key={field.name}
                {...field}
                label={definition.label}
                hint={definition.hint}
                required={definition.required}
                multiline
                maxLength={6000}
              />
            ) : (
              <FormField
                key={field.name}
                {...field}
                label={definition.label}
                hint={definition.hint}
                required={definition.required}
                type={definition.type ?? "text"}
                maxLength={6000}
              />
            );
          })}
        </>
      )}
    </ActionForm>
  );
}
