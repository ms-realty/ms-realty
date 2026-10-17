import "server-only";

import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { DiscoveryPage } from "@/features/discovery/page";
import { isStaffLocale } from "@/i18n/config";
import { listWorkspaces, readWorkspace, readWorkspaceOperation } from "@/server/ai/workspace";
import { workspaceConfig } from "@/server/ai/workspace-config";
import { resolveWorkspaceContext } from "@/server/ai/workspace-context";
import type { Session } from "@/server/auth/sessions";
import { listCases } from "@/server/cases/queries";
import { AppError } from "@/server/errors";
import { inventoryListPage } from "@/server/inventory/queries";
import type { OperationView } from "@/server/operations";
import { inquiryIdByReference, listInbox } from "@/server/work/queries";
import { liveStaff } from "@/server/work/shared";
import { buttonClass } from "@/ui/button-class";
import { controlClass, labelClass } from "@/ui/field-class";
import { initialFormState } from "@/ui/form/server";
import { Notice } from "@/ui/notice";
import { TechnicalDetails } from "@/ui/technical-details";
import { workspaceAction } from "./workspace-actions";
import { workspaceCopy } from "./workspace-copy";
import { WorkspaceForm } from "./workspace-forms";
import { WorkspaceLiveProgress } from "./workspace-live-progress";
import {
  WorkspaceArtifactContent,
  WorkspaceCheckpoints,
  WorkspaceSources,
  WorkspaceWorkingState,
  workspaceLink,
} from "./workspace-panels";
import { projectWorkspaceProgress } from "./workspace-progress";
import {
  type ContextChoice,
  emptyWorkspaceValues,
  type WorkspaceChoices,
  type WorkspaceMode,
  type WorkspaceParent,
  type WorkspaceValues,
  type WorkspaceView,
  workspaceHref,
  workspaceScope,
} from "./workspace-types";

function privateError(error: unknown): never {
  if (
    error instanceof AppError &&
    ["not_found", "forbidden", "validation_failed", "approval_stale"].includes(error.code)
  )
    notFound();
  throw error;
}
async function optional<T>(request: Promise<T>, fallback: T): Promise<T> {
  try {
    return await request;
  } catch (error) {
    if (
      error instanceof AppError &&
      ["not_found", "forbidden", "validation_failed"].includes(error.code)
    )
      return fallback;
    throw error;
  }
}

/** Choice labels are authorized projections. Selecting a choice still re-reads every source. */
async function contextChoices(session: Session, q: string): Promise<WorkspaceChoices> {
  const db = getDb(),
    live = await liveStaff(db, session);
  const [caseRows, queue, inventory, exactInquiry] = await Promise.all([
    optional(listCases(db, session, q), []),
    optional(listInbox(db, session, "all"), { rows: [], page: 1, hasMore: false, total: 0 }),
    optional(inventoryListPage(db, live.actor, { q, pageSize: 24 }), {
      rows: [],
      total: 0,
      nextCursor: null,
    }),
    q.length >= 3 && q.length <= 80
      ? optional(inquiryIdByReference(db, session, q), null)
      : Promise.resolve(null),
  ]);
  const eligible = async (
    kind: "case" | "inquiry" | "listing",
    id: string,
  ): Promise<ContextChoice | null> => {
    const context = await optional(
      resolveWorkspaceContext(db, live.actor, {
        caseId: kind === "case" ? id : null,
        inquiryId: kind === "inquiry" ? id : null,
        listingIds: kind === "listing" ? [id] : [],
      }),
      null,
    ).catch((error: unknown) => {
      // Inventory includes drafts and withdrawn offers; they are not approved research choices.
      if (kind === "listing" && error instanceof AppError && error.code === "listing_unavailable")
        return null;
      throw error;
    });
    const source = context?.sources.find((item) => item.key === kind + ":" + id);
    if (!source) return null;
    return {
      id,
      reference: source.facts.reference || source.title,
      title: kind === "case" ? (source.text.split("\n")[0] ?? "") : "",
    };
  };
  const inquiryIds = exactInquiry
    ? [exactInquiry]
    : queue.rows
        .filter((row) => !q || row.inquiry.reference.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 20)
        .map((row) => row.inquiry.id);
  const [cases, inquiries, listings] = await Promise.all([
    Promise.all(caseRows.slice(0, 20).map((row) => eligible("case", row.id))),
    Promise.all(inquiryIds.map((id) => eligible("inquiry", id))),
    Promise.all(inventory.rows.map((row) => eligible("listing", row.listing.id))),
  ]);
  return {
    cases: cases.filter((row) => row !== null),
    inquiries: inquiries.filter((row) => row !== null),
    listings: listings.filter((row) => row !== null),
  };
}
function statusHref(locale: string, id: string, mode: WorkspaceMode, key: string) {
  return (
    workspaceHref(locale, id) +
    "?" +
    new URLSearchParams({ operation: key, command: mode === "revise" ? "artifact.revise" : mode })
  );
}

