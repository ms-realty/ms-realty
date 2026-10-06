"use client";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { controlClass } from "@/ui/field";
import type { FormAction, FormState } from "@/ui/form/contract";
import { ActionForm, type FormController } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import { Notice } from "@/ui/notice";
import { inventoryCopy, optionLabel } from "./copy";

import {
  type InventoryField as Field,
  type InventoryValues,
  identity,
  selects,
  textFields,
} from "./fields";

export type { InventoryValues };

/**
 * One Server Action and one draft. `create` shows every field (O11). `edit` (O12) keeps the
 * whole draft in one form: a Text panel and a Facts panel that the page's tabs switch through
 * CSS (the [data-o12] wrapper is `group/o12`), plus a stable block for required values that
 * were missing when the page loaded, so typing never moves a field. A panel holding a field
 * the server rejected stays visible, also without JavaScript.
 */
export function InventoryEditor({
  locale,
  initialState,
  action,
  reference,
  view = "create",
  missing = [],
  missingNote,
  formId,
  draftKey,
  secondaryActions,
  footer,
}: {
  locale: string;
  initialState: FormState<InventoryValues>;
  action: FormAction<InventoryValues>;
  reference?: string;
  view?: "create" | "edit";
  missing?: Field[];
  /** Shown inside the "needed before saving" block (e.g. a recorded price it cannot carry). */
  missingNote?: ReactNode;
  formId?: string;
  /** sessionStorage key for unsaved work, scoped to listing and version (DraftKeeper). */
  draftKey?: string;
  secondaryActions?: ReactNode;
  footer?: ReactNode;
}) {
  const copy = inventoryCopy(locale);
  const labels =
    view === "edit"
      ? { ...copy.labels, title: copy.o12.titleLabel, description: copy.o12.descriptionLabel }
      : copy.labels;
  const fields = (Object.keys(copy.labels) as Field[]).filter(
    (name) => view === "create" || !identity.includes(name),
  );
  const render = (form: FormController<InventoryValues>, name: Field, required = false) => {
    const field = form.field(name);
    const values = selects[name];
    if (!values)
      return (
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
            hint={required && name === "sourceReference" ? copy.o12.sourceMissing : undefined}
            multiline={name === "description" || name === "brokerNote"}
            rows={name === "description" && view === "edit" ? 6 : undefined}
          />
        </div>
      );
    // A value outside the list (blank, or a recorded one the form cannot save) stays visible
    // as itself; a select must never quietly submit its first option instead.
    const current = values.includes(field.value)
      ? null
      : field.value
        ? `${field.value} · ${copy.o12.unsupported}`
        : copy.o12.choose;
    return (
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
          {current ? <option value={field.value}>{current}</option> : null}
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
    );
  };
  return (
    <ActionForm
      action={action}
      initialState={initialState}
      permalink={`/${locale}/inventory/${reference ?? "new"}`}
      reconciliation={{
        href: `/${locale}/inventory/operations/${initialState.operationId}`,
        label: copy.operation,
      }}
      labels={labels}
      copy={copy.form}
      layout={view === "create" ? "reading" : "full"}
      submitLabel={
        view === "edit" ? (
          <>
            <span className="group-has-[#o12-facts:checked]/o12:hidden">{copy.o12.saveText}</span>
            <span className="hidden group-has-[#o12-facts:checked]/o12:inline">
              {copy.o12.saveFacts}
            </span>
          </>
        ) : (
          copy.create
        )
      }
      secondaryActions={secondaryActions}
      formId={formId}
    >
      {(form) =>
        view === "create" ? (
          <div className="grid gap-5 sm:grid-cols-2">
            {fields.map((name) => render(form, name))}
          </div>
        ) : (
          <>
            {draftKey ? (
              <DraftKeeper
                form={form}
                storageKey={draftKey}
                labels={labels}
                copy={{
                  ...copy.o12,
                  yourValue: copy.form.yourValue,
                  currentValue: copy.form.latestValue,
                }}
              />
            ) : null}
            {missing.length ? (
              <fieldset className="grid gap-5 rounded-panel border border-warning p-4 sm:grid-cols-2">
                <legend className="px-1 text-dense font-semibold">{copy.o12.needsInput}</legend>
                {missing.map((name) => render(form, name, true))}
                {missingNote}
              </fieldset>
            ) : null}
            <div
              data-o12-panel="text"
              className="flex flex-col gap-6 group-has-[#o12-facts:checked]/o12:hidden has-[[aria-invalid=true]]:flex!"
            >
              {textFields.map((name) => render(form, name))}
            </div>
            <div
              data-o12-panel="facts"
              className="hidden gap-5 sm:grid-cols-2 group-has-[#o12-facts:checked]/o12:grid has-[[aria-invalid=true]]:grid!"
            >
              {fields
                .filter((name) => !textFields.includes(name) && !missing.includes(name))
                .map((name) => render(form, name))}
            </div>
            {footer}
          </>
        )
      }
    </ActionForm>
  );
}

