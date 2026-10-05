"use client";
// O07 single-property check and add (design/contracts/o07.md §3–4). The server renders the check
// frames from its current reads; this component owns only what the add command answered:
// ADDSEND, ADDED (readback only), ADDCONFLICT, ADDOFFLINE, ADDUNKNOWN and the safe refusals.
// It posts the existing `interest` workflow Server Action directly (native HTML baseline).

import { useRouter } from "next/navigation";
import {
  Component,
  type FormEvent,
  type ReactNode,
  type RefObject,
  useActionState,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { buttonClass } from "@/ui/button-class";
import { ErrorSummary } from "@/ui/error-summary";
import { type FormAction, type FormState, type FormValues, formFields } from "@/ui/form/contract";
import { nativeFormPermalink } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import { Notice } from "@/ui/notice";
import { StatusBadge } from "@/ui/status-badge";
import type { AddText } from "./matching-copy";
import { addState, changedCategory, type MatchCurrent } from "./matching-view";

export type CheckFrame = {
  readonly title: string;
  readonly body: ReactNode;
  /** The way forward when no add is offered; beside the add button it is the secondary. */
  readonly actions: ReactNode;
  readonly next: string | null;
  readonly canAdd: boolean;
};

export type MatchAddProps = {
  readonly action: FormAction<FormValues>;
  /** Issued by this server render: a fresh operation key, the current deal version and review. */
  readonly initialState: FormState<FormValues>;
  /** Changes with every server render; tells a refreshed render from the one that was posted. */
  readonly renderId: string;
  readonly permalink: string;
  readonly nativeIdentity: string;
  /** Regional tag for the readback time, e.g. bg-BG. */
  readonly localeTag: string;
  readonly reference: string;
  /** The check as the server reads it now. */
  readonly fresh: CheckFrame;
  /** O07STALE: the page was opened from a list of an older requirements revision. */
  readonly stale: CheckFrame | null;
  readonly header: ReactNode;
  readonly current: MatchCurrent | null;
  readonly listHref: string;
  readonly recheckHref: string;
  readonly added: {
    readonly property: string;
    readonly dealHref: string;
    /** From the saved property's own recorded event; unknown until the next server read. */
    readonly recordedBy: string | null;
    readonly next: { readonly href: string; readonly label: string; readonly line: string } | null;
  };
  readonly text: AddText;
};

type Snapshot = Pick<FormState<FormValues>, "operationId" | "expectedRevision" | "values">;
type Attempt = { operationId: string; expectedRevision: number | null; matchReview: string };

const action = (variant: "primary" | "secondary" | "tertiary", extra?: string) =>
  buttonClass(variant, `max-w-full text-center ${extra ?? ""}`);

/** The frame's next-step line (contract «Next-step line»), as plain text. */
function Next({ text }: { text: string | null }) {
  return text ? <p>{text}</p> : null;
}

let lostResponses = 0;

/**
 * A lost acknowledgement must not erase the explanation or invite a second add: the request is
 * shown as unconfirmed and the same operation is checked again (ADDUNKNOWN).
 */
class TransportBoundary extends Component<
  {
    snapshot: RefObject<Snapshot | null>;
    fallback: (lost: Snapshot, attempt: number) => ReactNode;
    children: ReactNode;
  },
  { attempt: number }
> {
  state = { attempt: 0 };
  static getDerivedStateFromError() {
    lostResponses += 1;
    return { attempt: lostResponses };
  }
  render() {
    const lost = this.state.attempt ? this.props.snapshot.current : null;
    return lost ? this.props.fallback(lost, this.state.attempt) : this.props.children;
  }
}

export function MatchAddWorkbench(props: MatchAddProps) {
  const snapshot = useRef<Snapshot | null>(null);
  return (
    <TransportBoundary
      snapshot={snapshot}
      fallback={(lost, attempt) => (
        <AddSession
          key={`lost-${attempt}`}
          {...props}
          snapshot={snapshot}
          restored={{
            ...lost,
            responseId: `lost-${attempt}`,
            outcome: {
              kind: "unknown",
              code: "OUTCOME_UNKNOWN",
              message: props.text.unknownAlert,
              status: { href: props.recheckHref, label: props.text.checkSame },
            },
          }}
        />
      )}
    >
      <AddSession {...props} snapshot={snapshot} />
    </TransportBoundary>
  );
}

function AddSession({
  restored,
  snapshot,
  ...props
}: MatchAddProps & { snapshot: RefObject<Snapshot | null>; restored?: FormState<FormValues> }) {
  const t = props.text;
  // React keys the native POST response by this permalink, so the answer reaches this form.
  const permalink = nativeFormPermalink(props.permalink, "match", props.nativeIdentity);
  const [state, formAction, pending] = useActionState(
    props.action,
    restored ?? props.initialState,
    permalink,
  );
  const [offline, setOffline] = useState(false);
  const [draft, setDraft] = useState({
    responseId: state.responseId,
    explanation: state.values.explanation ?? "",
  });
  const explanation =
    draft.responseId === state.responseId ? draft.explanation : (state.values.explanation ?? "");
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const answered = useRef(state.responseId);
  const inFlight = useRef(false);
  const postedRender = useRef<string | null>(null);
  const fieldId = `${props.nativeIdentity}-explanation`;
  const kind = addState(state.outcome, { pending, offline });

  const adopted = useRef(false);
  useLayoutEffect(() => {
    // Text typed before hydration stays: the server-rendered textarea is usable without JS.
    if (adopted.current) return;
    adopted.current = true;
    const typed = (document.getElementById(fieldId) as HTMLTextAreaElement | null)?.value ?? "";
    if (typed)
      setDraft((current) =>
        typed !== current.explanation ? { ...current, explanation: typed } : current,
      );
  }, [fieldId]);
  useEffect(() => {
    if (!pending) inFlight.current = false;
  }, [pending]);
  useEffect(() => {
    if (answered.current === state.responseId) return;
    answered.current = state.responseId;
    setOffline(false);
    // Validation focuses its own error summary; every other answer is a new frame.
    if (state.outcome.kind !== "validation") heading.current?.focus();
    // Read the server again after every answer: the saved row, what changed, the next property.
    router.refresh();
  }, [state.responseId, state.outcome.kind, router]);
  useEffect(() => {
    if (restored) heading.current?.focus();
  }, [restored]);

  // A render after the post carries current server truth; the posted one does not.
  const propsFresh = postedRender.current === null || postedRender.current !== props.renderId;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (pending || inFlight.current) {
      event.preventDefault();
      return;
    }
    if (navigator.onLine === false) {
      // ADDOFFLINE: nothing left the browser; the same request is sent when trying again.
      event.preventDefault();
      setOffline(true);
      return;
    }
    inFlight.current = true;
    postedRender.current = props.renderId;
    const data = new FormData(event.currentTarget);
    const read = (name: string) => {
      const value = data.get(name);
      return typeof value === "string" ? value : "";
    };
    snapshot.current = {
      operationId: read(formFields.operationId),
      expectedRevision: Number(read(formFields.expectedRevision)) || null,
      values: {
        reference: read("reference"),
        explanation: read("explanation"),
        matchReview: read("matchReview"),
      },
    };
    setOffline(false);
  };

  const hidden = (attempt: Attempt) => (
    <>
      <input type="hidden" name={formFields.operationId} value={attempt.operationId} />
      <input
        type="hidden"
        name={formFields.expectedRevision}
        value={attempt.expectedRevision ?? ""}
      />
      <input type="hidden" name="reference" value={props.reference} />
      <input type="hidden" name="matchReview" value={attempt.matchReview} />
    </>
  );
  const explanationField = (readOnly: boolean, error?: string) => (
    <FormField
      id={fieldId}
      name="explanation"
      label={t.explanationLabel}
      hint={t.explanationRule}
      error={error}
      multiline
      required
      maxLength={1500}
      value={explanation}
      readOnly={readOnly}
      onChange={(event) =>
        setDraft({ responseId: state.responseId, explanation: event.target.value })
      }
    />
  );
  const submit = (label: string) => (
    <button
      type="submit"
      name={formFields.intent}
      value="submit"
      aria-disabled={pending || undefined}
      data-pending={pending || undefined}
      className={action("primary")}
    >
      {pending ? t.sending : label}
    </button>
  );
  const keptExplanation = (
    <dl className="space-y-1">
      <dt className="font-semibold">{t.addedExplanation}</dt>
      <dd className="whitespace-pre-wrap">{state.values.explanation}</dd>
    </dl>
  );
  const title = (text: string) => (
    <h1 ref={heading} tabIndex={-1} className="text-heading font-semibold">
      {text}
    </h1>
  );
  const backToList = (variant: "primary" | "secondary") => (
    <a className={action(variant)} href={props.listHref}>
      {t.backToList}
    </a>
  );

  if (kind === "added" && state.outcome.kind === "confirmed") {
    // ADDED: only the command's readback; the recorder comes from the saved row's own event.
    const at = state.outcome.receipt.recordedAt.dateTime;
    const zoned = `${new Intl.DateTimeFormat(props.localeTag, { dateStyle: "long", timeZone: "Europe/Sofia" }).format(new Date(at))}, ${new Intl.DateTimeFormat(props.localeTag, { timeStyle: "short", timeZone: "Europe/Sofia" }).format(new Date(at))} · Europe/Sofia`;
    const next = props.added.next;
    return (
      <section className="min-w-0 space-y-5">
        {title(t.addedTitle)}
        <StatusBadge family="delivery" tone="positive" label={t.statusAdded} />
        <dl className="grid gap-3">
          <div>
            <dt className="font-semibold">{t.addedProperty}</dt>
            <dd>
              <bdi>{props.added.property}</bdi>
            </dd>
          </div>
          <div>
            <dt className="font-semibold">{t.addedExplanation}</dt>
            <dd className="whitespace-pre-wrap">{state.values.explanation}</dd>
          </div>
          <div>
            <dt className="font-semibold">{t.whatClientSeesLabel}</dt>
            <dd>{t.whatClientSees}</dd>
          </div>
          <div>
            <dt className="font-semibold">{t.recordedLabel}</dt>
            <dd>
              <time dateTime={at}>
                {props.added.recordedBy && propsFresh
                  ? `${props.added.recordedBy} · ${zoned}`
                  : zoned}
              </time>
            </dd>
          </div>
        </dl>
        <Next text={next?.line ?? t.nextAddedLast} />
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {next ? (
            <a className={action("primary")} href={next.href}>
              {next.label}
            </a>
          ) : (
            backToList("primary")
          )}
          <a className={action("tertiary")} href={props.added.dealHref}>
            {t.openInDeal}
          </a>
        </div>
      </section>
    );
  }

  if (
    kind === "unavailable" ||
    kind === "dealInactive" ||
    kind === "notFound" ||
    kind === "reviewRejected" ||
    kind === "failed"
  ) {
    // O07UNAVAILABLE / O07DENIED / O07NOTFOUND: say only what the server said; nothing added.
    const alert = {
      unavailable: t.unavailableAlert,
      dealInactive: t.deniedAlert,
      notFound: t.notFoundAlert,
      reviewRejected: t.reviewRejected,
      failed: t.failed,
    }[kind];
    const recovery = state.outcome.kind === "rejected" ? state.outcome.recovery : undefined;
    return (
      <section className="min-w-0 space-y-5">
        {title(kind === "notFound" ? t.notFoundTitle : t.checkTitle)}
        <StatusBadge
          family="delivery"
          tone="negative"
          label={kind === "notFound" ? t.statusNothingAdded : t.statusNotAdded}
        />
        <Notice
          tone="warning"
          title={alert}
          action={
            kind === "failed" && recovery ? (
              <a className="underline" href={recovery.href}>
                {recovery.label}
              </a>
            ) : undefined
          }
        />
        {kind === "reviewRejected" || kind === "failed" ? keptExplanation : null}
        <Next
          text={
            kind === "unavailable"
              ? t.nextUnavailable
              : kind === "dealInactive"
                ? t.nextDealInactive
                : kind === "notFound"
                  ? t.nextNotFound
                  : kind === "reviewRejected"
                    ? t.nextAddConflict
                    : null
          }
        />
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {kind === "reviewRejected" ? (
            <>
              <a className={action("primary")} href={props.recheckHref}>
                {t.conflict.recheck}
              </a>
              {backToList("secondary")}
            </>
          ) : (
            backToList("primary")
          )}
        </div>
      </section>
    );
  }

  if (kind === "conflict") {
    // ADDCONFLICT: name the category that changed, keep the explanation, check again on demand.
    const category = changedCategory(state.values.matchReview, props.current);
    const recheckForm = props.fresh.canAdd && propsFresh;
    return (
      <section className="min-w-0 space-y-5">
        {title(t.conflictTitle)}
        <StatusBadge family="delivery" tone="negative" label={t.statusNotAdded} />
        {propsFresh ? <Notice tone="warning" title={t.conflict[category]} /> : null}
        {props.header}
        {keptExplanation}
        <p>{t.conflict.kept}</p>
        <Next text={t.nextAddConflict} />
        <details className="min-w-0">
          <summary className="w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <span className={action("primary")}>{t.conflict.recheck}</span>
          </summary>
          <div className="min-w-0 space-y-5 pt-5">
            <h2 className="text-subheading font-semibold">{props.fresh.title}</h2>
            {props.fresh.body}
            {recheckForm ? (
              <form
                action={formAction}
                noValidate
                onSubmit={onSubmit}
                onReset={(event) => event.preventDefault()}
                className="flex min-w-0 flex-col gap-5"
              >
                {hidden({
                  operationId: props.initialState.operationId,
                  expectedRevision: props.initialState.expectedRevision,
                  matchReview: props.initialState.values.matchReview ?? "",
                })}
                {explanationField(false)}
                <p>{t.effect}</p>
                <Next text={props.fresh.next} />
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  {submit(t.submit)}
                  {props.fresh.actions}
                </div>
              </form>
            ) : (
              <>
                <Next text={props.fresh.next} />
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  {props.fresh.actions}
                </div>
              </>
            )}
          </div>
        </details>
      </section>
    );
  }

  // The check itself, and the states that keep the same form: ADDSEND, ADDOFFLINE, ADDUNKNOWN.
  const idle = kind === "form";
  const frame = idle && state.outcome.kind === "idle" && props.stale ? props.stale : props.fresh;
  const formShown = !idle || (frame === props.fresh && frame.canAdd);
  const replay = kind === "unknown";
  const attempt: Attempt = replay
    ? {
        operationId: state.operationId,
        expectedRevision: state.expectedRevision,
        matchReview: state.values.matchReview ?? "",
      }
    : {
        operationId: state.operationId,
        expectedRevision: props.initialState.expectedRevision,
        matchReview: props.initialState.values.matchReview ?? "",
      };
  const error =
    state.outcome.kind === "validation" && state.outcome.fieldErrors.explanation?.length
      ? t.explanationError
      : undefined;
  return (
    <section className="min-w-0 space-y-5">
      {title(replay ? t.unknownTitle : frame.title)}
      {kind === "sending" ? (
        <StatusBadge family="delivery" tone="pending" label={t.statusAdding} />
      ) : kind === "offline" ? (
        <StatusBadge family="delivery" tone="negative" label={t.statusNotSent} />
      ) : replay ? (
        <StatusBadge family="delivery" tone="attention" label={t.statusUnconfirmed} />
      ) : null}
      {kind === "offline" ? <Notice tone="error" title={t.offlineAlert} role="alert" /> : null}
      {replay ? <Notice tone="warning" title={t.unknownAlert} /> : null}
      {idle ? frame.body : props.header}
      {formShown ? (
        <form
          key="add"
          action={formAction}
          noValidate
          aria-busy={pending}
          onSubmit={onSubmit}
          onReset={(event) => event.preventDefault()}
          className="flex min-w-0 flex-col gap-5"
        >
          {hidden(attempt)}
          <ErrorSummary
            key={`errors-${state.responseId}`}
            title={t.errorSummary}
            errors={error ? [{ fieldId, message: error }] : []}
          />
          {explanationField(!idle || pending, error)}
          {kind === "sending" ? <Notice tone="info" title={t.sendingNote} /> : null}
          {idle ? <p>{t.effect}</p> : null}
          <Next
            text={
              kind === "sending"
                ? t.nextAddSend
                : kind === "offline"
                  ? t.nextAddOffline
                  : replay
                    ? t.nextAddUnknown
                    : frame.next
            }
          />
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            {submit(kind === "offline" ? t.retry : replay ? t.checkSame : t.submit)}
            {kind === "sending" ? (
              <span aria-disabled="true" data-disabled="" className={action("secondary")}>
                {t.backToList}
              </span>
            ) : idle ? (
              frame.actions
            ) : null}
          </div>
          <p className="sr-only" role="status">
            {pending ? t.sending : ""}
          </p>
        </form>
      ) : (
        <>
          <Next text={frame.next} />
          <div className="flex min-w-0 flex-wrap items-center gap-3">{frame.actions}</div>
        </>
      )}
    </section>
  );
}
