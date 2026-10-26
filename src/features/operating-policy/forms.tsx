"use client";
import { policyWeekdays } from "@/domain/operating-policy";
import { type PolicyFormValues, policyFormFields } from "@/domain/operating-policy-form";
import { staffUi } from "@/features/shell/staff-ui";
import type { FormAction, FormCopy, FormState } from "@/ui/form/contract";
import { ActionForm, type FormController } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import type { OperatingPolicyCopy } from "./copy";

export type PolicyApprovalValues = { expectedHash: string; note: string; reviewed: string };
type Shared = { locale: string; copy: OperatingPolicyCopy; formCopy: FormCopy };
function labels(copy: OperatingPolicyCopy) {
  return Object.fromEntries(
    policyFormFields.map((key) => {
      const day = policyWeekdays.find((day) => key === day || key === `${day}State`);
      return [
        key,
        day
          ? `${copy.weekdays[day]} · ${key === day ? copy.ranges : copy.fields.calendarState}`
          : copy.fields[key as keyof typeof copy.fields],
      ];
    }),
  ) as Record<keyof PolicyFormValues, string>;
}
function Select({
  form,
  name,
  label,
  options,
}: {
  form: FormController<PolicyFormValues>;
  name: keyof PolicyFormValues;
  label: string;
  options: { value: string; label: string }[];
}) {
  const field = form.field(name);
  return (
    <div className={staffUi.field}>
      <label htmlFor={field.id}>{label}</label>
      <select
        {...field}
        disabled={field.readOnly}
        className={staffUi.control}
        aria-invalid={Boolean(field.error) || undefined}
        aria-describedby={field.error ? `${field.id}-error` : undefined}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {field.error ? <p id={`${field.id}-error`}>{field.error}</p> : null}
    </div>
  );
}
export function PolicyDraftForm({
  locale,
  copy,
  formCopy,
  initialState,
  action,
  owners,
}: Shared & {
  initialState: FormState<PolicyFormValues>;
  action: FormAction<PolicyFormValues>;
  owners: { id: string; displayName: string }[];
}) {
  const fieldLabels = labels(copy),
    path = `/${locale}/settings/operating-policy`;
  return (
    <ActionForm
      action={action}
      initialState={initialState}
      permalink={path}
      reconciliation={{
        href: `${path}/operations/save/${encodeURIComponent(initialState.operationId)}`,
        label: copy.check,
      }}
      copy={formCopy}
      labels={fieldLabels}
      submitLabel={copy.save}
      layout="full"
    >
      {(form) => (
        <div className={staffUi.form}>
          <details open className={staffUi.section}>
            <summary className="min-h-control cursor-pointer text-subheading font-semibold">
              {copy.calendar}
            </summary>
            <p className={staffUi.hint}>{copy.calendarHelp}</p>
            <Select
              form={form}
              name="calendarState"
              label={copy.fields.calendarState}
              options={[
                { value: "", label: copy.calendarUnknown },
                { value: "reviewed", label: copy.calendarReviewed },
              ]}
            />
            <div className={staffUi.formGrid}>
              {(["validFrom", "validUntil"] as const).map((key) => (
                <FormField key={key} {...form.field(key)} label={copy.fields[key]} type="date" />
              ))}
            </div>
            <FormField
              {...form.field("calendarSource")}
              label={copy.fields.calendarSource}
              maxLength={1500}
              multiline="wrap"
            />
            <p className={staffUi.hint}>{copy.rangesHelp}</p>
            {policyWeekdays.map((day) => (
              <div key={day} className={staffUi.formGrid}>
                <Select
                  form={form}
                  name={`${day}State`}
                  label={copy.weekdays[day]}
                  options={[
                    { value: "", label: copy.unknown },
                    { value: "closed", label: copy.closed },
                    { value: "open", label: copy.open },
                  ]}
                />
                <FormField
                  {...form.field(day)}
                  label={`${copy.weekdays[day]} · ${copy.ranges}`}
                  maxLength={110}
                />
              </div>
            ))}
            <FormField
              {...form.field("exceptions")}
              label={copy.fields.exceptions}
              hint={copy.exceptionsHelp}
              multiline
              maxLength={100000}
            />
          </details>
          <details className={staffUi.section}>
            <summary className="min-h-control cursor-pointer border-t border-divider pt-4 text-subheading font-semibold">
              {copy.coverageGroup}
            </summary>
            <FormField
              {...form.field("coverage")}
              label={copy.fields.coverage}
              multiline
              maxLength={1500}
            />
            {(["ownerService", "ownerPrivacy", "ownerAlerts"] as const).map((key) => (
              <Select
                key={key}
                form={form}
                name={key}
                label={copy.fields[key]}
                options={[
                  { value: "", label: copy.unknown },
                  ...(!owners.some((owner) => owner.id === form.values[key]) && form.values[key]
                    ? [{ value: form.values[key], label: copy.held }]
                    : []),
                  ...owners.map((owner) => ({ value: owner.id, label: owner.displayName })),
                ]}
              />
            ))}
          </details>
          <details className={staffUi.section}>
            <summary className="min-h-control cursor-pointer border-t border-divider pt-4 text-subheading font-semibold">
              {copy.referencesGroup}
            </summary>
            <p className={staffUi.hint}>{copy.referencesHelp}</p>
            {(
              [
                "purposeService",
                "purposeSavedSearch",
                "purposeMarketing",
                "retentionReference",
                "vendorReference",
              ] as const
            ).map((key) => (
              <FormField
                key={key}
                {...form.field(key)}
                label={copy.fields[key]}
                multiline="wrap"
                maxLength={1500}
              />
            ))}
          </details>
          <details className={staffUi.section}>
            <summary className="min-h-control cursor-pointer border-t border-divider pt-4 text-subheading font-semibold">
              {copy.controlsGroup}
            </summary>
            <p className={staffUi.hint}>{copy.controlsHelp}</p>
            {(["processReference", "alertReference"] as const).map((key) => (
              <FormField
                key={key}
                {...form.field(key)}
                label={copy.fields[key]}
                multiline="wrap"
                maxLength={1500}
              />
            ))}
            <div className={staffUi.formGrid}>
              {(["daysSales", "daysRent"] as const).map((key) => (
                <FormField
                  key={key}
                  {...form.field(key)}
                  label={copy.fields[key]}
                  type="number"
                  min={1}
                  max={key === "daysSales" ? 14 : 7}
                />
              ))}
            </div>
          </details>
        </div>
      )}
    </ActionForm>
  );
}
export function PolicyApprovalForm({
  locale,
  copy,
  formCopy,
  initialState,
  action,
}: Shared & {
  initialState: FormState<PolicyApprovalValues>;
  action: FormAction<PolicyApprovalValues>;
}) {
  const path = `/${locale}/settings/operating-policy`;
  return (
    <ActionForm
      action={action}
      initialState={initialState}
      permalink={path}
      reconciliation={{
        href: `${path}/operations/approve/${encodeURIComponent(initialState.operationId)}`,
        label: copy.check,
      }}
      copy={formCopy}
      labels={{ expectedHash: copy.technical, note: copy.note, reviewed: copy.reviewed }}
      submitLabel={copy.approve}
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
            {copy.reviewed}
          </label>
        </div>
      )}
    </ActionForm>
  );
}
