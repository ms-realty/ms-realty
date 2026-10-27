"use client";
import { type ReactNode, useActionState, useEffect, useRef } from "react";
import type { WorkspaceSearchRow } from "@/server/work/workspace-search";
import { buttonClass } from "@/ui/button-class";
import { controlClass } from "@/ui/field-class";
import { SubmitButton } from "@/ui/form/submit-button";
import { staffWorkflowCopy } from "./workflow-completion-copy";

export type RecordSearchState = {
  responseId: string;
  q: string;
  error?: string;
  rows?: WorkspaceSearchRow[];
};
const initial: RecordSearchState = { responseId: "initial", q: "" };
export function RecordSearch({
  locale,
  action,
  path,
  children,
}: {
  locale: string;
  action: (state: RecordSearchState, data: FormData) => Promise<RecordSearchState>;
  path: string;
  children?: ReactNode;
}) {
  const copy = staffWorkflowCopy(locale);
  const [state, submit, pending] = useActionState(action, initial, path);
  const result = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.responseId !== "initial") result.current?.focus();
  }, [state.responseId]);
  return (
    <div className="space-y-5">
      <search aria-label={copy.search}>
        <form
          action={submit}
          onReset={(event) => event.preventDefault()}
          aria-busy={pending}
          className="space-y-3"
        >
          <label className="block text-dense font-semibold" htmlFor="record-search-q">
            {copy.search}
          </label>
          <div className="flex flex-wrap gap-3">
            <input
              id="record-search-q"
              type="search"
              name="q"
              required
              minLength={2}
              maxLength={120}
              defaultValue={state.q}
              className={`${controlClass} min-w-0 flex-1`}
              aria-describedby="record-search-hint"
              autoComplete="off"
            />
            <SubmitButton className={buttonClass("secondary")}>{copy.searchSubmit}</SubmitButton>
          </div>
          <p id="record-search-hint" className="text-dense text-text-muted">
            {copy.searchHint}
          </p>
        </form>
      </search>
      <div ref={result} tabIndex={-1} className="space-y-4" aria-live="polite">
        {state.error ? <p role="alert">{state.error}</p> : null}
        {state.rows ? (
          <>
            <p>{copy.scoped}</p>
            {state.rows.length ? (
              <ul className="divide-y divide-border">
                {state.rows.map((row) => (
                  <li key={`${row.kind}:${row.id}`} className="py-3">
                    <a
                      className="inline-flex min-h-control items-center gap-3 font-semibold text-link underline"
                      href={`/${locale}/${row.kind === "listings" ? "inventory" : row.kind}/${row.id}`}
                    >
                      <span>{copy[row.kind]}</span>
                      <bdi>{row.reference}</bdi>
                      <span>{row.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{copy.noResults}</p>
            )}
            <p className="text-dense text-text-muted">{copy.moreResults}</p>
            <a href={path} className="inline-flex min-h-control items-center text-link underline">
              {copy.openRecord}
            </a>
          </>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
