import "server-only";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { DiscoveryPage } from "@/features/discovery/page";
import { workCopy } from "@/features/work/copy";
import { isStaffLocale, localeDirection, localeEndonyms, type PublicLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import type { Session } from "@/server/auth/sessions";
import { getEnv } from "@/server/config/env";
import {
  type ContentLocaleDecision,
  readContentLocaleOperation,
  readContentLocaleWorkbench,
  reviewedContentLocaleKinds,
} from "@/server/content/locale-commands";
import { contentBody } from "@/server/content/public";
import { AppError } from "@/server/errors";
import { initialFormState } from "@/ui/form/server";
import { Notice } from "@/ui/notice";
import { Receipt } from "@/ui/receipt";
import { TechnicalDetails } from "@/ui/technical-details";
import type { DecisionValues } from "./actions";
import { contentCopy } from "./copy";
import { ContentEditionLinks } from "./edition-links";
import { contentLabel } from "./labels";
import {
  type ContentLocaleBinding,
  decideContentLocaleAction,
  type LocaleContentValues,
  saveContentLocaleAction,
} from "./locale-actions";
import { contentLocaleCopy, contentLocaleState } from "./locale-copy";
import { ContentLocaleForm, ContentLocaleReviewForm } from "./locale-forms";
import { ContentPlaintext } from "./plaintext";

function privateError(error: unknown): never {
  if (
    error instanceof AppError &&
    ["not_found", "forbidden", "validation_failed"].includes(error.code)
  )
    notFound();
  throw error;
}

export async function ContentLocaleScreen({
  shell,
  id,
  target,
  session,
}: {
  shell: string;
  id: string;
  target: ContentLocaleDecision["locale"];
  session: Session;
}) {
  const workbench = await readContentLocaleWorkbench(getDb(), session, id, target).catch(
    privateError,
  );
  const {
    page,
    source,
    sourceReady,
    sourceCurrent,
    current,
    edition,
    decisions,
    access,
    localeEditions,
    boundSource,
  } = workbench;
  const copy = contentCopy(shell),
    local = contentLocaleCopy(shell);
  const body = current ? contentBody.parse(current.body) : null;
  const original = boundSource ? contentBody.parse(boundSource.body) : null;
  const binding: ContentLocaleBinding | null = source
    ? {
        sourceExpectedVersion: page.version,
        sourceVersionId: source.version.id,
        sourceVersionHash: source.version.contentHash,
      }
    : current
      ? {
          sourceExpectedVersion: page.version,
          sourceVersionId: current.sourceVersionId,
          sourceVersionHash: current.sourceVersionHash,
        }
      : null;
  const reviewed = reviewedContentLocaleKinds(workbench, target);
  const actions: ContentLocaleDecision["decision"][] = [];
  if (current && sourceCurrent) {
    if (edition?.reviewState === "draft" && access["content.edit"]) actions.push("request_review");
    if (edition?.reviewState === "in_review") {
      if (access["claim.approve"] && !reviewed.includes("legal_process_claim"))
        actions.push("claims");
      if (access["translation.review"] && !reviewed.includes("language")) actions.push("language");
      if (access["listing.review_facts"] && !reviewed.includes("editorial"))
        actions.push("editorial");
      if (
        access["publication.release"] &&
        ["legal_process_claim", "language", "editorial"].every((kind) =>
          reviewed.includes(kind as (typeof reviewed)[number]),
        )
      )
        actions.push("publish");
    }
    if (access["translation.review"] && edition?.reviewState !== "rejected") actions.push("reject");
  }
  if (edition?.publicationState === "active" && access["publication.release"])
    actions.push("withdraw");
  const state = current && !sourceCurrent ? "stale" : (edition?.reviewState ?? "missing");
  const publicPath =
    page.kind === "service" && ["sell", "let"].includes(page.slug)
      ? page.slug
      : page.kind === "help" && page.slug === "contact"
        ? "contact"
        : `${page.kind === "area" ? "areas" : page.kind === "service" ? "services" : "help"}/${page.slug}`;
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">
        {local.editions} · <bdi lang={target}>{localeEndonyms[target]}</bdi>
      </h1>
      <ContentEditionLinks shell={shell} id={id} selected={target} editions={localeEditions} />
      <p>{local.sourceNote}</p>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt>{local.target}</dt>
          <dd>
            <bdi lang={target}>{localeEndonyms[target]}</bdi>
          </dd>
        </div>
        <div>
          <dt>{copy.state}</dt>
          <dd>{contentLocaleState(state, shell)}</dd>
        </div>
        <div>
          <dt>{local.sourceRevision}</dt>
          <dd>{source?.version.number ?? copy.none}</dd>
        </div>
        <div>
          <dt>{copy.live}</dt>
          <dd>
            {edition ? contentLabel("publication", edition.publicationState, shell) : copy.none}
            {edition?.publicationState === "active" ? ` · ${edition.publishedVersionNumber}` : ""}
          </dd>
        </div>
      </dl>
      {!sourceReady ? <Notice tone="warning" title={local.sourceHeld} /> : null}
      {current && !sourceCurrent ? <Notice tone="warning" title={local.stale} /> : null}
      {source ? (
        <section className="max-w-reading space-y-4 rounded-panel border border-border p-5">
          <h2 className="text-subheading font-semibold">{local.source}</h2>
          <article lang="bg" dir="ltr" className="space-y-4 break-words">
            <h3 className="font-semibold">
              <ContentPlaintext text={source.title} />
            </h3>
            {source.paragraphs.map((paragraph, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: immutable source paragraph positions
              <p key={`${source.version.id}:${index}`} className="whitespace-pre-wrap">
                <ContentPlaintext text={paragraph} />
              </p>
            ))}
          </article>
        </section>
      ) : null}
      <TechnicalDetails locale={shell}>
        <p>
          {local.currentSource}: <bdi>{source?.version.id ?? copy.none}</bdi> ·{" "}
          <bdi>{source?.version.contentHash ?? copy.none}</bdi>
        </p>
        <p>
          {local.boundSource}: <bdi>{current?.sourceVersionId ?? copy.none}</bdi> ·{" "}
          <bdi>{current?.sourceVersionHash ?? copy.none}</bdi>
        </p>
      </TechnicalDetails>
      {original && !sourceCurrent ? (
        <section className="max-w-reading space-y-4 rounded-panel border border-border p-5">
          <h2 className="text-subheading font-semibold">{local.boundSource}</h2>
          <article lang="bg" dir="ltr" className="space-y-4 break-words">
            <h3 className="font-semibold">
              <ContentPlaintext text={original.title} />
            </h3>
            {original.paragraphs.map((paragraph, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: immutable historical source positions
              <p key={`${boundSource?.id}:${index}`} className="whitespace-pre-wrap">
                <ContentPlaintext text={paragraph} />
              </p>
            ))}
          </article>
        </section>
      ) : null}
      {body ? (
        <section className="max-w-reading space-y-4 rounded-panel border border-border p-5">
          <h2 className="text-subheading font-semibold">{local.preview}</h2>
          <article lang={target} dir={localeDirection(target)} className="space-y-4 break-words">
            <h3 className="font-semibold">
              <ContentPlaintext text={body.title} />
            </h3>
            {body.paragraphs.map((paragraph, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: immutable target paragraph positions
              <p key={`${current?.id}:${index}`} className="whitespace-pre-wrap">
                <ContentPlaintext text={paragraph} />
              </p>
            ))}
          </article>
        </section>
      ) : null}
      {access["content.edit"] && sourceReady && binding ? (
        <section className="space-y-4">
          <h2 className="text-subheading font-semibold">{copy.draft}</h2>
          <ContentLocaleForm
            shell={shell}
            id={id}
            target={target}
            initialState={initialFormState<LocaleContentValues>(
              `content.locale.save.${id}.${target}`,
              { title: body?.title ?? "", text: body?.paragraphs.join("\n\n") ?? "" },
              edition?.version ?? 1,
            )}
            action={saveContentLocaleAction.bind(null, shell, id, target, binding)}
          />
        </section>
      ) : null}
      <section className="space-y-3">
        <h2 className="text-subheading font-semibold">{copy.reviews}</h2>
        <p>{local.sameHuman}</p>
        {decisions.length ? (
          <ul className="space-y-3">
            {decisions.map((decision) => (
              <li key={decision.id}>
                {contentLabel("review", decision.kind, shell)} ·{" "}
                {contentLabel("state", decision.state, shell)} ·{" "}
                {decision.decidedAt
                  ? formatDateTime(isStaffLocale(shell) ? shell : "bg", decision.decidedAt)
                  : copy.none}
                <p className="break-words">{decision.decisionNote}</p>
                {decision.expiresAt ? (
                  <p>
                    {copy.until}:{" "}
                    {formatDateTime(isStaffLocale(shell) ? shell : "bg", decision.expiresAt)}
                  </p>
                ) : null}
                <TechnicalDetails locale={shell}>
                  <p>
                    <bdi>{decision.decidedById}</bdi> · {decision.decidedWithCapability}
                  </p>
                  <p>
                    <bdi>{decision.id}</bdi> · <bdi>{decision.subjectHash}</bdi>
                  </p>
                </TechnicalDetails>
              </li>
            ))}
          </ul>
        ) : (
          <p>{local.noApprovals}</p>
        )}
      </section>
      {binding
        ? actions.map((decision) => (
            <section key={decision} className="space-y-4 rounded-panel border border-border p-5">
              <h2 className="text-subheading font-semibold">{local[decision]}</h2>
              <ContentLocaleReviewForm
                shell={shell}
                id={id}
                target={target}
                decision={decision}
                initialState={initialFormState<DecisionValues>(
                  `content.locale.decide.${id}.${target}.${decision}`,
                  { note: "", expiresAt: "", reviewed: "" },
                  edition?.version ?? 1,
                )}
                action={decideContentLocaleAction.bind(null, shell, id, target, binding, decision)}
              />
            </section>
          ))
        : null}
      {edition?.publicationState === "active" && sourceCurrent ? (
        <a
          className="underline"
          href={`${getEnv().hosts.public}/${target}/${publicPath}`}
          hrefLang={target}
        >
          {local.public}
        </a>
      ) : null}
      <a className="underline" href={`/${shell}/content`}>
        {copy.back}
      </a>
    </DiscoveryPage>
  );
}

