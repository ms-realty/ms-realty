// O26/F30 · AT45/UX23: native review, real local outcomes, explicit unresolved manual work.
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { readOperatingPolicySnapshot } from "@/domain/operating-policy";
import { erasureCategories, optionalProcessingPurposes } from "@/domain/privacy-erasure";
import type { Session } from "@/server/auth/sessions";
import { can } from "@/server/authz";
import {
  privacyErasureOperationStatus,
  readPrivacyErasureWorkbench,
} from "@/server/privacy/erasure";
import { controlClass, labelClass } from "@/ui/field-class";
import { NativeForm } from "@/ui/form/native-form";
import { Notice } from "@/ui/notice";
import { TechnicalDetails } from "@/ui/technical-details";
import { StaffPage, StaffPanel, StaffToolbar } from "../shell/staff-ui";
import { privacyErasureCopy } from "./erasure-copy";
import { Check, Submit, TextField } from "./forms";

export type ErasureQuery = {
  operation?: string;
  type?: string;
  version?: string;
  receipt?: string;
  error?: string;
};
export async function StaffPrivacyErasureScreen({
  locale,
  session,
  requestId,
  query,
}: {
  locale: string;
  session: Session;
  requestId: string;
  query: ErasureQuery;
}) {
  const db = getDb(),
    c = privacyErasureCopy(locale);
  const data = await readPrivacyErasureWorkbench(db, session, requestId);
  const path = `/${locale}/operations/privacy/${requestId}/erasure`;
  const canApply = await can(db, session.actor, "access.grant");
  const command = z
    .object({
      operation: z.uuid(),
      type: z.enum(["apply", "complete"]),
      version: z.coerce.number().int().positive(),
    })
    .safeParse(query);
  // A visible issued key survives refresh, back navigation and a lost POST response.
  if (!command.success)
    redirect(`${path}?operation=${randomUUID()}&type=apply&version=${data.request.version}`);
  const issued = command.data;
  const status = canApply
    ? await privacyErasureOperationStatus(db, session, {
        requestId,
        operationId: issued.operation,
        type: issued.type,
        expectedVersion: issued.version,
      })
    : null;
  const latest = data.decisions[0];
  const policy = readOperatingPolicySnapshot(data.inventory.policy);
  const policyPermitsReview = Boolean(
    policy?.document.retentionReference &&
      policy.document.contactPurposes.savedSearch &&
      policy.document.contactPurposes.marketing,
  );
  const formReady =
    canApply &&
    status === "absent" &&
    issued.version === data.request.version &&
    ["in_progress", "on_legal_hold"].includes(data.request.state);
  const action = `${path}/submit?${new URLSearchParams({ operation: issued.operation, type: issued.type, version: String(issued.version) })}`;
  const envelope = (
    <>
      <input type="hidden" name="operationId" value={issued.operation} />
      <input type="hidden" name="expectedVersion" value={issued.version} />
    </>
  );
  return (
    <StaffPage
      title={c.title}
      reference={data.request.reference}
      lead={c.lead}
      actions={<a href={`/${locale}/operations/privacy`}>{c.queue}</a>}
    >
      <Notice tone="info">{c.partialHelp}</Notice>
      {!policyPermitsReview ? <Notice tone="info">{c.policyUnknown}</Notice> : null}
      {query.error ? <Notice tone="error">{c.error}</Notice> : null}
      {status ? (
        <Notice tone={status === "succeeded" ? "success" : "info"}>{c.statuses[status]}</Notice>
      ) : null}
      {!canApply ? <Notice tone="info">{c.accessRequired}</Notice> : null}
      {data.inventory.retentionHold ? <Notice tone="info">{c.retentionHold}</Notice> : null}
      {data.inventory.businessDependencies ? <Notice tone="info">{c.businessHold}</Notice> : null}
      <StaffToolbar>
        <a
          href={`${path}?${new URLSearchParams({ operation: issued.operation, type: issued.type, version: String(issued.version) })}`}
        >
          {c.checkResult}
        </a>
        {status && ["succeeded", "failed", "absent"].includes(status) ? (
          <a href={path}>{c.refresh}</a>
        ) : null}
      </StaffToolbar>
      {formReady && issued.type === "apply" ? (
        <StaffPanel title={c.reviewTitle} lead={c.reviewHelp}>
          <NativeForm method="post" action={action} className="grid gap-5">
            {envelope}
            <input type="hidden" name="intent" value="apply" />
            <input type="hidden" name="inventoryDigest" value={data.inventoryDigest} />
            <fieldset className="grid gap-2">
              <legend>{c.purposes}</legend>
              {optionalProcessingPurposes.map((purpose) => (
                <label key={purpose} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1 size-5"
                    name="purpose"
                    value={purpose}
                    defaultChecked
                  />
                  <span>{c.purposeNames[purpose]}</span>
                </label>
              ))}
            </fieldset>
            {erasureCategories.map((category) => {
              const sources = data.inventory.sources.filter((row) => row.category === category);
              const mandatory = category === "optional_processing" || category === "client_access";
              const disposition =
                category === "optional_processing" ? "restrict_processing" : "revoke_client_access";
              return (
                <fieldset
                  key={category}
                  className="grid gap-3 rounded-panel border border-divider p-4"
                >
                  <legend>{c.categories[category]}</legend>
                  {sources.map((source) => (
                    <input
                      key={source.key}
                      type="hidden"
                      name={`source:${category}`}
                      value={source.key}
                    />
                  ))}
                  <p>{sources.every((source) => source.eligible) ? c.eligible : c.heldCopies}</p>
                  {sources.length ? (
                    <details>
                      <summary className="min-h-control cursor-pointer py-2">
                        {c.sourcePreview}
                      </summary>
                      {sources.map((source) => (
                        <pre
                          key={source.key}
                          className="max-w-full overflow-x-auto whitespace-pre-wrap break-all"
                          dir="auto"
                        >
                          {JSON.stringify(
                            data.sourcePreviews.find((preview) => preview.key === source.key)
                              ?.value,
                            null,
                            2,
                          )}
                        </pre>
                      ))}
                    </details>
                  ) : null}
                  {mandatory ? (
                    <>
                      <p>{c.dispositions[disposition]}</p>
                      <input type="hidden" name={`disposition:${category}`} value={disposition} />
                      <input
                        type="hidden"
                        name={`classification:${category}`}
                        value={
                          category === "client_access" ? "account_credentials" : "optional_only"
                        }
                      />
                    </>
                  ) : (
                    <>
                      <label className="grid gap-2">
                        <span className={labelClass}>{c.disposition}</span>
                        <select
                          className={controlClass}
                          name={`disposition:${category}`}
                          defaultValue="hold_unknown"
                        >
                          <option value="hold_unknown">{c.dispositions.hold_unknown}</option>
                          <option value="retain_restricted">
                            {c.dispositions.retain_restricted}
                          </option>
                          <option
                            value="erase_optional_copy"
                            disabled={
                              !policyPermitsReview || !sources.every((source) => source.eligible)
                            }
                          >
                            {c.dispositions.erase_optional_copy}
                          </option>
                        </select>
                      </label>
                      <label className="grid gap-2">
                        <span className={labelClass}>{c.classification}</span>
                        <select
                          className={controlClass}
                          name={`classification:${category}`}
                          defaultValue="unknown"
                        >
                          <option value="unknown">{c.classifications.unknown}</option>
                          <option value="retained_business">
                            {c.classifications.retained_business}
                          </option>
                          <option value="optional_only">{c.classifications.optional_only}</option>
                        </select>
                      </label>
                    </>
                  )}
                  <TextField name={`evidence:${category}`} label={c.evidence} required />
                </fieldset>
              );
            })}
            <Check name="confirmed">{c.confirm}</Check>
            <Submit>{c.apply}</Submit>
          </NativeForm>
        </StaffPanel>
      ) : null}
      {latest ? (
        <StaffPanel title={c.outcome} lead={c.localApplied}>
          {data.events
            .filter((event) => event.decisionSequence === latest.sequence)
            .map((event) => (
              <p key={event.id}>
                {c.boundaries[event.boundary as keyof typeof c.boundaries]} ·{" "}
                {c.states[event.state as keyof typeof c.states]}
              </p>
            ))}
          <p>{c.manual}</p>
          <a
            href={`${path}?operation=${randomUUID()}&type=complete&version=${data.request.version}`}
          >
            {c.completionCheck}
          </a>
          {formReady && issued.type === "complete" ? (
            <NativeForm method="post" action={action}>
              {envelope}
              <input type="hidden" name="intent" value="complete" />
              <input type="hidden" name="sequence" value={latest.sequence} />
              <input type="hidden" name="digest" value={latest.digest} />
              <Check name="confirmed">{c.confirmCheck}</Check>
              <Submit>{c.completionCheck}</Submit>
            </NativeForm>
          ) : null}
          <TechnicalDetails locale={locale}>
            <p>{data.inventoryDigest}</p>
            <p>{latest.digest}</p>
          </TechnicalDetails>
        </StaffPanel>
      ) : null}
    </StaffPage>
  );
}
