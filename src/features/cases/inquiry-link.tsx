// O03 existing-Case candidates (inside InquiryScreen) and the O03L review / O03LR result route
// (Figma 20:1055 / 25:2228 and 20:1175 / 25:2279). C02 decides eligibility and enforces every
// check on submit; this layer only words the candidates, the effects and the outcome.
import "server-only";
import { sql } from "drizzle-orm";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { CaseStage } from "@/domain/case";
import { inquiryMachine } from "@/domain/inquiry";
import { agencyTimeZone } from "@/i18n/config";
import { requireAvailableStaff } from "@/server/auth/availability";
import type { Session } from "@/server/auth/sessions";
import { listInquiryCaseCandidates } from "@/server/cases/queries";
import { isAppError } from "@/server/errors";
import { findOperation } from "@/server/operations";
import { readInquiry } from "@/server/work/queries";
import { buttonClass } from "@/ui/button-class";
import { cx } from "@/ui/cx";
import { initialFormState, isIssuedFormOperation } from "@/ui/form/server";
import { workCopy } from "../work/copy";
import { caseCopy } from "./copy";
import { linkInquiryAction } from "./inquiry-link-actions";
import { type InquiryLinkValues, inquiryLinkHref, inquiryLinkScope } from "./inquiry-link-contract";
import { type InquiryLinkCopy, inquiryLinkCopy } from "./inquiry-link-copy";
import { InquiryLinkForm } from "./inquiry-link-form";

type Detail = Awaited<ReturnType<typeof readInquiry>>;
type Candidate = Awaited<ReturnType<typeof listInquiryCaseCandidates>>[number];

// UI14 entity row, as the X02 rows and the O04 list draw it.
const rowClass =
  "flex min-h-19 items-center gap-4 rounded-control p-4 text-dense text-text no-underline";
const linkedOutcome = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  caseReference: z.string(),
  recordedAt: z.string(),
});

function Icon({ name }: { name: "folder" | "chevron-right" | "circle-alert" | "list-todo" }) {
  return (
    <Image
      src={`/brand/workspace/${name}.svg`}
      alt=""
      width={20}
      height={20}
      className="shrink-0"
    />
  );
}

/** UI26 inline alert. Info and warning keep Figma's tints; a failed read uses the error tint. */
function Alert({
  tone,
  state,
  children,
}: {
  tone: "info" | "warning" | "error";
  state?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-candidates={state}
      className={cx(
        "flex items-start gap-3 rounded-control p-4 text-dense text-text",
        tone === "info" ? "bg-subtle" : tone === "warning" ? "bg-warning-soft" : "bg-error-soft",
      )}
    >
      <Icon name="circle-alert" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">{children}</div>
    </div>
  );
}

function withReference(template: string, reference: string) {
  const [before, after = ""] = template.split("{case}");
  return (
    <>
      {before}
      <bdi>{reference}</bdi>
      {after}
    </>
  );
}

const formatInstant = (locale: string, iso: string) =>
  `${new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: agencyTimeZone,
  }).format(new Date(iso))} ${agencyTimeZone}`;

/** Same condition as the inquiry page's own "create a Case" link. */
const mayCreateCase = (detail: Detail, session: Session) =>
  detail.canCreateCase &&
  detail.inquiry.ownerId === session.account.id &&
  detail.inquiry.state === "assigned";

/** Suggestions are optional: a failed, slow or blocked read must not hold O03 or read as "none". */
async function readCandidates(session: Session, inquiryId: string) {
  try {
    return await getDb().transaction(async (tx) => {
      // ponytail: each statement gets at most 2 s, including a wait behind a table lock (for
      // example a migration); raise it only if ordinary reads start failing here.
      await tx.execute(sql`set local statement_timeout = '2s'`);
      return listInquiryCaseCandidates(tx, session, inquiryId);
    });
  } catch (error) {
    // Name the failure class only: candidate rows and contact routes never reach a log line.
    const cause = error instanceof Error ? (error.cause as { code?: unknown } | undefined) : null;
    console.error(
      "[O03] Case candidates unavailable:",
      isAppError(error) ? error.code : String(cause?.code ?? (error as Error)?.name ?? "unknown"),
    );
    return null;
  }
}

