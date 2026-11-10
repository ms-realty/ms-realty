// C/O Deal overview · the Deal path (ADR 0013). One ordered list the client and the broker both
// read: done, where the Deal stands now, what comes next, who acts and by when. Server-rendered
// with native forms, so it works without JavaScript.
import "server-only";
import type { ReactNode } from "react";
import { agencyTimeZone, type DealPathActor, type DealPathTransaction } from "@/config/tenant";
import type { CaseKind } from "@/domain/case";
import { calendarDate, ownerSide, type PathStepStatus } from "@/domain/deal-path";
import { defaultLocale, isPublicLocale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import type { Session } from "@/server/auth/sessions";
import type { casePath } from "@/server/cases/path";
import { cx } from "@/ui/cx";
import { initialFormState } from "@/ui/form/server";
import { LockIcon, NeutralIcon, PendingIcon, SuccessIcon } from "@/ui/icons";
import { workflowAction } from "./actions";
import { type WorkflowCommand, workflowFields, workflowScope, workflowStatus } from "./contract";
import { caseCopy } from "./copy";
import { dealPathCopy, dealPathStaffCopy, stepCopy } from "./deal-path-copy";
import { type WorkflowField, WorkflowForm } from "./form";

export type DealPathView = NonNullable<Awaited<ReturnType<typeof casePath>>>;
type Step = DealPathView["steps"][number];

const formatLocale = (locale: string) => (isPublicLocale(locale) ? locale : defaultLocale);

/** A calendar date (YYYY-MM-DD) or an instant, as one day in the agency's zone. */
function PathDate({ value, locale }: { value: Date | string; locale: string }) {
  // Noon UTC falls on the same calendar day in every zone the agency works in.
  const instant = typeof value === "string" ? new Date(`${value}T12:00:00Z`) : value;
  const machine = typeof value === "string" ? value : calendarDate(value, agencyTimeZone);
  return (
    <time dateTime={machine} className="tabular-nums">
      {formatDate(formatLocale(locale), instant, { timeZone: agencyTimeZone })}
    </time>
  );
}

function actorLabel(
  locale: string,
  actor: DealPathActor,
  kind: CaseKind,
  transaction: DealPathTransaction,
  audience: "client" | "staff",
) {
  const a = dealPathCopy(locale).actors;
  const owner = ownerSide(kind);
  if (actor === "client") {
    if (audience === "client" && !owner) return a.you;
    return transaction === "sale" ? a.buyer : a.tenant;
  }
  if (actor === "owner") return audience === "client" && owner ? a.you : a.owner;
  return a[actor];
}

const markerClass: Record<PathStepStatus, string> = {
  done: "text-success",
  skipped: "text-text-muted",
  not_recorded: "text-text-muted",
  current: "text-action",
  next: "text-text-muted",
  upcoming: "text-text-muted",
};

function Marker({ status }: { status: PathStepStatus }) {
  const className = cx("size-6", markerClass[status]);
  if (status === "done") return <SuccessIcon className={className} />;
  if (status === "current") return <NeutralIcon className={cx(className, "fill-current")} />;
  if (status === "next") return <PendingIcon className={className} />;
  return <NeutralIcon className={className} />;
}

/** The ordered steps. `actions` renders a step's staff forms, if any. */
export function DealPathList({
  locale,
  path,
  audience,
  actions,
}: {
  locale: string;
  path: DealPathView;
  audience: "client" | "staff";
  actions?: (step: Step) => ReactNode;
}) {
  const c = dealPathCopy(locale);
  const staffCopy = audience === "staff" ? dealPathStaffCopy(locale) : null;
  const status = (value: PathStepStatus) =>
    value === "current" && staffCopy ? staffCopy.currentStep : c.status[value];
  return (
    <ol className="min-w-0 [overflow-wrap:anywhere]" data-deal-path={path.template}>
      {path.steps.map((step) => {
        const words = stepCopy(locale, step.key);
        const current = step.status === "current";
        return (
          <li
            key={`${step.source}-${step.key}`}
            data-step={step.key}
            data-status={step.status}
            aria-current={current ? "step" : undefined}
            className="relative flex gap-3 pb-6 last:pb-0"
          >
            <span
              aria-hidden="true"
              className="absolute start-3 top-8 bottom-0 w-px bg-divider [li:last-child>&]:hidden"
            />
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface">
              <Marker status={step.status} />
            </span>
            <div
              className={cx(
                "min-w-0 flex-1 space-y-1",
                current && "-mt-2 rounded-control bg-brand-tint p-3",
              )}
            >
              <p
                className={cx(
                  "text-dense font-semibold",
                  current ? "text-action" : markerClass[step.status],
                )}
              >
                {status(step.status)}
              </p>
              <h3
                className={cx(
                  "font-semibold",
                  step.status === "skipped" || step.status === "not_recorded"
                    ? "text-text-muted"
                    : "text-text",
                )}
              >
                {words.label}
              </h3>
              {words.about ? <p className="text-text">{words.about}</p> : null}
              <p className="text-dense text-text-muted">
                {c.whoActs}: {actorLabel(locale, step.actor, path.kind, path.transaction, audience)}
              </p>
              {step.status === "done" && step.doneAt ? (
                <p className="text-dense text-text-muted">
                  {c.doneOn}: <PathDate value={step.doneAt} locale={locale} />
                </p>
              ) : null}
              {!step.settled && step.expectedAt ? (
                <p className="text-dense font-semibold">
                  {c.expectedBy}: <PathDate value={step.expectedAt} locale={locale} />
                </p>
              ) : null}
              {step.clientNote ? (
                <p className="text-dense">
                  <strong>{c.brokerNote}:</strong> <bdi>{step.clientNote}</bdi>
                </p>
              ) : null}
              {staffCopy ? (
                <>
                  {!step.clientVisible ? (
                    <p className="flex items-center gap-1 text-dense text-text-muted">
                      <LockIcon className="size-4" /> {staffCopy.hidden}
                    </p>
                  ) : null}
                  {step.evidenceExpected && !step.settled ? (
                    <p className="text-dense text-text-muted">{staffCopy.evidenceUsual}</p>
                  ) : null}
                  {step.canSkip === false && !step.settled ? (
                    <p className="text-dense font-semibold">{staffCopy.required}</p>
                  ) : null}
                  {step.brokerage ? (
                    <div className="space-y-1 text-dense">
                      <p>
                        {step.brokerage.away
                          ? staffCopy.brokerage.signedAway
                          : staffCopy.brokerage.signedOffice}
                      </p>
                      {step.brokerage.away ? (
                        <p>
                          {step.brokerage.earlyStart
                            ? staffCopy.brokerage.earlyStartYes
                            : staffCopy.brokerage.earlyStartNo}
                        </p>
                      ) : null}
                      {step.brokerage.withdrawalEndsOn ? (
                        <p className="font-semibold">
                          {staffCopy.brokerage.withdrawalEnds}:{" "}
                          <PathDate value={step.brokerage.withdrawalEndsOn} locale={locale} />
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {step.skipReason ? (
                    <p className="text-dense">
                      <strong>{staffCopy.skipReason}:</strong> <bdi>{step.skipReason}</bdi>
                    </p>
                  ) : null}
                  {step.internalNote ? (
                    <p className="rounded-control border border-dashed border-border bg-subtle p-2 text-dense">
                      <LockIcon className="me-1 inline size-4 align-text-bottom" />
                      <strong>{staffCopy.internalNote}:</strong> <bdi>{step.internalNote}</bdi>
                    </p>
                  ) : null}
                  {step.evidence ? (
                    <p className="text-dense">
                      <strong>{staffCopy.evidence}:</strong> <bdi>{step.evidence.fileName}</bdi>
                    </p>
                  ) : null}
                </>
              ) : null}
              {actions?.(step)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function CompletedSummary({ locale, path }: { locale: string; path: DealPathView }) {
  const c = dealPathCopy(locale).completed;
  if (!path.completion) return null;
  return (
    <div
      className="space-y-2 rounded-control border border-success bg-success-soft p-4"
      role="status"
    >
      <p className="flex items-center gap-2 font-semibold text-text">
        <SuccessIcon className="size-6 text-success" />
        {c.title}
      </p>
      <p>{c.lead}</p>
      <p>
        {c.completedOn}: <PathDate value={path.completion.completedOn} locale={locale} />
      </p>
      {path.completion.registryReference ? (
        <p>
          {c.reference}: <bdi>{path.completion.registryReference}</bdi>
        </p>
      ) : null}
      <p className="text-dense text-text-muted">{c.boundary}</p>
    </div>
  );
}

/** The client's Deal path: the first section of the Deal overview. */
export function ClientDealPath({ locale, path }: { locale: string; path: DealPathView }) {
  const c = dealPathCopy(locale);
  return (
    <section
      id="case-path"
      aria-labelledby="case-path-heading"
      className="min-w-0 space-y-5 rounded-[1rem] border border-border bg-surface p-5 lg:p-6"
    >
      <div className="space-y-2">
        <h2
          id="case-path-heading"
          className="font-display text-[1.5rem] leading-[2.125rem] font-semibold tracking-[-0.02em]"
        >
          {c.title}
        </h2>
        <p className="text-text-muted">{c.lead}</p>
      </div>
      <CompletedSummary locale={locale} path={path} />
      <DealPathList locale={locale} path={path} audience="client" />
      {!path.recorded ? <p className="text-dense text-text-muted">{c.preview}</p> : null}
    </section>
  );
}

type FormProps = {
  locale: string;
  session: Session;
  command: WorkflowCommand;
  path: DealPathView;
  identity: string;
  fields: WorkflowField[];
  values: Record<string, string>;
  submit: string;
  pagePath: string;
};

function PathForm({
  locale,
  session,
  command,
  path,
  identity,
  fields,
  values,
  submit,
  pagePath,
}: FormProps) {
  const scope = workflowScope(command, path.caseId);
  const initial = initialFormState(
    scope,
    Object.fromEntries(workflowFields[command].map((name) => [name, values[name] ?? ""])),
    path.caseVersion,
  );
  return (
    <WorkflowForm
      locale={locale}
      action={workflowAction.bind(null, session.account.kind, locale, command, path.caseId)}
      initialState={initial}
      fields={fields}
      path={pagePath}
      nativeIdentity={`${scope}:${identity}`}
      status={{
        href: workflowStatus(
          session.account.kind,
          locale,
          command,
          path.caseId,
          initial.operationId,
        ),
        label: caseCopy(locale).status,
      }}
      submit={submit}
    />
  );
}

const disclosure =
  "min-h-control cursor-pointer py-2 font-semibold text-action underline underline-offset-4";

/** The broker's Path panel on the Deal page: the same list, with one-step actions. */
export function StaffDealPath({
  locale,
  session,
  path,
  pagePath,
}: {
  locale: string;
  session: Session;
  path: DealPathView;
  pagePath: string;
}) {
  const s = dealPathStaffCopy(locale);
  const today = calendarDate(new Date(), agencyTimeZone);
  const documentField: WorkflowField[] = path.evidenceOptions.length
    ? [
        {
          name: "evidenceVersionId",
          label: s.evidenceField,
          type: "select",
          options: [
            { value: "", label: s.noDocument },
            ...path.evidenceOptions.map((file) => ({
              value: file.id,
              label: `${file.fileName} · ${file.reference}`,
            })),
          ],
        },
      ]
    : [];
  const common = { locale, session, path, pagePath };
  const hidden = (step: Step, action: string) => ({ stepKey: step.key, action });
  const hiddenFields: WorkflowField[] = [
    { name: "stepKey", label: "stepKey", type: "hidden" },
    { name: "action", label: "action", type: "hidden" },
  ];
  const actions = (step: Step) => {
    if (!path.canRecord || step.source !== "recorded") return null;
    if (step.settled)
      return (
        <details className="pt-1">
          <summary className={disclosure}>{s.reopen}</summary>
          <PathForm
            {...common}
            command="pathStep"
            identity={`${step.key}:reopen`}
            fields={[
              ...hiddenFields,
              { name: "reason", label: s.reopenReason, type: "textarea", required: true },
            ]}
            values={hidden(step, "reopen")}
            submit={s.reopen}
          />
        </details>
      );
    const brokerage = step.duty === "brokerage_contract";
    const yesNo = [
      { value: "", label: s.brokerage.choose },
      { value: "yes", label: s.brokerage.yes },
      { value: "no", label: s.brokerage.no },
    ];
    return (
      <details className="pt-1" open={step.status === "current"}>
        <summary className={disclosure}>{s.record}</summary>
        <div className="space-y-6 pt-2">
          {step.waitsForIdentityChecks ? (
            // ADR 0015: money, signatures and the property move only after identity checks.
            <p className="text-dense">{s.waitsForIdentity}</p>
          ) : (
            <PathForm
              {...common}
              command="pathStep"
              identity={`${step.key}:done`}
              fields={[
                ...hiddenFields,
                {
                  name: "date",
                  label: brokerage ? s.brokerage.signedOn : s.doneDate,
                  type: "date",
                  required: true,
                },
                ...(brokerage
                  ? ([
                      {
                        name: "away",
                        label: s.brokerage.away,
                        type: "select",
                        required: true,
                        options: yesNo,
                      },
                      {
                        name: "earlyStart",
                        label: s.brokerage.earlyStart,
                        hint: s.brokerage.earlyStartHint,
                        type: "select",
                        options: yesNo,
                      },
                    ] satisfies WorkflowField[])
                  : []),
                { name: "clientNote", label: s.clientNote, type: "textarea" },
                { name: "internalNote", label: s.internalNoteField, type: "textarea" },
                ...documentField,
              ]}
              values={{ ...hidden(step, "done"), date: today }}
              submit={s.markDone}
            />
          )}
          {step.canSkip !== false ? (
            <details>
              <summary className={disclosure}>{s.notNeeded}</summary>
              <PathForm
                {...common}
                command="pathStep"
                identity={`${step.key}:skip`}
                fields={[
                  ...hiddenFields,
                  { name: "reason", label: s.skipReason, type: "textarea", required: true },
                  { name: "clientNote", label: s.clientNote, type: "textarea" },
                ]}
                values={hidden(step, "skip")}
                submit={s.notNeededSubmit}
              />
            </details>
          ) : null}
          <details>
            <summary className={disclosure}>{s.setExpected}</summary>
            <PathForm
              {...common}
              command="pathStep"
              identity={`${step.key}:expect`}
              fields={[
                ...hiddenFields,
                { name: "date", label: s.expectedDate, type: "date", required: true },
              ]}
              values={{
                ...hidden(step, "expect"),
                date: typeof step.expectedAt === "string" ? step.expectedAt : "",
              }}
              submit={s.setExpected}
            />
          </details>
        </div>
      </details>
    );
  };
  return (
    <section
      id="case-path"
      aria-labelledby="case-path-heading"
      tabIndex={-1}
      className="scroll-mt-6 space-y-4 rounded-card border border-border bg-surface p-5"
    >
      <h2 id="case-path-heading" className="text-subheading font-semibold">
        {s.title}
      </h2>
      <p className="text-text-muted">{s.lead}</p>
      <p className="text-dense text-text-muted">
        {s.template}: <bdi>{path.template}</bdi>
      </p>
      <CompletedSummary locale={locale} path={path} />
      <DealPathList locale={locale} path={path} audience="staff" actions={actions} />
      {!path.recorded ? <p className="text-dense text-text-muted">{s.preview}</p> : null}
      {path.canComplete ? (
        <div className="space-y-3 border-t border-divider pt-4" id="case-path-complete">
          <h3 className="font-semibold">{s.complete.title}</h3>
          <p>{s.complete.lead}</p>
          <p className="text-dense text-text-muted">{s.complete.boundary}</p>
          <PathForm
            {...common}
            command="pathComplete"
            identity="complete"
            fields={[
              { name: "completedOn", label: s.complete.completedOn, type: "date", required: true },
              { name: "registryReference", label: s.complete.reference },
              ...(documentField.length
                ? [{ ...documentField[0], label: s.complete.evidence } as WorkflowField]
                : []),
              { name: "reviewed", label: s.complete.reviewed, type: "checkbox", required: true },
            ]}
            values={{ completedOn: today }}
            submit={s.complete.submit}
          />
        </div>
      ) : path.canRecord && path.recorded && path.completionBlocked ? (
        <p className="border-t border-divider pt-4 text-dense text-text-muted">
          {s.complete.title}: {s.blocked[path.completionBlocked]}
        </p>
      ) : null}
    </section>
  );
}
