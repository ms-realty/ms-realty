"use client";
import { useActionState } from "react";
import { buttonClass } from "@/ui/button-class";
import { fieldClass, labelClass, textareaClass } from "@/ui/field-class";
import { duplicateMergeCopy } from "./merge-copy";
import type { DuplicateMergeState } from "./merge-state";

export function DuplicateMergeForm({
  locale,
  mode,
  leftVersion,
  rightVersion,
  impactDigest,
  permalink,
  statusUrl,
  initialState,
  action,
}: {
  locale: string;
  mode: "merge" | "reverse";
  leftVersion: number;
  rightVersion: number;
  impactDigest: string;
  permalink: string;
  statusUrl: string;
  initialState: DuplicateMergeState;
  action: (previous: DuplicateMergeState, data: FormData) => Promise<DuplicateMergeState>;
}) {
  const copy = duplicateMergeCopy(locale);
  const [state, submit, pending] = useActionState(action, initialState, permalink);
  const unavailable = pending || Boolean(state.error);
  return (
    <form action={submit} className="grid gap-5" data-duplicate-merge-form={mode}>
      {state.error ? (
        <div role="alert" className="rounded-panel border border-error p-4 text-error">
          <p>{copy[state.error]}</p>
          <a
            className="block min-h-control py-2 font-semibold text-link underline"
            href={
              state.error === "unknown"
                ? `${statusUrl}&key=${encodeURIComponent(state.operationId)}`
                : permalink
            }
          >
            {state.error === "unknown" ? copy.checkAgain : copy.reviewAgain}
          </a>
        </div>
      ) : null}
      <input type="hidden" name="operationId" value={state.operationId} />
      <input type="hidden" name="leftVersion" value={leftVersion} />
      <input type="hidden" name="rightVersion" value={rightVersion} />
      <input type="hidden" name="impactDigest" value={impactDigest} />
      <div className={fieldClass}>
        <label className={labelClass} htmlFor="identity-reason">
          {copy.reason}
        </label>
        <textarea
          className={textareaClass}
          id="identity-reason"
          name="reason"
          minLength={10}
          maxLength={1000}
          required
          defaultValue={state.reason}
          disabled={unavailable}
        />
      </div>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="reviewed"
          value="yes"
          required
          disabled={unavailable}
          className="mt-1 size-5 shrink-0 accent-accent"
        />
        <span>{copy.reviewed}</span>
      </label>
      <button type="submit" className={buttonClass()} disabled={unavailable}>
        {pending ? copy.saving : copy[mode]}
      </button>
      {!state.error ? (
        <a
          className="min-h-control py-2 font-semibold text-link underline"
          href={`${statusUrl}&key=${encodeURIComponent(state.operationId)}`}
        >
          {copy.checkAgain}
        </a>
      ) : null}
      <a
        href={`/${locale}/operations/duplicates`}
        className="min-h-control py-2 font-semibold text-link underline"
      >
        {copy.cancel}
      </a>
    </form>
  );
}
