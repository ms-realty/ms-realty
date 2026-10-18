"use client";
import { useActionState } from "react";
import { dataReviewCopy } from "@/features/import-review/copy";
import { fieldClass, labelClass, textareaClass } from "@/ui/field-class";
import type { ContactReviewState } from "./state";
export function ContactReviewForm({
  locale,
  left,
  right,
  leftVersion,
  rightVersion,
  inquiryId,
  ownerName,
  initialState,
  action,
}: {
  locale: string;
  left: string;
  right: string;
  leftVersion: number;
  rightVersion: number;
  inquiryId: string;
  ownerName: string;
  initialState: ContactReviewState;
  action: (previous: ContactReviewState, form: FormData) => Promise<ContactReviewState>;
}) {
  const copy = dataReviewCopy(locale).duplicates;
  const [state, submit, pending] = useActionState(
    action,
    initialState,
    `/${locale}/operations/duplicates?left=${left}&right=${right}`,
  );
  return (
    <form action={submit} className="grid gap-5" data-contact-review-form>
      {state.error ? (
        <div role="alert" className="rounded-panel border border-error p-4 text-error">
          {state.error === "unknown" ? copy.uncertain : copy.failure}
          {state.error === "unknown" ? (
            <a
              className="block min-h-control py-2 font-semibold text-link underline"
              href={`/${locale}/operations/duplicates/status?left=${left}&right=${right}&key=${encodeURIComponent(state.operationId)}`}
            >
              {copy.checkAgain}
            </a>
          ) : (
            <a
              className="block min-h-control py-2 font-semibold text-link underline"
              href={`/${locale}/operations/duplicates?left=${left}&right=${right}`}
            >
              {copy.compare}
            </a>
          )}
        </div>
      ) : null}
      <input name="operationId" type="hidden" value={state.operationId} />
      <input name="leftVersion" type="hidden" value={leftVersion} />
      <input name="rightVersion" type="hidden" value={rightVersion} />
      <input name="inquiryId" type="hidden" value={inquiryId} />
      <div>
        <h2 className="font-semibold">{copy.owner}</h2>
        <p>{ownerName}</p>
        <p className="text-caption text-text-muted">{copy.ownerHint}</p>
      </div>
      <div className={fieldClass}>
        <label htmlFor="review-next" className={labelClass}>
          {copy.nextStep}
        </label>
        <textarea
          id="review-next"
          name="nextStep"
          defaultValue={state.nextStep}
          className={textareaClass}
          minLength={10}
          maxLength={500}
          required
          disabled={pending || Boolean(state.error)}
        />
      </div>
      <label className="flex items-start gap-3">
        <input
          className="mt-1 size-5 shrink-0 accent-accent"
          type="checkbox"
          name="reviewed"
          value="yes"
          required
          disabled={pending || Boolean(state.error)}
        />
        <span>{copy.reviewed}</span>
      </label>
      <button
        type="submit"
        className="min-h-control rounded-control bg-accent px-5 py-3 font-semibold text-on-accent disabled:opacity-60"
        disabled={pending || Boolean(state.error)}
      >
        {pending ? copy.saving : copy.defer}
      </button>
    </form>
  );
}
