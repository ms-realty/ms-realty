"use client";
import {
  emptyGovernanceDocument,
  type GovernanceKind,
  type GovernanceValues,
} from "@/domain/privacy-governance";
import { staffUi } from "@/features/shell/staff-ui";
import type { FormAction, FormCopy, FormState } from "@/ui/form/contract";
import { ActionForm, type FormController } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import type { GovernanceCopy } from "./copy";

type Person = { id: string; displayName: string };
type Shared = {
  path: string;
  statusPath: string;
  copy: GovernanceCopy;
  formCopy: FormCopy;
  initialState: FormState<GovernanceValues>;
  action: FormAction<GovernanceValues>;
};
const choices = {
  lifecycle: ["active", "retired"],
  transferState: ["unknown", "no_transfer", "reviewed_transfer"],
  notificationDecision: ["pending", "required", "not_required"],
  responseState: ["open", "response_recorded", "closed"],
} as const;
function Select({
  form,
  name,
  label,
  options,
}: {
  form: FormController<GovernanceValues>;
  name: string;
  label: string;
  options: { value: string; label: string }[];
}) {
  const { error, readOnly, ...field } = form.field(name);
  return (
    <div className={staffUi.field}>
      <label htmlFor={field.id}>{label}</label>
      <span className="block -m-1.5 p-1.5 [contain:paint]">
        <select
          {...field}
          disabled={readOnly}
          className={`${staffUi.control} max-w-full`}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${field.id}-error` : undefined}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </span>
      {error ? <p id={`${field.id}-error`}>{error}</p> : null}
    </div>
  );
}
export function GovernanceDraftForm({
  path,
  statusPath,
  copy,
  formCopy,
  initialState,
  action,
  kind,
  owners,
  reviewers,
}: Shared & { kind: GovernanceKind; owners: Person[]; reviewers: Person[] }) {
  const fields = Object.keys(emptyGovernanceDocument(kind)).filter((key) => key !== "kind");
  const labels = copy.fields as Record<string, string>;
  return (
    <ActionForm
      action={action}
      initialState={initialState}
      permalink={path}
      reconciliation={{
        href: `${statusPath}/save/${encodeURIComponent(initialState.operationId)}`,
        label: copy.check,
      }}
      copy={formCopy}
      labels={labels}
      submitLabel={copy.save}
      layout="full"
    >
      {(form) => (
        <div className={staffUi.form}>
          <p className={staffUi.hint}>{copy.dataHelp}</p>
          <div className={staffUi.formGrid}>
            {fields.map((key) => {
              const label = labels[key] ?? copy.unknown;
              if (key === "ownerId" || key === "determinationById") {
                const people = key === "ownerId" ? owners : reviewers;
                return (
                  <Select
                    key={key}
                    form={form}
                    name={key}
                    label={label}
                    options={[
                      { value: "", label: copy.unknown },
                      ...(!people.some((person) => person.id === form.values[key]) &&
                      form.values[key]
                        ? [{ value: form.values[key] ?? "", label: copy.inactiveOwner }]
                        : []),
                      ...people.map((person) => ({ value: person.id, label: person.displayName })),
                    ]}
                  />
                );
              }
              if (key in choices)
                return (
                  <Select
                    key={key}
                    form={form}
                    name={key}
                    label={label}
                    options={choices[key as keyof typeof choices].map((value) => ({
                      value,
                      label: copy.options[value],
                    }))}
                  />
                );
              const temporal = key.endsWith("At");
              return (
                <FormField
                  key={key}
                  {...form.field(key)}
                  label={label}
                  required={key === "title" || key === "nextAction"}
                  maxLength={key === "title" ? 160 : 1500}
                  hint={temporal ? copy.timeHelp : undefined}
                  multiline={
                    temporal || key === "deadlineTimezone" || key === "processingRecordId"
                      ? false
                      : "wrap"
                  }
                />
              );
            })}
          </div>
        </div>
      )}
    </ActionForm>
  );
}
export function GovernanceReviewForm({
  path,
  statusPath,
  copy,
  formCopy,
  initialState,
  action,
}: Shared) {
  return (
    <ActionForm
      action={action}
      initialState={initialState}
      permalink={path}
      reconciliation={{
        href: `${statusPath}/review/${encodeURIComponent(initialState.operationId)}`,
        label: copy.check,
      }}
      copy={formCopy}
      labels={{ expectedHash: copy.hash, note: copy.note, reviewed: copy.confirm }}
      submitLabel={copy.review}
    >
      {(form) => (
        <div className={staffUi.form}>
          <input {...form.field("expectedHash")} type="hidden" />
          <FormField
            {...form.field("note")}
            label={copy.note}
            multiline
            required
            minLength={10}
            maxLength={1500}
          />
          <label className="flex items-start gap-3 text-dense">
            <input
              type="checkbox"
              name="reviewed"
              value="yes"
              required
              checked={form.values.reviewed === "yes"}
              disabled={form.pending}
              onChange={(event) =>
                form.setValue("reviewed", event.currentTarget.checked ? "yes" : "")
              }
              className="mt-1 size-5 shrink-0"
            />
            {copy.confirm}
          </label>
        </div>
      )}
    </ActionForm>
  );
}
