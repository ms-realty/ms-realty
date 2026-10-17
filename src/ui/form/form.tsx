"use client";

import {
  type ChangeEvent,
  Component,
  type ReactNode,
  type RefObject,
  useActionState,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { buttonClass } from "../button-class";
import { cx } from "../cx";
import { ErrorSummary } from "../error-summary";
import { Notice } from "../notice";
import { Receipt } from "../receipt";
import { ReceiptListings } from "../receipt-listings";
import { TechnicalDetails } from "../technical-details";
import {
  type FieldErrors,
  type FormAction,
  type FormCopy,
  type FormState,
  type FormValues,
  formFields,
  type RecoveryLink,
} from "./contract";
import { nativeTimeValue } from "./date-time-value";

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

export type FormSnapshot<V extends FormValues> = {
  state: FormState<V>;
  values: V;
  pending: boolean;
};

export type ActionFormProps<V extends FormValues> = {
  action: FormAction<V>;
  initialState: FormState<V>;
  /** Same canonical page and Server Action before/after an HTML POST (React permalink). */
  permalink: string;
  /** Stable, page-unique business identity for a form in a list that can reorder. */
  nativeIdentity?: string;
  /** Current server eligibility. Keep the state hook mounted for recovery, never a new command. */
  commandAvailable?: boolean;
  /** A server-authorized status URL for this logical operation; safe on lost acknowledgment. */
  reconciliation: RecoveryLink;
  /** Preserve a signed operation reference before the request can lose its acknowledgment. */
  pendingReferenceCookie?: string;
  copy: FormCopy;
  labels: Record<keyof V, string>;
  /** Human-facing representations of opaque choices in a reviewed conflict comparison. */
  formatValue?: (name: string, value: string, state: FormState<V>) => ReactNode;
  submitLabel: ReactNode | ((state: FormState<V>) => ReactNode);
  /** Native disclosure stays open for restored responses and drafts, including an HTML POST. */
  disclosure?: string;
  /** Optional navigation hint: empty in native HTML, yes after hydration. Never an auth gate. */
  enhancementField?: string;
  /** Public source review can use the page width; entry fields retain their reading width. */
  layout?: "reading" | "full";
  /** Navigation beside the one submit (links only; never a second command). */
  secondaryActions?: ReactNode;
  /** Lets controls outside the form (tab radios, leave buttons) belong to it natively. */
  formId?: string;
  /** Feature-owned draft retention; observes confirmation without wrapping the Server Action. */
  onSnapshot?: (snapshot: FormSnapshot<V>) => void;
  /** Restoring an existing pending status must not interrupt focus; new responses still focus. */
  focusInitialStatus?: boolean;
  children: (form: FormController<V>) => ReactNode;
};

type Snapshot = {
  operationId: string;
  values: FormValues;
  reconciliation: RecoveryLink;
  formatValue?: (name: string, value: string) => ReactNode;
};

export function nativeFormPermalink(
  permalink: string,
  positionalId: string,
  nativeIdentity?: string,
) {
  return `${permalink}${permalink.includes("#") ? "-" : "#form-"}${encodeURIComponent(nativeIdentity ?? positionalId)}`;
}

const noSubscription = () => () => {};

/**
 * Text in this form's server-rendered textareas (field binding ids), by field name, read before
 * they hydrate. Hydration rewrites a textarea's default text and resets its value to it, which
 * also collapses a selection unless the value counts as edited; assigning the value it already
 * has marks it edited, so a selection made before JavaScript arrived still takes the typing.
 */
function textareaValues(prefix: string, names: string[]) {
  const values: Record<string, string> = {};
  if (typeof document === "undefined") return values;
  for (const name of names) {
    const control = document.getElementById(`${prefix}-${name}`);
    if (!(control instanceof HTMLTextAreaElement)) continue;
    const text = control.value;
    values[name] = text;
    control.value = text;
  }
  return values;
}

function FocusResult({
  children,
  focusOnMount = true,
}: {
  children: ReactNode;
  focusOnMount?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);
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
    locale: string;
  },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const { values, operationId, reconciliation, formatValue } = this.props.snapshot.current;
    return (
      <FocusResult>
        <Notice tone="warning" title={this.props.copy.unknown}>
          <p>{this.props.copy.draftRetained}</p>
          <a href={reconciliation.href} className="font-semibold underline">
            {reconciliation.label}
          </a>
        </Notice>
        <dl className="mt-4 space-y-3">
          {Object.entries(values)
            .filter(([name]) => this.props.labels[name]?.trim())
            .map(([name, value]) => (
              <div key={name}>
                <dt className="font-semibold">{this.props.labels[name]}</dt>
                <dd className="whitespace-pre-wrap break-words">
                  {formatValue?.(name, value) ?? value}
                </dd>
              </div>
            ))}
        </dl>
        <TechnicalDetails locale={this.props.locale}>
          <p className="break-all">
            <bdi>{operationId}</bdi>
          </p>
          {Object.entries(values)
            .filter(([name]) => !this.props.labels[name]?.trim())
            .map(([name, value]) => (
              <dl key={name}>
                <dt>{name}</dt>
                <dd className="whitespace-pre-wrap break-words">{value}</dd>
              </dl>
            ))}
        </TechnicalDetails>
      </FocusResult>
    );
  }
}

