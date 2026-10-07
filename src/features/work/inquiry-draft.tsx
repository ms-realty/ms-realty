"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { errorClass, fieldClass } from "@/ui/field-class";
import type { FormAction, FormState, FormValues } from "@/ui/form/contract";
import { ActionForm, type ActionFormProps, type FormSnapshot } from "@/ui/form/form";
import { Notice } from "@/ui/notice";
import {
  claimInquiryDraftOwner,
  type InquiryDraftKind,
  type InquiryDraftOwner,
  ownsInquiryDrafts,
  readInquiryDraft,
  reconcileInquiryDraft,
  releaseInquiryDraftOwner,
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

/** The signed-out page also fences a native sign-out that happened before hydration. */
export function SignedOutInquiryDraftBoundary() {
  useLayoutEffect(() => releaseInquiryDraftOwner(), []);
  return null;
}

export function InquiryDraftSignOutForm({
  action,
  children,
}: {
  action: string;
  children: ReactNode;
}) {
  return (
    <form action={action} method="post" onSubmitCapture={() => releaseInquiryDraftOwner()}>
      {children}
    </form>
  );
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
  draftCopy: {
    restored: string;
    local: string;
    changed: string;
    confirm: string;
    required: string;
  };
};

export function InquiryDraftForm<V extends FormValues>(props: InquiryDraftFormProps<V>) {
  return <InquiryDraftSession key={`${props.owner.id}:${props.id}:${props.kind}`} {...props} />;
}

function InquiryDraftSession<V extends FormValues>({
  owner,
  id,
  kind,
  draftCopy,
  ...props
}: InquiryDraftFormProps<V>) {
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const ready = useRef(false);
  const firstSnapshot = useRef<FormSnapshot<V> | null>(null);
  const [restored, setRestored] = useState<FormState<V> | null>(null);
  const [restoreInfo, setRestoreInfo] = useState<{
    revision: number | null;
    changed: boolean;
  } | null>(null);
  const draftRevision = useRef<number | null | undefined>(undefined);
  const reviewRevision = useRef<number | null | undefined>(undefined);
  const [reviewChecked, setReviewChecked] = useState(false);
  const [reviewError, setReviewError] = useState(false);
  const reviewControl = useRef<HTMLInputElement>(null);
  const reviewId = useId();
  const restoreFocus = useRef<{
    name: string;
    start: number | null;
    end: number | null;
    direction: "forward" | "backward" | "none" | null;
  } | null>(null);
  const [confirmedStatus, setConfirmedStatus] = useState<string | null>(null);
  const initial = props.initialState;
  const onSnapshot = useCallback(
    (snapshot: FormSnapshot<V>) => {
      if (!ready.current) {
        firstSnapshot.current = snapshot;
        return;
      }
      retainInquiryDraft(
        owner,
        id,
        kind,
        initial,
        snapshot,
        (initial as FormState<V> & InquiryReferenceState).inquiryRetryOperationId,
        draftRevision.current,
      );
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
  // Recording a confirmed change re-issues its pending reference, so Next re-renders this record
  // in the same response and its pending fence can replace the form before the confirmed state
  // renders. Settle the submitted draft where that confirmed body arrives, on the same promise
  // React awaits so its timing is unchanged. Only once hydrated: native submissions need the
  // untouched Server Action reference (ui/form/form.tsx).
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const serverAction = props.action;
  const settlingAction = useCallback<FormAction<V>>(
    (previous, data) => {
      const response = serverAction(previous, data);
      response.then(
        (state) => {
          if (state.outcome.kind === "confirmed" && ready.current)
            retainInquiryDraft(
              owner,
              id,
              kind,
              initial,
              { state, values: state.values, pending: false },
              (initial as FormState<V> & InquiryReferenceState).inquiryRetryOperationId,
              draftRevision.current,
            );
        },
        // The form's own boundary reports a failed request.
        () => {},
      );
      return response;
    },
    [serverAction, owner, id, kind, initial],
  );
  useLayoutEffect(() => {
    if (ready.current) return;
    claimInquiryDraftOwner(owner);
    // An HTML POST response wins over an older local draft, including its receipt/errors.
    const native = firstSnapshot.current?.state;
    const initialResponse = native && native.responseId !== initial.responseId ? native : initial;
    const retained =
      initialResponse.outcome.kind === "idle"
        ? readInquiryDraft(owner, id, kind, initialResponse)
        : null;
    const values = { ...initialResponse.values, ...retained?.values } as V;
    const liveValues = { ...initialResponse.values };
    // ActionForm already adopts pre-hydration edits. Compare with those live controls so
    // ordinary hydration, or an identical retained draft, keeps its DOM, focus and caret.
    const form = container.current?.querySelector("form");
    for (const name of Object.keys(initialResponse.values)) {
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
        liveValues[name as keyof V] = value as V[keyof V];
        if (value !== initialResponse.values[name]) values[name as keyof V] = value as V[keyof V];
      }
    }
    // A missing-receipt retry is editable, but it still needs fresh review when the
    // record changed. Only an unresolved operation rendered read-only skips this gate.
    const retryOperationId = (initial as FormState<V> & InquiryReferenceState)
      .inquiryRetryOperationId;
    const changed = Boolean(
      retained &&
        (!retained.operation || retryOperationId === retained.operation.id) &&
        retained.revision !== initialResponse.expectedRevision,
    );
    if (retained) {
      // The operation may use a newer revision during retry or read-only recovery.
      // Restoring either path must keep the revision these draft entries were based on.
      draftRevision.current = retained.revision;
      setRestoreInfo({ revision: retained.revision, changed });
    }
    if (changed) reviewRevision.current = initialResponse.expectedRevision;
    const state: FormState<V> = { ...initialResponse, values };
    if ((retryOperationId || changed) && "reviewed" in values) (values as FormValues).reviewed = "";
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
    if (
      Object.keys(values).some((name) => values[name] !== liveValues[name]) ||
      state.operationId !== initialResponse.operationId ||
      state.expectedRevision !== initialResponse.expectedRevision ||
      state.outcome.kind !== initialResponse.outcome.kind
    ) {
      const active = document.activeElement;
      if (
        active &&
        form?.contains(active) &&
        (active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement ||
          active instanceof HTMLSelectElement)
      )
        restoreFocus.current = {
          name: active.name,
          start: active instanceof HTMLSelectElement ? null : active.selectionStart,
          end: active instanceof HTMLSelectElement ? null : active.selectionEnd,
          direction: active instanceof HTMLSelectElement ? null : active.selectionDirection,
        };
      setRestored(state);
    } else {
      onSnapshot({
        state: initialResponse,
        values,
        pending: firstSnapshot.current?.pending ?? false,
      });
    }
  }, [
    owner,
    id,
    kind,
    initial,
    props.permalink,
    props.reconciliation.label,
    props.copy.unknown,
    onSnapshot,
  ]);
  useLayoutEffect(() => {
    const focus = restoreFocus.current;
    if (!restored || !focus) return;
    restoreFocus.current = null;
    const control = container.current?.querySelector("form")?.elements.namedItem(focus.name);
    if (
      control instanceof HTMLInputElement ||
      control instanceof HTMLTextAreaElement ||
      control instanceof HTMLSelectElement
    ) {
      control.focus({ preventScroll: true });
      if (!(control instanceof HTMLSelectElement) && focus.start !== null && focus.end !== null)
        control.setSelectionRange(focus.start, focus.end, focus.direction ?? undefined);
    }
  }, [restored]);
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
        if (reviewRevision.current !== undefined && !reviewChecked) {
          event.preventDefault();
          event.stopPropagation();
          setReviewError(true);
          reviewControl.current?.focus();
          return;
        }
        const enhanced = form?.elements.namedItem(inquiryEnhancedField);
        if (enhanced instanceof HTMLInputElement) enhanced.value = "yes";
      }}
    >
      <ActionForm
        {...props}
        action={hydrated ? settlingAction : props.action}
        key={`${owner.id}:${id}:${kind}:${restored ? "restored" : "initial"}`}
        initialState={restored ?? initial}
        focusInitialStatus={restored ? false : props.focusInitialStatus}
        onSnapshot={onSnapshot}
        pendingReferenceCookie={inquiryReferenceCookie(owner.id, id, kind)}
      >
        {(form) => (
          <>
            <input type="hidden" name={inquiryEnhancedField} defaultValue="" />
            {restoreInfo ? (
              <Notice
                role="status"
                tone={restoreInfo.changed ? "warning" : "info"}
                title={draftCopy.restored}
              >
                <p>{draftCopy.local}</p>
                {restoreInfo.changed ? (
                  <>
                    <p id={`${reviewId}-notice`}>{draftCopy.changed}</p>
                    <p>
                      {props.copy.revision}: {restoreInfo.revision} → {initial.expectedRevision}
                    </p>
                  </>
                ) : null}
              </Notice>
            ) : null}
            {props.children(form)}
            {restoreInfo?.changed ? (
              <div className={fieldClass}>
                <label htmlFor={reviewId} className="flex items-start gap-3">
                  <input
                    ref={reviewControl}
                    id={reviewId}
                    type="checkbox"
                    checked={reviewChecked}
                    disabled={form.pending}
                    required
                    onChange={(event) => {
                      setReviewChecked(event.target.checked);
                      setReviewError(false);
                    }}
                    className="mt-1 size-5 shrink-0 accent-accent"
                    aria-invalid={reviewError || undefined}
                    aria-describedby={`${reviewId}-notice${reviewError ? ` ${reviewId}-error` : ""}`}
                  />
                  <span>{draftCopy.confirm}</span>
                </label>
                {reviewError ? (
                  <p id={`${reviewId}-error`} className={errorClass}>
                    {draftCopy.required}
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </ActionForm>
    </div>
  );
}
