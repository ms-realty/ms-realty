import "server-only";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";
import { getDb } from "@/db/client";
import { interestMachine } from "@/domain/interest";
import { displayLocale, isPublicLocale } from "@/i18n/config";
import { listAppointments, readAppointment } from "@/server/appointments/service";
import type { Session } from "@/server/auth/sessions";
import { listCases, readCase, readCaseMessages, readInterestContext } from "@/server/cases/queries";
import { caseFor } from "@/server/cases/shared";
import { getEnv } from "@/server/config/env";
import { findOperation } from "@/server/operations";
import { listTasks, readInquiry } from "@/server/work/queries";
import { buttonClass } from "@/ui/button-class";
import type { FormReceipt } from "@/ui/form/contract";
import { initialFormState, isIssuedFormOperation } from "@/ui/form/server";
import { caseAccessCopy } from "../case-access/copy";
import { documentRequestCopy } from "../document-requests/copy";
import { CoverageOwner } from "../work/coverage-owner";
import { privateRead } from "../work/screens";
import { workflowAction } from "./actions";
import {
  type WorkflowCommand,
  workflowFields,
  workflowScope,
  workflowStatus,
  workflowTypes,
} from "./contract";
import { caseCopy } from "./copy";
import { caseEmailCopy } from "./email-copy";
import { type WorkflowField, WorkflowForm } from "./form";
import { lifecycleCopy } from "./lifecycle-copy";
import { matchingCopy } from "./matching-copy";
import { ownerPreviewCopy } from "./owner-preview-copy";

export const workflowLink = "font-semibold text-accent underline underline-offset-4";
export type ScreenProps = { locale: string; session: Session };
export function WorkflowPage({
  locale,
  session,
  title,
  children,
  clientOverview = false,
}: ScreenProps & { title: string; children: ReactNode; clientOverview?: boolean }) {
  const c = caseCopy(locale),
    staff = session.account.kind === "staff";
  return (
    <div
      className={
        clientOverview
          ? "mx-auto min-w-0 max-w-page space-y-8 p-5 [overflow-wrap:anywhere] lg:p-8"
          : "mx-auto max-w-6xl space-y-8 px-gutter py-6 lg:px-gutter-wide"
      }
    >
      <header className="space-y-4">
        <h1
          className={
            clientOverview
              ? "font-display text-[1.5rem] leading-[2.125rem] font-semibold tracking-[-0.02em] lg:text-title"
              : "text-heading font-semibold"
          }
        >
          {title}
        </h1>
        {!clientOverview ? (
          <nav className="flex flex-wrap gap-5" aria-label={c.cases}>
            <a className={workflowLink} href={`/${locale}/${staff ? "cases" : "overview"}`}>
              {staff ? c.cases : c.overview}
            </a>
            <a className={workflowLink} href={`/${locale}/${staff ? "calendar" : "appointments"}`}>
              {c.appointments}
            </a>
            <a className={workflowLink} href={`/${locale}/proposals`}>
              {c.proposals}
            </a>
            {!staff ? (
              <a className={workflowLink} href={`/${locale}/documents`}>
                {c.documents}
              </a>
            ) : null}
            {staff ? (
              <a className={workflowLink} href={`/${locale}/inquiries`}>
                Inbox
              </a>
            ) : (
              <>
                <a className={workflowLink} href={`/${locale}/properties`}>
                  {c.interests}
                </a>
                <a className={workflowLink} href={`/${locale}/messages`}>
                  {c.messages}
                </a>
              </>
            )}
          </nav>
        ) : null}
      </header>
      {children}
    </div>
  );
}
export function WorkflowSection({
  title,
  children,
  id,
}: {
  title: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="space-y-4 rounded-card border border-border bg-surface p-5">
      <h2 className="text-subheading font-semibold">{title}</h2>
      {children}
    </section>
  );
}
export function WorkflowTime({
  value,
  locale,
  zone = "Europe/Sofia",
}: {
  value: Date | null;
  locale: string;
  zone?: string;
}) {
  return value ? (
    <time dateTime={value.toISOString()}>
      {new Intl.DateTimeFormat(isPublicLocale(locale) ? displayLocale(locale) : "en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: zone,
      }).format(value)}{" "}
      {zone}
    </time>
  ) : (
    <span>—</span>
  );
}
export function BoundWorkflowForm({
  locale,
  session,
  command,
  id,
  revision,
  fields,
  values = {},
  path,
  submit,
  receipt,
  nativeIdentity,
}: ScreenProps & {
  command: WorkflowCommand;
  id: string;
  revision: number;
  fields: WorkflowField[];
  values?: Record<string, string>;
  path: string;
  submit: string;
  receipt?: FormReceipt;
  nativeIdentity?: string;
}) {
  const initial = initialFormState(
    workflowScope(command, id),
    Object.fromEntries(workflowFields[command].map((name) => [name, values[name] ?? ""])),
    revision,
  );
  if (receipt) initial.outcome = { kind: "confirmed", receipt };
  return (
    <WorkflowForm
      locale={locale}
      action={workflowAction.bind(null, session.account.kind, locale, command, id)}
      initialState={initial}
      fields={fields}
      path={path}
      nativeIdentity={nativeIdentity ?? workflowScope(command, id)}
      status={{
        href: workflowStatus(session.account.kind, locale, command, id, initial.operationId),
        label: caseCopy(locale).status,
      }}
      submit={submit}
    />
  );
}

