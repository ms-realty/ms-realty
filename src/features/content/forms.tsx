"use client";
import { workCopy } from "@/features/work/copy";
import { controlClass } from "@/ui/field-class";
import type { FormAction, FormState } from "@/ui/form/contract";
import { ActionForm } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import type { ContentValues, DecisionValues } from "./actions";
import { contentCopy } from "./copy";
export function ContentForm({
  locale,
  id,
  initialState,
  action,
}: {
  locale: string;
  id?: string;
  initialState: FormState<ContentValues>;
  action: FormAction<ContentValues>;
}) {
  const copy = contentCopy(locale),
    path = `/${locale}/content/${id ?? "new"}`,
    kind = id ? "save" : "create";
  return (
    <ActionForm
      initialState={initialState}
      action={action}
      permalink={path}
      reconciliation={{
        href: `/${locale}/content/operations?${new URLSearchParams({ kind, key: initialState.operationId, ...(id ? { id } : {}) })}`,
        label: copy.check,
      }}
      copy={workCopy(locale).form}
      labels={{
        kind: copy.kind,
        slug: copy.slug,
        title: copy.pageTitle,
        text: copy.text,
        jurisdiction: copy.jurisdiction,
        reviewScope: copy.scope,
      }}
      submitLabel={copy.save}
    >
      {(form) => (
        <>
          {id ? (
            <>
              <input type="hidden" name="kind" value={form.values.kind} />
              <input type="hidden" name="slug" value={form.values.slug} />
            </>
          ) : (
            <>
              <label className="grid gap-2">
                <span>{copy.kind}</span>
                <select
                  name="kind"
                  value={form.values.kind}
                  onChange={(e) => form.setValue("kind", e.target.value)}
                  disabled={form.pending}
                  className={controlClass}
                >
                  {(["area", "service", "help"] as const).map((value) => (
                    <option key={value} value={value}>
                      {copy[value]}
                    </option>
                  ))}
                </select>
              </label>
              <FormField {...form.field("slug")} label={copy.slug} required maxLength={101} />
            </>
          )}
          <FormField {...form.field("title")} label={copy.pageTitle} required maxLength={200} />
          <FormField
            {...form.field("text")}
            label={copy.text}
            hint={copy.paragraphs}
            multiline
            rows={10}
            required
            maxLength={50000}
          />
          <FormField
            {...form.field("jurisdiction")}
            label={copy.jurisdiction}
            required
            maxLength={200}
          />
          <FormField {...form.field("reviewScope")} label={copy.scope} required maxLength={1000} />
        </>
      )}
    </ActionForm>
  );
}
export function ContentReviewForm({
  locale,
  id,
  decision,
  initialState,
  action,
}: {
  locale: string;
  id: string;
  decision: "claims" | "editorial" | "publish" | "withdraw";
  initialState: FormState<DecisionValues>;
  action: FormAction<DecisionValues>;
}) {
  const copy = contentCopy(locale);
  return (
    <ActionForm
      initialState={initialState}
      action={action}
      permalink={`/${locale}/content/${id}`}
      nativeIdentity={`content.decide.${id}.${decision}`}
      reconciliation={{
        href: `/${locale}/content/operations?${new URLSearchParams({ kind: "decide", id, key: initialState.operationId })}`,
        label: copy.check,
      }}
      copy={workCopy(locale).form}
      labels={{ note: copy.note, expiresAt: copy.expiry, reviewed: copy.reviewed }}
      submitLabel={copy[decision]}
    >
      {(form) => (
        <>
          <FormField {...form.field("note")} label={copy.note} required maxLength={1500} />
          {decision !== "withdraw" ? (
            <FormField
              {...form.field("expiresAt")}
              label={copy.expiry}
              type="datetime-local"
              required
            />
          ) : null}
          <label className="flex min-h-11 items-start gap-3">
            <input
              name="reviewed"
              type="checkbox"
              value="yes"
              checked={form.values.reviewed === "yes"}
              onChange={(e) => form.setValue("reviewed", e.target.checked ? "yes" : "")}
              required
              disabled={form.pending}
              className="mt-1 size-5 shrink-0 accent-action"
            />
            <span>{copy.reviewed}</span>
          </label>
        </>
      )}
    </ActionForm>
  );
}
