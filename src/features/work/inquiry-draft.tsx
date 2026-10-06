"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { FormState, FormValues } from "@/ui/form/contract";
import { ActionForm, type ActionFormProps, type FormSnapshot } from "@/ui/form/form";
import {
  claimInquiryDraftOwner,
  type InquiryDraftKind,
  type InquiryDraftOwner,
  readInquiryDraft,
  reconcileInquiryDraft,
  retainInquiryDraft,
} from "./inquiry-draft-storage";

/** Also fences drafts when the new actor opens the queue before opening a conversation. */
export function InquiryDraftBoundary({ owner }: { owner: InquiryDraftOwner }) {
  useLayoutEffect(() => {
    claimInquiryDraftOwner(owner);
  }, [owner]);
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
  }, [owner, id, kind, operationId, outcome]);
  return null;
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
  const container = useRef<HTMLDivElement>(null);
  const ready = useRef(false);
  const firstSnapshot = useRef<FormSnapshot<V> | null>(null);
  const [restored, setRestored] = useState<FormState<V> | null>(null);
  const [cannotRetain, setCannotRetain] = useState(false);
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
    if (retained?.operation) {
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
      const dirty =
        snapshot.pending ||
        ["unknown", "accepted"].includes(snapshot.state.outcome.kind) ||
        Object.keys(initial.values).some((name) => snapshot.values[name] !== initial.values[name]);
      const retained = retainInquiryDraft(owner, id, kind, initial, snapshot);
      setCannotRetain(snapshot.state.outcome.kind !== "confirmed" && dirty && !retained);
    },
    [owner, id, kind, initial],
  );
  useLayoutEffect(() => {
    if (!cannotRetain) return;
    // Storage can be disabled or full. In that case a full navigation asks before loss.
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [cannotRetain]);
  return (
    <div ref={container}>
      <ActionForm
        {...props}
        key={`${owner.id}:${id}:${kind}:${restored ? "restored" : "initial"}`}
        initialState={restored ?? initial}
        onSnapshot={onSnapshot}
      />
    </div>
  );
}
