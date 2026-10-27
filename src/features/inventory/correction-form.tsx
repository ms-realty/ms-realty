"use client";
import { isPublicLocale } from "@/i18n/config";
import { workflowLabel } from "@/i18n/workflow-labels";
import type { CorrectionImpactItem } from "@/server/inventory/corrections";
import { DateTimeField } from "@/ui/date-time-field";
import { controlClass } from "@/ui/field-class";
import type { FormAction, FormState, FormValues } from "@/ui/form/contract";
import { ActionForm } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import { TechnicalDetails } from "@/ui/technical-details";
import { staffWorkflowCopy } from "../work/workflow-completion-copy";
import { inventoryCopy } from "./copy";

export function CorrectionForm({
  locale,
  reference,
  mode,
  items,
  initialState,
  action,
}: {
  locale: string;
  reference: string;
  mode: "open" | "reconcile";
  items: CorrectionImpactItem[];
  initialState: FormState<FormValues>;
  action: FormAction<FormValues>;
}) {
  const copy = staffWorkflowCopy(locale).correction;
  const path = `/${locale}/inventory/${reference}/correction`;
  return (
    <ActionForm
      action={action}
      initialState={initialState}
      permalink={path}
      nativeIdentity={`correction:${reference}:${mode}`}
      copy={inventoryCopy(locale).form}
      labels={{
        sourceReference: copy.source,
        disputedFact: copy.fact,
        urgency: copy.urgency,
        reviewed: mode === "open" ? copy.confirmOpen : copy.confirmReconcile,
        followUpAt: copy.followUp,
      }}
      submitLabel={mode === "open" ? copy.open : copy.reconcile}
      reconciliation={{
        href: `${path}/operations?type=${mode}&key=${encodeURIComponent(initialState.operationId)}`,
        label: copy.check,
      }}
    >
      {(form) => (
        <>
          <input type="hidden" name="impactHash" value={form.values.impactHash} />
          <input type="hidden" name="items" value={JSON.stringify(items.map((item) => item.key))} />
          {mode === "open" ? (
            <>
              <FormField
                {...form.field("sourceReference")}
                label={copy.source}
                required
                maxLength={1000}
              />
              <FormField
                {...form.field("disputedFact")}
                label={copy.fact}
                multiline
                required
                maxLength={2000}
              />
              <label className="block space-y-2">
                <span className="font-semibold">{copy.urgency}</span>
                <select
                  name="urgency"
                  required
                  value={form.values.urgency}
                  onChange={form.field("urgency").onChange}
                  disabled={form.field("urgency").readOnly}
                  className={controlClass}
                >
                  <option value="">{copy.choose}</option>
                  <option value="urgent">{copy.urgent}</option>
                  <option value="normal">{copy.normal}</option>
                </select>
              </label>
            </>
          ) : (
            <>
              {items.map((item, index) => (
                <fieldset
                  key={item.key}
                  className="space-y-3 rounded-control border border-divider p-4"
                >
                  <legend className="px-2 font-semibold">
                    {copy.kinds[item.kind]} · <bdi>{item.reference}</bdi>
                  </legend>
                  <p>{workflowLabel(item.state, locale)}</p>
                  {!item.ready ? (
                    <p className="text-dense text-text-muted">{copy.pending}</p>
                  ) : null}
                  <label className="block space-y-2">
                    <span className="font-semibold">{copy.choose}</span>
                    <select
                      name={`state_${index}`}
                      value={form.values[`state_${index}`] ?? ""}
                      onChange={form.field(`state_${index}`).onChange}
                      disabled={form.field(`state_${index}`).readOnly}
                      required
                      className={controlClass}
                    >
                      <option value="">{copy.choose}</option>
                      {item.ready ? <option value="verified">{copy.verified}</option> : null}
                      <option value="unresolved">{copy.unresolved}</option>
                    </select>
                  </label>
                  <FormField
                    {...form.field(`evidence_${index}`)}
                    label={copy.evidence}
                    multiline
                    required
                    maxLength={1500}
                  />
                  <TechnicalDetails locale={locale}>
                    <bdi>
                      {item.state} · {item.recordId} · {item.revision}
                    </bdi>
                  </TechnicalDetails>
                </fieldset>
              ))}
              <DateTimeField
                {...form.field("followUpAt")}
                label={copy.followUp}
                locale={isPublicLocale(locale) ? locale : "bg"}
                onValueChange={(value) => form.setValue("followUpAt", value)}
                required={items.some((_, index) => form.values[`state_${index}`] === "unresolved")}
              />
            </>
          )}
          <label className="flex min-h-control items-start gap-3">
            <input
              type="checkbox"
              name="reviewed"
              value="yes"
              checked={form.values.reviewed === "yes"}
              onChange={(event) => form.setValue("reviewed", event.target.checked ? "yes" : "")}
              disabled={form.field("reviewed").readOnly}
              required
            />
            <span>{mode === "open" ? copy.confirmOpen : copy.confirmReconcile}</span>
          </label>
        </>
      )}
    </ActionForm>
  );
}
