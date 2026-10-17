"use client";

import {
  Component,
  type ReactNode,
  type RefObject,
  useActionState,
  useEffect,
  useRef,
} from "react";
import type { PublicLocale } from "@/i18n/config";
import { buttonClass } from "@/ui/button-class";
import { formFields } from "@/ui/form/contract";
import { nativeFormPermalink } from "@/ui/form/form";
import { Notice } from "@/ui/notice";
import { StatusBadge, type StatusTone } from "@/ui/status-badge";
import { CopyLink } from "./copy-link";
import type { ShareCopy } from "./share-copy";
import type { Moment, SharedLinkView } from "./share-model";
import { type RevokeShareAction, type ShareRevokeState, shareFields } from "./share-state";

type Props = {
  locale: PublicLocale;
  view: SharedLinkView;
  labels: ShareCopy;
  /** The server action, bound to the page locale. Passed through untouched for no-JS posts. */
  revoke: RevokeShareAction;
  /** Canonical route of the page, without a fragment. */
  permalink: string;
};

/** live: recipients can open it · checking: a revocation is unconfirmed · dead: expired/revoked. */
type Mode = "live" | "checking" | "dead";

function badgeFor(
  mode: Mode,
  state: SharedLinkView["state"],
  revoked: boolean,
  labels: ShareCopy,
): { tone: StatusTone; label: string } {
  if (revoked) return { tone: "neutral", label: labels.revokedAt };
  if (mode === "checking") return { tone: "pending", label: labels.checking };
  switch (state) {
    case "active":
      return { tone: "positive", label: labels.statusActive };
    case "expiring":
      return { tone: "attention", label: labels.statusExpiring };
    case "expired":
      return { tone: "neutral", label: labels.expiredAt };
    case "revoked":
      return { tone: "neutral", label: labels.revokedAt };
  }
}

/** Presentation only: the facts of one link, plus a slot for what can be done with it. */
function Details({
  locale,
  view,
  labels,
  mode,
  revokedAt,
  children,
}: {
  locale: PublicLocale;
  view: SharedLinkView;
  labels: ShareCopy;
  mode: Mode;
  revokedAt: Moment | null;
  children: ReactNode;
}) {
  const titleId = `share-${view.id}-title`;
  const badge = badgeFor(mode, view.state, revokedAt !== null, labels);
  const when = revokedAt
    ? { label: labels.revokedAt, at: revokedAt }
    : { label: view.state === "expired" ? labels.expiredAt : labels.expires, at: view.expires };
  return (
    <article
      id={`share-${view.id}`}
      aria-labelledby={titleId}
      data-share-state={revokedAt ? "revoked" : mode === "checking" ? "checking" : view.state}
      className="min-w-0 scroll-mt-24 space-y-5 rounded-panel border border-border bg-surface p-5 sm:p-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={titleId} className="text-subheading font-semibold">
          {labels.linkTitle}
        </h3>
        <StatusBadge family="delivery" tone={badge.tone} label={badge.label} />
      </header>
      {mode === "live" ? (
        <CopyLink
          url={view.url}
          labels={{
            address: labels.linkAddress,
            copy: labels.copy,
            copied: labels.copied,
            failed: labels.copyFailed,
          }}
        />
      ) : null}
      <dl className="grid gap-x-6 gap-y-3 text-compact sm:grid-cols-[auto_minmax(0,1fr)]">
        <dt className="text-text-muted">{labels.createdAt}</dt>
        <dd>
          <time dateTime={view.created.dateTime}>{view.created.label}</time>
        </dd>
        {when.at ? (
          <>
            <dt className="text-text-muted">{when.label}</dt>
            <dd className="font-semibold">
              <time dateTime={when.at.dateTime}>{when.at.label}</time>
            </dd>
          </>
        ) : null}
        <dt className="text-text-muted">{labels.properties}</dt>
        <dd>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {view.references.map((reference) => (
              <li key={reference}>
                <a
                  className="underline"
                  href={`/${locale}/properties/${reference}/${reference.toLowerCase()}`}
                >
                  <bdi>{reference}</bdi>
                </a>
              </li>
            ))}
          </ul>
        </dd>
      </dl>
      {mode === "live" ? (
        <a className={buttonClass("tertiary", "self-start px-1")} href={new URL(view.url).pathname}>
          {labels.viewAs}
        </a>
      ) : null}
      {mode === "dead" ? <p className="text-compact text-text-muted">{labels.renew}</p> : null}
      {children}
    </article>
  );
}

function Checking({ labels, children }: { labels: ShareCopy; children: ReactNode }) {
  return (
    <Notice tone="warning" role="alert" title={labels.checking} action={children}>
      {labels.checkingBody}
    </Notice>
  );
}

/**
 * A lost acknowledgment must read neither as success nor as failure. The fallback replays the
 * same operation key; the ledger then answers with the stored outcome or performs it once.
 */
