"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormState, FormValues } from "@/ui/form/contract";
import { ActionForm, type ActionFormProps, type FormSnapshot } from "@/ui/form/form";
import {
  claimInquiryDraftOwner,
  type InquiryDraftKind,
  type InquiryDraftOwner,
  ownsInquiryDrafts,
  readInquiryDraft,
  reconcileInquiryDraft,
  retainInquiryDraft,
} from "./inquiry-draft-storage";
import {
  acknowledgeInquiryReference,
  browserInquiryReference,
  type InquiryReferenceState,
  inquiryEnhancedField,
  inquiryReferenceCookie,
} from "./inquiry-reference";

/** Also fences drafts when the new actor opens the queue before opening a conversation. */
export function InquiryDraftBoundary({
  owner,
  resolutions,
}: {
  owner: InquiryDraftOwner;
  resolutions?: {
    kind: InquiryDraftKind;
    key: string;
    status: "succeeded" | "failed";
    id: string;
  }[];
}) {
  useLayoutEffect(() => {
    claimInquiryDraftOwner(owner);
    for (const resolution of resolutions ?? []) {
      reconcileInquiryDraft(
        owner,
        resolution.id,
        resolution.kind,
        resolution.key,
        resolution.status,
      );
      acknowledgeInquiryReference(
        inquiryReferenceCookie(owner.id, resolution.id, resolution.kind),
        resolution.key,
      );
    }
  }, [owner, resolutions]);
  return null;
}

export function InquiryDraftReconciliation({
  owner,
  id,
  kind,
  operationId,
  outcome,
}: {
  owner: InquiryDraftOwner;
  id: string;
  kind: InquiryDraftKind;
  operationId: string;
  outcome: "succeeded" | "failed";
}) {
  useLayoutEffect(() => {
    claimInquiryDraftOwner(owner);
    reconcileInquiryDraft(owner, id, kind, operationId, outcome);
    acknowledgeInquiryReference(inquiryReferenceCookie(owner.id, id, kind), operationId);
  }, [owner, id, kind, operationId, outcome]);
  return null;
}

/** The authorized terminal body is an acknowledgment once rendered. Before hydration the
 * native form still verifies the receipt on the server; afterward the return stays in SPA. */
