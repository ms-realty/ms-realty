"use client";
import type { ReactNode } from "react";
import { mediaModifications } from "@/domain/media";
import { controlClass, labelClass } from "@/ui/field-class";
import type { FormAction, FormCopy, FormState, RecoveryLink } from "@/ui/form/contract";
import { ActionForm } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";

export type MediaDetailsValues = Record<
  "caption" | "altText" | "modification" | "modificationDisclosure",
  string
>;

export function MediaDetailsEditor({
  action,
  initialState,
  path,
  formId,
  copy,
  labels,
  options,
  saveLabel,
  advancedLabel,
  secondaryActions,
}: {
  action: FormAction<MediaDetailsValues>;
  initialState: FormState<MediaDetailsValues> & { reconciliation: RecoveryLink };
  path: string;
  formId: string;
  copy: FormCopy;
  labels: MediaDetailsValues;
  options: Record<string, string>;
  saveLabel: string;
  advancedLabel: string;
  secondaryActions: ReactNode;
}) {
  return (
    <ActionForm
      action={action}
      initialState={initialState}
      permalink={path}
      reconciliation={initialState.reconciliation}
      labels={labels}
      copy={copy}
      submitLabel={saveLabel}
      formId={formId}
      layout="full"
      secondaryActions={secondaryActions}
    >
      {(form) => (
        <div className="grid gap-5">
          <FormField
            {...form.field("caption")}
            label={labels.caption}
            multiline="wrap"
            maxLength={2000}
          />
          <FormField
            {...form.field("altText")}
            label={labels.altText}
            multiline="wrap"
            maxLength={1000}
          />
          <details open={form.values.modification !== "none"}>
            <summary className="min-h-control cursor-pointer py-2 text-dense text-text-muted">
              {advancedLabel}
            </summary>
            <div className="mt-3 grid gap-4">
              <div className="grid gap-2">
                <label className={labelClass} htmlFor={form.field("modification").id}>
                  {labels.modification}
                </label>
                <select
                  id={form.field("modification").id}
                  name="modification"
                  value={form.values.modification}
                  onChange={form.field("modification").onChange}
                  disabled={form.field("modification").readOnly}
                  className={controlClass}
                >
                  {mediaModifications.map((value) => (
                    <option key={value} value={value}>
                      {options[value]}
                    </option>
                  ))}
                </select>
              </div>
              <FormField
                {...form.field("modificationDisclosure")}
                label={labels.modificationDisclosure}
                multiline="wrap"
                maxLength={2000}
              />
            </div>
          </details>
        </div>
      )}
    </ActionForm>
  );
}
