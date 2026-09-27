"use client";

import { publicLocales } from "@/domain/ids";
import { controlClass } from "@/ui/field-class";
import type { FormAction, FormState } from "@/ui/form/contract";
import { ActionForm } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import { inventoryCopy } from "./copy";
import type { InventoryDecisionContext, InventoryDecisionValues } from "./decision-contract";
import { inventoryDecisionCopy } from "./decision-copy";

export function InventoryDecisionForm({
  context,
  title,
  initialState,
  action,
}: {
  context: InventoryDecisionContext;
  title: string;
  initialState: FormState<InventoryDecisionValues>;
  action: FormAction<InventoryDecisionValues>;
}) {
  const copy = inventoryCopy(context.locale),
    decision = inventoryDecisionCopy(context.locale);
  const href = `/${context.locale}/inventory/${context.reference}`;
  return (
    <div
      className="space-y-3 rounded-panel border border-divider bg-surface p-5"
      data-inventory-decision={context.intent}
    >
      <h3 className="font-semibold">{title}</h3>
      <ActionForm
        action={action}
        initialState={initialState}
        permalink={href}
        reconciliation={{
          href: `/${context.locale}/inventory/operations/${initialState.operationId}?reference=${encodeURIComponent(context.reference)}`,
          label: copy.operation,
        }}
        labels={{
          scope: copy.scope,
          confirmed: copy.confirm,
          publicationLocale: decision.publicationLocale,
        }}
        copy={copy.form}
        submitLabel={title}
      >
        {(form) => {
          const confirm = form.field("confirmed"),
            language = form.field("publicationLocale");
          return (
            <>
              {context.intent === "prepare" ? (
                <div className="grid gap-2">
                  <label htmlFor={language.id}>{decision.publicationLocale}</label>
                  <select
                    id={language.id}
                    name={language.name}
                    value={language.value}
                    onChange={language.onChange}
                    disabled={language.readOnly}
                    className={controlClass}
                    aria-invalid={Boolean(language.error)}
                    aria-describedby={language.error ? `${language.id}-error` : undefined}
                  >
                    {publicLocales.map((locale) => (
                      <option key={locale} value={locale}>
                        {locale.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  {language.readOnly ? (
                    <input type="hidden" name="publicationLocale" value={language.value} />
                  ) : null}
                  {language.error ? (
                    <p className="text-error" id={`${language.id}-error`}>
                      {language.error}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {context.intent !== "freeze" ? (
                <>
                  <FormField
                    {...form.field("scope")}
                    label={copy.scope}
                    required
                    maxLength={1000}
                  />
                  <div>
                    <label className="flex items-start gap-2" htmlFor={confirm.id}>
                      <input
                        id={confirm.id}
                        type="checkbox"
                        name="confirmed"
                        value="yes"
                        checked={form.values.confirmed === "yes"}
                        disabled={confirm.readOnly}
                        required
                        className="mt-1 size-5 shrink-0"
                        aria-invalid={Boolean(confirm.error)}
                        aria-describedby={confirm.error ? `${confirm.id}-error` : undefined}
                        onChange={(event) =>
                          form.setValue("confirmed", event.target.checked ? "yes" : "")
                        }
                      />
                      {copy.confirm}
                    </label>
                    {confirm.readOnly && form.values.confirmed === "yes" ? (
                      <input type="hidden" name="confirmed" value="yes" />
                    ) : null}
                    {confirm.error ? (
                      <p className="mt-2 text-error" id={`${confirm.id}-error`}>
                        {confirm.error}
                      </p>
                    ) : null}
                  </div>
                </>
              ) : null}
              {form.state.outcome.kind !== "idle" && form.state.outcome.kind !== "validation" ? (
                <a
                  href={
                    form.state.reconciliation?.href ??
                    `/${context.locale}/inventory/operations/${form.state.operationId}?reference=${encodeURIComponent(context.reference)}`
                  }
                  className="text-action underline"
                >
                  {copy.operation}
                </a>
              ) : null}
            </>
          );
        }}
      </ActionForm>
    </div>
  );
}
