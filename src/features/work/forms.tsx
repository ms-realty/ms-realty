"use client";

import { controlClass, fieldClass } from "@/ui/field-class";
import type { FormAction, FormState, FormValues } from "@/ui/form/contract";
import { ActionForm, type FormController } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import type { AcceptValues, TaskValues, TriageValues } from "./actions";
import { workCopy } from "./copy";

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
    <div className={fieldClass}>
      <label htmlFor={field.id} className="text-compact font-semibold">
        {label}
      </label>
      {field.error ? (
        <p id={`${field.id}-error`} className="text-error">
          {field.error}
        </p>
      ) : null}
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

export function AcceptForm({ locale, id, initialState, action }: Props<AcceptValues>) {
  const copy = workCopy(locale);
  const path = `/${locale}/inquiries/${id}`;
  return (
    <ActionForm
      action={action}
      initialState={initialState}
      permalink={path}
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
    </ActionForm>
  );
}

export function TriageForm({
  locale,
  id,
  initialState,
  action,
  states,
}: Props<TriageValues> & { states: (keyof ReturnType<typeof workCopy>["states"])[] }) {
  const copy = workCopy(locale);
  const path = `/${locale}/inquiries/${id}`;
  return (
    <ActionForm
      action={action}
      initialState={initialState}
      permalink={path}
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
    </ActionForm>
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