export async function WorkspaceEntryScreen({
  locale,
  session,
  id,
  q = "",
}: {
  locale: string;
  session: Session;
  id: string;
  q?: string;
}) {
  const copy = workspaceCopy(locale),
    path = workspaceHref(locale) + "?draft=" + id;
  const [choices, workspaces] = await Promise.all([
    contextChoices(session, q),
    listWorkspaces(getDb(), session),
  ]);
  const initial = initialFormState<WorkspaceValues>(workspaceScope("create", id), {
    ...emptyWorkspaceValues,
  });
  return (
    <DiscoveryPage>
      <header className="max-w-reading space-y-3">
        <h1 className="text-title font-semibold">{copy.title}</h1>
        <p>{copy.lead}</p>
        <p className="text-compact text-text-muted">{copy.boundary}</p>
      </header>
      {!workspaceConfig().enabled ? <Notice tone="info" title={copy.disabled} /> : null}
      <div className="grid min-w-0 gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-label={copy.goal} className="min-w-0 space-y-6">
          <WorkspaceForm
            locale={locale}
            mode="create"
            action={workspaceAction.bind(null, locale, id, "create", null, [], null)}
            initialState={initial}
            path={path}
            statusHref={statusHref(locale, id, "create", initial.operationId)}
            retentionKey={session.account.id + ":create:" + id}
            choices={choices}
            commandAvailable={!workspaces.some((workspace) => workspace.id === id)}
          />
          {workspaces.some((workspace) => workspace.id === id) ? (
            <a className={workspaceLink} href={workspaceHref(locale, id)}>
              {copy.open}
            </a>
          ) : null}
        </section>
        <aside
          aria-labelledby="workspace-recent"
          className="min-w-0 space-y-4 border-t border-border pt-6 lg:border-t-0 lg:pt-0"
        >
          <form action={workspaceHref(locale)} method="get" className="space-y-3">
            <input type="hidden" name="draft" value={id} />
            <label htmlFor="workspace-context-search" className={labelClass}>
              {copy.search}
            </label>
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
              <input
                id="workspace-context-search"
                name="q"
                type="search"
                defaultValue={q}
                maxLength={120}
                className={controlClass}
              />
              <button type="submit" className={buttonClass("secondary", "shrink-0")}>
                {copy.find}
              </button>
            </div>
            <p className="text-compact text-text-muted">{copy.contextLimited}</p>
          </form>
          <h2 id="workspace-recent" className="text-subheading font-semibold">
            {copy.recent}
          </h2>
          {workspaces.length ? (
            <ul className="divide-y divide-border">
              {workspaces.map((workspace) => (
                <li key={workspace.id} className="space-y-1 py-4 first:pt-0">
                  <a
                    className={workspaceLink + " break-words"}
                    href={workspaceHref(locale, workspace.id)}
                  >
                    {workspace.goal}
                  </a>
                  <p className="text-compact text-text-muted">{copy.states[workspace.state]}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-text-muted">{copy.empty}</p>
          )}
        </aside>
      </div>
      <a href={"/" + locale + "/operations/assistance"} className={workspaceLink}>
        {copy.back}
      </a>
    </DiscoveryPage>
  );
}

function workspaceParents(view: WorkspaceView): WorkspaceParent[] {
  return (["case", "inquiry"] as const).flatMap((type) => {
    const id =
      type === "case" ? view.workspace.selection.caseId : view.workspace.selection.inquiryId;
    const source = view.context.sources.find((item) => item.key === type + ":" + id);
    const expectedVersion = Number(source?.facts.version);
    return id && source && Number.isSafeInteger(expectedVersion) && expectedVersion > 0
      ? [{ type, id, expectedVersion, label: source.title }]
      : [];
  });
}

function artifactRevision(
  artifact: WorkspaceView["artifacts"][number],
  artifacts: WorkspaceView["artifacts"],
): number {
  let revision = 1,
    previous = artifact.replacesId;
  const visited = new Set<string>([artifact.id]);
  while (previous && !visited.has(previous)) {
    visited.add(previous);
    const source = artifacts.find((item) => item.id === previous);
    if (!source) break;
    revision += 1;
    previous = source.replacesId;
  }
  return revision;
}

export function WorkspaceOperationPanel({
  locale,
  operation,
  href,
}: {
  locale: string;
  operation: OperationView | null;
  href: string;
}) {
  const copy = workspaceCopy(locale);
  const saved = operation?.status === "succeeded";
  const outcome =
    operation?.outcome && typeof operation.outcome === "object"
      ? (operation.outcome as Record<string, unknown>)
      : null;
  const result =
    outcome?.result && typeof outcome.result === "object"
      ? (outcome.result as Record<string, unknown>)
      : null;
  const recordHref =
    result && typeof result.id === "string" && ["case", "task"].includes(String(result.type))
      ? "/" + locale + (result.type === "case" ? "/cases/" : "/tasks/") + result.id
      : null;
  return (
    <Notice
      tone={saved ? "success" : "warning"}
      title={
        saved
          ? copy.operationSaved
          : operation?.status === "failed"
            ? copy.denied
            : operation
              ? copy.operationPending
              : copy.notFoundOperation
      }
    >
      <p>{saved ? copy.recordNext : copy.retained}</p>
      <a href={recordHref ?? href} className={workspaceLink}>
        {recordHref ? copy.openRecord : copy.refresh}
      </a>
      {operation ? (
        <TechnicalDetails locale={locale}>
          <p>{operation.operationId}</p>
          <p>{operation.status}</p>
        </TechnicalDetails>
      ) : null}
    </Notice>
  );
}

export async function WorkspaceDetailScreen({
  locale,
  session,
  id,
  operationKey,
  command,
}: {
  locale: string;
  session: Session;
  id: string;
  operationKey?: string;
  command?: Parameters<typeof readWorkspaceOperation>[4];
}) {
  const copy = workspaceCopy(locale),
    path = workspaceHref(locale, id);
  const operation = operationKey
    ? await readWorkspaceOperation(getDb(), session, id, operationKey, command).catch(privateError)
    : null;
  let view: WorkspaceView;
  try {
    view = await readWorkspace(getDb(), session, id);
  } catch (error) {
    if (operationKey && error instanceof AppError && error.code === "not_found")
      return (
        <DiscoveryPage>
          <h1 className="text-title font-semibold">{copy.title}</h1>
          <WorkspaceOperationPanel
            locale={locale}
            operation={operation}
            href={
              path +
              "?" +
              new URLSearchParams({ operation: operationKey, ...(command ? { command } : {}) })
            }
          />
          <a href={workspaceHref(locale)} className={workspaceLink}>
            {copy.allWork}
          </a>
        </DiscoveryPage>
      );
    return privateError(error);
  }
  const unresolved = Boolean(
    operationKey && !["succeeded", "failed"].includes(operation?.status ?? ""),
  );
  const refreshHref = operationKey
    ? path + "?" + new URLSearchParams({ operation: operationKey, ...(command ? { command } : {}) })
    : path;
  const workspace = view.workspace,
    parents = workspaceParents(view);
  const buyerParent = parents.filter(
    (parent) =>
      parent.type === "case" &&
      view.context.sources.some(
        (source) =>
          source.key === "case:" + parent.id &&
          ["buyer", "tenant"].includes(source.facts.kind ?? ""),
      ),
  );
  const active = ["queued", "running"].includes(workspace.state);
  const renderForm = (
    mode: WorkspaceMode,
    values: Partial<WorkspaceValues>,
    revision: number,
    options: {
      artifactId?: string;
      buyer?: boolean;
      available?: boolean;
      parents?: WorkspaceParent[];
    } = {},
  ) => {
    const initial = initialFormState<WorkspaceValues>(
      workspaceScope(mode, id, options.artifactId),
      { ...emptyWorkspaceValues, ...values },
      revision,
    );
    return (
      <WorkspaceForm
        locale={locale}
        mode={mode}
        initialState={initial}
        action={workspaceAction.bind(
          null,
          locale,
          id,
          mode,
          options.artifactId ?? null,
          options.parents ?? parents,
          mode === "message" || mode === "cancel" ? workspace.generation : null,
        )}
        path={path}
        statusHref={statusHref(locale, id, mode, initial.operationId)}
        retentionKey={
          session.account.id + ":" + id + ":" + mode + ":" + (options.artifactId ?? "workspace")
        }
        parents={options.parents ?? parents}
        buyer={options.buyer}
        firstRun={view.runs.length === 0}
        commandAvailable={options.available !== false && !unresolved}
        unknownProvider={view.recovery?.requiresUnknownAck ?? false}
      />
    );
  };
  return (
    <DiscoveryPage>
      <header className="max-w-reading space-y-3">
        <a href={workspaceHref(locale)} className={workspaceLink}>
          {copy.allWork}
        </a>
        <h1 className="break-words text-title font-semibold">{workspace.goal}</h1>
        <p className="text-compact text-text-muted">{copy.boundary}</p>
        {workspace.constraints.length ? (
          <ul className="list-disc space-y-1 ps-5">
            {workspace.constraints.map((constraint) => (
              <li key={constraint} className="break-words">
                {constraint}
              </li>
            ))}
          </ul>
        ) : null}
      </header>
      {operationKey ? (
        <WorkspaceOperationPanel
          locale={locale}
          operation={operation}
          href={
            path +
            "?" +
            new URLSearchParams({ operation: operationKey, ...(command ? { command } : {}) })
          }
        />
      ) : null}
      {!view.availability.enabled ? <Notice tone="info" title={copy.disabled} /> : null}
      <nav aria-label={copy.progress} className="space-y-2">
        <a className={buttonClass("secondary")} href={refreshHref}>
          {copy.refresh}
        </a>
        <p className="max-w-reading text-compact text-text-muted">{copy.refreshHelp}</p>
      </nav>
      <div className="grid min-w-0 items-start gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-8">
          <div className="space-y-4">
            <WorkspaceLiveProgress
              locale={locale}
              initial={projectWorkspaceProgress(view)}
              workspaceId={id}
              latestUrl={refreshHref}
            />
            <WorkspaceCheckpoints locale={locale} view={view} />
          </div>
          <WorkspaceWorkingState locale={locale} view={view} />
          <section aria-label={copy.message} className="space-y-4 border-t border-border pt-6">
            {renderForm(
              "message",
              { goal: workspace.goal, constraints: workspace.constraints.join("\n") },
              workspace.version,
            )}
          </section>
          {renderForm("research", {}, workspace.version, {
            available:
              view.availability.enabled &&
              (workspace.state !== "running" || Boolean(view.recovery?.canResume)),
          })}
          {renderForm("cancel", {}, workspace.version, { available: active })}
        </div>
        <WorkspaceSources locale={locale} context={view.context} pins={workspace.contextPins} />
      </div>
      <section
        aria-labelledby="workspace-artifacts"
        className="space-y-6 border-t border-border pt-8"
      >
        <h2 id="workspace-artifacts" className="text-subheading font-semibold">
          {copy.artifacts}
        </h2>
        {!view.artifacts.length ? <p className="text-text-muted">{copy.noArtifacts}</p> : null}
        {view.artifacts.map((artifact) => {
          const proposal = artifact.proposal,
            stale = artifact.contextDigest !== view.context.digest;
          const buyer = proposal.kind === "buyer_handoff";
          const result = artifact.result,
            destination =
              result && typeof result.id === "string"
                ? "/" + locale + (result.type === "task" ? "/tasks/" : "/cases/") + result.id
                : null;
          return (
            <article
              key={artifact.id}
              id={"artifact-" + artifact.id}
              className="min-w-0 space-y-6 border-t border-border pt-6"
            >
              <WorkspaceArtifactContent
                locale={locale}
                artifact={artifact}
                context={view.context}
                language={workspace.locale}
                revision={artifactRevision(artifact, view.artifacts)}
              />
              {stale && artifact.state === "draft" ? (
                <Notice tone="warning" title={copy.stale} />
              ) : null}
              {renderForm(
                "revise",
                {
                  title: proposal.title,
                  body: proposal.body,
                  ...(buyer
                    ? {
                        requirements: proposal.requirements,
                        preferences: proposal.preferences,
                        listingIds: proposal.listingIds.join("\n"),
                      }
                    : {}),
                },
                artifact.version,
                { artifactId: artifact.id, buyer, available: artifact.state === "draft" },
              )}
              {proposal.kind === "task" || buyer ? (
                <div className="max-w-reading space-y-4">
                  {artifact.state === "draft" ? (
                    <h4 className="font-semibold">{copy.materialize}</h4>
                  ) : null}
                  {buyer && !buyerParent.length ? (
                    <p>{copy.buyerNeedsCase}</p>
                  ) : (
                    renderForm(
                      "materialize",
                      { parent: buyer ? "case" : (parents[0]?.type ?? "none") },
                      artifact.version,
                      {
                        artifactId: artifact.id,
                        buyer,
                        parents: buyer ? buyerParent : parents,
                        available: artifact.state === "draft" && !stale,
                      },
                    )
                  )}
                </div>
              ) : artifact.state === "draft" ? (
                <p className="text-compact text-text-muted">{copy.manualResearch}</p>
              ) : null}
              {artifact.state === "materialized" && destination ? (
                <div className="space-y-3">
                  <a className={workspaceLink} href={destination}>
                    {copy.openRecord}
                  </a>
                  {buyer && typeof result?.id === "string" ? (
                    <p>
                      <a
                        className={workspaceLink}
                        href={"/" + locale + "/cases/" + result.id + "/matching"}
                      >
                        {copy.manualListings}
                      </a>
                    </p>
                  ) : null}
                  <TechnicalDetails locale={locale}>
                    <p>{artifact.receiptId}</p>
                  </TechnicalDetails>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
    </DiscoveryPage>
  );
}

export function checkWorkspaceLocale(locale: string) {
  if (!isStaffLocale(locale)) notFound();
}
