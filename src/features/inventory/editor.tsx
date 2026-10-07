"use client";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { controlClass, errorClass, labelClass } from "@/ui/field";
import type { FormAction, FormState } from "@/ui/form/contract";
import { ActionForm, type FormController } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import { WarningIcon } from "@/ui/icons";
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

// O12 follows the Facts design sequence independently of localized label insertion order.
const factsFields: Field[] = [
  "priceState",
  "price",
  "areaState",
  "area",
  "areaBasis",
  "bedroomsState",
  "bedrooms",
  "sourceClass",
  "sourceLanguage",
  "sourceReference",
  "brokerNote",
];

// Keep the soft-wrapping title logically single-line, including pasted Unicode separators.
const singleLineTitle = (value: string) => value.replace(/[\s\u0085]+/g, " ");

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
  lead,
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
  /** Opens the edit column, under the error summary (694:13318), e.g. the no-draft alert. */
  lead?: ReactNode;
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
  const render = (form: FormController<InventoryValues>, name: Field) => {
    const field = form.field(name);
    const values = selects[name];
    if (!values)
      return (
        <div
          key={name}
          // O12 pairs source language and reference; its optional private note spans the row.
          className={
            name === "description" ||
            name === "brokerNote" ||
            (name === "sourceReference" && view === "create")
              ? "sm:col-span-2"
              : undefined
          }
        >
          {/* O12's UI06 title wraps on phones (14:4956); the description and private note
              remain the 144 px UI07 writing surfaces (694:13418, 647:31541). */}
          {name === "title" && view === "edit" ? (
            <FormField
              {...field}
              label={labels[name]}
              multiline="wrap"
              onChange={(event) => form.setValue(name, singleLineTitle(event.target.value))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) event.preventDefault();
              }}
              onPaste={(event) => {
                const pasted = event.clipboardData.getData("text/plain");
                const value = singleLineTitle(pasted);
                if (field.readOnly || value === pasted) return;
                event.preventDefault();
                const control = event.currentTarget;
                control.setRangeText(value, control.selectionStart, control.selectionEnd, "end");
                form.setValue(name, control.value);
              }}
            />
          ) : (
            <FormField
              {...field}
              label={labels[name]}
              multiline={name === "description" || name === "brokerNote"}
            />
          )}
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
      <div
        key={name}
        className="group flex min-w-0 flex-col gap-2"
        data-invalid={field.error ? "true" : undefined}
      >
        <label htmlFor={field.id} className={labelClass}>
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
          <p id={`${field.id}-error`} className={errorClass}>
            {field.error}
          </p>
        ) : null}
      </div>
    );
  };
  // 647:12680 / 659:12922: Facts sit in pairs 24 px apart; a pair is one row (24 px between its
  // fields) from sm, and two fields 16 px apart on phones. The private note follows on its own.
  const facts = factsFields.filter((name) => !missing.includes(name) && name !== "brokerNote");
  const factPairs = Array.from({ length: Math.ceil(facts.length / 2) }, (_, index) =>
    facts.slice(index * 2, index * 2 + 2),
  );
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
          // 647:12802 / 657:12889: the work column reads alerts, the needed-before-saving
          // block, the Facts hint, then the fields, 24 px apart.
          <div className="flex flex-col gap-6">
            {lead}
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
              // Named by its first row, as drawn (647:12802): a legend would sit in the border,
              // and WebKit keeps it there even when floated.
              <fieldset
                aria-labelledby="o12-needed"
                className="grid gap-x-6 gap-y-4 rounded-panel border border-warning p-4 sm:grid-cols-2"
              >
                <p id="o12-needed" className="text-dense font-semibold sm:col-span-2">
                  {copy.o12.needsInput}
                </p>
                {missing.map((name) => render(form, name))}
                {missingNote}
              </fieldset>
            ) : null}
            <p className="hidden text-dense group-has-[#o12-facts:checked]/o12:block">
              {copy.factsHint}
            </p>
            <div
              data-o12-panel="text"
              className="flex flex-col gap-6 group-has-[#o12-facts:checked]/o12:hidden has-[[aria-invalid=true]]:flex!"
            >
              {textFields.map((name) => render(form, name))}
            </div>
            <div
              data-o12-panel="facts"
              className="hidden flex-col gap-6 group-has-[#o12-facts:checked]/o12:flex has-[[aria-invalid=true]]:flex!"
            >
              {factPairs.map((pair) => (
                <div key={pair.join()} className="grid gap-4 sm:grid-cols-2 sm:gap-6">
                  {pair.map((name) => render(form, name))}
                </div>
              ))}
              {missing.includes("brokerNote") ? null : render(form, "brokerNote")}
            </div>
            {footer}
          </div>
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
  const [restored, setRestored] = useState<Field[]>([]);
  const [stale, setStale] = useState<{ key: string; values: Partial<InventoryValues> } | null>(
    null,
  );
  // This version's kept work, applied once the form holds anything typed before hydration: a
  // field already changed on this page keeps that newer input, and discarding the restored work
  // leaves it alone.
  const [kept, setKept] = useState<Partial<InventoryValues> | null>(null);
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
      const values = read(storageKey);
      if (Object.keys(values).length) setKept(values);
    } catch {}
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: applies the kept work once.
  useEffect(() => {
    if (!kept) return;
    const names = (Object.entries(kept) as [Field, string][]).flatMap(([name, value]) =>
      value !== initial.current[name] && form.values[name] === initial.current[name] ? [name] : [],
    );
    for (const name of names) form.setValue(name, kept[name] ?? "");
    setRestored(names);
    setKept(null);
  }, [kept]);
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
        // 657:31330 (UI26 inline alert): the message, each difference, then Apply / Discard.
        <div className="flex items-start gap-3 rounded-control bg-warning-soft p-4 text-dense">
          <WarningIcon className="size-5 shrink-0 text-warning" />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <p>{copy.staleRestored}</p>
            <dl className="flex flex-col gap-3">
              {differences.map((name) => (
                <div key={name} className="flex flex-col gap-1">
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
            <div className="flex flex-wrap gap-x-4 gap-y-3 sm:gap-y-2">
              <button
                type="button"
                className="text-start font-semibold underline"
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
                className="text-start font-semibold underline"
                onClick={() => {
                  forget(stale.key);
                  setStale(null);
                }}
              >
                {copy.discardRestored}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {restored.length ? (
        <Notice tone="info">
          <p>{copy.restored}</p>
          <button
            type="button"
            className="mt-2 font-semibold underline"
            onClick={() => {
              for (const name of restored) form.setValue(name, initial.current[name]);
              forget(storageKey);
              setRestored([]);
            }}
          >
            {copy.discardRestored}
          </button>
        </Notice>
      ) : null}
    </>
  );
}
