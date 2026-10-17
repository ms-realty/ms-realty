"use client";
import { workCopy } from "@/features/work/copy";
import { controlClass, labelClass } from "@/ui/field-class";
import type { FormAction, FormState } from "@/ui/form/contract";
import { ActionForm } from "@/ui/form/form";
import type { AiValues } from "./actions";
import { aiCopy } from "./copy";

export function AssistanceForm({
  locale,
  id,
  mode,
  initialState,
  action,
}: {
  locale: string;
  id: string;
  mode: "request" | "review";
  initialState: FormState<AiValues>;
  action: FormAction<AiValues>;
}) {
  const copy = aiCopy(locale);
  const path = `/${locale}/operations/assistance${mode === "review" ? `/${id}` : `?source=${id}`}`;
  return (
    <ActionForm
      initialState={initialState}
      action={action}
      permalink={path}
      reconciliation={{
        href:
          mode === "request"
            ? `${path}&operation=${encodeURIComponent(initialState.operationId)}`
            : path,
        label: copy.check,
      }}
      copy={workCopy(locale).form}
      labels={{ task: copy.task, decision: copy.decision, reviewed: copy.reviewedDraft }}
      submitLabel={mode === "request" ? copy.request : copy.review}
    >
      {(form) => (
        <>
          {mode === "request" ? (
            <label className="block min-w-0">
              <span className={`mb-2 block ${labelClass}`}>{copy.task}</span>
              <select
                name="task"
                value={form.values.task}
                onChange={(e) => form.setValue("task", e.target.value)}
                disabled={form.pending}
                className={`${controlClass} min-w-0 max-w-full`}
              >
                {(["inquiry_summary", "reply_draft", "task_draft"] as const).map((task) => (
                  <option key={task} value={task}>
                    {copy[task]}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block min-w-0">
              <span className={`mb-2 block ${labelClass}`}>{copy.decision}</span>
              <select
                name="decision"
                value={form.values.decision}
                onChange={(e) => form.setValue("decision", e.target.value)}
                disabled={form.pending}
                className={`${controlClass} min-w-0 max-w-full`}
              >
                <option value="accepted">{copy.accepted}</option>
                <option value="rejected">{copy.rejected}</option>
              </select>
            </label>
          )}
          <label className="flex min-h-11 items-start gap-3">
            <input
              type="checkbox"
              name="reviewed"
              value="yes"
              checked={form.values.reviewed === "yes"}
              onChange={(e) => form.setValue("reviewed", e.target.checked ? "yes" : "")}
              disabled={form.pending}
              required
              className="mt-1 size-5 shrink-0 accent-action"
            />
            <span>{mode === "request" ? copy.reviewedSource : copy.reviewedDraft}</span>
          </label>
        </>
      )}
    </ActionForm>
  );
}

export function LocaleAssistanceForm({
  locale,
  reference,
  targetLocale,
  initialState,
  action,
}: {
  locale: string;
  reference: string;
  targetLocale: string;
  initialState: FormState<AiValues>;
  action: FormAction<AiValues>;
}) {
  const copy = aiCopy(locale),
    path = `/${locale}/operations/assistance/locale?${new URLSearchParams({ reference, language: targetLocale })}`;
  return (
    <ActionForm
      initialState={initialState}
      action={action}
      permalink={path}
      reconciliation={{
        href: `${path}&operation=${encodeURIComponent(initialState.operationId)}`,
        label: copy.check,
      }}
      copy={workCopy(locale).form}
      labels={{ task: copy.task, decision: copy.decision, reviewed: copy.reviewedSource }}
      submitLabel={copy.request}
    >
      {(form) => (
        <>
          <input type="hidden" name="task" value="locale.draft" />
          <label className="flex min-h-11 items-start gap-3">
            <input
              type="checkbox"
              name="reviewed"
              value="yes"
              checked={form.values.reviewed === "yes"}
              onChange={(e) => form.setValue("reviewed", e.target.checked ? "yes" : "")}
              required
              disabled={form.pending}
              className="mt-1 size-5 shrink-0 accent-action"
            />
            <span>{copy.reviewedSource}</span>
          </label>
        </>
      )}
    </ActionForm>
  );
}

export function IntakeAssistanceForm({
  locale,
  reference,
  initialState,
  action,
}: {
  locale: string;
  reference: string;
  initialState: FormState<AiValues>;
  action: FormAction<AiValues>;
}) {
  const copy = aiCopy(locale),
    path = `/${locale}/operations/assistance/intake?${new URLSearchParams({ reference })}`;
  return (
    <ActionForm
      initialState={initialState}
      action={action}
      permalink={path}
      reconciliation={{
        href: `${path}&operation=${encodeURIComponent(initialState.operationId)}`,
        label: copy.check,
      }}
      copy={workCopy(locale).form}
      labels={{ task: copy.task, decision: copy.decision, reviewed: copy.reviewedSource }}
      submitLabel={copy.request}
    >
      {(form) => (
        <>
          <input type="hidden" name="task" value="intake.extract" />
          <label className="flex min-h-11 items-start gap-3">
            <input
              type="checkbox"
              name="reviewed"
              value="yes"
              checked={form.values.reviewed === "yes"}
              onChange={(e) => form.setValue("reviewed", e.target.checked ? "yes" : "")}
              required
              disabled={form.pending}
              className="mt-1 size-5 shrink-0 accent-action"
            />
            <span>{copy.reviewedSource}</span>
          </label>
        </>
      )}
    </ActionForm>
  );
}