export async function ContentLocaleOperationScreen({
  shell,
  id,
  target,
  session,
  kind,
  operationKey,
}: {
  shell: string;
  id: string;
  target: string;
  session: Session;
  kind: "save" | "decide";
  operationKey: string;
}) {
  const result = await readContentLocaleOperation(
    getDb(),
    session,
    id,
    target,
    kind,
    operationKey,
  ).catch(privateError);
  const copy = contentCopy(shell),
    local = contentLocaleCopy(shell),
    form = workCopy(shell).form;
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">{copy.check}</h1>
      {result?.status === "succeeded" && result.outcome?.recordedAt ? (
        <Receipt
          locale={shell}
          title={local.saved}
          reference={result.operationId}
          referenceLabel={form.reference}
          recordedAt={{
            dateTime: result.outcome.recordedAt,
            label: formatDateTime(isStaffLocale(shell) ? shell : "bg", result.outcome.recordedAt),
          }}
          recordedAtLabel={form.recordedAt}
        >
          {result.title ? (
            <h2
              className="font-semibold"
              lang={target}
              dir={localeDirection(target as PublicLocale)}
            >
              <ContentPlaintext text={result.title} />
            </h2>
          ) : null}
          <p>
            {local.target}: <bdi lang={target}>{localeEndonyms[target as PublicLocale]}</bdi>
          </p>
          <p>
            {copy.draft}: {result.outcome.editionVersion} ·{" "}
            {contentLocaleState(result.outcome.reviewState ?? "missing", shell)}
          </p>
          <p>{local.next}</p>
        </Receipt>
      ) : (
        <Notice
          tone="info"
          title={result ? contentLabel("operation", result.status, shell) : copy.statusMissing}
        />
      )}
      <a className="underline" href={`/${shell}/content/${id}/editions/${target}`}>
        {copy.open}
      </a>
    </DiscoveryPage>
  );
}
