"use client";

import { controlClass, errorClass, fieldClass, labelClass } from "@/ui/field-class";
import type { FormAction, FormState, FormValues } from "@/ui/form/contract";
import { ActionForm, type FormController } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import type { AcceptValues, TaskValues, TriageValues } from "./actions";
import { workCopy } from "./copy";
import { InquiryDraftForm } from "./inquiry-draft";
import type { InquiryDraftOwner } from "./inquiry-draft-storage";

function SelectField<V extends FormValues>({
  form,
  name,
  label,
  options,
}: {
  form: FormController<V>;
  name: keyof V & string;
  label: string;
  options: { value: string; label: string }[];
}) {
  const field = form.field(name);
  return (
    // UI06 Error (6:68): the error border and the message under the control.
    <div className={fieldClass} data-invalid={field.error ? "true" : undefined}>
      <label htmlFor={field.id} className={labelClass}>
        {label}
      </label>
      <select
        id={field.id}
        name={name}
        value={field.value}
        disabled={field.readOnly}
        onChange={(e) => form.setValue(name, e.target.value)}
        className={controlClass}
        aria-invalid={Boolean(field.error) || undefined}
        aria-describedby={field.error ? `${field.id}-error` : undefined}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {field.error ? (
        <p id={`${field.id}-error`} className={errorClass}>
          {field.error}
        </p>
      ) : null}
    </div>
  );
}

type Props<V extends FormValues> = {
  locale: string;
  id: string;
  initialState: FormState<V>;
  action: FormAction<V>;
};
const status = (path: string, kind: string, key: string, label: string) => ({
  href: `${path}/operations?type=${kind}&key=${encodeURIComponent(key)}`,
  label,
});

export function AcceptForm({
  locale,
  id,
  initialState,
  action,
  draftOwner,
}: Props<AcceptValues> & { draftOwner: InquiryDraftOwner }) {
  const copy = workCopy(locale);
  const path = `/${locale}/inquiries/${id}`;
  return (
    <InquiryDraftForm
      owner={draftOwner}
      id={id}
      kind="accept"
      draftCopy={copy.draft}
      action={action}
      initialState={initialState}
      permalink={path}
      nativeIdentity={`inquiry-accept:${id}`}
      reconciliation={status(path, "accept", initialState.operationId, copy.statusLink)}
      copy={copy.form}
      labels={{ nextAction: copy.nextAction, dueAt: copy.dueAt }}
      submitLabel={copy.accept}
    >
      {(form) => (
        <>
          <FormField
            {...form.field("nextAction")}
            label={copy.nextAction}
            required
            maxLength={500}
          />
          <FormField
            {...form.field("dueAt")}
            label={copy.dueAt}
            type="datetime-local"
            hint={copy.utcHint}
            required
          />
        </>
      )}
    </InquiryDraftForm>
  );
}

export function TriageForm({
  locale,
  id,
  initialState,
  action,
  states,
  draftOwner,
}: Props<TriageValues> & {
  states: (keyof ReturnType<typeof workCopy>["states"])[];
  draftOwner: InquiryDraftOwner;
}) {
  const copy = workCopy(locale);
  const path = `/${locale}/inquiries/${id}`;
  return (
    <InquiryDraftForm
      owner={draftOwner}
      id={id}
      kind="triage"
      draftCopy={copy.draft}
      action={action}
      initialState={initialState}
      permalink={path}
      nativeIdentity={`inquiry-triage:${id}`}
      reconciliation={status(path, "triage", initialState.operationId, copy.statusLink)}
      copy={copy.form}
      labels={{
        state: copy.state,
        reason: copy.reason,
        duplicateOfInquiryId: copy.duplicateOfInquiryId,
      }}
      submitLabel={copy.disposition}
    >
      {(form) => (
        <>
          <SelectField
            form={form}
            name="state"
            label={copy.state}
            options={states.map((value) => ({ value, label: copy.states[value] }))}
          />
          <FormField
            {...form.field("reason")}
            label={copy.reason}
            multiline
            required
            maxLength={1500}
          />
          <FormField
            {...form.field("duplicateOfInquiryId")}
            label={copy.duplicateOfInquiryId}
            hint={copy.duplicateHint}
            required={form.values.state === "duplicate_candidate"}
          />
        </>
      )}
    </InquiryDraftForm>
  );
}

export function TaskForm({
  locale,
  id,
  initialState,
  action,
  states,
}: Props<TaskValues> & { states: (keyof ReturnType<typeof workCopy>["states"])[] }) {
  const copy = workCopy(locale);
  const path = `/${locale}/tasks/${id}`;
  return (
    <ActionForm
      action={action}
      initialState={initialState}
      permalink={path}
      reconciliation={status(path, "task", initialState.operationId, copy.statusLink)}
      copy={copy.form}
      labels={{ state: copy.state, note: copy.note, followUpAt: copy.followUpAt }}
      submitLabel={copy.taskChange}
    >
      {(form) => (
        <>
          <SelectField
            form={form}
            name="state"
            label={copy.state}
            options={states.map((value) => ({ value, label: copy.states[value] }))}
          />
          <FormField
            {...form.field("note")}
            label={copy.note}
            multiline
            required={form.values.state !== "in_progress"}
            maxLength={1500}
          />
          <FormField
            {...form.field("followUpAt")}
            label={copy.followUpAt}
            hint={copy.utcHint}
            type="datetime-local"
            required={form.values.state === "waiting"}
          />
        </>
      )}
    </ActionForm>
  );
}