/** The inquiry-wide C02 conditions, in its order. Null leaves only Case-level reasons. */
async function inquiryBlock(detail: Detail, session: Session, copy: InquiryLinkCopy) {
  const { inquiry } = detail;
  if (inquiry.ownerId !== session.account.id) return copy.reasonOwner;
  if (inquiryMachine.check(inquiry.state, "linked_to_case").outcome === "denied")
    return copy.reasonState;
  if (!detail.canRespond) return copy.reasonRespond;
  const absent = await requireAvailableStaff(getDb(), session.account.id).then(
    () => false,
    (error: unknown) => isAppError(error) && error.code === "transition_denied",
  );
  return absent ? copy.reasonAway : null;
}

const caseBlock = (detail: Detail, candidate: Candidate, copy: InquiryLinkCopy) =>
  detail.tasks.some(({ task }) => task.caseId && task.caseId !== candidate.id)
    ? copy.reasonTask
    : copy.reasonAccess;

function caseLabels(candidate: Candidate, locale: string, copy: InquiryLinkCopy) {
  return {
    kind:
      candidate.kind === "service_intake" ? copy.serviceIntake : caseCopy(locale)[candidate.kind],
    stage: copy.stages[candidate.stage as CaseStage] ?? candidate.stage,
    basis: candidate.matchBasis === "party" ? copy.basisParty : copy.basisContact,
  };
}

function CandidateRow({
  locale,
  inquiryId,
  candidate,
  reason,
}: {
  locale: string;
  inquiryId: string;
  candidate: Candidate;
  reason: string | null;
}) {
  const copy = inquiryLinkCopy(locale);
  const { kind, stage, basis } = caseLabels(candidate, locale, copy);
  const body = (
    <span className="flex min-w-0 flex-1 flex-col gap-1 wrap-anywhere">
      <span className="font-semibold">
        <bdi>{candidate.reference}</bdi> · {kind}
      </span>
      <span className="font-medium text-text-muted">
        {candidate.title} · {stage}
      </span>
      <span className="font-medium text-text-muted">{basis}</span>
      {candidate.canLink ? null : (
        <span className="mt-1 w-fit max-w-full rounded-control bg-warning-soft p-2 font-medium text-warning">
          {copy.notLinkable}
          {reason ? ` · ${reason}` : null}
        </span>
      )}
    </span>
  );
  return (
    <li data-case-candidate={candidate.id} className="border-b border-divider last:border-b-0">
      {candidate.canLink ? (
        <a
          href={inquiryLinkHref(locale, inquiryId, { caseId: candidate.id })}
          className={cx(rowClass, "transition-colors duration-(--duration-fast) hover:bg-subtle")}
        >
          <Icon name="folder" />
          <span className="sr-only">{copy.reviewLink}: </span>
          {body}
          <Icon name="chevron-right" />
        </a>
      ) : (
        <div className={rowClass}>
          <Icon name="folder" />
          {body}
        </div>
      )}
    </li>
  );
}

