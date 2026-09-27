"use client";

import {
  type ChangeEvent,
  Component,
  type ReactNode,
  type RefObject,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { buttonClass } from "../button-class";
import { cx } from "../cx";
import { ErrorSummary } from "../error-summary";
import { Notice } from "../notice";
import { Receipt } from "../receipt";
import {
  type FieldErrors,
  type FormAction,
  type FormCopy,
  type FormState,
  type FormValues,
  formFields,
  type RecoveryLink,
} from "./contract";

type FieldBinding = {
  id: string;
  name: string;
  value: string;
  readOnly: boolean;
  error?: string;
  onChange: (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => void;
};

export type FormController<V extends FormValues> = {
  state: FormState<V>;
  pending: boolean;
  values: V;
  field: (name: keyof V & string) => FieldBinding;
  setValue: (name: keyof V & string, value: string) => void;
};

export type ActionFormProps<V extends FormValues> = {
  action: FormAction<V>;
  initialState: FormState<V>;
  /** Same canonical page and Server Action before/after an HTML POST (React permalink). */
  permalink: string;
  /** A server-authorized status URL for this logical operation; safe on lost acknowledgment. */
  reconciliation: RecoveryLink;
  copy: FormCopy;
  labels: Record<keyof V, string>;
  submitLabel: string;
  children: (form: FormController<V>) => ReactNode;
};

type Snapshot = { operationId: string; values: FormValues; reconciliation: RecoveryLink };

function FocusResult({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div ref={ref} tabIndex={-1}>
      {children}
    </div>
  );
}

/** Transport failures must not erase drafts, claim nonacceptance or offer a new command. */
class TransportBoundary extends Component<
  {
    children: ReactNode;
    snapshot: RefObject<Snapshot>;
    copy: FormCopy;
    labels: Record<string, string>;
  },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const { values, operationId, reconciliation } = this.props.snapshot.current;
    return (
      <FocusResult>
        <Notice tone="warning" title={this.props.copy.unknown}>
          <p>{this.props.copy.draftRetained}</p>
          <p className="break-all">
            <bdi>{operationId}</bdi>
          </p>
          <a href={reconciliation.href} className="font-semibold underline">
            {reconciliation.label}
          </a>
        </Notice>
        <dl className="mt-4 space-y-3">
          {Object.entries(values).map(([name, value]) => (
            <div key={name}>
              <dt className="font-semibold">{this.props.labels[name]}</dt>
              <dd className="whitespace-pre-wrap break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </FocusResult>
    );
  }
}

export function ActionForm<V extends FormValues>(props: ActionFormProps<V>) {
  const snapshot = useRef<Snapshot>({
    operationId: props.initialState.operationId,
    values: props.initialState.values,
    reconciliation: props.reconciliation,
  });
  return (
    <TransportBoundary snapshot={snapshot} copy={props.copy} labels={props.labels}>
      <FormSession {...props} snapshot={snapshot} />
    </TransportBoundary>
  );
}

function FormSession<V extends FormValues>({
  action,
  initialState,
  permalink,
  reconciliation,
  copy,
  labels,
  submitLabel,
  children,
  snapshot,
}: ActionFormProps<V> & { snapshot: RefObject<Snapshot> }) {
  // Keep the Server Action reference intact. Wrapping it in a client async callback breaks
  // native progressive enhancement, including the no-JavaScript validation response.
  const prefix = useId();
  // React keys native POST state by permalink, not by the Server Action's bound values.
  // A stable fragment keeps sibling forms on this page from restoring one another's
  // drafts/errors; fragments never change the route or reach the server as query data.
  const formPermalink = `${permalink}${permalink.includes("#") ? "-" : "#form-"}${encodeURIComponent(prefix)}`;
  const [state, formAction, pending] = useActionState(action, initialState, formPermalink);
  const [draft, setDraft] = useState({ responseId: state.responseId, values: state.values });
  const inFlight = useRef(false);
  useEffect(() => {
    if (!pending) inFlight.current = false;
  }, [pending]);
  const values = draft.responseId === state.responseId ? draft.values : state.values;
  const outcome = state.outcome;
  const blocked =
    outcome.kind === "unknown" ||
    outcome.kind === "accepted" ||
    (outcome.kind === "rejected" && !outcome.retryable) ||
    (outcome.kind === "conflict" && !outcome.reapply);
  const conflict = outcome.kind === "conflict" ? outcome : undefined;
  const fieldErrors: FieldErrors<V> = outcome.kind === "validation" ? outcome.fieldErrors : {};
  const errors = (Object.entries(fieldErrors) as [string, readonly string[] | undefined][]).flatMap(
    ([name, messages]) =>
      messages?.length
        ? [{ fieldId: `${prefix}-${name}`, message: `${labels[name]}: ${messages?.join(" ")}` }]
        : [],
  );
  if (!pending) {
    snapshot.current = {
      operationId: state.operationId,
      values,
      reconciliation: state.reconciliation ?? reconciliation,
    };
  }

  if (outcome.kind === "confirmed") {
    return (
      <Receipt
        title={outcome.receipt.title}
        reference={outcome.receipt.reference}
        referenceLabel={copy.reference}
        recordedAt={outcome.receipt.recordedAt}
        recordedAtLabel={copy.recordedAt}
        focusOnMount
        actions={
          <a href={outcome.receipt.destination.href} className={buttonClass("secondary")}>
            {outcome.receipt.destination.label}
          </a>
        }
      >
        <p>{outcome.receipt.nextStep}</p>
      </Receipt>
    );
  }

  return (
    <form
      action={formAction}
      noValidate
      aria-busy={pending}
      className="flex max-w-reading flex-col gap-5"
      // React resets native controls after an action resolves, including rejected actions.
      // Our controlled draft comes from the response; resetting a select loses that draft.
      onReset={(event) => event.preventDefault()}
      onSubmit={(event) => {
        if (pending || inFlight.current || blocked) {
          event.preventDefault();
          return;
        }
        inFlight.current = true;
        // Guard the narrow interval before React paints pending, and retain the effective
        // identity if a reviewed reapply loses its acknowledgment.
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.value === "reapply" && conflict?.reapply) {
          snapshot.current.operationId = conflict.reapply.operationId;
          snapshot.current.reconciliation = conflict.reapply.status;
        }
      }}
    >
      <input type="hidden" name={formFields.operationId} value={state.operationId} />
      <input
        type="hidden"
        name={formFields.expectedRevision}
        value={state.expectedRevision ?? ""}
      />
      <ErrorSummary key={`errors-${state.responseId}`} title={copy.errorSummary} errors={errors} />
      {outcome.kind === "rejected" ? (
        <FocusResult key={`rejected-${state.responseId}`}>
          <Notice
            tone="error"
            title={outcome.message}
            action={
              outcome.recovery && (
                <a href={outcome.recovery.href} className="underline">
                  {outcome.recovery.label}
                </a>
              )
            }
          />
        </FocusResult>
      ) : null}
      {outcome.kind === "accepted" || outcome.kind === "unknown" ? (
        <FocusResult key={`status-${state.responseId}`}>
          <Notice
            tone={outcome.kind === "unknown" ? "warning" : "info"}
            title={outcome.message}
            action={
              <a href={outcome.status.href} className="underline">
                {outcome.status.label}
              </a>
            }
          />
        </FocusResult>
      ) : null}
      {conflict ? (
        <FocusResult key={`conflict-${state.responseId}`}>
          <Notice tone="warning" title={conflict.message}>
            {conflict.latest ? (
              <div className="flex flex-col gap-3">
                <p>
                  {copy.revision}: {conflict.latest.revision}
                </p>
                {Object.keys(labels).map((name) => (
                  <dl key={name} className="border-t border-border pt-2">
                    <dt className="font-semibold">{labels[name]}</dt>
                    <dd className="whitespace-pre-wrap break-words">
                      {copy.yourValue}: {values[name]}
                    </dd>
                    <dd className="whitespace-pre-wrap break-words">
                      {copy.latestValue}: {conflict.latest?.values[name]}
                    </dd>
                  </dl>
                ))}
              </div>
            ) : null}
            {conflict.recovery ? (
              <a href={conflict.recovery.href} className="underline">
                {conflict.recovery.label}
              </a>
            ) : null}
          </Notice>
        </FocusResult>
      ) : null}
      {children({
        state,
        pending,
        values,
        setValue: (name, value) =>
          setDraft((current) => ({
            responseId: state.responseId,
            values: {
              ...(current.responseId === state.responseId ? current.values : state.values),
              [name]: value,
            },
          })),
        field: (name) => ({
          id: `${prefix}-${name}`,
          name,
          value: values[name] ?? "",
          readOnly: pending || blocked,
          error: fieldErrors[name]?.join(" "),
          onChange: (event) =>
            setDraft({
              responseId: state.responseId,
              values: { ...values, [name]: event.target.value },
            }),
        }),
      })}
      {conflict?.reapply ? (
        <>
          <input
            type="hidden"
            name={formFields.reapplyOperationId}
            value={conflict.reapply.operationId}
          />
          <input
            type="hidden"
            name={formFields.reapplyRevision}
            value={conflict.reapply.expectedRevision}
          />
        </>
      ) : null}
      {!blocked ? (
        <button
          type="submit"
          name={formFields.intent}
          value={conflict?.reapply ? "reapply" : "submit"}
          aria-disabled={pending || undefined}
          data-pending={pending || undefined}
          className={buttonClass("primary", "self-start")}
        >
          <span className="grid">
            <span
              className={cx("col-start-1 row-start-1", pending && "invisible")}
              aria-hidden={pending || undefined}
            >
              {conflict?.reapply ? copy.reapply : submitLabel}
            </span>
            <span
              className={cx("col-start-1 row-start-1", !pending && "invisible")}
              aria-hidden={!pending || undefined}
            >
              {copy.pending}
            </span>
          </span>
        </button>
      ) : null}
      <p className="sr-only" role="status">
        {pending ? copy.pending : ""}
      </p>
    </form>
  );
}
