"use client";
import { privacyCopy } from "@/features/privacy/copy";
import type { PublicLocale } from "@/i18n/config";
import { controlClass, errorClass, labelClass } from "@/ui/field-class";
import type { FormAction, FormState } from "@/ui/form/contract";
import { ActionForm } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import { searchAlertCopy, searchAlertCopyLocale } from "./search-alert-copy";
import type { SearchAlertValues } from "./search-alert-state";

export function SearchAlertForm({
  locale,
  permalink,
  contacts,
  initialState,
  action,
}: {
  locale: PublicLocale;
  permalink: string;
  contacts: { id: string; value: string }[];
  initialState: FormState<SearchAlertValues>;
  action: FormAction<SearchAlertValues>;
}) {
  const c = searchAlertCopy(locale),
    p = privacyCopy(locale);
  return (
    <div lang={searchAlertCopyLocale(locale)} dir="ltr">
      <ActionForm
        action={action}
        initialState={initialState}
        permalink={permalink}
        nativeIdentity="search-alert-opt-in"
        reconciliation={{
          href: `${permalink}${permalink.includes("?") ? "&" : "?"}operation=${encodeURIComponent(initialState.operationId)}`,
          label: c.status,
        }}
        submitLabel={c.save}
        labels={{
          contactMethodId: p.email,
          frequency: p.frequency,
          timezone: p.timezone,
          confirmed: c.consent,
          proof: c.status,
        }}
        copy={{
          errorSummary: c.check,
          pending: c.saving,
          reapply: c.save,
          yourValue: c.retained,
          latestValue: c.check,
          revision: p.terms,
          reference: c.status,
          recordedAt: c.checkedAt,
          unknown: c.unconfirmed,
          draftRetained: c.retained,
        }}
      >
        {(form) => (
          <>
            <input type="hidden" name="proof" value={form.values.proof} />
            {/* Radios show each complete verified address; a native select clips long ones. */}
            <fieldset className="min-w-0 w-full space-y-2">
              <legend className={labelClass}>{p.email}</legend>
              {contacts.map((contact, index) => (
                <label key={contact.id} className="flex min-h-control min-w-0 items-center gap-3">
                  <input
                    id={
                      index === 0
                        ? form.field("contactMethodId").id
                        : `${form.field("contactMethodId").id}-${contact.id}`
                    }
                    type="radio"
                    name="contactMethodId"
                    value={contact.id}
                    checked={form.values.contactMethodId === contact.id}
                    onChange={form.field("contactMethodId").onChange}
                    disabled={form.field("contactMethodId").readOnly}
                    required
                    className="size-5 shrink-0"
                    aria-invalid={Boolean(form.field("contactMethodId").error)}
                    aria-describedby={
                      form.field("contactMethodId").error
                        ? `${form.field("contactMethodId").id}-error`
                        : undefined
                    }
                  />
                  <bdi className="min-w-0 [overflow-wrap:anywhere]">{contact.value}</bdi>
                </label>
              ))}
              {form.field("contactMethodId").readOnly ? (
                <input type="hidden" name="contactMethodId" value={form.values.contactMethodId} />
              ) : null}
              {form.field("contactMethodId").error ? (
                <p id={`${form.field("contactMethodId").id}-error`} className={errorClass}>
                  {form.field("contactMethodId").error}
                </p>
              ) : null}
            </fieldset>
            {(
              [
                [
                  "frequency",
                  p.frequency,
                  [
                    ["daily", p.daily],
                    ["weekly", p.weekly],
                  ],
                ],
              ] as const
            ).map(([name, label, options]) => {
              const field = form.field(name);
              return (
                <div
                  key={name}
                  className="group grid min-w-0 grid-cols-1 gap-2"
                  data-invalid={field.error ? "true" : undefined}
                >
                  <label htmlFor={field.id} className={labelClass}>
                    {label}
                  </label>
                  <select
                    id={field.id}
                    name={name}
                    value={field.value}
                    onChange={field.onChange}
                    disabled={field.readOnly}
                    required
                    className={`${controlClass} min-w-0 max-w-full`}
                    aria-invalid={Boolean(field.error)}
                    aria-describedby={field.error ? `${field.id}-error` : undefined}
                  >
                    {options.map(([value, text]) => (
                      <option key={value} value={value}>
                        {text}
                      </option>
                    ))}
                  </select>
                  {field.readOnly ? <input type="hidden" name={name} value={field.value} /> : null}
                  {field.error ? (
                    <p id={`${field.id}-error`} className={errorClass}>
                      {field.error}
                    </p>
                  ) : null}
                </div>
              );
            })}
            <FormField {...form.field("timezone")} label={p.timezone} required maxLength={100} />
            <div>
              <label className="flex items-start gap-3" htmlFor={form.field("confirmed").id}>
                <input
                  id={form.field("confirmed").id}
                  type="checkbox"
                  name="confirmed"
                  value="yes"
                  checked={form.values.confirmed === "yes"}
                  onChange={(e) => form.setValue("confirmed", e.target.checked ? "yes" : "")}
                  disabled={form.field("confirmed").readOnly}
                  required
                  className="mt-1 size-5 shrink-0"
                  aria-describedby={
                    form.field("confirmed").error
                      ? `${form.field("confirmed").id}-error`
                      : undefined
                  }
                />
                <span>{c.consent}</span>
              </label>
              {form.field("confirmed").error ? (
                <p id={`${form.field("confirmed").id}-error`} className={errorClass}>
                  {form.field("confirmed").error}
                </p>
              ) : null}
            </div>
          </>
        )}
      </ActionForm>
    </div>
  );
}
