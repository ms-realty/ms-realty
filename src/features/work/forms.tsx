"use client";

import { isInstantInput } from "@/domain/time";
import { isPublicLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { workflowLabel } from "@/i18n/workflow-labels";
import { DateTimeField } from "@/ui/date-time-field";
import { controlClass, errorClass, fieldClass, labelClass } from "@/ui/field-class";
import type { FormAction, FormState, FormValues } from "@/ui/form/contract";
import { ActionForm, type FormController } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import { TechnicalDetails } from "@/ui/technical-details";
import type { AcceptValues, TaskValues, TriageValues } from "./actions";
import { workCopy } from "./copy";
import { InquiryDraftForm } from "./inquiry-draft";
import type { InquiryDraftOwner } from "./inquiry-draft-storage";
import { triageCopy } from "./triage-copy";

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
      formatValue={(name, value) =>
        name === "dueAt" && isInstantInput(value)
          ? formatDateTime(isPublicLocale(locale) ? locale : "bg", value, { zoneLabel: true })
          : value
      }
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
          <DateTimeField
            {...form.field("dueAt")}
            label={copy.dueAt}
            locale={isPublicLocale(locale) ? locale : "bg"}
            onValueChange={(value) => form.setValue("dueAt", value)}
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
  duplicateCandidates = [],
}: Props<TriageValues> & {
  states: (keyof ReturnType<typeof workCopy>["states"])[];
  duplicateCandidates?: { id: string; reference: string; preferredName: string | null }[];
  draftOwner: InquiryDraftOwner;
}) {
  const copy = workCopy(locale);
  const triage = triageCopy(locale);
  const path = `/${locale}/inquiries/${id}`;
  return (
    <InquiryDraftForm
      owner={draftOwner}
      id={id}
      kind="triage"
      formatValue={(name, value) => {
        if (name === "state")
          return copy.states[value as keyof typeof copy.states] ?? workflowLabel(value, locale);
        if (name === "duplicateOfInquiryId") {
          const original = duplicateCandidates.find(
            (candidate) => candidate.id === value || candidate.reference === value,
          );
          if (original) return original.reference;
          if (/^[a-f0-9-]{36}$/i.test(value))
            return <TechnicalDetails locale={locale}>{value}</TechnicalDetails>;
        }
        return value;
      }}
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
        duplicateOfInquiryId: triage.original,
      }}
      submitLabel={(state) =>
        state.values.state in copy.states
          ? `${triage.save}: ${copy.states[state.values.state as keyof typeof copy.states]}`
          : triage.recordSelected
      }
    >
      {(form) => (
        <>
          <fieldset
            id={form.field("state").id}
            tabIndex={-1}
            className="space-y-3"
            disabled={form.field("state").readOnly}
            aria-invalid={Boolean(form.field("state").error) || undefined}
            aria-describedby={
              form.field("state").error ? `${form.field("state").id}-error` : undefined
            }
          >
            <legend className={labelClass}>{triage.choose}</legend>
            {states.map((value) => (
              <label
                key={value}
                className="flex min-h-control items-center gap-3 rounded-control border border-border p-3"
              >
                <input
                  type="radio"
                  name="state"
                  value={value}
                  required
                  checked={form.values.state === value}
                  onChange={() => form.setValue("state", value)}
                />
                <span>{copy.states[value]}</span>
              </label>
            ))}
            {form.field("state").error ? (
              <p id={`${form.field("state").id}-error`} className={errorClass}>
                {form.field("state").error}
              </p>
            ) : null}
          </fieldset>
          {["suspected_spam", "duplicate_candidate"].includes(form.values.state) ? (
            <div className="space-y-3 rounded-control border border-warning bg-subtle p-4">
              <p>{triage.confirm}</p>
              <label className="flex min-h-control items-center gap-3">
                <input type="checkbox" name="queueEffectReviewed" value="yes" required />
                {triage.review}
              </label>
            </div>
          ) : null}
          <FormField
            {...form.field("reason")}
            label={copy.reason}
            multiline
            required
            maxLength={1500}
          />
          {form.values.state === "duplicate_candidate" ? (
            <div
              className={fieldClass}
              data-invalid={form.field("duplicateOfInquiryId").error ? "true" : undefined}
            >
              <label className={labelClass} htmlFor={form.field("duplicateOfInquiryId").id}>
                {triage.original}
              </label>
              <input
                type="search"
                autoComplete="off"
                maxLength={80}
                className={controlClass}
                id={form.field("duplicateOfInquiryId").id}
                name="duplicateOfInquiryId"
                list={`${form.field("duplicateOfInquiryId").id}-choices`}
                required
                value={
                  duplicateCandidates.find(
                    (candidate) => candidate.id === form.values.duplicateOfInquiryId,
                  )?.reference ?? form.values.duplicateOfInquiryId
                }
                onChange={(event) => form.setValue("duplicateOfInquiryId", event.target.value)}
                disabled={form.field("duplicateOfInquiryId").readOnly}
                aria-invalid={Boolean(form.field("duplicateOfInquiryId").error) || undefined}
                aria-describedby={[
                  `${form.field("duplicateOfInquiryId").id}-hint`,
                  form.field("duplicateOfInquiryId").error &&
                    `${form.field("duplicateOfInquiryId").id}-error`,
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
              <datalist id={`${form.field("duplicateOfInquiryId").id}-choices`}>
                {duplicateCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.reference}>
                    {candidate.preferredName}
                  </option>
                ))}
              </datalist>
              <p
                id={`${form.field("duplicateOfInquiryId").id}-hint`}
                className="text-caption text-text-muted"
              >
                {triage.hint}
              </p>
              {form.field("duplicateOfInquiryId").error ? (
                <p id={`${form.field("duplicateOfInquiryId").id}-error`} className={errorClass}>
                  {form.field("duplicateOfInquiryId").error}
                </p>
              ) : null}
            </div>
          ) : (
            <input type="hidden" name="duplicateOfInquiryId" value="" />
          )}
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
  completion = false,
}: Props<TaskValues> & {
  states: (keyof ReturnType<typeof workCopy>["states"])[];
  completion?: boolean;
}) {
  const copy = workCopy(locale);
  const path = `/${locale}/tasks/${id}`;
  return (
    <ActionForm
      formatValue={(name, value) => {
        if (name === "state")
          return copy.states[value as keyof typeof copy.states] ?? workflowLabel(value, locale);
        return name === "followUpAt" && isInstantInput(value)
          ? formatDateTime(isPublicLocale(locale) ? locale : "bg", value, { zoneLabel: true })
          : value;
      }}
      action={action}
      initialState={initialState}
      permalink={path}
      reconciliation={status(path, "task", initialState.operationId, copy.statusLink)}
      copy={copy.form}
      labels={{ state: copy.state, note: copy.note, followUpAt: copy.followUpAt }}
      submitLabel={completion ? copy.completeTask : copy.taskChange}
    >
      {(form) => (
        <>
          {completion ? (
            <input type="hidden" name="state" value="done" />
          ) : (
            <SelectField
              form={form}
              name="state"
              label={copy.state}
              options={states.map((value) => ({ value, label: copy.states[value] }))}
            />
          )}
          <FormField
            {...form.field("note")}
            label={completion ? copy.completionOutcome : copy.note}
            multiline
            required={form.values.state !== "in_progress"}
            maxLength={1500}
          />
          {completion ? (
            <input type="hidden" name="followUpAt" value="" />
          ) : (
            <DateTimeField
              {...form.field("followUpAt")}
              label={copy.followUpAt}
              hint={copy.utcHint}
              locale={isPublicLocale(locale) ? locale : "bg"}
              onValueChange={(value) => form.setValue("followUpAt", value)}
              required={form.values.state === "waiting"}
            />
          )}
        </>
      )}
    </ActionForm>
  );
}
