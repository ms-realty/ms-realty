"use client";

import { type ReactNode, useEffect, useState } from "react";
import type { FormAction, FormCopy, FormState, RecoveryLink } from "@/ui/form/contract";
import { ActionForm } from "@/ui/form/form";
import type { MediaReviewValues } from "./media-review-editor";

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
      onSubmitCapture={(event) => {
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
      : {
          kind: "unknown",
          code: "OUTCOME_UNKNOWN",
          message: copy.unknown,
          status,
        },
  };
  return (
    <ActionForm
      action={action}
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
      {() => (
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
          <dl className="grid gap-3 text-dense">
            {fields
              .filter((name) => kind === "review" || fields.indexOf(name) < 4)
              .map((name) => (
                <div key={name}>
                  <dt className="font-semibold">{labels[name]}</dt>
                  <dd className="whitespace-pre-wrap break-words">{draft.values[name]}</dd>
                  <input type="hidden" name={name} value={draft.values[name]} />
                </div>
              ))}
          </dl>
        </>
      )}
    </ActionForm>
  );
}
