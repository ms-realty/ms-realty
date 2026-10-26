// O26/F30: native working record, exact source review, human timer and attributed history.
import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import {
  emptyGovernanceDocument,
  governanceKinds,
  governanceToValues,
} from "@/domain/privacy-governance";
import { governancePageSession } from "@/features/privacy-governance/access";
import { governanceCopy } from "@/features/privacy-governance/copy";
import { GovernanceDraftForm, GovernanceReviewForm } from "@/features/privacy-governance/forms";
import { GovernanceDocumentView, GovernanceTimer } from "@/features/privacy-governance/review";
import { StaffPage, StaffPanel, StaffToolbar } from "@/features/shell/staff-ui";
import { workCopy } from "@/features/work/copy";
import { isStaffLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { can } from "@/server/authz";
import { isAppError } from "@/server/errors";
import {
  governanceOwners,
  governanceResource,
  readGovernance,
} from "@/server/privacy-governance/service";
import { initialFormState } from "@/ui/form/server";
import { reviewGovernanceAction, saveGovernanceAction } from "../actions";

export default async function GovernanceRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, id } = await params;
  if (!isStaffLocale(locale) || (id !== "new" && !z.uuid().safeParse(id).success)) notFound();
  const query = await searchParams,
    copy = governanceCopy(locale),
    base = `/${locale}/operations/privacy-governance`,
    requestedKind = governanceKinds.find((kind) => kind === query.kind),
    isNew = id === "new";
  if (isNew && !requestedKind) notFound();
  const path = isNew
    ? `${base}/new?kind=${requestedKind}&draft=${typeof query.draft === "string" ? query.draft : ""}`
    : `${base}/${id}`;
  const session = await governancePageSession(locale, path);
  if (!session)
    return (
      <StaffPage title={copy.title} lead={copy.denied}>
        <a href={`/${locale}/settings`}>{copy.settings}</a>
      </StaffPage>
    );
  if (isNew && (typeof query.draft !== "string" || !z.uuid().safeParse(query.draft).success))
    redirect(`${base}/new?kind=${requestedKind}&draft=${randomUUID()}`);
  const recordId = isNew ? (query.draft as string) : id,
    db = getDb();
  const historyPage =
    typeof query.historyPage === "string" &&
    /^[1-9]\d*$/.test(query.historyPage) &&
    Number(query.historyPage) <= 10000
      ? Number(query.historyPage)
      : 1;
  let model: Awaited<ReturnType<typeof readGovernance>> | null = null;
  try {
    model = await readGovernance(db, session, recordId, { historyPage });
  } catch (error) {
    if (!(isAppError(error) && error.code === "not_found" && isNew)) {
      if (isAppError(error) && error.code === "not_found") notFound();
      throw error;
    }
  }
  const document = model?.document ?? emptyGovernanceDocument(requestedKind ?? "processing"),
    people = await governanceOwners(db, session),
    qualified =
      document.kind !== "incident" ||
      (await can(db, session.actor, "claim.approve", governanceResource)),
    statusPath = `${base}/${recordId}/operations`,
    formCopy = workCopy(locale).form,
    names = [...people.owners, ...people.reviewers, ...(model?.people ?? [])],
    now = new Date();
  return (
    <StaffPage
      title={model?.document.title ?? `${copy.new} · ${copy.kinds[document.kind]}`}
      lead={copy.policyHelp}
      actions={
        <a className="text-action hover:underline" href={base}>
          {copy.back}
        </a>
      }
    >
      <StaffToolbar>
        <span>{copy.kinds[document.kind]}</span>
        <span>
          {copy.version} <bdi>{model?.version ?? 1}</bdi>
        </span>
        <span>
          {model?.issues.length ? copy.held : model?.reviewed ? copy.reviewed : copy.unreviewed}
        </span>
      </StaffToolbar>
      <GovernanceTimer
        document={model?.latestReview?.document ?? document}
        reviewed={Boolean(model?.latestReview)}
        locale={locale}
        copy={copy}
        now={now}
        href={path}
      />
      <StaffPanel title={copy.draft}>
        {model?.latestReview && !model.reviewed ? (
          <p className="text-dense text-text-muted">{copy.workingChanged}</p>
        ) : null}
        <GovernanceDraftForm
          path={path}
          statusPath={statusPath}
          copy={copy}
          formCopy={formCopy}
          kind={document.kind}
          owners={people.owners}
          reviewers={people.reviewers}
          initialState={initialFormState(
            `privacy_governance.save.${recordId}`,
            governanceToValues(document),
            model?.version ?? 1,
          )}
          action={saveGovernanceAction.bind(null, locale, recordId, document.kind)}
        />
      </StaffPanel>
      {model ? (
        <StaffPanel title={model.reviewed ? copy.reviewed : copy.review}>
          <GovernanceDocumentView document={model.document} copy={copy} people={names} />
          <dl className="mt-4 space-y-1 text-dense">
            <dt>{copy.hash}</dt>
            <dd className="break-all">
              <bdi>{model.contentHash}</bdi>
            </dd>
            <dt>{copy.recordId}</dt>
            <dd className="break-all">
              <bdi>{recordId}</bdi>
            </dd>
          </dl>
          {model.issues.length ? (
            <div className="mt-4 space-y-2" role="status">
              <h3 className="font-semibold">{copy.missing}</h3>
              <ul className="list-disc ps-5">
                {model.issues.map((issue) => (
                  <li key={issue}>
                    {copy.fields[issue as keyof typeof copy.fields] ?? copy.invalid}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {!qualified && !model.reviewed ? (
            <p className="mt-4 text-dense">{copy.qualifiedRequired}</p>
          ) : null}
          {!model.reviewed && !model.issues.length && qualified ? (
            <div className="mt-5">
              <GovernanceReviewForm
                path={path}
                statusPath={statusPath}
                copy={copy}
                formCopy={formCopy}
                initialState={initialFormState(
                  `privacy_governance.review.${recordId}`,
                  { expectedHash: model.contentHash, note: "", reviewed: "" },
                  model.version,
                )}
                action={reviewGovernanceAction.bind(null, locale, recordId)}
              />
            </div>
          ) : null}
        </StaffPanel>
      ) : null}
      {model?.latestReview && !model.reviewed ? (
        <StaffPanel title={copy.previousReview}>
          <GovernanceDocumentView
            document={model.latestReview.document}
            copy={copy}
            people={names}
          />
          <a
            className="text-action hover:underline"
            href={`${base}/${recordId}/versions/${model.latestReview.recordVersion}`}
          >
            {copy.version} {model.latestReview.recordVersion}
          </a>
        </StaffPanel>
      ) : null}
      {model ? (
        <StaffPanel title={copy.history}>
          <ol className="grid gap-4">
            {model.history.map((row) => (
              <li key={row.id} className="space-y-1 border-b border-divider pb-3 text-dense">
                <a
                  className="text-action hover:underline"
                  href={`${base}/${recordId}/versions/${row.recordVersion}`}
                >
                  {copy.version} {row.recordVersion}
                </a>
                <p>
                  {row.action === "reviewed" ? copy.reviewed : copy.saved} · {copy.actor}{" "}
                  {row.actorName}
                </p>
                <time dateTime={row.recordedAt.toISOString()}>
                  {formatDateTime(locale, row.recordedAt)}
                </time>
                {row.note ? <p className="whitespace-pre-wrap wrap-anywhere">{row.note}</p> : null}
              </li>
            ))}
          </ol>
          <StaffToolbar>
            {model.historyPage > 1 ? (
              <a href={`${base}/${recordId}?historyPage=${model.historyPage - 1}`}>
                {copy.previous}
              </a>
            ) : null}
            {model.historyMore ? (
              <a href={`${base}/${recordId}?historyPage=${model.historyPage + 1}`}>{copy.next}</a>
            ) : null}
          </StaffToolbar>
        </StaffPanel>
      ) : null}
    </StaffPage>
  );
}
