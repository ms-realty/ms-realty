// C/O Deal overview · the Deal path (ADR 0013). The client and the broker read the same path,
// ordered by what matters now: how far the Deal is, the step it is on, the steps still to come,
// and the finished steps folded into a native disclosure. Server-rendered with native forms, so
// it works without JavaScript.
import "server-only";
import { createTranslator } from "next-intl";
import type { ReactNode } from "react";
import { agencyTimeZone, type DealPathActor, type DealPathTransaction } from "@/config/tenant";
import type { CaseKind } from "@/domain/case";
import { calendarDate, ownerSide } from "@/domain/deal-path";
import { defaultLocale, isPublicLocale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import type { Session } from "@/server/auth/sessions";
import type { casePath } from "@/server/cases/path";
import { cx } from "@/ui/cx";
import { initialFormState } from "@/ui/form/server";
import { LockIcon, NeutralIcon, SuccessIcon } from "@/ui/icons";
import { workflowAction } from "./actions";
import { type WorkflowCommand, workflowFields, workflowScope, workflowStatus } from "./contract";
import { caseCopy } from "./copy";
import { dealPathCopy, dealPathStaffCopy, stepCopy } from "./deal-path-copy";
import { type WorkflowField, WorkflowForm } from "./form";

export type DealPathView = NonNullable<Awaited<ReturnType<typeof casePath>>>;
type Step = DealPathView["steps"][number];
type Audience = "client" | "staff";

const formatLocale = (locale: string) => (isPublicLocale(locale) ? locale : defaultLocale);

/** ICU messages (counts, plurals) from the dealPath catalog. */
function translator(locale: string) {
  const t = createTranslator({
    locale: formatLocale(locale),
    messages: { dealPath: dealPathCopy(locale) },
    namespace: "dealPath",
  });
  return (key: "progress" | "doneGroup" | "position", values: Record<string, number>) =>
    t(key, values);
}

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
  audience: Audience,
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

/** The step's sentence: addressed to the client on their side of the Deal, neutral for staff. */
function stepSentence(locale: string, key: string, kind: CaseKind, audience: Audience) {
  const fallback = stepCopy(locale, key).about;
  if (audience === "staff" || kind === "service_intake") return fallback;
  const you = dealPathCopy(locale).you;
  const side: Record<string, string | undefined> = you[kind];
  const common: Record<string, string | undefined> = you.common;
  return side[key] ?? common[key] ?? fallback;
}

const settled = (step: Step) =>
  step.status === "done" || step.status === "skipped" || step.status === "not_recorded";

type Groups = {
  total: number;
  position: (step: Step) => number;
  done: Step[];
  current: Step | undefined;
  toCome: Step[];
};

function groupSteps(path: DealPathView): Groups {
  const positions = new Map(path.steps.map((step, index) => [step, index + 1]));
  return {
    total: path.steps.length,
    position: (step) => positions.get(step) ?? 0,
    done: path.steps.filter(settled),
    current: path.steps.find((step) => step.status === "current"),
    toCome: path.steps.filter((step) => step.status === "next" || step.status === "upcoming"),
  };
}

type ListProps = {
  locale: string;
  path: DealPathView;
  audience: Audience;
  actions?: (step: Step) => ReactNode;
};

/** "Who acts" and the expected date, as one quiet line of plain sentences. */
function StepMeta({ locale, path, audience, step }: ListProps & { step: Step }) {
  const c = dealPathCopy(locale);
  return (
    <p className="text-dense text-text-muted">
      {c.whoActs}: {actorLabel(locale, step.actor, path.kind, path.transaction, audience)}
      {step.expectedAt ? (
        <>
          {". "}
          {c.expectedBy}: <PathDate value={step.expectedAt} locale={locale} />
        </>
      ) : null}
    </p>
  );
}

function BrokerNote({ locale, note }: { locale: string; note: string | null }) {
  if (!note) return null;
  return (
    <p className="text-dense">
      <strong>{dealPathCopy(locale).brokerNote}:</strong> <bdi>{note}</bdi>
    </p>
  );
}

/** Staff-only facts about a step: hidden from the client, reason, internal note, document. */
function StaffFacts({ locale, step }: { locale: string; step: Step }) {
  const s = dealPathStaffCopy(locale);
  return (
    <>
      {!step.clientVisible ? (
        <p className="flex items-center gap-1 text-dense text-text-muted">
          <LockIcon className="size-4" /> {s.hidden}
        </p>
      ) : null}
      {step.evidenceExpected && !step.settled ? (
        <p className="text-dense text-text-muted">{s.evidenceUsual}</p>
      ) : null}
      {step.skipReason ? (
        <p className="text-dense">
          <strong>{s.skipReason}:</strong> <bdi>{step.skipReason}</bdi>
        </p>
      ) : null}
      {step.internalNote ? (
        <p className="rounded-control border border-dashed border-border bg-subtle p-2 text-dense">
          <LockIcon className="me-1 inline size-4 align-text-bottom" />
          <strong>{s.internalNote}:</strong> <bdi>{step.internalNote}</bdi>
        </p>
      ) : null}
      {step.evidence ? (
        <p className="text-dense">
          <strong>{s.evidence}:</strong> <bdi>{step.evidence.fileName}</bdi>
        </p>
      ) : null}
    </>
  );
}

/** The step the Deal is on: the one prominent, tinted element of the path. */
function CurrentStep(props: ListProps & { step: Step; groups: Groups }) {
  const { locale, audience, step, groups } = props;
  const t = translator(locale);
  const label =
    audience === "staff"
      ? dealPathStaffCopy(locale).currentStep
      : dealPathCopy(locale).status.current;
  return (
    <ol start={groups.position(step)} className="min-w-0 [overflow-wrap:anywhere]">
      <li
        data-step={step.key}
        data-status={step.status}
        aria-current="step"
        className="min-w-0 space-y-2 rounded-control bg-brand-tint p-4"
      >
        <p className="flex flex-wrap items-baseline gap-x-3 text-dense">
          <span className="font-semibold text-action">{label}</span>
          <span className="text-text-muted">
            {t("position", { n: groups.position(step), total: groups.total })}
          </span>
        </p>
        <h3 className="text-subheading font-semibold text-text">
          {stepCopy(locale, step.key).label}
        </h3>
        <p className="text-text">{stepSentence(locale, step.key, props.path.kind, audience)}</p>
        <StepMeta {...props} />
        <BrokerNote locale={locale} note={step.clientNote} />
        {audience === "staff" ? <StaffFacts locale={locale} step={step} /> : null}
        {props.actions?.(step)}
      </li>
    </ol>
  );
}

/** The steps after the current one, in order and compact. */
function StepsToCome(props: ListProps & { groups: Groups }) {
  const { locale, audience, groups } = props;
  const first = groups.toCome[0];
  if (!first) return null;
  const t = translator(locale);
  return (
    <div className="space-y-3">
      <h3 id="case-path-to-come" className="font-semibold text-text">
        {dealPathCopy(locale).toCome}
      </h3>
      <ol
        start={groups.position(first)}
        aria-labelledby="case-path-to-come"
        className="min-w-0 divide-y divide-divider [overflow-wrap:anywhere]"
      >
        {groups.toCome.map((step) => (
          <li
            key={step.key}
            data-step={step.key}
            data-status={step.status}
            className="min-w-0 space-y-1 py-3 first:pt-0 last:pb-0"
          >
            <p className="font-semibold text-text">
              <span className="sr-only">
                {t("position", { n: groups.position(step), total: groups.total })}:{" "}
              </span>
              {stepCopy(locale, step.key).label}
            </p>
            <p className="text-dense text-text">
              {stepSentence(locale, step.key, props.path.kind, audience)}
            </p>
            <StepMeta {...props} step={step} />
            <BrokerNote locale={locale} note={step.clientNote} />
            {audience === "staff" ? <StaffFacts locale={locale} step={step} /> : null}
            {props.actions?.(step)}
          </li>
        ))}
      </ol>
    </div>
  );
}

const summaryClass =
  "min-h-control cursor-pointer py-3 font-semibold text-action underline underline-offset-4";

/** Finished steps, one line each, folded away until someone opens them. */
function DoneSteps(props: ListProps & { groups: Groups }) {
  const { locale, audience, groups } = props;
  const first = groups.done[0];
  if (!first) return null;
  const c = dealPathCopy(locale);
  const t = translator(locale);
  return (
    <details className="border-t border-divider pt-1">
      <summary className={summaryClass}>{t("doneGroup", { count: groups.done.length })}</summary>
      <ol className="min-w-0 space-y-3 pt-2 [overflow-wrap:anywhere]">
        {groups.done.map((step) => {
          const muted = step.status !== "done";
          return (
            <li
              key={`${step.source}-${step.key}`}
              value={groups.position(step)}
              data-step={step.key}
              data-status={step.status}
              className="flex min-w-0 gap-2"
            >
              {step.status === "done" ? (
                <SuccessIcon className="mt-0.5 size-5 text-success" />
              ) : (
                <NeutralIcon className="mt-0.5 size-5 text-text-muted" />
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <p
                  className={cx("flex flex-wrap gap-x-3", muted ? "text-text-muted" : "text-text")}
                >
                  <span className="sr-only">
                    {t("position", { n: groups.position(step), total: groups.total })}:{" "}
                  </span>
                  <span className="font-semibold">{stepCopy(locale, step.key).label}</span>
                  {step.status === "done" ? (
                    <span className="text-dense text-text-muted">
                      <span className="sr-only">{c.status.done}: </span>
                      {step.doneAt ? <PathDate value={step.doneAt} locale={locale} /> : null}
                    </span>
                  ) : (
                    <span className="text-dense">
                      {step.status === "skipped"
                        ? c.status.skipped
                        : dealPathStaffCopy(locale).passed}
                    </span>
                  )}
                </p>
                <BrokerNote locale={locale} note={step.clientNote} />
                {audience === "staff" ? <StaffFacts locale={locale} step={step} /> : null}
                {props.actions?.(step)}
              </div>
            </li>
          );
        })}
      </ol>
    </details>
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
      <p className="flex items-center gap-2 text-subheading font-semibold text-text">
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

/** Progress in words, the current step, the steps to come, then the finished ones. */
function PathBody(props: ListProps) {
  const groups = groupSteps(props.path);
  const t = translator(props.locale);
  return (
    <>
      <CompletedSummary locale={props.locale} path={props.path} />
      <p className="font-semibold text-text">
        {t("progress", { count: groups.done.length, total: groups.total })}
      </p>
      {groups.current ? <CurrentStep {...props} step={groups.current} groups={groups} /> : null}
      <StepsToCome {...props} groups={groups} />
      <DoneSteps {...props} groups={groups} />
    </>
  );
}

/** The client's Deal path: the first section of the Deal overview. */
export function ClientDealPath({ locale, path }: { locale: string; path: DealPathView }) {
  const c = dealPathCopy(locale);
  return (
    <section
      id="case-path"
      aria-labelledby="case-path-heading"
      className="min-w-0 space-y-4 rounded-[1rem] border border-border bg-surface p-5 lg:p-6"
    >
      <div className="space-y-1">
        <h2
          id="case-path-heading"
          className="font-display text-[1.5rem] leading-[2.125rem] font-semibold tracking-[-0.02em]"
        >
          {c.title}
        </h2>
        <p className="text-text-muted">{c.lead}</p>
      </div>
      <PathBody locale={locale} path={path} audience="client" />
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

/** The kind of Deal in words, from the template it follows. */
function dealKind(locale: string, template: string) {
  const kinds: Record<string, string | undefined> = dealPathStaffCopy(locale).kinds;
  return kinds[template.replace(".", "_")] ?? null;
}

/** The broker's Path panel on the Deal page: the same order, with one-step actions. */
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
              label: `${file.fileName} (${file.reference})`,
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
    // Each disclosure names its step, so a list of identical "Record this step" is not ambiguous.
    const stepName = stepCopy(locale, step.key).label;
    if (step.settled)
      return (
        <details>
          <summary className={summaryClass}>
            {s.reopen}
            <span className="sr-only"> {stepName}</span>
          </summary>
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
    return (
      <details open={step.status === "current"}>
        <summary className={summaryClass}>
          {s.record}
          <span className="sr-only"> {stepName}</span>
        </summary>
        <div className="space-y-2 pt-2">
          <PathForm
            {...common}
            command="pathStep"
            identity={`${step.key}:done`}
            fields={[
              ...hiddenFields,
              { name: "date", label: s.doneDate, type: "date", required: true },
              { name: "clientNote", label: s.clientNote, type: "textarea" },
              { name: "internalNote", label: s.internalNoteField, type: "textarea" },
              ...documentField,
            ]}
            values={{ ...hidden(step, "done"), date: today }}
            submit={s.markDone}
          />
          <details>
            <summary className={summaryClass}>
              {s.notNeeded}
              <span className="sr-only"> {stepName}</span>
            </summary>
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
          <details>
            <summary className={summaryClass}>
              {s.setExpected}
              <span className="sr-only"> {stepName}</span>
            </summary>
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
  const kind = dealKind(locale, path.template);
  return (
    <section
      id="case-path"
      aria-labelledby="case-path-heading"
      tabIndex={-1}
      className="scroll-mt-6 space-y-4 rounded-card border border-border bg-surface p-5"
    >
      <div className="space-y-1">
        <h2 id="case-path-heading" className="text-subheading font-semibold">
          {s.title}
        </h2>
        {kind ? <p className="text-text">{kind}</p> : null}
        <p className="text-text-muted">{s.lead}</p>
      </div>
      <PathBody locale={locale} path={path} audience="staff" actions={actions} />
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