/**
 * Keeps unsaved work in this tab's sessionStorage, so leaving through browser history or a
 * reload does not lose it. On return to the same listing version the work is restored, with a
 * way to discard it. Work kept from an earlier version (someone saved the listing since) is
 * never dropped or applied silently: its differences from the current version are shown, and
 * the person applies or discards them. Nothing is sent anywhere.
 */
function DraftKeeper({
  form,
  storageKey,
  labels,
  copy,
}: {
  form: FormController<InventoryValues>;
  storageKey: string;
  labels: Record<Field, string>;
  copy: {
    restored: string;
    discardRestored: string;
    staleRestored: string;
    applyStale: string;
    yourValue: string;
    currentValue: string;
  };
}) {
  const initial = useRef(form.values);
  const [restored, setRestored] = useState(false);
  const [stale, setStale] = useState<{ key: string; values: Partial<InventoryValues> } | null>(
    null,
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: restore once, on mount.
  useEffect(() => {
    try {
      const read = (key: string) => {
        const saved = JSON.parse(window.sessionStorage.getItem(key) ?? "null") as Record<
          string,
          unknown
        > | null;
        return Object.fromEntries(
          Object.entries(saved ?? {}).filter(
            ([name, value]) => typeof value === "string" && name in initial.current,
          ),
        ) as Partial<InventoryValues>;
      };
      const prefix = storageKey.slice(0, storageKey.lastIndexOf(":") + 1);
      for (let index = window.sessionStorage.length - 1; index >= 0; index--) {
        const key = window.sessionStorage.key(index);
        if (!key?.startsWith(prefix) || key === storageKey) continue;
        const values = read(key);
        const differs = (Object.keys(values) as Field[]).some(
          (name) => values[name] !== initial.current[name],
        );
        if (differs) setStale({ key, values });
        else window.sessionStorage.removeItem(key);
      }
      let changed = false;
      for (const [name, value] of Object.entries(read(storageKey)))
        if (form.values[name as Field] !== value) {
          form.setValue(name as Field, value as string);
          changed = true;
        }
      setRestored(changed);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      const dirty = (Object.keys(initial.current) as Field[]).some(
        (name) => form.values[name] !== initial.current[name],
      );
      if (dirty) window.sessionStorage.setItem(storageKey, JSON.stringify(form.values));
      else window.sessionStorage.removeItem(storageKey);
    } catch {}
  }, [form.values, storageKey]);
  const forget = (key: string) => {
    try {
      window.sessionStorage.removeItem(key);
    } catch {}
  };
  const differences = stale
    ? (Object.keys(stale.values) as Field[]).filter(
        (name) => stale.values[name] !== initial.current[name],
      )
    : [];
  return (
    <>
      {stale && differences.length ? (
        <Notice tone="warning">
          <p>{copy.staleRestored}</p>
          <dl className="mt-2 grid gap-3">
            {differences.map((name) => (
              <div key={name} className="grid gap-1">
                <dt className="font-semibold">{labels[name]}</dt>
                <dd>
                  {copy.yourValue}:{" "}
                  <span className="whitespace-pre-wrap">{stale.values[name]}</span>
                </dd>
                <dd className="text-text-muted">
                  {copy.currentValue}:{" "}
                  <span className="whitespace-pre-wrap">{initial.current[name]}</span>
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex flex-wrap gap-4">
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => {
                for (const name of differences) form.setValue(name, stale.values[name] ?? "");
                forget(stale.key);
                setStale(null);
              }}
            >
              {copy.applyStale}
            </button>
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => {
                forget(stale.key);
                setStale(null);
              }}
            >
              {copy.discardRestored}
            </button>
          </div>
        </Notice>
      ) : null}
      {restored ? (
        <Notice tone="info">
          <p>{copy.restored}</p>
          <button
            type="button"
            className="mt-2 font-semibold underline"
            onClick={() => {
              for (const name of Object.keys(initial.current) as Field[])
                form.setValue(name, initial.current[name]);
              forget(storageKey);
              setRestored(false);
            }}
          >
            {copy.discardRestored}
          </button>
        </Notice>
      ) : null}
    </>
  );
}