/** The client host's case chooser; staff use O04 (directory-screen.tsx). */
export async function CaseIndexScreen(
  props: ScreenProps & {
    destination?: "overview" | "properties" | "messages";
    openSingleCase?: boolean;
  },
) {
  const c = caseCopy(props.locale);
  const rows = await listCases(getDb(), props.session);
  const root = props.destination ?? "overview";
  // listCases applies authorization in SQL before its unfiltered limit of 50. One returned
  // row therefore means one accessible Case, not one item on an arbitrary cursor page.
  // CaseScreen still reauthorizes the selected record before rendering any private facts.
  const onlyCase = rows.length === 1 ? rows[0] : undefined;
  if (props.openSingleCase && root === "overview" && onlyCase)
    return (
      <CaseScreen
        locale={props.locale}
        session={props.session}
        id={onlyCase.id}
        pane="overview"
        compactClientOverview
      />
    );
  return (
    <WorkflowPage
      {...props}
      clientOverview={root === "overview"}
      title={root === "properties" ? c.interests : root === "messages" ? c.messages : c.cases}
    >
      <p>{c.scope}</p>
      {root === "overview" ? (
        <a className={workflowLink} href={`/${props.locale}/proposals`}>
          {c.proposals}
        </a>
      ) : null}
      {rows.length ? (
        <>
          <p className="text-text-muted">{c.bounded}</p>
          <ul className="min-w-0 divide-y divide-divider [overflow-wrap:anywhere]">
            {rows.map((row) => (
              <li key={row.id} className="min-w-0 space-y-2 py-5">
                <a className={workflowLink} href={`/${props.locale}/${root}/${row.id}`}>
                  <bdi>{row.reference}</bdi> · {row.title}
                </a>
                <p>
                  {c.owned}: {row.ownerName ?? "—"}
                </p>
                <p className="text-text-muted">
                  {row.kind in c ? c[row.kind as "buyer"] : row.kind} ·{" "}
                  {row.stage.replaceAll("_", " ")} ·{" "}
                  {row.disposition === "paused"
                    ? lifecycleCopy(props.locale).pause
                    : lifecycleCopy(props.locale)[row.disposition]}
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>{c.empty}</p>
      )}
    </WorkflowPage>
  );
}

export async function NewCaseScreen(props: ScreenProps & { inquiryId: string }) {
  const { inquiry } = await privateRead(() => readInquiry(getDb(), props.session, props.inquiryId));
  const c = caseCopy(props.locale);
  if (inquiry.caseId)
    return (
      <WorkflowPage {...props} title={c.create}>
        <a className={workflowLink} href={`/${props.locale}/cases/${inquiry.caseId}`}>
          {c.back}
        </a>
      </WorkflowPage>
    );
  const fields: WorkflowField[] = [
    {
      name: "kind",
      label: c.kind,
      type: "select",
      options: ["buyer", "tenant", "seller", "landlord"].map((value) => ({
        value,
        label: c[value as "buyer"],
      })),
    },
    { name: "title", label: c.title, required: true },
    { name: "requirements", label: c.requirements, type: "textarea", required: true },
    { name: "preferences", label: c.preferences, type: "textarea" },
    { name: "nextAction", label: c.next, required: true },
    { name: "dueAt", label: c.due, type: "datetime-local", required: true },
  ];
  return (
    <WorkflowPage {...props} title={`${c.create} · ${inquiry.reference}`}>
      <p>{c.createLead}</p>
      <BoundWorkflowForm
        {...props}
        command="create"
        id={inquiry.id}
        revision={inquiry.version}
        fields={fields}
        values={{ kind: "buyer", requirements: inquiry.message ?? "" }}
        path={`/${props.locale}/cases/new?inquiry=${inquiry.id}`}
        submit={c.create}
      />
    </WorkflowPage>
  );
}

export function ClientCaseOverview({
  locale,
  view,
  targetBasePath = "",
  nextSteps,
}: {
  locale: string;
  targetBasePath?: string;
  nextSteps?: ReactNode;
  view: Pick<
    Awaited<ReturnType<typeof readCase>>,
    "record" | "brief" | "canAcknowledge" | "canPost"
  >;
}) {
  const c = caseCopy(locale),
    row = view.record,
    brief = view.brief[0];
  const active = row.disposition === "active";
  const reviewBrief = active && view.canAcknowledge && brief && !brief.clientAcknowledgedAt;
  const primaryHref = `${targetBasePath}${reviewBrief || !view.canPost ? "#case-brief" : "#case-conversation"}`;
  const primaryLabel = reviewBrief ? c.requirements : view.canPost ? c.messages : c.brief;
  return (
    <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
      <p className="text-body text-text-muted">
        {row.kind in c ? c[row.kind as "buyer"] : row.kind} ·{" "}
        {row.stage === "needs_agreed" && !brief?.clientAcknowledgedAt
          ? c.needsReview
          : row.stage.replaceAll("_", " ")}{" "}
        ·{" "}
        {row.disposition === "paused"
          ? lifecycleCopy(locale).pause
          : lifecycleCopy(locale)[row.disposition]}
      </p>
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-8">
        <div className="min-w-0 space-y-6">
          <section
            className="min-w-0 space-y-5 rounded-[1rem] bg-brand-tint p-6"
            aria-label={c.clientSummary}
          >
            <h2
              dir="auto"
              className="font-display text-[1.5rem] leading-[2.125rem] font-semibold tracking-[-0.02em]"
            >
              {active
                ? (row.nextAction ?? c.noAction)
                : row.disposition === "closed"
                  ? c.closedSummary
                  : c.pausedSummary}
            </h2>
            {!active &&
            (row.dispositionReason || row.closureOutcome || row.waitingOn || row.reviewAt) ? (
              <div className="space-y-3">
                {row.dispositionReason ? (
                  <p>
                    <strong>{c.dispositionReason}:</strong> {row.dispositionReason}
                  </p>
                ) : null}
                {row.closureOutcome ? (
                  <p>
                    <strong>{c.closureOutcome}:</strong> {row.closureOutcome}
                  </p>
                ) : null}
                {row.waitingOn ? (
                  <p>
                    <strong>{c.waitingOn}:</strong> {row.waitingOn}
                  </p>
                ) : null}
                {row.reviewAt ? (
                  <p>
                    <strong>{c.reviewAt}:</strong>{" "}
                    <WorkflowTime value={row.reviewAt} locale={locale} />
                  </p>
                ) : null}
              </div>
            ) : null}
            {active && row.dueAt ? (
              <p>
                <WorkflowTime value={row.dueAt} locale={locale} />
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-4">
              <a
                href={primaryHref}
                className="inline-flex min-h-control items-center justify-center rounded-control bg-action px-4 py-3 text-dense font-semibold text-text-inverse hover:bg-action-hover active:bg-action-pressed"
              >
                {primaryLabel}
              </a>
            </div>
          </section>
          {nextSteps}
        </div>
        <aside className="min-w-0 space-y-5 rounded-[1rem] bg-subtle p-6" aria-label={c.owned}>
          <p className="text-dense text-text-muted">{c.owned}</p>
          <h2 className="font-display text-[1.5rem] leading-[2.125rem] font-semibold tracking-[-0.02em]">
            {row.ownerName ?? "—"}
          </h2>
          <a
            href={`/${locale}/messages/${row.id}`}
            className="inline-flex min-h-control w-full items-center justify-center rounded-control bg-action px-4 py-3 text-dense font-semibold text-text-inverse hover:bg-action-hover active:bg-action-pressed"
          >
            {c.messages}
          </a>
        </aside>
      </div>
    </div>
  );
}

export async function CaseScreen(
  props: ScreenProps & {
    id: string;
    pane?: "overview" | "properties" | "messages";
    compactClientOverview?: boolean;
  },
) {
  const view = await privateRead(() => readCase(getDb(), props.session, props.id));
  const c = caseCopy(props.locale);
  const staff = props.session.account.kind === "staff";
  const row = view.record;
  const path = `/${props.locale}/${staff ? "cases" : (props.pane ?? "overview")}/${row.id}`;
  if (!staff && props.compactClientOverview && props.pane === "overview") {
    // The compact entry still uses readCase's current authorization and client projection.
    // Its links need no conversation history or signed manual-action forms.
    const agenda = await listAppointments(getDb(), props.session, row.id);
    const appointment = agenda.length === 1 ? agenda[0] : undefined;
    const copyLocale = props.locale === "bg" || props.locale === "ru" ? props.locale : "en";
    const links = [
      {
        label: c.appointments,
        href: `/${props.locale}/appointments${appointment ? `/${appointment.id}` : ""}`,
        detail: appointment ? (
          <>
            {appointment.reference} · {c[appointment.state]}
            {appointment.confirmedStartsAt || appointment.proposedStartsAt ? (
              <>
                {" · "}
                <WorkflowTime
                  value={appointment.confirmedStartsAt ?? appointment.proposedStartsAt}
                  locale={props.locale}
                />
              </>
            ) : null}
          </>
        ) : agenda.length === 0 ? (
          <span lang={copyLocale} dir="ltr">
            {c.noAppointments}
          </span>
        ) : null,
      },
      {
        label: c.interests,
        href: `/${props.locale}/properties/${row.id}`,
        detail:
          view.interests.length === 0 ? (
            <span lang={copyLocale} dir="ltr">
              {c.noInterests}
            </span>
          ) : null,
      },
      { label: c.documents, href: `/${props.locale}/documents`, detail: null },
    ];
    return (
      <WorkflowPage {...props} title={`${row.reference} · ${row.title}`} clientOverview>
        <ClientCaseOverview
          locale={props.locale}
          view={view}
          targetBasePath={path}
          nextSteps={
            <section className="min-w-0 space-y-3" aria-label={c.nextSteps}>
              <h2 className="font-display text-heading font-semibold">{c.nextSteps}</h2>
              <ul className="divide-y divide-divider">
                {links.map((link) => (
                  <li key={link.href}>
                    <a
                      className="flex min-h-control items-center justify-between gap-4 rounded-control px-4 py-5 hover:bg-subtle"
                      href={link.href}
                    >
                      <span className="min-w-0 space-y-1">
                        <span className="block font-semibold">{link.label}</span>
                        {link.detail ? (
                          <span className="block text-dense text-text-muted">{link.detail}</span>
                        ) : null}
                      </span>
                      <span aria-hidden="true" className="shrink-0 rtl:rotate-180">
                        →
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          }
        />
      </WorkflowPage>
    );
  }
  const brief = view.brief[0];
  const parsedItems = z
    .array(z.object({ kind: z.string(), text: z.string(), origin: z.string() }))
    .safeParse(brief?.items ?? []);
  const items = parsedItems.success ? parsedItems.data : [];
  const thread = await readCaseMessages(getDb(), props.session, row.id);
  const agenda = await listAppointments(getDb(), props.session, row.id);
  const commitments = staff ? await listTasks(getDb(), props.session, { caseId: row.id }) : null;
  const matching =
    staff && view.canAddInterest && ["buyer", "tenant"].includes(row.kind)
      ? `/${props.locale}/cases/${row.id}/matching`
      : null;
  const showOverview = staff || !props.pane || props.pane === "overview";
  const showProperties = staff || props.pane === "properties" || showOverview;
  const showMessages = staff || props.pane === "messages" || showOverview;
  return (
    <WorkflowPage
      {...props}
      title={`${row.reference} · ${row.title}`}
      clientOverview={!staff && showOverview}
    >
      {!staff && showOverview ? <ClientCaseOverview locale={props.locale} view={view} /> : null}
      <div className="min-w-0 space-y-3 [overflow-wrap:anywhere]">
        <div className="flex flex-wrap gap-5">
          <a className={workflowLink} href={`/${props.locale}/proposals?case=${row.id}`}>
            {c.proposals}
          </a>
          {staff ? (
            <a className={workflowLink} href={`/${props.locale}/cases/${row.id}/documents`}>
              {c.documents}
            </a>
          ) : null}
          {!staff || view.canManageAccess ? (
            <a
              className={workflowLink}
              href={`/${props.locale}/${staff ? "cases" : "overview"}/${row.id}/participants`}
            >
              {caseAccessCopy(props.locale).title}
            </a>
          ) : null}
          {view.canReadRequestedDocuments ? (
            <a className={workflowLink} href={`/${props.locale}/cases/${row.id}/document-requests`}>
              {documentRequestCopy(props.locale).title}
            </a>
          ) : null}
          {view.canNote ? (
            <a className={workflowLink} href={`/${props.locale}/cases/${row.id}/email`}>
              {caseEmailCopy(props.locale).title}
            </a>
          ) : null}
          {view.canReviewProcess ? (
            <a className={workflowLink} href={`/${props.locale}/cases/${row.id}/process`}>
              {props.locale === "bg"
                ? "Преглед на процеса"
                : props.locale === "ru"
                  ? "Проверка процесса"
                  : "Case process review"}
            </a>
          ) : null}
        </div>
        {staff || !showOverview ? (
          <>
            <p>
              {c.owned}:{" "}
              <strong>
                {props.session.account.kind === "staff" ? (
                  <CoverageOwner
                    name={row.ownerName}
                    needsCoverage={row.needsCoverage}
                    locale={props.locale}
                  />
                ) : (
                  (row.ownerName ?? "—")
                )}
              </strong>
            </p>
            <p>
              {row.kind in c ? c[row.kind as "buyer"] : row.kind} ·{" "}
              {row.stage === "needs_agreed" && !brief?.clientAcknowledgedAt
                ? c.needsReview
                : row.stage.replaceAll("_", " ")}{" "}
              ·{" "}
              {row.disposition === "paused"
                ? lifecycleCopy(props.locale).pause
                : lifecycleCopy(props.locale)[row.disposition]}
            </p>
            {view.canManageContinuity ? (
              <a className={workflowLink} href={`/${props.locale}/cases/${row.id}/continuity`}>
                {row.disposition === "active"
                  ? lifecycleCopy(props.locale).title
                  : c.reviewReopening}
              </a>
            ) : null}
            {row.disposition === "active" ? (
              <>
                <p>
                  {staff ? <strong>{c.next}: </strong> : null}
                  {row.nextAction ?? c.noAction}
                </p>
                <WorkflowTime value={row.dueAt} locale={props.locale} />
              </>
            ) : (
              <div className="space-y-3 rounded-control border border-border p-4">
                <p>{row.disposition === "closed" ? c.closedSummary : c.pausedSummary}</p>
                {row.dispositionReason ? (
                  <p>
                    <strong>{c.dispositionReason}:</strong> {row.dispositionReason}
                  </p>
                ) : null}
                {row.closureOutcome ? (
                  <p>
                    <strong>{c.closureOutcome}:</strong> {row.closureOutcome}
                  </p>
                ) : null}
                {row.waitingOn ? (
                  <p>
                    <strong>{c.waitingOn}:</strong> {row.waitingOn}
                  </p>
                ) : null}
                {row.reviewAt ? (
                  <p>
                    <strong>{c.reviewAt}:</strong>{" "}
                    <WorkflowTime value={row.reviewAt} locale={props.locale} />
                  </p>
                ) : null}
              </div>
            )}
          </>
        ) : null}
      </div>
      {view.ownerPreviews.map((reference) => (
        <a
          key={reference}
          className={workflowLink}
          href={`/${props.locale}/properties/${row.id}/preview?listing=${encodeURIComponent(reference)}`}
        >
          {ownerPreviewCopy(props.locale).ownerLink} · {reference}
        </a>
      ))}
      {commitments ? (
        <WorkflowSection title={c.tasks}>
          {commitments.rows.length ? (
            <ul className="space-y-4">
              {commitments.rows.map(({ task, ownerName }) => (
                <li key={task.id} className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
                  <a className={workflowLink} href={`/${props.locale}/tasks/${task.id}`}>
                    {task.title}
                  </a>
                  <p>
                    {c.owned}: {ownerName ?? "—"}
                  </p>
                  <WorkflowTime
                    value={task.state === "waiting" ? task.followUpAt : task.dueAt}
                    locale={props.locale}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p>{c.noTasks}</p>
          )}
          {commitments.hasMore ? (
            <a className={workflowLink} href={`/${props.locale}/tasks`}>
              {c.moreTasks}
            </a>
          ) : null}
        </WorkflowSection>
      ) : null}
      {showOverview ? (
        <>
          <WorkflowSection title={c.brief} id="case-brief">
            {matching ? (
              <a className={buttonClass("secondary", "max-w-full text-center")} href={matching}>
                {matchingCopy(props.locale).entry}
              </a>
            ) : null}
            <p>{brief?.clientAcknowledgedAt ? c.agreedBrief : c.draftBrief}</p>
            <p>Revision {brief?.revision ?? "—"}</p>
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={`${item.kind}-${item.text}`}>
                  <strong>
                    {item.kind === "hard_constraint" ? c.requirements : c.preferences}:
                  </strong>{" "}
                  {item.text}
                </li>
              ))}
            </ul>
            {!staff && row.disposition === "active" && view.canPost ? (
              <p>{c.requirementMessage}</p>
            ) : null}
            {view.canAcknowledge &&
            brief &&
            !brief.clientAcknowledgedAt &&
            row.disposition === "active" ? (
              <BoundWorkflowForm
                {...props}
                command="acknowledge"
                id={row.id}
                revision={row.version}
                path={path}
                fields={[
                  { name: "briefId", label: "Brief", type: "hidden" },
                  {
                    name: "reviewed",
                    label: lifecycleCopy(props.locale).ackCheck,
                    type: "checkbox",
                    required: true,
                  },
                ]}
                values={{ briefId: brief.id }}
                submit={lifecycleCopy(props.locale).acknowledge}
              />
            ) : null}
            {view.canManage ? (
              <BoundWorkflowForm
                {...props}
                command="brief"
                id={row.id}
                revision={row.version}
                path={path}
                fields={[
                  { name: "requirements", label: c.requirements, type: "textarea", required: true },
                  { name: "preferences", label: c.preferences, type: "textarea" },
                ]}
                values={{
                  requirements: items.find((item) => item.kind === "hard_constraint")?.text ?? "",
                  preferences: items.find((item) => item.kind === "preference")?.text ?? "",
                }}
                submit={c.revise}
              />
            ) : null}
          </WorkflowSection>
          {view.canManageNext ? (
            <WorkflowSection title={c.next}>
              <BoundWorkflowForm
                {...props}
                command="next"
                id={row.id}
                revision={row.version}
                path={path}
                fields={[
                  { name: "nextAction", label: c.next, required: true },
                  { name: "dueAt", label: c.due, type: "datetime-local", required: true },
                  { name: "clientSummary", label: c.clientSummary, type: "textarea" },
                ]}
                values={{
                  nextAction: row.nextAction ?? "",
                  dueAt: row.dueAt?.toISOString().slice(0, 16) ?? "",
                  clientSummary: row.clientSummary ?? "",
                }}
                submit={c.nextSave}
              />
            </WorkflowSection>
          ) : null}
        </>
      ) : null}
      {showProperties ? (
        <WorkflowSection title={c.interests}>
          {view.interests.length ? (
            <ul className="space-y-7">
              {view.interests.map((interest) => (
                <li
                  key={interest.id}
                  id={`interest-${interest.id}`}
                  className="scroll-mt-6 space-y-3 border-b border-border pb-5"
                >
                  <a
                    className={workflowLink}
                    href={`${getEnv().hosts.public}/bg/properties/${interest.reference}/${interest.reference.toLowerCase()}`}
                  >
                    {interest.reference}
                  </a>
                  <p>{c[interest.state]}</p>
                  {view.canRequestProposal &&
                  row.disposition === "active" &&
                  ["shortlisted", "viewing_requested", "viewed"].includes(interest.state) ? (
                    <BoundWorkflowForm
                      {...props}
                      command="proposalRequest"
                      id={row.id}
                      nativeIdentity={`${workflowScope("proposalRequest", row.id)}:${interest.id}`}
                      revision={row.version}
                      path={path}
                      fields={[
                        { name: "interestId", label: "Interest", type: "hidden" },
                        {
                          name: "reviewed",
                          label: lifecycleCopy(props.locale).requestCheck,
                          type: "checkbox",
                          required: true,
                        },
                      ]}
                      values={{ interestId: interest.id }}
                      submit={lifecycleCopy(props.locale).requestProposal}
                    />
                  ) : null}
                  {view.canPropose &&
                  ["shortlisted", "viewing_requested", "viewed", "proposal"].includes(
                    interest.state,
                  ) ? (
                    <a
                      className={workflowLink}
                      href={`/${props.locale}/proposals/new?case=${row.id}&interest=${interest.id}`}
                    >
                      {c.prepareProposal}
                    </a>
                  ) : null}
                  {Array.isArray(interest.explanation) ? (
                    <ul>
                      {interest.explanation
                        .filter((text): text is string => typeof text === "string")
                        .map((text) => (
                          <li key={text}>{text}</li>
                        ))}
                    </ul>
                  ) : null}
                  {interest.listingRevisionId !== interest.currentRevisionId ? (
                    <p role="status">{c.stale}</p>
                  ) : null}
                  {interest.canRespond &&
                  ["shortlisted", "declined"].some(
                    (state) =>
                      interestMachine.check(interest.state, state as "shortlisted").outcome ===
                      "allowed",
                  ) ? (
                    <BoundWorkflowForm
                      {...props}
                      command="feedback"
                      id={interest.id}
                      revision={interest.version}
                      path={path}
                      fields={[
                        {
                          name: "state",
                          label: c.action,
                          type: "select",
                          options: (["shortlisted", "declined"] as const)
                            .filter(
                              (state) =>
                                interestMachine.check(interest.state, state).outcome === "allowed",
                            )
                            .map((value) => ({
                              value,
                              label: value === "shortlisted" ? c.shortlist : c.decline,
                            })),
                        },
                        { name: "reason", label: c.feedback, type: "textarea" },
                      ]}
                      values={{
                        state:
                          interestMachine.check(interest.state, "shortlisted").outcome === "allowed"
                            ? "shortlisted"
                            : "declined",
                      }}
                      submit={c.respond}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p>{c.noInterests}</p>
          )}
          {matching ? (
            <a className={buttonClass("secondary", "max-w-full text-center")} href={matching}>
              {matchingCopy(props.locale).entry}
            </a>
          ) : null}
        </WorkflowSection>
      ) : null}
      <WorkflowSection title={c.appointments}>
        <AppointmentList {...props} rows={agenda} />
        {view.canRequest && view.interests.some((interest) => interest.state === "shortlisted") ? (
          <>
            <p>{c.requestNote}</p>
            <BoundWorkflowForm
              {...props}
              command="request"
              id={row.id}
              revision={row.version}
              path={path}
              fields={[
                {
                  name: "interestId",
                  label: c.interests,
                  type: "select",
                  options: view.interests
                    .filter((interest) => interest.state === "shortlisted")
                    .map((interest) => ({ value: interest.id, label: interest.reference })),
                },
                {
                  name: "preferredWindow",
                  label: c.preferredWindow,
                  type: "textarea",
                  required: true,
                },
                ...(staff
                  ? [
                      {
                        name: "participantPartyId",
                        label: c.participant,
                        type: "select" as const,
                        options: view.participants.map((participant) => ({
                          value: participant.partyId,
                          label: participant.name,
                        })),
                      },
                    ]
                  : []),
              ]}
              values={{
                interestId:
                  view.interests.find((interest) => interest.state === "shortlisted")?.id ?? "",
                participantPartyId: view.participants[0]?.partyId ?? "",
              }}
              submit={c.request}
            />
          </>
        ) : null}
      </WorkflowSection>
      {showMessages ? (
        <WorkflowSection title={c.messages} id="case-conversation">
          <p>{c.messageNote}</p>
          {thread.length ? (
            <ol className="space-y-5">
              {thread.map((message) => (
                <li key={message.id} className="rounded-control border border-border p-4">
                  <p className="text-caption">
                    {message.authorName ?? "—"} ·{" "}
                    {message.audience === "internal" ? c.internal : c.shared} ·{" "}
                    <WorkflowTime value={message.at} locale={props.locale} />
                  </p>
                  <p className="whitespace-pre-wrap">{message.body}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p>{c.noMessages}</p>
          )}
          {view.canPost ? (
            <BoundWorkflowForm
              {...props}
              command="message"
              id={row.id}
              revision={row.version}
              path={path}
              fields={[
                { name: "body", label: c.message, type: "textarea", required: true },
                ...(staff
                  ? [{ name: "reviewed", label: c.reviewPost, type: "checkbox" as const }]
                  : []),
              ]}
              submit={c.post}
            />
          ) : null}
          {view.canNote ? (
            <WorkflowSection title={c.internal}>
              <BoundWorkflowForm
                {...props}
                command="note"
                id={row.id}
                revision={row.version}
                path={path}
                fields={[{ name: "body", label: c.internal, type: "textarea", required: true }]}
                submit={c.note}
              />
            </WorkflowSection>
          ) : null}
        </WorkflowSection>
      ) : null}
      {staff ? (
        <WorkflowSection title={c.participants}>
          <ul className="space-y-3">
            {view.participants.map((participant) => (
              <li key={participant.id}>
                {participant.name} · {participant.role.replaceAll("_", " ")} · {c.authority}:{" "}
                {participant.authority.replaceAll("_", " ")}
              </li>
            ))}
          </ul>
        </WorkflowSection>
      ) : null}
    </WorkflowPage>
  );
}

export function AppointmentList(
  props: ScreenProps & { rows: Awaited<ReturnType<typeof listAppointments>> },
) {
  const c = caseCopy(props.locale);
  return props.rows.length ? (
    <ul className="space-y-5">
      {props.rows.map((row) => (
        <li key={row.id} className="space-y-2 border-b border-border pb-4">
          <a
            className={workflowLink}
            href={`/${props.locale}/${props.session.account.kind === "staff" ? "calendar" : "appointments"}/${row.id}`}
          >
            {row.reference}
          </a>
          <p>{c[row.state]}</p>
          <p>{row.hostName}</p>
          <WorkflowTime
            value={row.confirmedStartsAt ?? row.proposedStartsAt}
            locale={props.locale}
          />
        </li>
      ))}
    </ul>
  ) : (
    <p>{c.noAppointments}</p>
  );
}

export async function WorkflowStatusScreen(
  props: ScreenProps & {
    command: string | string[] | undefined;
    id: string | string[] | undefined;
    operationKey: string | string[] | undefined;
  },
) {
  if (
    typeof props.command !== "string" ||
    !Object.hasOwn(workflowTypes, props.command) ||
    typeof props.id !== "string" ||
    typeof props.operationKey !== "string"
  )
    notFound();
  const command = props.command as WorkflowCommand,
    id = props.id;
  if (!isIssuedFormOperation(workflowScope(command, id), props.operationKey)) notFound();
  let destination: string;
  if (command === "create") {
    await privateRead(() => readInquiry(getDb(), props.session, id));
    destination = `/${props.locale}/inquiries/${id}`;
  } else if (
    ["arrange", "appointment", "appointmentHost", "appointmentHostHandover"].includes(command)
  ) {
    await privateRead(() => readAppointment(getDb(), props.session, id));
    destination = `/${props.locale}/${props.session.account.kind === "staff" ? "calendar" : "appointments"}/${id}`;
  } else if (command === "feedback") {
    const interest = await privateRead(() => readInterestContext(getDb(), props.session, id));
    destination = `/${props.locale}/${props.session.account.kind === "staff" ? "cases" : "overview"}/${interest.caseId}`;
  } else {
    await privateRead(() => caseFor(getDb(), props.session, id));
    destination = `/${props.locale}/${props.session.account.kind === "staff" ? "cases" : "overview"}/${id}`;
  }
  if (command === "emailDraft" || command === "emailApprove") {
    if (props.session.account.kind !== "staff") notFound();
    destination += "/email";
  }
  const receipt = await findOperation(
    getDb(),
    props.session.actor,
    workflowTypes[command],
    props.operationKey,
  );
  const c = caseCopy(props.locale);
  if (receipt?.status === "succeeded") {
    const outcome = z.object({ id: z.uuid() }).safeParse(receipt.outcome);
    if (outcome.success)
      destination = `/${props.locale}/${["request", "arrange", "appointment", "appointmentHost", "appointmentHostHandover"].includes(command) ? (props.session.account.kind === "staff" ? "calendar" : "appointments") : props.session.account.kind === "staff" ? "cases" : "overview"}/${outcome.data.id}${command === "emailDraft" || command === "emailApprove" ? "/email" : ""}`;
  }
  return (
    <WorkflowPage
      {...props}
      title={
        ["handover", "appointmentHost", "appointmentHostHandover"].includes(command) &&
        receipt?.status === "succeeded"
          ? c.saved
          : c.status
      }
    >
      <p>
        {!receipt
          ? c.statusAbsent
          : receipt.status === "succeeded"
            ? c.statusSaved
            : receipt.status === "failed"
              ? c.statusFailed
              : c.statusUnknown}
      </p>
      <a className={workflowLink} href={destination}>
        {c.back}
      </a>
    </WorkflowPage>
  );
}