/** O03: linkable existing Cases beside the new-Case choice; nothing once a Case is linked. */
export async function InquiryCaseLink({
  locale,
  session,
  detail,
}: {
  locale: string;
  session: Session;
  detail: Detail;
}) {
  const { inquiry } = detail;
  if (inquiry.caseId || inquiry.state === "resolved_without_case") return null;
  const copy = inquiryLinkCopy(locale);
  const rows = inquiry.partyId ? await readCandidates(session, inquiry.id) : [];
  const blocked = rows?.some((row) => !row.canLink)
    ? await inquiryBlock(detail, session, copy)
    : null;
  return (
    <section
      aria-labelledby="inquiry-case-link"
      data-inquiry-case-link
      className="min-w-0 space-y-6 rounded-card border border-border p-5"
    >
      <h2 id="inquiry-case-link" className="text-subheading font-semibold">
        {copy.title}
      </h2>
      <div className="space-y-4">
        <h3 className="text-compact font-semibold">{copy.linkTitle}</h3>
        <p className="text-dense text-text-muted">{copy.linkLead}</p>
        {rows === null ? (
          <Alert tone="error" state="failed">
            <p className="font-semibold">{copy.failedTitle}</p>
            <p>{copy.failedBody}</p>
            <a
              href={`/${locale}/inquiries/${inquiry.id}`}
              className="w-fit font-semibold text-action underline"
            >
              {copy.reload}
            </a>
          </Alert>
        ) : rows.length === 0 ? (
          <Alert tone="info" state={inquiry.partyId ? "empty" : "no-contact"}>
            <p className="font-semibold">{inquiry.partyId ? copy.emptyTitle : copy.noPartyTitle}</p>
            <p>{inquiry.partyId ? copy.emptyBody : copy.noPartyBody}</p>
          </Alert>
        ) : (
          <>
            {blocked ? (
              <Alert tone="warning">
                <p>{blocked}</p>
              </Alert>
            ) : null}
            <ul className="flex flex-col" data-case-candidates>
              {rows.map((candidate) => (
                <CandidateRow
                  key={candidate.id}
                  locale={locale}
                  inquiryId={inquiry.id}
                  candidate={candidate}
                  reason={candidate.canLink || blocked ? null : caseBlock(detail, candidate, copy)}
                />
              ))}
            </ul>
            {/* C02 returns at most 50 rows, most recently updated first. */}
            {rows.length >= 50 ? <p className="text-dense text-text-muted">{copy.capped}</p> : null}
          </>
        )}
      </div>
      {mayCreateCase(detail, session) ? (
        <div className="space-y-4 border-t border-divider pt-6">
          <h3 className="text-compact font-semibold">{copy.createTitle}</h3>
          <p className="text-dense text-text-muted">{copy.createLead}</p>
          <a
            href={`/${locale}/cases/new?inquiry=${inquiry.id}`}
            className={buttonClass("secondary", "text-text")}
          >
            {copy.create}
          </a>
        </div>
      ) : null}
    </section>
  );
}

function LinkPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-6 px-gutter py-5 wrap-anywhere sm:gap-8 sm:px-gutter-wide sm:py-8">
      {children}
    </div>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap">{children}</div>;
}

/** UI15 neutral status: which inquiry this page acts on and its current state. */
function InquiryStatus({ locale, detail }: { locale: string; detail: Detail }) {
  return (
    <p className="w-full rounded-control bg-subtle p-2 text-caption font-medium text-text-muted sm:w-100">
      {inquiryLinkCopy(locale).inquiry} <bdi>{detail.inquiry.reference}</bdi> ·{" "}
      {workCopy(locale).states[detail.inquiry.state]}
    </p>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <dt className="text-dense font-semibold">{label}</dt>
      <dd className="min-h-12 flex-1 rounded-control border border-border bg-canvas p-3">
        {children}
      </dd>
    </div>
  );
}

async function readOrNotFound(session: Session, id: string) {
  try {
    return await readInquiry(getDb(), session, id);
  } catch (error) {
    if (isAppError(error) && error.code === "not_found") notFound();
    throw error;
  }
}