export function ActionForm<V extends FormValues>(props: ActionFormProps<V>) {
  const snapshot = useRef<Snapshot>({
    operationId: props.initialState.operationId,
    values: props.initialState.values,
    reconciliation: props.reconciliation,
    formatValue: (name, value) => props.formatValue?.(name, value, props.initialState) ?? value,
  });
  return (
    <TransportBoundary
      snapshot={snapshot}
      copy={props.copy}
      labels={props.labels}
      locale={props.permalink.split("/")[1] ?? "en"}
    >
      <FormSession {...props} snapshot={snapshot} />
    </TransportBoundary>
  );
}

function FormSession<V extends FormValues>({
  action,
  initialState,
  permalink,
  nativeIdentity,
  commandAvailable = true,
  reconciliation,
  pendingReferenceCookie,
  copy,
  labels,
  formatValue,
  submitLabel,
  disclosure,
  enhancementField,
  layout = "reading",
  secondaryActions,
  formId,
  onSnapshot,
  focusInitialStatus = true,
  children,
  snapshot,
}: ActionFormProps<V> & { snapshot: RefObject<Snapshot> }) {
  // Keep the Server Action reference intact. Wrapping it in a client async callback breaks
  // native progressive enhancement, including the no-JavaScript validation response.
  const prefix = useId();
  // React keys native POST state by permalink, not by the Server Action's bound values.
  // Reorderable lists supply a business identity: useId follows server tree position.
  // Fragments never change the route or reach the server as query data. This is only
  // native UI recovery identity; signed operation scope/version checks remain separate.
  const formPermalink = nativeFormPermalink(permalink, prefix, nativeIdentity);
  const [state, formAction, pending] = useActionState(action, initialState, formPermalink);
  const [draft, setDraft] = useState({ responseId: state.responseId, values: state.values });
  const inFlight = useRef(false);
  const submittedState = useRef<FormState<V> | null>(null);
  const nativeForm = useRef<HTMLFormElement>(null);
  const adopted = useRef(false);
  // Hydrating a textarea resets it to its server text (inputs and selects keep their DOM
  // values), so read typed text now, before the fields below hydrate. Only while hydrating: a
  // client render can still show another page's form with the same field ids.
  const hydrating = useSyncExternalStore(
    noSubscription,
    () => false,
    () => true,
  );
  const [typed] = useState(() =>
    hydrating ? textareaValues(prefix, Object.keys(initialState.values)) : {},
  );
  useLayoutEffect(() => {
    if (adopted.current || !nativeForm.current) return;
    adopted.current = true;
    // Server-rendered controls are usable before JavaScript. Hydration preserves their DOM
    // values (textareas: read above), but React's initial draft does not know about those
    // edits. Adopt only the safe declared fields before a later controlled render can replace
    // the visitor's input.
    const values = { ...state.values };
    for (const name of Object.keys(values)) {
      const control = nativeForm.current.elements.namedItem(name);
      if (control instanceof HTMLInputElement) {
        if (["hidden", "password", "file", "submit", "button"].includes(control.type)) continue;
        const timeValue = nativeTimeValue(nativeForm.current, control);
        if (timeValue !== null) {
          values[name as keyof V] = timeValue as V[keyof V];
          continue;
        }
        if (control.type === "radio") {
          values[name as keyof V] = (control.checked ? control.value : "") as V[keyof V];
          continue;
        }
        values[name as keyof V] = (
          control.type === "checkbox" ? (control.checked ? control.value : "") : control.value
        ) as V[keyof V];
      } else if (control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) {
        if (control instanceof HTMLSelectElement && control.multiple) continue;
        values[name as keyof V] = (typed[name] ?? control.value) as V[keyof V];
      } else if (control instanceof RadioNodeList) {
        const controls = Array.from(control);
        if (controls.every((item) => item instanceof HTMLInputElement && item.type === "checkbox"))
          values[name as keyof V] = controls
            .filter(
              (item): item is HTMLInputElement => item instanceof HTMLInputElement && item.checked,
            )
            .map((item) => item.value)
            .join("\n") as V[keyof V];
        else if (
          controls.every((item) => item instanceof HTMLInputElement && item.type === "radio")
        )
          values[name as keyof V] = control.value as V[keyof V];
      }
    }
    if (Object.keys(values).some((key) => values[key] !== state.values[key]))
      setDraft({ responseId: state.responseId, values });
  }, [state.responseId, state.values, typed]);
  useEffect(() => {
    if (!pending) inFlight.current = false;
  }, [pending]);
  const values = draft.responseId === state.responseId ? draft.values : state.values;
  useLayoutEffect(() => {
    onSnapshot?.({ state: pending ? (submittedState.current ?? state) : state, values, pending });
  }, [onSnapshot, state, values, pending]);
  const outcome = state.outcome;
  const disclosureOpen =
    pending ||
    outcome.kind !== "idle" ||
    Object.keys(values).some((name) => values[name] !== initialState.values[name]);
  const disclose = (content: ReactNode) =>
    disclosure ? (
      <details
        open={disclosureOpen || undefined}
        // A person can collapse a pending disclosure natively. Reopen on a response before
        // focus effects run for its errors/receipt, even when React's open prop is unchanged.
        ref={(node) => {
          if (node && disclosureOpen) node.open = true;
        }}
        className="rounded-control border border-border p-4"
      >
        <summary className="min-h-control cursor-pointer font-semibold">{disclosure}</summary>
        <div className="pt-4">{content}</div>
      </details>
    ) : (
      content
    );
  const blocked =
    !commandAvailable ||
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
      formatValue: (name, value) => formatValue?.(name, value, state) ?? value,
    };
  }

  // An HTML POST can restore its response after the committed command changes eligibility.
  // Preserve every hook above so React can recover that state before hiding a fresh idle form.
  if (!commandAvailable && outcome.kind === "idle" && !pending) return null;

  if (outcome.kind === "confirmed") {
    return disclose(
      <Receipt
        title={outcome.receipt.title}
        reference={outcome.receipt.reference}
        locale={permalink.split("/")[1] ?? "bg"}
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
        {outcome.receipt.listings ? (
          <ReceiptListings listings={outcome.receipt.listings} headingLevel={3} />
        ) : null}
        <p>{outcome.receipt.nextStep}</p>
      </Receipt>,
    );
  }

  const submit = blocked ? null : (
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
          {conflict?.reapply
            ? copy.reapply
            : typeof submitLabel === "function"
              ? submitLabel({ ...state, values })
              : submitLabel}
        </span>
        <span
          className={cx("col-start-1 row-start-1", !pending && "invisible")}
          aria-hidden={!pending || undefined}
        >
          {copy.pending}
        </span>
      </span>
    </button>
  );
  return disclose(
    <form
      ref={nativeForm}
      id={formId}
      action={formAction}
      noValidate
      aria-busy={pending}
      className={cx(
        "flex min-w-0 flex-col gap-5",
        layout === "full" ? "max-w-full" : "max-w-reading",
      )}
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
        // Record the effective reference before navigation can lose the acknowledgment.
        submittedState.current = {
          ...state,
          operationId: snapshot.current.operationId,
          expectedRevision:
            submitter?.value === "reapply" && conflict?.reapply
              ? conflict.reapply.expectedRevision
              : state.expectedRevision,
        };
        onSnapshot?.({
          state: submittedState.current,
          values,
          pending: true,
        });
        if (pendingReferenceCookie) {
          // The reference must exist synchronously before React sends the native action.
          // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store is asynchronous and unavailable on supported HTTP test hosts.
          document.cookie = `${pendingReferenceCookie}=${encodeURIComponent(snapshot.current.operationId)}; Path=/; SameSite=Strict${location.protocol === "https:" ? "; Secure" : ""}`;
        }
      }}
    >
      <input type="hidden" name={formFields.operationId} value={state.operationId} />
      <input
        type="hidden"
        name={formFields.expectedRevision}
        value={state.expectedRevision ?? ""}
      />
      {enhancementField ? (
        <input type="hidden" name={enhancementField} value={hydrating ? "" : "yes"} />
      ) : null}
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
        <FocusResult
          key={`status-${state.responseId}`}
          focusOnMount={focusInitialStatus || state.responseId !== initialState.responseId}
        >
          <Notice
            tone={outcome.kind === "unknown" ? "warning" : "info"}
            title={outcome.message}
            action={
              <a href={outcome.status.href} className="underline">
                {outcome.status.label}
              </a>
            }
          >
            {outcome.kind === "unknown" ? <p>{copy.draftRetained}</p> : null}
          </Notice>
        </FocusResult>
      ) : null}
      {conflict ? (
        <FocusResult key={`conflict-${state.responseId}`}>
          <Notice tone="warning" title={conflict.message}>
            {conflict.latest ? (
              <div className="flex flex-col gap-3">
                {conflict.latest.details?.map(({ label, value }) => (
                  <dl key={label} className="border-t border-border pt-2">
                    <dt className="font-semibold">{label}</dt>
                    <dd className="whitespace-pre-wrap break-words">{value}</dd>
                  </dl>
                ))}
                {Object.keys(labels)
                  .filter(
                    (name) =>
                      labels[name]?.trim() && Object.hasOwn(conflict.latest?.values ?? {}, name),
                  )
                  .map((name) => (
                    <dl key={name} className="border-t border-border pt-2">
                      <dt className="font-semibold">{labels[name]}</dt>
                      <dd className="whitespace-pre-wrap break-words">
                        {copy.yourValue}:{" "}
                        {formatValue?.(name, values[name] ?? "", state) ?? values[name]}
                      </dd>
                      <dd className="whitespace-pre-wrap break-words">
                        {copy.latestValue}:{" "}
                        {formatValue?.(name, conflict.latest?.values[name] ?? "", state) ??
                          conflict.latest?.values[name]}
                      </dd>
                    </dl>
                  ))}
                <TechnicalDetails locale={permalink.split("/")[1] ?? "en"}>
                  <p>
                    {copy.revision}: {conflict.latest.revision}
                  </p>
                  {Object.entries(conflict.latest.values)
                    .filter(([name]) => !labels[name]?.trim())
                    .map(([name, value]) => (
                      <dl key={name}>
                        <dt>{name}</dt>
                        <dd>
                          {copy.yourValue}: {values[name]}
                        </dd>
                        <dd>
                          {copy.latestValue}: {value}
                        </dd>
                      </dl>
                    ))}
                </TechnicalDetails>
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
      {commandAvailable && conflict?.reapply ? (
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
      {secondaryActions ? (
        <div className="flex flex-wrap items-center gap-3">
          {submit}
          {secondaryActions}
        </div>
      ) : (
        submit
      )}
      <p className="sr-only" role="status">
        {pending ? copy.pending : ""}
      </p>
    </form>,
  );
}
