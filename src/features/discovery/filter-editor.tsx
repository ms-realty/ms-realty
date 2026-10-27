"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { buttonClass } from "@/ui/button-class";
import { controlClass, labelClass } from "@/ui/field-class";
import { ChevronDownIcon, FiltersIcon } from "@/ui/icons";
import { Sheet, useSheet } from "@/ui/sheet";
import type { DiscoveryCopy } from "./copy";
import type { Filters } from "./query";

/** P03/UI15: native GET fields remain the baseline; compact editing gets its own draft. */
export function FilterEditor({
  action,
  copy,
  values,
  activeCount,
  filtersOpen,
  children,
}: {
  action: string;
  copy: DiscoveryCopy;
  values: Filters;
  activeCount: number;
  filtersOpen: boolean;
  children: ReactNode;
}) {
  const sheet = useSheet();
  const [compact, setCompact] = useState(false);
  const [primary, setPrimary] = useState({ purpose: values.purpose || "sale", q: values.q });
  const [draftKey, setDraftKey] = useState(0);
  const draftId = useId();
  const hintId = useId();
  const disclosure = useRef<HTMLDetailsElement>(null);
  const draft = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia("(max-width: 63.999rem)");
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (compact && filtersOpen) sheet.open();
  }, [compact, filtersOpen, sheet.open]);

  const open = () => {
    const form = disclosure.current?.closest("form");
    if (form) {
      const data = new FormData(form);
      setPrimary({
        purpose: String(data.get("purpose") ?? "sale"),
        q: String(data.get("q") ?? ""),
      });
    }
    setDraftKey((key) => key + 1);
    sheet.open();
  };

  const clearDraft = () => {
    for (const field of draft.current?.elements ?? []) {
      if (field instanceof HTMLInputElement) {
        if (field.type === "checkbox") field.checked = false;
        else field.value = "";
      } else if (field instanceof HTMLSelectElement) {
        if (field.multiple) {
          for (const option of field.options) option.selected = false;
        } else {
          const defaults: Record<string, string> = {
            purpose: "sale",
            currency: "EUR",
            areaBasis: "living",
            sort: "relevance",
          };
          field.value = defaults[field.name] ?? "";
        }
      }
    }
  };

  return (
    <>
      <details
        ref={disclosure}
        open={filtersOpen && !compact}
        className="group/filters border-t border-divider pt-3 [&:not([open])>div]:hidden"
      >
        {/* biome-ignore lint/a11y/useSemanticElements: summary must remain a working native disclosure before hydration. */}
        <summary
          role="button"
          aria-haspopup={compact ? "dialog" : undefined}
          onClick={(event) => {
            if (!compact) return;
            event.preventDefault();
            open();
          }}
          className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-control text-compact font-semibold text-action [&::-webkit-details-marker]:hidden"
        >
          <FiltersIcon />
          <span>
            {copy.filters}
            {activeCount ? (
              <>
                {" "}
                · <bdi>{activeCount}</bdi>
              </>
            ) : null}
          </span>
          <ChevronDownIcon className="ms-auto shrink-0 group-open/filters:rotate-180" />
        </summary>
        <div>
          {children}
          <button type="submit" className={buttonClass("secondary", "mt-5")}>
            {copy.apply}
          </button>
        </div>
      </details>
      <Sheet
        state={sheet}
        title={copy.filters}
        closeLabel={copy.close}
        footer={
          <>
            <button
              type="button"
              onClick={clearDraft}
              className={buttonClass("tertiary", "me-auto px-2")}
            >
              {copy.clearDraft}
            </button>
            <button
              type="button"
              onClick={sheet.close}
              className={buttonClass("secondary", "px-3")}
            >
              {copy.cancel}
            </button>
            <button type="submit" form={draftId} className={buttonClass("primary", "px-3")}>
              {copy.apply}
            </button>
          </>
        }
      >
        <form
          key={draftKey}
          id={draftId}
          ref={draft}
          action={action}
          method="get"
          aria-describedby={hintId}
          className="min-w-0 space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            const query = new URLSearchParams();
            for (const [name, value] of new FormData(event.currentTarget))
              query.append(name, String(value));
            // Replace the closeable sheet entry with the committed GET, so Back restores
            // the previous results instead of leaving a second, stale sheet entry.
            window.location.replace(`${action}?${query}`);
          }}
        >
          <p id={hintId} className="rounded-control bg-subtle p-3 text-compact text-text-muted">
            {copy.filterDraftHint}
          </p>
          <div className="grid gap-4">
            <label className="flex min-w-0 flex-col gap-2">
              <span className={labelClass}>{copy.searchPurpose}</span>
              <select name="purpose" defaultValue={primary.purpose} className={controlClass}>
                <option value="sale">{copy.buy}</option>
                <option value="long_term_rent">{copy.rent}</option>
                {!["sale", "long_term_rent"].includes(primary.purpose) ? (
                  <option value={primary.purpose}>{copy.check}</option>
                ) : null}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-2">
              <span className={labelClass}>{copy.query}</span>
              <input
                name="q"
                type="search"
                enterKeyHint="search"
                placeholder={copy.searchPlaceholder}
                defaultValue={primary.q}
                maxLength={100}
                className={controlClass}
              />
            </label>
          </div>
          {children}
        </form>
      </Sheet>
    </>
  );
}
