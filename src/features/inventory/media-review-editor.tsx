"use client";

import { fileLabel, type filesCopy } from "@/features/files/copy";
import type { workflowCopy } from "@/i18n/workflow-copy";
import { buttonClass } from "@/ui/button-class";
import type { FormAction, FormCopy, FormState, RecoveryLink } from "@/ui/form/contract";
import { ActionForm } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import type { MediaDetailsValues } from "./media-details-editor";

export type MediaReviewValues = MediaDetailsValues &
  Record<"rightsHolder" | "rightsReference" | "privacyReviewed" | "rightsConfirmed", string>;

/** O13: failed reviews return safe text through React's native form state. A conflict shows
 * the reviewed and current text; fresh confirmations precede any new human decision. */
export function MediaReviewEditor({
  action,
  initialState,
  path,
  copy,
  workspace,
  formCopy,
  ready,
  recordedRights,
}: {
  action: FormAction<MediaReviewValues>;
  initialState: FormState<MediaReviewValues> & { reconciliation: RecoveryLink };
  path: string;
  copy: ReturnType<typeof filesCopy>;
  workspace: ReturnType<typeof workflowCopy<"listingWorkspace">>;
  formCopy: FormCopy;
  ready: boolean;
  recordedRights: boolean;
}) {
  return (
    <ActionForm
      action={action}
      initialState={initialState}
      permalink={path}
      nativeIdentity="photo-review"
      formId="photo-review-form"
      commandAvailable={ready}
      reconciliation={initialState.reconciliation}
      copy={{ ...formCopy, reapply: copy.approve }}
      labels={{
        caption: copy.caption,
        altText: copy.altText,
        modification: copy.modification,
        modificationDisclosure: copy.disclosure,
        rightsHolder: copy.rightsHolder,
        rightsReference: copy.rightsReference,
        privacyReviewed: copy.privacy,
        rightsConfirmed: copy.rightsCheck,
      }}
      formatValue={(name, value) => (name === "modification" ? fileLabel(copy, value) : value)}
      submitLabel={copy.approve}
      layout="full"
    >
      {(form) => {
        const details =
          form.state.outcome.kind === "conflict" && form.state.outcome.latest
            ? form.state.outcome.latest.values
            : form.values;
        const permissions = (
          <>
            <FormField {...form.field("rightsHolder")} label={copy.rightsHolder} maxLength={300} />
            <FormField
              {...form.field("rightsReference")}
              label={copy.rightsReference}
              maxLength={1000}
            />
          </>
        );
        return (
          <div className="grid gap-4">
            {(["caption", "altText", "modification", "modificationDisclosure"] as const).map(
              (name) => (
                <input key={name} type="hidden" name={name} value={details[name]} />
              ),
            )}
            <p className="text-dense text-text-muted">{workspace.reviewHint}</p>
            <dl className="grid gap-3 text-dense">
              <div>
                <dt className="font-semibold">{copy.caption}</dt>
                <dd className="whitespace-pre-wrap text-text-muted">
                  {details.caption || copy.none}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">{copy.altText}</dt>
                <dd className="whitespace-pre-wrap text-text-muted">
                  {details.altText || copy.none}
                </dd>
              </div>
              {details.modification !== "none" ? (
                <>
                  <div>
                    <dt className="font-semibold">{copy.modification}</dt>
                    <dd>{fileLabel(copy, details.modification)}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">{copy.disclosure}</dt>
                    <dd className="whitespace-pre-wrap text-text-muted">
                      {details.modificationDisclosure || copy.none}
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
            {recordedRights ? (
              <>
                <dl className="grid gap-3 text-dense">
                  <div>
                    <dt className="font-semibold">{copy.rightsHolder}</dt>
                    <dd>{initialState.values.rightsHolder}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">{copy.rightsReference}</dt>
                    <dd>{initialState.values.rightsReference}</dd>
                  </div>
                </dl>
                <details open={form.state.outcome.kind !== "idle" || undefined}>
                  <summary className="min-h-control cursor-pointer py-2 text-dense text-action">
                    {workspace.editPermissions}
                  </summary>
                  <div className="grid gap-4 pt-3">{permissions}</div>
                </details>
              </>
            ) : (
              permissions
            )}
            {(
              [
                ["privacyReviewed", copy.privacy],
                ["rightsConfirmed", copy.rightsCheck],
              ] as const
            ).map(([name, label]) => (
              <label key={name} className="flex items-start gap-2" htmlFor={form.field(name).id}>
                <input
                  id={form.field(name).id}
                  className="mt-1 size-5"
                  type="checkbox"
                  name={name}
                  value="yes"
                  checked={form.values[name] === "yes"}
                  disabled={form.field(name).readOnly}
                  onChange={(event) => form.setValue(name, event.target.checked ? "yes" : "")}
                />
                <span>{label}</span>
              </label>
            ))}
            {!details.altText.trim() ||
            (details.modification !== "none" && !details.modificationDisclosure.trim()) ? (
              <p className="text-dense text-warning">{workspace.reviewNeedsDetails}</p>
            ) : null}
            {!form.field("rightsHolder").readOnly ? (
              <details className="border-t border-divider pt-3">
                <summary className="min-h-control cursor-pointer py-2 text-dense text-error">
                  {copy.reject}
                </summary>
                <button
                  type="submit"
                  name="_decision"
                  value="reject"
                  formNoValidate
                  className={buttonClass("destructive")}
                >
                  {copy.reject}
                </button>
              </details>
            ) : null}
          </div>
        );
      }}
    </ActionForm>
  );
}
