"use client";
import { controlClass, errorClass, fieldClass, labelClass } from "@/ui/field-class";
import type { FormAction, FormState, FormValues } from "@/ui/form/contract";
import { ActionForm } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import { workCopy } from "../work/copy";
export type WorkflowField = {
  name: string;
  label: string;
  type?:
    | "textarea"
    | "text"
    | "datetime-local"
    | "number"
    | "checkbox"
    | "checkbox-group"
    | "select"
    | "hidden";
  hint?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
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
}) {
  return (
    <ActionForm
      action={action}
      initialState={initialState}
      permalink={path}
      nativeIdentity={nativeIdentity}
      reconciliation={status}
      pendingReferenceCookie={pendingReferenceCookie}
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
