"use client";
// ADR 0012 forms: one attestation and Publish, Unpublish, and the bulk selection. Native forms
// through ActionForm, so each works without JavaScript; the server rechecks everything.
import { useSyncExternalStore } from "react";
import { errorClass } from "@/ui/field-class";
import type { FormAction, FormCopy, FormState } from "@/ui/form/contract";
import { ActionForm } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import type { BulkPublishValues, PublishValues, UnpublishValues } from "./publish-actions";

function Confirm({
  id,
  name,
  label,
  checked,
  readOnly,
  error,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  checked: boolean;
  readOnly: boolean;
  error?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div data-invalid={error ? "true" : undefined}>
      <label className="flex min-h-control items-start gap-3 py-2 text-body" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          name={name}
          value="yes"
          checked={checked}
          disabled={readOnly}
          required
          className="mt-1 size-5 shrink-0 accent-action"
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{label}</span>
      </label>
      {readOnly && checked ? <input type="hidden" name={name} value="yes" /> : null}
      {error ? (
        <p className={`mt-2 ${errorClass}`} id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function PublishForm({
  action,
  initialState,
  permalink,
  reconciliation,
  formCopy,
  labels,
}: {
  action: FormAction<PublishValues>;
  initialState: FormState<PublishValues>;
  permalink: string;
  reconciliation: { href: string; label: string };
  formCopy: FormCopy;
  labels: { attested: string; note: string; submit: string };
}) {
  return (
    <ActionForm
      action={action}
      initialState={initialState}
      permalink={permalink}
      nativeIdentity="listing-publish"
      reconciliation={reconciliation}
      copy={formCopy}
      labels={{ attested: labels.attested, note: labels.note }}
      submitLabel={labels.submit}
      layout="full"
    >
      {(form) => {
        const attested = form.field("attested");
        return (
          <>
            <Confirm
              id={attested.id}
              name="attested"
              label={labels.attested}
              checked={form.values.attested === "yes"}
              readOnly={attested.readOnly}
              error={attested.error}
              onChange={(checked) => form.setValue("attested", checked ? "yes" : "")}
            />
            <FormField {...form.field("note")} label={labels.note} maxLength={1000} />
          </>
        );
      }}
    </ActionForm>
  );
}

export function UnpublishForm({
  action,
  initialState,
  permalink,
  reconciliation,
  formCopy,
  labels,
}: {
  action: FormAction<UnpublishValues>;
  initialState: FormState<UnpublishValues>;
  permalink: string;
  reconciliation: { href: string; label: string };
  formCopy: FormCopy;
  labels: { confirmed: string; submit: string };
}) {
  return (
    <ActionForm
      action={action}
      initialState={initialState}
      permalink={permalink}
      nativeIdentity="listing-unpublish"
      reconciliation={reconciliation}
      copy={formCopy}
      labels={{ confirmed: labels.confirmed }}
      submitLabel={labels.submit}
      disclosure={labels.submit}
    >
      {(form) => {
        const confirmed = form.field("confirmed");
        return (
          <Confirm
            id={confirmed.id}
            name="confirmed"
            label={labels.confirmed}
            checked={form.values.confirmed === "yes"}
            readOnly={confirmed.readOnly}
            error={confirmed.error}
            onChange={(checked) => form.setValue("confirmed", checked ? "yes" : "")}
          />
        );
      }}
    </ActionForm>
  );
}

export type BulkRow = {
  reference: string;
  version: number;
  title: string;
  detail: string;
  warnings: readonly string[];
  href: string;
  selectLabel: string;
};

const noSubscription = () => () => {};

export function BulkPublishForm({
  action,
  initialState,
  permalink,
  reconciliation,
  formCopy,
  rows,
  labels,
}: {
  action: FormAction<BulkPublishValues>;
  initialState: FormState<BulkPublishValues>;
  permalink: string;
  reconciliation: { href: string; label: string };
  formCopy: FormCopy;
  rows: readonly BulkRow[];
  labels: { attested: string; submit: string; list: string; selectAll: string };
}) {
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  return (
    <ActionForm
      action={action}
      initialState={initialState}
      permalink={permalink}
      nativeIdentity="inventory-bulk-publish"
      reconciliation={reconciliation}
      copy={formCopy}
      labels={{ attested: labels.attested }}
      submitLabel={labels.submit}
      layout="full"
    >
      {(form) => {
        const attested = form.field("attested");
        return (
          <>
            <fieldset className="grid gap-3">
              <legend className="sr-only">{labels.list}</legend>
              {/* Select all needs a script; without one each listing keeps its own box. */}
              {hydrated ? (
                <label className="flex min-h-control items-center gap-3 text-dense text-text-muted">
                  <input
                    type="checkbox"
                    className="size-5 accent-action"
                    disabled={attested.readOnly}
                    onChange={(event) => {
                      const fieldset = event.currentTarget.closest("fieldset");
                      for (const box of fieldset?.querySelectorAll<HTMLInputElement>(
                        'input[name="reference"]',
                      ) ?? [])
                        box.checked = event.currentTarget.checked;
                    }}
                  />
                  {labels.selectAll}
                </label>
              ) : null}
              <ul className="divide-y divide-divider border-y border-divider">
                {rows.map((row) => (
                  <li key={row.reference} className="flex items-start gap-2 py-2">
                    {/* 44 px target around the 20 px box (WCAG 2.5.8 and the UI kit minimum). */}
                    <label className="flex size-11 shrink-0 items-center justify-center rounded-control hover:bg-subtle">
                      <input
                        id={`ready-${row.reference}`}
                        type="checkbox"
                        name="reference"
                        value={row.reference}
                        aria-label={row.selectLabel}
                        disabled={attested.readOnly}
                        className="size-5 accent-action"
                      />
                    </label>
                    <input type="hidden" name={`version:${row.reference}`} value={row.version} />
                    <span className="grid min-w-0 gap-1 py-2">
                      <a href={row.href} lang="bg" className="font-semibold text-action underline">
                        {row.title}
                      </a>
                      <span className="flex flex-wrap gap-x-4 text-dense text-text-muted">
                        <bdi>{row.reference}</bdi>
                        {row.detail ? <span>{row.detail}</span> : null}
                      </span>
                      {row.warnings.map((warning) => (
                        <span key={warning} className="text-caption text-warning">
                          {warning}
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </fieldset>
            <Confirm
              id={attested.id}
              name="attested"
              label={labels.attested}
              checked={form.values.attested === "yes"}
              readOnly={attested.readOnly}
              error={attested.error}
              onChange={(checked) => form.setValue("attested", checked ? "yes" : "")}
            />
          </>
        );
      }}
    </ActionForm>
  );
}
