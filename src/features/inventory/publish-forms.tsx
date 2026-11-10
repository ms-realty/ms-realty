"use client";
// ADR 0012 forms: one attestation and Publish, Unpublish, and the bulk selection. Native forms
// through ActionForm, so each works without JavaScript; the server rechecks everything.
import { useSyncExternalStore } from "react";
import { cx } from "@/ui/cx";
import { controlClass, errorClass, labelClass } from "@/ui/field-class";
import type { FormAction, FormCopy, FormState } from "@/ui/form/contract";
import { ActionForm } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import type {
  BulkPublishValues,
  LanguagesValues,
  PublishValues,
  UnpublishValues,
} from "./publish-actions";
import { InventoryThumbnail } from "./thumbnail";

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
  rent,
  cleanTitle,
  formId,
}: {
  action: FormAction<PublishValues>;
  initialState: FormState<PublishValues>;
  permalink: string;
  reconciliation: { href: string; label: string };
  formCopy: FormCopy;
  labels: { attested: string; note: string; submit: string };
  /** A rent the import recorded without a period: confirmed here, in the same decision. */
  rent?: { label: string; month: string; hint: string };
  /** The title has the old site's ending: removing it is offered, pre-ticked. */
  cleanTitle?: { label: string; hint: string };
  /** Language ticks outside the form belong to it through this id. */
  formId?: string;
}) {
  return (
    <ActionForm
      action={action}
      initialState={initialState}
      permalink={permalink}
      nativeIdentity="listing-publish"
      reconciliation={reconciliation}
      copy={formCopy}
      labels={{ attested: labels.attested, note: labels.note, rentPeriod: rent?.label ?? "" }}
      submitLabel={labels.submit}
      layout="full"
      {...(formId ? { formId } : {})}
    >
      {(form) => {
        const attested = form.field("attested");
        const period = form.field("rentPeriod");
        return (
          <>
            {cleanTitle ? (
              <label className="flex min-h-control items-start gap-3 py-2 text-body">
                <input
                  type="checkbox"
                  name="cleanTitle"
                  value="yes"
                  defaultChecked
                  disabled={attested.readOnly}
                  className="mt-1 size-5 shrink-0 accent-action"
                  aria-describedby="clean-title-hint"
                />
                <span className="grid gap-1">
                  {cleanTitle.label}
                  <span id="clean-title-hint" className="text-caption text-text-muted">
                    {cleanTitle.hint}
                  </span>
                </span>
              </label>
            ) : null}
            {rent ? (
              <div className="grid gap-2" data-invalid={period.error ? "true" : undefined}>
                <label htmlFor={period.id} className={labelClass}>
                  {rent.label}
                </label>
                <p id={`${period.id}-hint`} className="text-caption text-text-muted">
                  {rent.hint}
                </p>
                <select
                  id={period.id}
                  name={period.name}
                  value={period.value}
                  onChange={period.onChange}
                  disabled={period.readOnly}
                  className={controlClass}
                  aria-invalid={Boolean(period.error) || undefined}
                  aria-describedby={cx(`${period.id}-hint`, period.error && `${period.id}-error`)}
                >
                  <option value="month">{rent.month}</option>
                </select>
                {period.readOnly ? (
                  <input type="hidden" name="rentPeriod" value={period.value} />
                ) : null}
                {period.error ? (
                  <p className={errorClass} id={`${period.id}-error`}>
                    {period.error}
                  </p>
                ) : null}
              </div>
            ) : null}
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

/** The references ticked in a bulk list, kept in the form's values so an error keeps them. */
function pickedFrom(value: string | undefined): Set<string> {
  return new Set((value ?? "").split(",").filter(Boolean));
}

function joinPicked(picked: ReadonlySet<string>): string {
  return [...picked].join(",");
}

export type BulkRow = {
  reference: string;
  version: number;
  title: string;
  detail: string;
  price: string;
  area: string;
  /** How many photos the decision shows, said on the row. */
  photos: string;
  thumbnail?: string;
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
  labels: {
    attested: string;
    submit: string;
    list: string;
    selectAll: string;
    listing: string;
    photo: string;
    price: string;
    area: string;
    noPhoto: string;
    /** Shown when some titles carry the old site's ending; pre-ticked. */
    cleanTitles?: string;
  };
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
      labels={{ attested: labels.attested, selected: labels.list }}
      submitLabel={labels.submit}
      layout="full"
    >
      {(form) => {
        const attested = form.field("attested");
        const selection = form.field("selected");
        const picked = pickedFrom(form.values.selected);
        return (
          <>
            <fieldset
              id={selection.id}
              tabIndex={-1}
              aria-describedby={selection.error ? `${selection.id}-error` : undefined}
              className="grid gap-3"
            >
              <legend className="sr-only">{labels.list}</legend>
              {selection.error ? (
                <p className={errorClass} id={`${selection.id}-error`}>
                  {selection.error}
                </p>
              ) : null}
              {/* Select all needs a script; without one each listing keeps its own box. */}
              {hydrated ? (
                <label className="flex min-h-control items-center gap-3 text-dense text-text-muted">
                  <input
                    type="checkbox"
                    className="size-5 accent-action"
                    disabled={attested.readOnly}
                    checked={rows.length > 0 && picked.size === rows.length}
                    onChange={(event) =>
                      form.setValue(
                        "selected",
                        event.currentTarget.checked
                          ? rows.map((row) => row.reference).join(",")
                          : "",
                      )
                    }
                  />
                  {labels.selectAll}
                </label>
              ) : null}
              {/* Aligned columns: select, photo, listing, price, area. */}
              <div
                aria-hidden="true"
                className="hidden grid-cols-[2.75rem_7rem_minmax(0,1fr)_9rem_6rem] gap-x-4 border-b border-divider pb-2 text-caption font-semibold text-text-muted lg:grid"
              >
                <span />
                <span>{labels.photo}</span>
                <span>{labels.listing}</span>
                <span className="text-end">{labels.price}</span>
                <span className="text-end">{labels.area}</span>
              </div>
              <ul className="divide-y divide-divider border-b border-divider">
                {rows.map((row) => (
                  <li
                    key={row.reference}
                    className="grid grid-cols-[2.75rem_auto_minmax(0,1fr)] items-start gap-x-4 gap-y-1 py-3 lg:grid-cols-[2.75rem_auto_minmax(0,1fr)_9rem_6rem]"
                  >
                    {/* 44 px target around the 20 px box (WCAG 2.5.8 and the UI kit minimum). */}
                    <label className="flex size-11 items-center justify-center rounded-control hover:bg-subtle">
                      <input
                        id={`ready-${row.reference}`}
                        type="checkbox"
                        name="reference"
                        value={row.reference}
                        aria-label={row.selectLabel}
                        disabled={attested.readOnly}
                        checked={picked.has(row.reference)}
                        onChange={(event) => {
                          const next = new Set(picked);
                          if (event.currentTarget.checked) next.add(row.reference);
                          else next.delete(row.reference);
                          form.setValue("selected", joinPicked(next));
                        }}
                        className="size-5 accent-action"
                      />
                    </label>
                    <input type="hidden" name={`version:${row.reference}`} value={row.version} />
                    <InventoryThumbnail source={row.thumbnail} label={labels.noPhoto} />
                    <span className="grid min-w-0 gap-1">
                      <a href={row.href} lang="bg" className="font-semibold text-action underline">
                        {row.title}
                      </a>
                      <span className="flex flex-wrap gap-x-4 text-dense text-text-muted">
                        <bdi>{row.reference}</bdi>
                        {row.detail ? <span>{row.detail}</span> : null}
                        <span>{row.photos}</span>
                      </span>
                      {/* Below lg the figures sit under the title, each with its own label. */}
                      <dl className="flex flex-wrap gap-x-4 text-dense lg:hidden">
                        <div className="flex gap-1">
                          <dt className="text-text-muted">{labels.price}</dt>
                          <dd className="font-semibold">{row.price}</dd>
                        </div>
                        <div className="flex gap-1">
                          <dt className="text-text-muted">{labels.area}</dt>
                          <dd className="font-semibold">{row.area}</dd>
                        </div>
                      </dl>
                      {row.warnings.map((warning) => (
                        <span key={warning} className="text-caption text-warning">
                          {warning}
                        </span>
                      ))}
                    </span>
                    {/* The column header row is visual only; each figure names itself. */}
                    <span className="hidden pt-1 text-end font-semibold tabular-nums lg:block">
                      <span className="sr-only">{labels.price} </span>
                      {row.price}
                    </span>
                    <span className="hidden pt-1 text-end tabular-nums lg:block">
                      <span className="sr-only">{labels.area} </span>
                      {row.area}
                    </span>
                  </li>
                ))}
              </ul>
            </fieldset>
            {labels.cleanTitles ? (
              <label className="flex min-h-control items-start gap-3 py-2 text-body">
                <input
                  type="checkbox"
                  name="cleanTitles"
                  value="yes"
                  defaultChecked
                  disabled={attested.readOnly}
                  className="mt-1 size-5 shrink-0 accent-action"
                />
                <span>{labels.cleanTitles}</span>
              </label>
            ) : null}
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

/** Languages of a listing already online: the ticks sit next to each text, outside this form. */
export function LanguagesForm({
  action,
  initialState,
  permalink,
  reconciliation,
  formCopy,
  labels,
  formId,
}: {
  action: FormAction<LanguagesValues>;
  initialState: FormState<LanguagesValues>;
  permalink: string;
  reconciliation: { href: string; label: string };
  formCopy: FormCopy;
  labels: { attested: string; submit: string };
  formId: string;
}) {
  return (
    <ActionForm
      action={action}
      initialState={initialState}
      permalink={permalink}
      nativeIdentity="listing-languages"
      reconciliation={reconciliation}
      copy={formCopy}
      labels={{ attested: labels.attested }}
      submitLabel={labels.submit}
      formId={formId}
    >
      {(form) => {
        const attested = form.field("attested");
        return attested.error ? (
          <p className={errorClass} id={`${attested.id}-error`}>
            {attested.error}
          </p>
        ) : null;
      }}
    </ActionForm>
  );
}

export type LanguageRow = {
  reference: string;
  title: string;
  excerpt: string;
  sourceTitle: string;
  lang: string;
  warnings: readonly string[];
  href: string;
  selectLabel: string;
};

/** One language for many listings: read each text, tick it, one attestation for the batch. */
export function BulkLanguageForm({
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
  rows: readonly LanguageRow[];
  labels: { attested: string; submit: string; list: string; source: string };
}) {
  return (
    <ActionForm
      action={action}
      initialState={initialState}
      permalink={permalink}
      nativeIdentity="inventory-bulk-language"
      reconciliation={reconciliation}
      copy={formCopy}
      labels={{ attested: labels.attested, selected: labels.list }}
      submitLabel={labels.submit}
      layout="full"
    >
      {(form) => {
        const attested = form.field("attested");
        const selection = form.field("selected");
        const picked = pickedFrom(form.values.selected);
        return (
          <>
            <fieldset
              id={selection.id}
              tabIndex={-1}
              aria-describedby={selection.error ? `${selection.id}-error` : undefined}
              className="grid gap-3"
            >
              <legend className="sr-only">{labels.list}</legend>
              {selection.error ? (
                <p className={errorClass} id={`${selection.id}-error`}>
                  {selection.error}
                </p>
              ) : null}
              <ul className="divide-y divide-divider border-y border-divider">
                {rows.map((row) => (
                  <li
                    key={row.reference}
                    className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-x-4 py-3"
                  >
                    <label className="flex size-11 items-center justify-center rounded-control hover:bg-subtle">
                      <input
                        type="checkbox"
                        name="reference"
                        value={row.reference}
                        aria-label={row.selectLabel}
                        disabled={attested.readOnly}
                        checked={picked.has(row.reference)}
                        onChange={(event) => {
                          const next = new Set(picked);
                          if (event.currentTarget.checked) next.add(row.reference);
                          else next.delete(row.reference);
                          form.setValue("selected", joinPicked(next));
                        }}
                        className="size-5 accent-action"
                      />
                    </label>
                    <span className="grid min-w-0 gap-2 py-2">
                      <a
                        href={row.href}
                        lang={row.lang}
                        className="font-semibold text-action underline"
                      >
                        {row.title}
                      </a>
                      <span lang={row.lang} className="max-w-reading text-dense">
                        {row.excerpt}
                      </span>
                      <span className="flex flex-wrap gap-x-4 text-dense text-text-muted">
                        <bdi>{row.reference}</bdi>
                        <span>
                          {labels.source}: <span lang="bg">{row.sourceTitle}</span>
                        </span>
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
