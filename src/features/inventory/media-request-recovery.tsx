"use client";

import { type ReactNode, useEffect, useState } from "react";
import { mediaModifications } from "@/domain/media";
import { controlClass, labelClass } from "@/ui/field-class";
import type { FormAction, FormCopy, FormState, RecoveryLink } from "@/ui/form/contract";
import { ActionForm } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import type { MediaReviewValues } from "./media-review-editor";
import { MediaReviewGuard } from "./media-workbench";

const fields = [
  "caption",
  "altText",
  "modification",
  "modificationDisclosure",
  "rightsHolder",
  "rightsReference",
  "privacyReviewed",
  "rightsConfirmed",
] as const;
type Kind = "details" | "review";
type Draft = {
  kind: Kind;
  operationId: string;
  expectedRevision: number;
  values: MediaReviewValues;
  decision: "approve" | "reject";
  discard: boolean;
};

/** Only safe text and the exact command envelope stay in this actor/listing/photo's tab.
 * Never retain React action tokens, cookies, files, or unrelated form fields. */
export function MediaRequestKeeper({
  storageKey,
  acknowledgedKey,
  children,
}: {
  storageKey: string;
  acknowledgedKey?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (acknowledgedKey) {
      try {
        sessionStorage.removeItem(`${storageKey}:${acknowledgedKey}`);
      } catch {}
    }
  }, [storageKey, acknowledgedKey]);
  return (
    <div
      onSubmit={(event) => {
        // Bubble after ActionForm has rejected a duplicate pending submission.
        if (event.defaultPrevented) return;
        const form = event.target;
        if (!(form instanceof HTMLFormElement)) return;
        const kind =
          form.id === "photo-details-form"
            ? "details"
            : form.id === "photo-review-form"
              ? "review"
              : null;
        if (!kind) return;
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        const data = new FormData(form, submitter);
        if (data.has("_leave") || data.has("_mediaHidden")) return;
        const reapply = data.get("_intent") === "reapply" || data.get("_decision") === "reapply";
        const operationId = String(
          data.get(reapply ? "_reapplyOperationId" : "_operationId") ?? "",
        );
        const expectedRevision = Number(
          data.get(reapply ? "_reapplyRevision" : "_expectedRevision"),
        );
        if (!operationId || !Number.isSafeInteger(expectedRevision)) return;
        const draft: Draft = {
          kind,
          operationId,
          expectedRevision,
          values: Object.fromEntries(
            fields.map((name) => [name, String(data.get(name) ?? "")]),
          ) as MediaReviewValues,
          decision:
            data.get("_decision") === "reject" || data.get("_decision") === "reapply"
              ? "reject"
              : "approve",
          discard: data.get("_detailsAction") === "discard",
        };
        try {
          sessionStorage.setItem(`${storageKey}:${operationId}`, JSON.stringify(draft));
        } catch {}
      }}
    >
      {children}
    </div>
  );
}

function readDraft(storageKey: string, operationId: string, kind: Kind): Draft | null {
  try {
    const data = JSON.parse(
      sessionStorage.getItem(`${storageKey}:${operationId}`) ?? "null",
    ) as Draft | null;
    if (
      !data ||
      data.operationId !== operationId ||
      data.kind !== kind ||
      !Number.isSafeInteger(data.expectedRevision) ||
      data.expectedRevision < 0 ||
      !["approve", "reject"].includes(data.decision) ||
      typeof data.discard !== "boolean" ||
      !data.values ||
      fields.some(
        (name) => typeof data.values[name] !== "string" || data.values[name].length > 2000,
      )
    )
      return null;
    return {
      ...data,
      values: Object.fromEntries(
        fields.map((name) => [name, data.values[name]]),
      ) as MediaReviewValues,
    };
  } catch {
    return null;
  }
}

/** A missing readback permits only an explicit retry of the retained command. Pending and
 * unmatched results expose the same read-only text without a mutation control. */
