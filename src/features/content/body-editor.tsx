"use client";
import { type ChangeEvent, useEffect, useRef, useSyncExternalStore } from "react";
import { localeDirection, type PublicLocale } from "@/i18n/config";
import { buttonClass } from "@/ui/button-class";
import { controlClass, errorClass, labelClass } from "@/ui/field-class";
import type { FormValues } from "@/ui/form/contract";
import type { FormController } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import { contentBodyCopy } from "./body-copy";
import {
  type BlockFields,
  type ContentBodyValues,
  emptyBlock,
  maxContentBlocks,
  readCompositionFields,
  readEditableBlocks,
} from "./body-fields";
import { contentCopy } from "./copy";

const noSubscription = () => () => {};
export function ContentBodyEditor<V extends FormValues & ContentBodyValues>({
  form,
  locale,
  target = "bg",
  allowBlocks = true,
}: {
  form: FormController<V>;
  locale: string;
  target?: PublicLocale;
  allowBlocks?: boolean;
}) {
  const copy = contentBodyCopy(locale),
    common = contentCopy(locale);
  const binding = form.field("composition"),
    mode = form.field("bodyFormat");
  const enhanced = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  // Read before React hydrates controlled textareas. Named block fields are a feature-owned
  // extension of the form's safe draft; adopt them after the parent adopts its own fields.
  const native = useRef<string | null | undefined>(undefined);
  if (native.current === undefined && typeof document !== "undefined") {
    const element = document.getElementById(binding.id)?.closest("form");
    native.current = element
      ? readCompositionFields(new FormData(element), form.values.composition)
      : null;
  }
  useEffect(() => {
    const captured = native.current;
    native.current = null;
    if (captured !== null && captured !== undefined && captured !== form.values.composition)
      form.setValue("composition", captured);
  }, [form.setValue, form.values.composition]);
  const rows = readEditableBlocks(form.values.composition);
  const count = enhanced ? Math.min(maxContentBlocks, rows.length + 1) : maxContentBlocks;
  const update = (index: number, key: keyof BlockFields, value: string) => {
    const next = [...rows];
    while (next.length <= index) next.push(emptyBlock());
    next[index] = { ...(next[index] ?? emptyBlock()), [key]: value };
    form.setValue("composition", JSON.stringify(next));
  };
  const move = (index: number, direction: -1 | 1) => {
    const next = [...rows],
      other = index + direction;
    const row = next[index],
      neighbor = next[other];
    if (!row || !neighbor) return;
    next[index] = neighbor;
    next[other] = row;
    form.setValue("composition", JSON.stringify(next));
  };
  return (
    <fieldset
      id={mode.id}
      tabIndex={-1}
      className="min-w-0 space-y-3"
      aria-invalid={Boolean(mode.error) || undefined}
      aria-describedby={`${mode.id}-hint${mode.error ? ` ${mode.id}-error` : ""}`}
    >
      <legend className={labelClass}>{copy.format}</legend>
      <p id={`${mode.id}-hint`} className="text-caption text-text-muted">
        {copy.hint}
      </p>
      <input
        id={`${mode.id}-paragraphs`}
        name="bodyFormat"
        type="radio"
        value="paragraphs"
        checked={!allowBlocks || !form.values.bodyFormat || form.values.bodyFormat === "paragraphs"}
        onChange={mode.onChange}
        disabled={form.pending || mode.readOnly}
        className="peer/paragraphs me-2 size-5 accent-action"
      />
      <label htmlFor={`${mode.id}-paragraphs`}>{copy.paragraphs}</label>
      <div
        hidden={enhanced && allowBlocks && form.values.bodyFormat === "blocks"}
        className="hidden peer-checked/paragraphs:block"
      >
        <FormField
          {...form.field("text")}
          label={common.text}
          hint={common.paragraphs}
          lang={target}
          dir={localeDirection(target)}
          multiline
          maxLength={50000}
        />
      </div>
      <input
        id={`${mode.id}-blocks`}
        name="bodyFormat"
        type="radio"
        value="blocks"
        checked={allowBlocks && form.values.bodyFormat === "blocks"}
        onChange={mode.onChange}
        disabled={form.pending || mode.readOnly || !allowBlocks}
        className="peer/blocks me-2 size-5 accent-action"
      />
      <label htmlFor={`${mode.id}-blocks`}>{copy.blocks}</label>
      {mode.error ? (
        <p id={`${mode.id}-error`} className={errorClass}>
          {mode.error}
        </p>
      ) : null}
      <div
        hidden={enhanced && (!allowBlocks || form.values.bodyFormat !== "blocks")}
        className="hidden min-w-0 space-y-4 peer-checked/blocks:block"
      >
        <input type="hidden" name="composition" value={form.values.composition} />
        <p className="text-caption text-text-muted">{copy.native}</p>
        {binding.error ? (
          <p className={errorClass} id={`${binding.id}-error`}>
            {binding.error}
          </p>
        ) : null}
        <div
          id={binding.id}
          tabIndex={-1}
          aria-invalid={Boolean(binding.error) || undefined}
          aria-describedby={binding.error ? `${binding.id}-error` : undefined}
          className="space-y-3"
        >
          {Array.from({ length: count }, (_, index) => {
            const row = rows[index] ?? emptyBlock(),
              prefix = `${binding.id}-${index}`;
            const named = (key: keyof BlockFields) => ({
              id: `${prefix}-${key}`,
              name: `bodyBlocks.${index}.${key}`,
              value: row[key],
              onChange: (
                event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
              ) => update(index, key, event.target.value),
              disabled: form.pending || binding.readOnly,
              lang: target,
              dir: localeDirection(target),
            });
            return (
              <details
                // biome-ignore lint/suspicious/noArrayIndexKey: controls explicitly represent ordered block slots
                key={index}
                open={Boolean(row.type)}
                className="min-w-0 rounded-panel border border-border p-4"
              >
                <summary className="min-h-control cursor-pointer break-words font-semibold">
                  {copy.block} {index + 1}
                  {row.type ? ` · ${copy[row.type]}` : ""}
                </summary>
                <div className="min-w-0 space-y-4 pt-3">
                  <label className="grid gap-2" htmlFor={`${prefix}-type`}>
                    <span className={labelClass}>{copy.type}</span>
                    <select
                      {...named("type")}
                      lang={undefined}
                      dir={undefined}
                      className={controlClass}
                    >
                      <option value="">{copy.empty}</option>
                      {(["paragraph", "heading", "step", "list", "callout", "link"] as const).map(
                        (type) => (
                          <option key={type} value={type}>
                            {copy[type]}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <div hidden={enhanced && row.type !== "step" && row.type !== "callout"}>
                    <FormField {...named("title")} label={copy.title} maxLength={200} />
                  </div>
                  <div
                    hidden={
                      enhanced &&
                      !["paragraph", "heading", "step", "callout", "link"].includes(row.type)
                    }
                  >
                    <FormField
                      {...named("text")}
                      label={copy.text}
                      multiline
                      maxLength={row.type === "heading" || row.type === "link" ? 200 : 5000}
                    />
                  </div>
                  <div hidden={enhanced && row.type !== "list"}>
                    <FormField
                      {...named("items")}
                      label={copy.items}
                      hint={copy.itemsHint}
                      multiline
                      maxLength={6030}
                    />
                  </div>
                  <div hidden={enhanced && row.type !== "link"}>
                    <FormField
                      {...named("href")}
                      lang="en"
                      dir="ltr"
                      label={copy.href}
                      hint={copy.hrefHint}
                      maxLength={400}
                    />
                  </div>
                  {enhanced && row.type ? (
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        className={buttonClass("secondary")}
                        disabled={form.pending || binding.readOnly || index === 0}
                        onClick={() => move(index, -1)}
                      >
                        {copy.up}
                      </button>
                      <button
                        type="button"
                        className={buttonClass("secondary")}
                        disabled={form.pending || binding.readOnly || index >= rows.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        {copy.down}
                      </button>
                    </div>
                  ) : null}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </fieldset>
  );
}
