import type { SourcePin, WorkspaceContext, WorkspaceSource } from "@/domain/generative";
import { Notice } from "@/ui/notice";
import { TechnicalDetails } from "@/ui/technical-details";
import { assistanceCost } from "./cost-label";
import { aiLabel } from "./labels";
import { workspaceCopy } from "./workspace-copy";
import { WorkspaceListingFacts } from "./workspace-listing-facts";
import type { WorkspaceProgressView } from "./workspace-progress";
import type { WorkspaceView } from "./workspace-types";

export const workspaceLink = "font-semibold text-accent underline underline-offset-4";
export function sourceAnchor(key: string) {
  return "workspace-source-" + key.replace(/[^a-zA-Z0-9_-]/g, "-");
}
export function sourceHref(source: WorkspaceSource, locale: string): string | null {
  const base = "/" + locale;
  return source.type === "case"
    ? base + "/cases/" + source.id
    : source.type === "inquiry"
      ? base + "/inquiries/" + source.id
      : source.type === "task"
        ? base + "/tasks/" + source.id
        : source.type === "listing"
          ? base + "/inventory/" + source.id
          : null;
}

export function WorkspaceSources({
  locale,
  context,
  pins,
}: {
  locale: string;
  context: WorkspaceContext;
  pins: SourcePin[];
}) {
  const copy = workspaceCopy(locale);
  return (
    <section
      aria-labelledby="workspace-sources"
      className="min-w-0 space-y-4 border-t border-border pt-6 lg:border-t-0 lg:pt-0"
    >
      <h2 id="workspace-sources" className="text-subheading font-semibold">
        {copy.sources}
      </h2>
      {context.truncated ? <Notice tone="warning" title={copy.truncated} /> : null}
      {!context.sources.length ? <p className="text-text-muted">{copy.noSources}</p> : null}
      <ul className="divide-y divide-border">
        {context.sources.map((source) => {
          const pinned = pins.find((pin) => pin.key === source.key);
          const changed =
            pinned && (pinned.revision !== source.revision || pinned.digest !== source.digest);
          const href = sourceHref(source, locale);
          return (
            <li
              key={source.key}
              id={sourceAnchor(source.key)}
              className="min-w-0 space-y-3 py-4 first:pt-0"
            >
              <h3 className="break-words font-semibold">
                <bdi>{source.title}</bdi>
              </h3>
              <p className="text-compact text-text-muted">
                {source.audience === "internal"
                  ? copy.internal
                  : source.audience === "approved_public"
                    ? copy.approved
                    : copy.external}
              </p>
              <p className="break-words text-compact">
                {/^[0-9]+$/.test(source.revision)
                  ? `${copy.current}: ${source.revision}${pinned && /^[0-9]+$/.test(pinned.revision) ? ` · ${copy.pinned}: ${pinned.revision}` : ` · ${copy.added}`}`
                  : pinned && !changed
                    ? copy.matched
                    : pinned
                      ? copy.revisionMismatch
                      : copy.added}
              </p>
              {changed ? (
                <p className="text-compact font-semibold text-warning">{copy.revisionMismatch}</p>
              ) : null}
              <WorkspaceListingFacts locale={locale} source={source} />
              {source.type === "calculation" ? (
                <p className="font-semibold">{copy.calculation}</p>
              ) : null}
              <details className="min-w-0">
                <summary className="min-h-control cursor-pointer py-2 font-semibold">
                  {copy.sourceText}
                </summary>
                <p className="whitespace-pre-wrap break-words py-2 text-compact">{source.text}</p>
              </details>
              {href ? (
                <a className={workspaceLink} href={href}>
                  {copy.original}
                </a>
              ) : null}
              <TechnicalDetails locale={locale}>
                <p className="break-all">{source.key}</p>
                <p className="break-all">{source.digest}</p>
                <dl>
                  {Object.entries(source.facts).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd className="break-words">{value}</dd>
                    </div>
                  ))}
                </dl>
              </TechnicalDetails>
            </li>
          );
        })}
      </ul>
      {pins
        .filter((pin) => !context.sources.some((source) => source.key === pin.key))
        .map((pin) => (
          <Notice key={pin.key} tone="warning" title={copy.missingSource}>
            <TechnicalDetails locale={locale}>
              <p>{pin.key}</p>
              <p>
                {copy.pinned}: {pin.revision}
              </p>
            </TechnicalDetails>
          </Notice>
        ))}
    </section>
  );
}