/** O03L review (`?case=`), or O03LR: the result and status of the actor's own attempt (`?key=`). */
export async function InquiryLinkScreen({
  locale,
  session,
  inquiryId,
  caseId,
  operationKey,
}: {
  locale: string;
  session: Session;
  inquiryId: string;
  caseId?: string;
  operationKey?: string;
}) {
  const detail = await readOrNotFound(session, inquiryId);
  if (operationKey !== undefined)
    return (
      <LinkOutcome locale={locale} session={session} detail={detail} operationKey={operationKey} />
    );
  if (caseId === undefined) notFound();
  const { inquiry } = detail;
  const copy = inquiryLinkCopy(locale);
  const inquiryPath = `/${locale}/inquiries/${inquiry.id}`;
  const back = (
    <a href={inquiryPath} className={buttonClass("secondary", "text-text")}>
      {copy.backToInquiry}
    </a>
  );
  const rows = inquiry.caseId || !inquiry.partyId ? [] : await readCandidates(session, inquiry.id);
  const candidate = rows?.find((row) => row.id === caseId);
  if (!candidate)
    return (
      <LinkPage>
        <h1 className="text-heading font-semibold sm:text-title">{copy.linkTitle}</h1>
        <InquiryStatus locale={locale} detail={detail} />
        {inquiry.caseId ? (
          <Alert tone="info">
            <p>{copy.alreadyLinked}</p>
          </Alert>
        ) : rows === null ? (
          <Alert tone="error" state="failed">
            <p className="font-semibold">{copy.failedTitle}</p>
            <p>{copy.failedBody}</p>
          </Alert>
        ) : (
          <Alert tone="warning">
            <p>{copy.notCandidate}</p>
          </Alert>
        )}
        <Actions>
          {inquiry.caseId ? (
            <a href={`/${locale}/cases/${inquiry.caseId}`} className={buttonClass("primary")}>
              {copy.openCase}
            </a>
          ) : rows === null ? (
            <a
              href={inquiryLinkHref(locale, inquiry.id, { caseId })}
              className={buttonClass("primary")}
            >
              {copy.reload}
            </a>
          ) : null}
          {back}
        </Actions>
      </LinkPage>
    );

  const { kind, stage, basis } = caseLabels(candidate, locale, copy);
  const blocked = candidate.canLink
    ? null
    : ((await inquiryBlock(detail, session, copy)) ?? caseBlock(detail, candidate, copy));
  const initialState = initialFormState<InquiryLinkValues>(
    inquiryLinkScope(inquiry.id),
    { caseId: candidate.id, expectedCaseVersion: String(candidate.version) },
    inquiry.version,
  );
  return (
    <LinkPage>
      <h1 className="text-heading font-semibold sm:text-title">{copy.linkTitle}</h1>
      <p className="text-text-muted">{copy.reviewLead}</p>
      <InquiryStatus locale={locale} detail={detail} />
      <dl className="grid gap-6 sm:grid-cols-2">
        <Fact label={copy.factAction}>{copy.linkTitle}</Fact>
        <Fact label={copy.factCase}>
          <bdi>{candidate.reference}</bdi> · {kind}
          <span className="block text-text-muted">
            {candidate.title} · {stage}
          </span>
        </Fact>
        <Fact label={copy.factBasis}>{basis}</Fact>
        <Fact label={copy.factAlternative}>{copy.alternative}</Fact>
      </dl>
      <section aria-labelledby="inquiry-link-effects" className="flex flex-col gap-4">
        <h2 id="inquiry-link-effects" className="text-subheading font-semibold">
          {copy.effectsTitle}
        </h2>
        <ul className="flex list-disc flex-col gap-2 ps-5 text-dense">
          <li>{withReference(copy.effectJoins, candidate.reference)}</li>
          <li>{withReference(copy.effectVisible, candidate.reference)}</li>
          <li>{copy.effectKept}</li>
          <li>{copy.effectNot}</li>
        </ul>
      </section>
      {mayCreateCase(detail, session) ? (
        <a
          href={`/${locale}/cases/new?inquiry=${inquiry.id}`}
          className={buttonClass("secondary", "self-start text-text")}
        >
          {copy.create}
        </a>
      ) : null}
      <Alert tone="warning">
        <p>{copy.matchWarning}</p>
      </Alert>
      {blocked ? (
        <>
          <Alert tone="warning">
            <p className="font-semibold">{copy.notLinkable}</p>
            <p>{blocked}</p>
          </Alert>
          <Actions>{back}</Actions>
        </>
      ) : (
        <InquiryLinkForm
          locale={locale}
          action={linkInquiryAction.bind(null, locale, inquiry.id)}
          initialState={initialState}
          path={inquiryLinkHref(locale, inquiry.id, { caseId: candidate.id })}
          nativeIdentity={inquiryLinkScope(inquiry.id)}
          status={{
            href: inquiryLinkHref(locale, inquiry.id, { key: initialState.operationId }),
            label: copy.checkStatus,
          }}
          back={inquiryPath}
        />
      )}
    </LinkPage>
  );
}