class TransportBoundary extends Component<
  { resetKey: string; fallback: () => ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(previous: { resetKey: string }) {
    // A refreshed server state (revoked, expired) supersedes the uncertainty.
    if (this.state.failed && previous.resetKey !== this.props.resetKey)
      this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? this.props.fallback() : this.props.children;
  }
}

function ReplayRevocation({
  view,
  labels,
  revoke,
  operationId,
}: Pick<Props, "view" | "labels" | "revoke"> & { operationId: string }) {
  // Past a transport failure scripts are running, so a bound plain action is enough here.
  // `previous` is ignored by the server action.
  const replay = revoke.bind(null, { operationId, outcome: { kind: "idle" } });
  return (
    <form
      action={async (data) => {
        try {
          await replay(data);
        } catch {
          // Still no answer: the notice already says the outcome is unconfirmed.
        }
      }}
    >
      <input type="hidden" name={formFields.operationId} value={operationId} />
      <input type="hidden" name={shareFields.shareId} value={view.id} />
      <Checking labels={labels}>
        <button type="submit" className={buttonClass("secondary")}>
          {labels.checkAgain}
        </button>
      </Checking>
    </form>
  );
}

function Body({
  locale,
  view,
  labels,
  revoke,
  permalink,
  effectiveKey,
}: Props & { effectiveKey: RefObject<string> }) {
  const [state, formAction, pending] = useActionState(
    revoke,
    { operationId: view.revokeKey, outcome: { kind: "idle" } } satisfies ShareRevokeState,
    nativeFormPermalink(permalink, view.id),
  );
  if (!pending) effectiveKey.current = state.operationId;

  const confirmed = state.outcome.kind === "revoked" ? state.outcome.revokedAt : null;
  const revokedAt = view.revoked ?? confirmed;
  const open = revokedAt === null && (view.state === "active" || view.state === "expiring");
  const unknown = state.outcome.kind === "unknown";
  const mode: Mode = !open ? "dead" : unknown ? "checking" : "live";

  // Move focus to the result when this session revokes the link: the button that held it is gone.
  const result = useRef<HTMLDivElement>(null);
  const wasRevoked = useRef(revokedAt !== null);
  useEffect(() => {
    if (revokedAt !== null && !wasRevoked.current) result.current?.focus();
    wasRevoked.current = revokedAt !== null;
  }, [revokedAt]);

  const fields = (
    <>
      <input type="hidden" name={formFields.operationId} value={state.operationId} />
      <input type="hidden" name={shareFields.shareId} value={view.id} />
    </>
  );
  return (
    <Details locale={locale} view={view} labels={labels} mode={mode} revokedAt={revokedAt}>
      {confirmed ? (
        <div ref={result} tabIndex={-1} role="status">
          <Notice tone="success">{labels.revokedDone}</Notice>
        </div>
      ) : null}
      {mode === "checking" ? (
        <form action={formAction} aria-busy={pending}>
          {fields}
          <Checking labels={labels}>
            <button
              type="submit"
              className={buttonClass("secondary")}
              aria-disabled={pending || undefined}
            >
              {pending ? labels.revoking : labels.checkAgain}
            </button>
          </Checking>
        </form>
      ) : null}
      {mode === "live" && state.outcome.kind === "rejected" ? (
        <Notice tone="error" role="alert">
          {labels.revokeFailed}
        </Notice>
      ) : null}
      {mode === "live" ? (
        <details className="rounded-control border border-border">
          <summary
            className={buttonClass(
              "tertiary",
              "w-full list-none justify-start [&::-webkit-details-marker]:hidden",
            )}
          >
            {labels.revoke}
          </summary>
          <form
            action={formAction}
            aria-busy={pending}
            // React resets native controls after an action settles; the form keeps its fields.
            onReset={(event) => event.preventDefault()}
            onSubmit={(event) => {
              if (pending) event.preventDefault();
            }}
            className="space-y-4 border-t border-border p-4"
          >
            {fields}
            <p className="text-compact">{labels.revokeExplain}</p>
            <button
              type="submit"
              className={buttonClass("destructive")}
              aria-disabled={pending || undefined}
              data-pending={pending || undefined}
            >
              {pending ? labels.revoking : labels.revokeNow}
            </button>
          </form>
        </details>
      ) : null}
    </Details>
  );
}

export function SharedLinkCard(props: Props) {
  const effectiveKey = useRef(props.view.revokeKey);
  return (
    <TransportBoundary
      resetKey={props.view.state}
      fallback={() => (
        <Details
          locale={props.locale}
          view={props.view}
          labels={props.labels}
          mode="checking"
          revokedAt={props.view.revoked}
        >
          <ReplayRevocation
            view={props.view}
            labels={props.labels}
            revoke={props.revoke}
            operationId={effectiveKey.current}
          />
        </Details>
      )}
    >
      <Body {...props} effectiveKey={effectiveKey} />
    </TransportBoundary>
  );
}