export function WorkspaceProgress({
  locale,
  view,
}: {
  locale: string;
  view: WorkspaceProgressView;
}) {
  const copy = workspaceCopy(locale);
  return (
    <section aria-labelledby="workspace-progress" className="space-y-4">
      <h2 id="workspace-progress" className="text-subheading font-semibold">
        {copy.progress}
      </h2>
      <p className="font-semibold" role="status">
        {copy.states[view.state]}
      </p>
      {view.recovery.canResume ? <Notice tone="info" title={copy.recovery} /> : null}
      {view.sourceChanged ? (
        <Notice tone="warning" title={copy.sourceChanged}>
          <p>{copy.sourceChangedHelp}</p>
        </Notice>
      ) : null}
      <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-compact sm:grid-cols-3">
        <div>
          <dt className="text-text-muted">{copy.steps}</dt>
          <dd>{view.steps}</dd>
        </div>
        <div>
          <dt className="text-text-muted">{copy.limit}</dt>
          <dd>{view.maxSteps}</dd>
        </div>
        <div>
          <dt className="text-text-muted">{copy.ceiling}</dt>
          <dd>{assistanceCost(view.reservedCostMicros, locale)}</dd>
        </div>
        {view.hasRun ? (
          <div className="col-span-2">
            <dt className="text-text-muted">{copy.cost}</dt>
            <dd>
              {view.actualCostMicros === null
                ? copy.costUnknown
                : assistanceCost(view.actualCostMicros, locale)}
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

/** Private saved text stays server-rendered; the live status endpoint never returns it. */
export function WorkspaceCheckpoints({ locale, view }: { locale: string; view: WorkspaceView }) {
  const run = view.runs[0];
  return (
    <div className="space-y-3">
      {view.workspace.errorCode || run?.errorCode ? (
        <TechnicalDetails locale={locale}>
          <p>{view.workspace.errorCode ?? run?.errorCode}</p>
        </TechnicalDetails>
      ) : null}
      {view.checkpoints.length ? (
        <ol className="space-y-3 border-t border-border pt-4">
          {view.checkpoints.map((checkpoint) => (
            <li key={checkpoint.id} className="space-y-1">
              <p className="whitespace-pre-wrap break-words text-compact">
                {checkpoint.turn.message}
              </p>
              <TechnicalDetails locale={locale}>
                <p>{checkpoint.step}</p>
                <p>{checkpoint.turn.tool?.name ?? checkpoint.turn.next}</p>
              </TechnicalDetails>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

export function WorkspaceWorkingState({ locale, view }: { locale: string; view: WorkspaceView }) {
  const copy = workspaceCopy(locale),
    workspace = view.workspace;
  return (
    <>
      {workspace.questions.length ? (
        <section aria-labelledby="workspace-questions" className="space-y-3">
          <h2 id="workspace-questions" className="text-subheading font-semibold">
            {copy.questions}
          </h2>
          <ul className="list-disc space-y-2 ps-5">
            {workspace.questions.map((question) => (
              <li key={question} className="break-words">
                {question}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section aria-labelledby="workspace-plan" className="space-y-3">
        <h2 id="workspace-plan" className="text-subheading font-semibold">
          {copy.plan}
        </h2>
        {workspace.plan.length ? (
          <ol className="space-y-3">
            {workspace.plan.map((step) => (
              <li
                key={step.id}
                className="flex min-w-0 flex-wrap justify-between gap-x-4 gap-y-1 border-b border-border pb-3"
              >
                <span className="min-w-0 break-words">{step.title}</span>
                <span className="text-compact text-text-muted">{copy.planStates[step.state]}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-text-muted">{copy.noPlan}</p>
        )}
      </section>
      {workspace.decisions.length ? (
        <section aria-labelledby="workspace-decisions" className="space-y-3">
          <h2 id="workspace-decisions" className="text-subheading font-semibold">
            {copy.decisions}
          </h2>
          <ul className="list-disc space-y-2 ps-5">
            {workspace.decisions.map((decision) => (
              <li key={decision} className="break-words">
                {decision}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section aria-labelledby="workspace-conversation" className="space-y-4">
        <h2 id="workspace-conversation" className="text-subheading font-semibold">
          {copy.conversation}
        </h2>
        <ol className="divide-y divide-border">
          {workspace.conversation.map((turn, index) => (
            <li key={String(index) + turn.role} className="space-y-2 py-4 first:pt-0">
              <p className="text-compact font-semibold">
                {turn.role === "user" ? copy.you : copy.assistant}
              </p>
              <p className="max-w-reading whitespace-pre-wrap break-words" lang={workspace.locale}>
                {turn.text}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

export function WorkspaceArtifactContent({
  locale,
  artifact,
  context,
  revision = 1,
  language,
}: {
  locale: string;
  artifact: WorkspaceView["artifacts"][number];
  context: WorkspaceContext;
  revision?: number;
  language?: string;
}) {
  const copy = workspaceCopy(locale),
    proposal = artifact.proposal;
  return (
    <div className="space-y-4">
      <p className="text-compact font-semibold text-text-muted">
        {copy.artifactKinds[proposal.kind]} · {copy.version} {revision} ·{" "}
        {artifact.state === "draft"
          ? copy.draft
          : artifact.state === "superseded"
            ? copy.superseded
            : copy.materialized}
      </p>
      <h3 lang={language} className="break-words text-subheading font-semibold">
        {proposal.title}
      </h3>
      <p lang={language} className="max-w-reading whitespace-pre-wrap break-words">
        {proposal.body}
      </p>
      {proposal.kind === "buyer_handoff" ? (
        <dl className="space-y-4">
          <div>
            <dt className="font-semibold">{copy.requirements}</dt>
            <dd className="whitespace-pre-wrap break-words">{proposal.requirements}</dd>
          </div>
          <div>
            <dt className="font-semibold">{copy.preferences}</dt>
            <dd className="whitespace-pre-wrap break-words">{proposal.preferences || copy.none}</dd>
          </div>
          <div>
            <dt className="font-semibold">{copy.selectedListings}</dt>
            <dd>
              {proposal.listingIds.length ? (
                <ul className="list-disc space-y-1 ps-5">
                  {proposal.listingIds.map((id) => (
                    <li key={id}>
                      {context.sources.find(
                        (source) => source.type === "listing" && source.id === id,
                      )?.title ?? copy.missingSource}
                    </li>
                  ))}
                </ul>
              ) : (
                copy.none
              )}
            </dd>
          </div>
        </dl>
      ) : null}
      <section aria-label={copy.citations} className="space-y-3 border-t border-border pt-4">
        <h4 className="font-semibold">{copy.citations}</h4>
        {proposal.citations.length ? (
          <ul className="space-y-4">
            {proposal.citations.map((citation, index) => {
              const source = context.sources.find((item) => item.key === citation.source);
              return (
                <li key={String(index) + citation.source} className="space-y-2">
                  <blockquote className="whitespace-pre-wrap break-words text-compact">
                    {citation.quote}
                  </blockquote>
                  {source ? (
                    <a href={"#" + sourceAnchor(source.key)} className={workspaceLink}>
                      {source.title}
                    </a>
                  ) : (
                    <p className="text-compact text-warning">{copy.missingSource}</p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-compact text-text-muted">{copy.unsupported}</p>
        )}
      </section>
      <p className="text-compact text-text-muted">{copy.authority}</p>
      <TechnicalDetails locale={locale}>
        {artifact.operationPolicy ? (
          <p className="whitespace-pre-wrap break-words">
            {JSON.stringify(artifact.operationPolicy)}
          </p>
        ) : null}
        <p>
          {aiLabel("code", artifact.state, locale)} · {copy.version}: {artifact.version}
        </p>
        <p className="break-all">{artifact.id}</p>
        <p className="break-all">{artifact.contextDigest}</p>
      </TechnicalDetails>
    </div>
  );
}