export function InquiryConfirmedReturn({
  href,
  label,
  className,
  action,
}: {
  href: string;
  label: string;
  className: string;
  action: (data: FormData) => void | Promise<void>;
}) {
  const [observed, setObserved] = useState(false);
  useLayoutEffect(() => setObserved(true), []);
  return observed ? (
    <Link href={href} className={className}>
      {label}
    </Link>
  ) : (
    <form action={action}>
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}

type InquiryDraftFormProps<V extends FormValues> = ActionFormProps<V> & {
  owner: InquiryDraftOwner;
  id: string;
  kind: InquiryDraftKind;
};

export function InquiryDraftForm<V extends FormValues>(props: InquiryDraftFormProps<V>) {
  return <InquiryDraftSession key={`${props.owner.id}:${props.id}:${props.kind}`} {...props} />;
}

function InquiryDraftSession<V extends FormValues>({
  owner,
  id,
  kind,
  ...props
}: InquiryDraftFormProps<V>) {
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const ready = useRef(false);
  const firstSnapshot = useRef<FormSnapshot<V> | null>(null);
  const [restored, setRestored] = useState<FormState<V> | null>(null);
  const [confirmedStatus, setConfirmedStatus] = useState<string | null>(null);
  const initial = props.initialState;
  useLayoutEffect(() => {
    if (ready.current) return;
    claimInquiryDraftOwner(owner);
    // An HTML POST response wins over an older local draft, including its receipt/errors.
    const native = firstSnapshot.current?.state;
    const initialResponse = native && native.responseId !== initial.responseId ? native : initial;
    const retained =
      initialResponse.outcome.kind === "idle" ? readInquiryDraft(owner, id, kind, initial) : null;
    const values = { ...initialResponse.values, ...retained?.values } as V;
    // Preserve edits made to the server-rendered controls before hydration, too.
    const form = container.current?.querySelector("form");
    for (const name of Object.keys(initial.values)) {
      const control = form?.elements.namedItem(name);
      if (
        control instanceof HTMLInputElement ||
        control instanceof HTMLTextAreaElement ||
        control instanceof HTMLSelectElement
      ) {
        const value =
          control instanceof HTMLInputElement && control.type === "checkbox"
            ? control.checked
              ? control.value
              : ""
            : control.value;
        if (value !== initial.values[name]) values[name as keyof V] = value as V[keyof V];
      }
    }
    const state: FormState<V> = { ...initialResponse, values };
    const retryOperationId = (initial as FormState<V> & InquiryReferenceState)
      .inquiryRetryOperationId;
    if (retryOperationId && "reviewed" in values) (values as FormValues).reviewed = "";
    if (retained?.operation && retryOperationId !== retained.operation.id) {
      const status = {
        href: `${props.permalink}/operations?type=${kind}&key=${encodeURIComponent(retained.operation.id)}`,
        label: props.reconciliation.label,
      };
      Object.assign(state, {
        operationId: retained.operation.id,
        expectedRevision: retained.operation.revision,
        reconciliation: status,
        outcome: { kind: "unknown", code: "OUTCOME_UNKNOWN", message: props.copy.unknown, status },
      });
    }
    ready.current = true;
    setRestored(state);
  }, [owner, id, kind, initial, props.permalink, props.reconciliation.label, props.copy.unknown]);
  const onSnapshot = useCallback(
    (snapshot: FormSnapshot<V>) => {
      if (!ready.current) {
        firstSnapshot.current = snapshot;
        return;
      }
      retainInquiryDraft(owner, id, kind, initial, snapshot);
      const acknowledgment = (snapshot.state as FormState<V> & InquiryReferenceState)
        .inquiryReferenceToAcknowledge;
      if (!snapshot.pending && acknowledgment && ownsInquiryDrafts(owner))
        acknowledgeInquiryReference(inquiryReferenceCookie(owner.id, id, kind), acknowledgment);
      if (
        !snapshot.pending &&
        snapshot.state.outcome.kind === "confirmed" &&
        ownsInquiryDrafts(owner)
      ) {
        acknowledgeInquiryReference(
          inquiryReferenceCookie(owner.id, id, kind),
          snapshot.state.operationId,
        );
        if (kind === "contact" || kind === "accept")
          setConfirmedStatus(snapshot.state.reconciliation?.href ?? props.reconciliation.href);
      }
    },
    [owner, id, kind, initial, props.reconciliation.href],
  );
  useEffect(() => {
    // The client has processed the confirmed body before moving to its authorized status.
    if (confirmedStatus) router.push(confirmedStatus);
  }, [confirmedStatus, router]);
  return (
    <div
      ref={container}
      onSubmitCapture={(event) => {
        const reference = browserInquiryReference(inquiryReferenceCookie(owner.id, id, kind));
        const form = event.target instanceof HTMLFormElement ? event.target : null;
        const current = form?.elements.namedItem("_operationId");
        if (
          reference?.status === "pending" &&
          current instanceof HTMLInputElement &&
          reference.key !== current.value
        ) {
          // A previously opened tab must not overwrite an unresolved reference from another tab.
          event.preventDefault();
          event.stopPropagation();
          location.assign(
            `${props.permalink}/operations?type=${kind}&key=${encodeURIComponent(reference.key)}`,
          );
          return;
        }
        const enhanced = form?.elements.namedItem(inquiryEnhancedField);
        if (enhanced instanceof HTMLInputElement) enhanced.value = "yes";
      }}
    >
      <ActionForm
        {...props}
        key={`${owner.id}:${id}:${kind}:${restored ? "restored" : "initial"}`}
        initialState={restored ?? initial}
        onSnapshot={onSnapshot}
        pendingReferenceCookie={inquiryReferenceCookie(owner.id, id, kind)}
      >
        {(form) => (
          <>
            <input type="hidden" name={inquiryEnhancedField} defaultValue="" />
            {props.children(form)}
          </>
        )}
      </ActionForm>
    </div>
  );
}
