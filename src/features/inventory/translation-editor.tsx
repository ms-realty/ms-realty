"use client";
import { controlClass } from "@/ui/field-class";
import type { FormAction, FormState } from "@/ui/form/contract";
import { ActionForm } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import { inventoryCopy } from "./copy";
import { translationCopy } from "./translation-copy";

export type TranslationValues = {
  title: string;
  description: string;
  intent: string;
  note: string;
  confirmed: string;
};
export function TranslationEditor({
  locale,
  href,
  initialState,
  action,
  mayDraft,
  mayReview,
}: {
  locale: string;
  href: string;
  initialState: FormState<TranslationValues>;
  action: FormAction<TranslationValues>;
  mayDraft: boolean;
  mayReview: boolean;
}) {
  const copy = translationCopy(locale),
    general = inventoryCopy(locale);
  return (
    <ActionForm
      action={action}
      initialState={initialState}
      permalink={href}
      copy={general.form}
      labels={copy}
      submitLabel={copy.apply}
      reconciliation={{
        href: `/${locale}/inventory/operations/${initialState.operationId}`,
        label: general.operation,
      }}
    >
      {(form) => (
        <div className="space-y-5">
          <FormField {...form.field("title")} label={copy.title} />
          <FormField {...form.field("description")} label={copy.description} multiline />
          <div className="grid gap-2">
            <label htmlFor={form.field("intent").id}>{copy.intent}</label>
            <select
              id={form.field("intent").id}
              name="intent"
              value={form.field("intent").value}
              disabled={form.field("intent").readOnly}
              className={controlClass}
              onChange={(e) => form.setValue("intent", e.target.value)}
            >
              {mayDraft ? (
                <>
                  <option value="save">{copy.save}</option>
                  <option value="submit">{copy.submit}</option>
                </>
              ) : null}
              {mayReview ? (
                <>
                  <option value="approve">{copy.approve}</option>
                  <option value="reject">{copy.reject}</option>
                </>
              ) : null}
            </select>
          </div>
          <FormField {...form.field("note")} label={copy.note} multiline />
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="confirmed"
              value="yes"
              checked={form.field("confirmed").value === "yes"}
              disabled={form.field("confirmed").readOnly}
              onChange={(e) => form.setValue("confirmed", e.target.checked ? "yes" : "")}
              className="mt-1 size-5"
            />
            {copy.confirmed}
          </label>
        </div>
      )}
    </ActionForm>
  );
}