export function MediaRequestRecovery({
  storageKey,
  operationId,
  kind,
  missing,
  action,
  status,
  labels,
  copy,
  retryLabel,
  commands,
  modifications,
  guard,
  failedMessage,
}: {
  storageKey: string;
  operationId: string;
  kind: Kind;
  missing: boolean;
  action: FormAction<MediaReviewValues>;
  status: RecoveryLink;
  labels: Record<keyof MediaReviewValues, string>;
  copy: FormCopy;
  retryLabel: string;
  commands: { details: string; discard: string; approve: string; reject: string };
  modifications: Record<string, string>;
  guard: { title: string; body: string; stay: string; discard: string };
  failedMessage?: string;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(
    () => setDraft(readDraft(storageKey, operationId, kind)),
    [storageKey, operationId, kind],
  );
  if (!draft) return null;
  const initialState: FormState<MediaReviewValues> = {
    operationId,
    expectedRevision: draft.expectedRevision,
    values: draft.values,
    responseId: operationId,
    reconciliation: status,
    outcome: missing
      ? { kind: "idle" }
      : failedMessage
        ? { kind: "rejected", code: "REQUEST_FAILED", message: failedMessage, retryable: false }
        : {
            kind: "unknown",
            code: "OUTCOME_UNKNOWN",
            message: copy.unknown,
            status,
          },
  };
  return (
    <MediaRequestKeeper storageKey={storageKey}>
      <MediaReviewGuard copy={guard} requireAcknowledgment>
        <ActionForm
          action={action}
          formId={kind === "review" ? "photo-review-form" : "photo-details-form"}
          initialState={initialState}
          permalink={status.href}
          nativeIdentity="retained-photo-request"
          commandAvailable={missing}
          reconciliation={status}
          labels={labels}
          copy={copy}
          submitLabel={retryLabel}
          layout="full"
        >
          {(form) => (
            <>
              <input
                type="hidden"
                name="_decision"
                value={draft.decision === "reject" ? "reject" : ""}
              />
              <input type="hidden" name="_detailsAction" value={draft.discard ? "discard" : ""} />
              <p className="font-semibold">
                {draft.kind === "review"
                  ? commands[draft.decision]
                  : draft.discard
                    ? commands.discard
                    : commands.details}
              </p>
              <div className="grid gap-3 text-dense">
                {fields
                  .filter((name) => kind === "review" || fields.indexOf(name) < 4)
                  .map((name) =>
                    form.state.outcome.kind === "validation" &&
                    (kind === "details" || fields.indexOf(name) >= 4) ? (
                      <div key={name}>
                        {name === "privacyReviewed" || name === "rightsConfirmed" ? (
                          <label className="flex items-start gap-2">
                            <input
                              id={form.field(name).id}
                              type="checkbox"
                              name={name}
                              value="yes"
                              checked={form.values[name] === "yes"}
                              disabled={form.field(name).readOnly}
                              onChange={(event) =>
                                form.setValue(name, event.target.checked ? "yes" : "")
                              }
                            />
                            {labels[name]}
                          </label>
                        ) : name === "modification" ? (
                          <>
                            <label className={labelClass} htmlFor={form.field(name).id}>
                              {labels[name]}
                            </label>
                            <select
                              id={form.field(name).id}
                              name={name}
                              value={form.values[name]}
                              disabled={form.field(name).readOnly}
                              className={controlClass}
                              onChange={form.field(name).onChange}
                            >
                              {mediaModifications.map((value) => (
                                <option key={value} value={value}>
                                  {modifications[value]}
                                </option>
                              ))}
                            </select>
                          </>
                        ) : (
                          <FormField
                            {...form.field(name)}
                            label={labels[name]}
                            multiline="wrap"
                            maxLength={2000}
                          />
                        )}
                      </div>
                    ) : (
                      <dl key={name}>
                        <dt className="font-semibold">{labels[name]}</dt>
                        <dd className="whitespace-pre-wrap break-words">{form.values[name]}</dd>
                        <input type="hidden" name={name} value={form.values[name]} />
                      </dl>
                    ),
                  )}
              </div>
            </>
          )}
        </ActionForm>
      </MediaReviewGuard>
    </MediaRequestKeeper>
  );
}