/** O03LR for this staff member's own succeeded link of this inquiry; otherwise its status. */
async function LinkOutcome({
  locale,
  session,
  detail,
  operationKey,
}: {
  locale: string;
  session: Session;
  detail: Detail;
  operationKey: string;
}) {
  const { inquiry } = detail;
  if (!isIssuedFormOperation(inquiryLinkScope(inquiry.id), operationKey)) notFound();
  const copy = inquiryLinkCopy(locale);
  const inquiryPath = `/${locale}/inquiries/${inquiry.id}`;
  const receipt = await findOperation(getDb(), session.actor, "case.link_inquiry", operationKey);
  const parsed =
    receipt?.status === "succeeded" ? linkedOutcome.safeParse(receipt.outcome) : undefined;
  const linked = parsed?.success && parsed.data.id === inquiry.id ? parsed.data : null;
  if (!linked) {
    const pending = receipt && receipt.status !== "failed" && receipt.status !== "succeeded";
    return (
      <LinkPage>
        <h1 className="text-heading font-semibold sm:text-title">{copy.statusTitle}</h1>
        <InquiryStatus locale={locale} detail={detail} />
        <Alert tone={pending ? "info" : "warning"}>
          <p>
            {pending
              ? copy.statusPending
              : receipt?.status === "failed"
                ? copy.statusFailed
                : copy.statusMissing}
          </p>
        </Alert>
        <Actions>
          <a href={inquiryPath} className={buttonClass("primary")}>
            {copy.backToInquiry}
          </a>
          {pending ? (
            <a
              href={inquiryLinkHref(locale, inquiry.id, { key: operationKey })}
              className={buttonClass("secondary", "text-text")}
            >
              {copy.checkAgain}
            </a>
          ) : null}
        </Actions>
      </LinkPage>
    );
  }
  const next = detail.tasks.find(({ task }) =>
    ["open", "in_progress", "waiting"].includes(task.state),
  );
  return (
    <LinkPage>
      <h1 className="text-heading font-semibold sm:text-title">{copy.resultTitle}</h1>
      <InquiryStatus locale={locale} detail={detail} />
      <h2 className="text-heading font-semibold">
        {withReference(copy.resultHeading, linked.caseReference)}
      </h2>
      <p className="text-text-muted">
        {copy.recorded}{" "}
        <time dateTime={linked.recordedAt}>{formatInstant(locale, linked.recordedAt)}</time>
      </p>
      {next ? (
        <>
          <a
            href={`/${locale}/tasks/${next.task.id}`}
            className={cx(rowClass, "transition-colors duration-(--duration-fast) hover:bg-subtle")}
          >
            <Icon name="list-todo" />
            <span className="flex min-w-0 flex-1 flex-col gap-1 wrap-anywhere">
              <span className="font-semibold">{copy.nextStep}</span>
              <span className="font-medium text-text-muted">
                {next.ownerName ? `${next.ownerName} · ` : null}
                {next.task.title}
              </span>
            </span>
            <Icon name="chevron-right" />
          </a>
          <hr className="border-divider" />
        </>
      ) : null}
      <Alert tone="info">
        <p>{copy.resultNote}</p>
      </Alert>
      <Actions>
        <a href={inquiryPath} className={buttonClass("primary")}>
          {copy.backToInquiry}
        </a>
        <a
          href={`/${locale}/cases/${linked.caseId}`}
          className={buttonClass("secondary", "text-text")}
        >
          {copy.openCase}
        </a>
      </Actions>
    </LinkPage>
  );
}
