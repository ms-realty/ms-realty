import "server-only";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type InquiryState, inquiryMachine } from "@/domain/inquiry";
import { highImpactTaskTypes, type TaskState, taskMachine } from "@/domain/task";
import { custodyCopy } from "@/features/key-custody/copy";
import { isStaffLocale } from "@/i18n/config";
import type { Session } from "@/server/auth/sessions";
import { isAppError } from "@/server/errors";
import { readWorkOperation } from "@/server/work/commands";
import { readTaskHandover } from "@/server/work/handover";
import {
  type InboxView,
  listContacts,
  listInbox,
  listTasks,
  readContact,
  readInquiry,
  readToday,
} from "@/server/work/queries";
import { initialFormState } from "@/ui/form/server";
import { acceptAction, contactAction, taskAction, triageAction } from "./actions";
import { contactCopy } from "./contact-copy";
import { ContactForm } from "./contact-form";
import { workCopy } from "./copy";
import { coverageCopy } from "./coverage-copy";
import { CoverageOwner } from "./coverage-owner";
import { AcceptForm, TaskForm, TriageForm } from "./forms";
import { taskHandoverCopy } from "./handover-copy";
import { TaskHandoverScreen } from "./handover-screen";
import { InquirySelectionContext } from "./inquiry-selection-context";

export function checkLocale(locale: string) {
  if (!isStaffLocale(locale)) notFound();
}
export async function privateRead<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (error) {
    if (isAppError(error) && error.code === "not_found") notFound();
    throw error;
  }
}
export function queryPage(value: string | string[] | undefined) {
  const page = typeof value === "string" ? Number(value) : 1;
  return Number.isSafeInteger(page) && page > 0 && page <= 10000 ? page : 1;
}
const link = "font-semibold text-accent underline underline-offset-4";

export function Page({
  title,
  locale,
  children,
}: {
  title: string;
  locale: string;
  children: ReactNode;
}) {
  const copy = workCopy(locale);
  return (
    <div className="mx-auto min-w-0 max-w-page space-y-8 break-words px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="space-y-4">
        <h1 className="text-title font-semibold">{title}</h1>
        <nav aria-label={copy.details} className="flex flex-wrap gap-5">
          <a className={link} href={`/${locale}/today`}>
            {copy.today}
          </a>
          <a className={link} href={`/${locale}/inquiries`}>
            {copy.inbox}
          </a>
          <a className={link} href={`/${locale}/tasks`}>
            {copy.tasks}
          </a>
          <a className={link} href={`/${locale}/contacts`}>
            {copy.contacts}
          </a>
          <a className={link} href={`/${locale}/coverage`}>
            {coverageCopy(locale).title}
          </a>
        </nav>
      </header>
      {children}
    </div>
  );
}

export function When({
  date,
  locale,
  zone = "UTC",
}: {
  date: Date | null;
  locale: string;
  zone?: string;
}) {
  return date ? (
    <time dateTime={date.toISOString()}>
      {new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: zone,
      }).format(date)}{" "}
      {zone}
    </time>
  ) : (
    <span>{workCopy(locale).noDate}</span>
  );
}
export function Pagination({
  page,
  hasMore,
  href,
  locale,
}: {
  page: number;
  hasMore: boolean;
  href: string;
  locale: string;
}) {
  const copy = workCopy(locale);
  return (
    <nav className="flex gap-6 py-4" aria-label={copy.details}>
      {page > 1 ? (
        <a className={link} href={`${href}${href.includes("?") ? "&" : "?"}page=${page - 1}`}>
          {copy.previous}
        </a>
      ) : null}
      {hasMore ? (
        <a className={link} href={`${href}${href.includes("?") ? "&" : "?"}page=${page + 1}`}>
          {copy.next}
        </a>
      ) : null}
    </nav>
  );
}

function InquiryList({
  rows,
  locale,
}: {
  rows: Awaited<ReturnType<typeof listInbox>>["rows"];
  locale: string;
}) {
  const copy = workCopy(locale);
  if (!rows.length)
    return <p className="rounded-card border border-border p-5 text-text-muted">{copy.empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-start text-compact">
        <thead>
          <tr className="border-b border-border">
            {[copy.reference, copy.state, copy.owner, copy.received, copy.followUp].map((label) => (
              <th key={label} scope="col" className="p-3 text-start font-semibold">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ inquiry, ownerName, needsCoverage }) => (
            <tr key={inquiry.id} data-inquiry-id={inquiry.id} className="border-b border-border">
              <td className="p-3">
                <a className={link} href={`/${locale}/inquiries/${inquiry.id}`}>
                  <bdi>{inquiry.reference}</bdi>
                </a>
              </td>
              <td className="p-3">{copy.states[inquiry.state]}</td>
              <td className="p-3">
                <CoverageOwner name={ownerName} needsCoverage={needsCoverage} locale={locale} />
              </td>
              <td className="p-3">
                <When locale={locale} date={inquiry.createdAt} />
              </td>
              <td className="p-3">
                <When locale={locale} date={inquiry.followUpAt} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TaskList({
  rows,
  locale,
}: {
  rows: Awaited<ReturnType<typeof listTasks>>["rows"];
  locale: string;
}) {
  const copy = workCopy(locale);
  return rows.length ? (
    <ul className="divide-y divide-border rounded-card border border-border">
      {rows.map(({ task, ownerName, needsCoverage }) => (
        <li key={task.id} className="space-y-2 p-4">
          <a className={link} href={`/${locale}/tasks/${task.id}`}>
            {task.title}
          </a>
          <p>
            {copy.states[task.state]} · {copy.owner}:{" "}
            <CoverageOwner
              name={ownerName}
              needsCoverage={needsCoverage && !["done", "cancelled"].includes(task.state)}
              locale={locale}
            />
          </p>
          <p>
            {copy.followUp}:{" "}
            <When date={task.state === "waiting" ? task.followUpAt : task.dueAt} locale={locale} />
          </p>
          {task.waitingOn ? (
            <p>
              {copy.dependency}: {task.waitingOn}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  ) : (
    <p className="rounded-card border border-border p-5 text-text-muted">{copy.empty}</p>
  );
}

export async function TodayScreen({ locale, session }: { locale: string; session: Session }) {
  const copy = workCopy(locale);
  const queues = await readToday(getDb(), session);
  const custody = custodyCopy(locale);
  return (
    <Page title={copy.today} locale={locale}>
      <p className="text-text-muted">{copy.queueNote}</p>
      {queues.keyReturns ? (
        <section
          className="space-y-4"
          aria-labelledby="key-return-reminders"
          data-key-return-reminders
        >
          <h2 id="key-return-reminders" className="text-subheading font-semibold">
            {custody.returnReminders}
          </h2>
          <p>{custody.reminderHint}</p>
          {queues.keyReturns.rows.length ? (
            <ul className="divide-y divide-border rounded-card border border-border">
              {queues.keyReturns.rows.map((row) => (
                <li
                  key={row.id}
                  className="min-w-0 space-y-2 break-words p-4"
                  data-key-return={row.id}
                >
                  <a className={link} href={`/${locale}/operations/keys/${row.id}`}>
                    <bdi>{row.reference}</bdi>
                  </a>
                  <p>
                    {custody.propertyReference}: <bdi>{row.propertyReference}</bdi>
                  </p>
                  <p>
                    {custody.holderId}:{" "}
                    <CoverageOwner
                      name={row.holderName}
                      needsCoverage={row.needsCoverage}
                      locale={locale}
                    />
                  </p>
                  <p>
                    {custody.returnDue}:{" "}
                    <When date={row.dueAt} locale={locale} zone="Europe/Sofia" />
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-card border border-border p-5 text-text-muted">{copy.empty}</p>
          )}
          {queues.keyReturns.hasMore ? <p>{custody.moreReminders}</p> : null}
          <a className={link} href={`/${locale}/operations/keys?state=overdue`}>
            {custody.openOverdue}
          </a>
        </section>
      ) : null}
      <section className="space-y-4">
        <h2 className="text-subheading font-semibold">{taskHandoverCopy(locale).inbox}</h2>
        <TaskList rows={queues.handovers.rows} locale={locale} />
        <a className={link} href={`/${locale}/tasks?view=handovers`}>
          {taskHandoverCopy(locale).inbox}
        </a>
      </section>
      <section className="space-y-4">
        <h2 className="text-subheading font-semibold">{copy.unassigned}</h2>
        <InquiryList rows={queues.unassigned.rows} locale={locale} />
        <a className={link} href={`/${locale}/inquiries?view=unassigned`}>
          {copy.inbox}
        </a>
      </section>
      <section className="space-y-4">
        <h2 className="text-subheading font-semibold">{copy.due}</h2>
        <TaskList rows={queues.due.rows} locale={locale} />
        <a className={link} href={`/${locale}/tasks?view=mine`}>
          {copy.tasks}
        </a>
      </section>
      <section className="space-y-4">
        <h2 className="text-subheading font-semibold">{copy.mineInquiries}</h2>
        <InquiryList rows={queues.mine.rows} locale={locale} />
      </section>
    </Page>
  );
}

export async function InboxScreen({
  locale,
  session,
  view,
  page,
}: {
  locale: string;
  session: Session;
  view?: string | string[];
  page: number;
}) {
  const copy = workCopy(locale);
  const active: InboxView =
    typeof view === "string" && ["all", "unassigned", "mine", "awaiting", "review"].includes(view)
      ? (view as InboxView)
      : "all";
  const queue = await listInbox(getDb(), session, active, page);
  return (
    <Page title={copy.inbox} locale={locale}>
      <nav aria-label={copy.inbox} className="flex flex-wrap gap-5">
        {(["all", "unassigned", "mine", "awaiting", "review"] as const).map((key) => (
          <a
            className={link}
            aria-current={key === active ? "page" : undefined}
            key={key}
            href={`/${locale}/inquiries?view=${key}`}
          >
            {copy[key]}
          </a>
        ))}
      </nav>
      <InquiryList rows={queue.rows} locale={locale} />
      <Pagination {...queue} href={`/${locale}/inquiries?view=${active}`} locale={locale} />
    </Page>
  );
}

export async function InquiryScreen({
  locale,
  session,
  id,
}: {
  locale: string;
  session: Session;
  id: string;
}) {
  const detail = await privateRead(() => readInquiry(getDb(), session, id));
  const { inquiry, ownerName } = detail;
  const copy = workCopy(locale);
  const contact = contactCopy(locale);
  const targets = (
    [
      "suspected_spam",
      "duplicate_candidate",
      "contact_unreachable",
      "resolved_without_case",
    ] as const
  ).filter(
    (target) =>
      inquiryMachine.check(inquiry.state, target).outcome === "allowed" &&
      (["suspected_spam", "duplicate_candidate"].includes(target)
        ? detail.canAssign
        : detail.canRespond),
  );
  const canAccept =
    detail.canAssign &&
    detail.canRespond &&
    detail.canCreateTask &&
    (inquiryMachine.check(inquiry.state, "assigned").outcome === "allowed" ||
      (inquiry.state === "assigned" && inquiry.ownerId !== session.account.id));
  const snapshot = z
    .object({
      listing: z
        .object({ reference: z.string(), title: z.string(), sourceUrl: z.string().optional() })
        .nullable()
        .optional(),
    })
    .safeParse(inquiry.context);
  const listing = snapshot.success ? snapshot.data.listing : null;
  return (
    <Page title={inquiry.reference} locale={locale}>
      <nav className="flex flex-wrap gap-5" aria-label={copy.details}>
        {detail.canAssist ? (
          <a className={link} href={`/${locale}/operations/assistance?source=${inquiry.id}`}>
            {locale === "bg"
              ? "Преглед с Hermes"
              : locale === "ru"
                ? "Проверка с Hermes"
                : "Review with Hermes"}
          </a>
        ) : null}
        {inquiry.caseId ? (
          <a className={link} href={`/${locale}/cases/${inquiry.caseId}`}>
            {locale === "bg"
              ? "Отваряне на случая"
              : locale === "ru"
                ? "Открыть дело"
                : "Open case"}
          </a>
        ) : detail.canCreateCase &&
          inquiry.ownerId === session.account.id &&
          inquiry.state === "assigned" ? (
          <a className={link} href={`/${locale}/cases/new?inquiry=${inquiry.id}`}>
            {locale === "bg"
              ? "Създаване на случай"
              : locale === "ru"
                ? "Создать дело"
                : "Create a case"}
          </a>
        ) : null}
      </nav>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <div className="space-y-8">
          <section className="space-y-4 rounded-card border border-border bg-surface p-5">
            <h2 className="text-subheading font-semibold">{copy.submitted}</h2>
            <p className="whitespace-pre-wrap break-words">{inquiry.message}</p>
            {listing ? (
              <div className="rounded-control bg-subtle p-3">
                <p>
                  <bdi>{listing.reference}</bdi> · {listing.title}
                </p>
                {listing.sourceUrl ? (
                  <p className="break-all text-caption">
                    <bdi>{listing.sourceUrl}</bdi>
                  </p>
                ) : null}
              </div>
            ) : null}
            <InquirySelectionContext context={inquiry.context} locale={locale} />
            <dl className="space-y-2">
              <div>
                <dt className="font-semibold">{copy.purpose}</dt>
                <dd>{copy.purposes[inquiry.purpose]}</dd>
              </div>
              <div>
                <dt className="font-semibold">{copy.received}</dt>
                <dd>
                  <When date={inquiry.createdAt} locale={locale} />
                </dd>
              </div>
              <div>
                <dt className="font-semibold">{copy.preferredLocale}</dt>
                <dd>{inquiry.preferredLocale ?? "—"}</dd>
              </div>
              <div>
                <dt className="font-semibold">{copy.channel}</dt>
                <dd>{inquiry.preferredChannel ?? "—"}</dd>
              </div>
              <div>
                <dt className="font-semibold">{copy.contact}</dt>
                <dd>
                  {inquiry.partyId ? (
                    <a className={link} href={`/${locale}/contacts/${inquiry.partyId}`}>
                      {inquiry.preferredName || copy.contact}
                    </a>
                  ) : (
                    copy.noContact
                  )}
                </dd>
              </div>
            </dl>
          </section>
          {canAccept ? (
            <section className="space-y-4 rounded-card border border-border p-5">
              <h2 className="text-subheading font-semibold">{copy.accept}</h2>
              <p>{copy.acceptLead}</p>
              <AcceptForm
                locale={locale}
                id={id}
                action={acceptAction.bind(null, locale, id)}
                initialState={initialFormState(
                  `work.accept.${id}`,
                  { nextAction: "", dueAt: "" },
                  inquiry.version,
                )}
              />
            </section>
          ) : null}
          {detail.canRespond &&
          detail.canCreateTask &&
          !detail.needsCoverage &&
          inquiry.ownerId === session.account.id &&
          detail.contactMethod &&
          (inquiry.state === "assigned" || inquiry.state === "awaiting_client") ? (
            <section
              className="space-y-4 rounded-card border border-border p-5"
              data-inquiry-contact
            >
              <h2 className="text-subheading font-semibold">{contact.title}</h2>
              <p>{contact.lead}</p>
              <ContactForm
                locale={locale}
                id={id}
                contact={detail.contactMethod}
                action={contactAction.bind(null, locale, id)}
                initialState={initialFormState(
                  `work.contact.${id}`,
                  {
                    contactChoice: `${detail.contactMethod.id}:${detail.contactMethod.version}`,
                    result: "unanswered",
                    contactedAt: "",
                    note: "",
                    nextAction: "",
                    dueAt: "",
                    promisedToClient: "",
                    reviewed: "",
                  },
                  inquiry.version,
                )}
              />
            </section>
          ) : null}
          {targets.length ? (
            <section className="space-y-4 rounded-card border border-border p-5">
              <h2 className="text-subheading font-semibold">{copy.disposition}</h2>
              <p>{copy.dispositionLead}</p>
              <TriageForm
                locale={locale}
                id={id}
                action={triageAction.bind(null, locale, id)}
                states={targets}
                initialState={initialFormState(
                  `work.triage.${id}`,
                  {
                    state: targets[0] as InquiryState,
                    reason: "",
                    duplicateOfInquiryId: inquiry.duplicateOfInquiryId ?? "",
                  },
                  inquiry.version,
                )}
              />
            </section>
          ) : null}
          <section className="space-y-4">
            <h2 className="text-subheading font-semibold">{copy.tasks}</h2>
            <TaskList rows={detail.tasks} locale={locale} />
          </section>
        </div>
        <aside className="space-y-6">
          <dl className="space-y-4 rounded-card border border-border p-5">
            <div>
              <dt className="font-semibold">{contact.acknowledgment}</dt>
              <dd>
                <When date={inquiry.acknowledgedAt} locale={locale} />
              </dd>
            </div>
            <div>
              <dt className="font-semibold">{contact.firstResponse}</dt>
              <dd data-testid="inquiry-first-response">
                {inquiry.firstResponseAt ? (
                  <When date={inquiry.firstResponseAt} locale={locale} />
                ) : (
                  contact.noResponse
                )}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">{copy.state}</dt>
              <dd data-testid="inquiry-state">{copy.states[inquiry.state]}</dd>
            </div>
            <div>
              <dt className="font-semibold">{copy.owner}</dt>
              <dd data-testid="inquiry-owner">
                <CoverageOwner
                  name={ownerName}
                  needsCoverage={
                    detail.needsCoverage &&
                    !inquiry.caseId &&
                    inquiry.state !== "resolved_without_case"
                  }
                  locale={locale}
                />
              </dd>
            </div>
            <div>
              <dt className="font-semibold">{copy.followUp}</dt>
              <dd>
                <When date={inquiry.followUpAt} locale={locale} />
              </dd>
            </div>
            <div>
              <dt className="font-semibold">{copy.revision}</dt>
              <dd>{inquiry.version}</dd>
            </div>
            <div>
              <dt className="font-semibold">ID</dt>
              <dd className="break-all text-caption">
                <bdi>{id}</bdi>
              </dd>
            </div>
            {inquiry.dispositionReason ? (
              <div>
                <dt className="font-semibold">{copy.reason}</dt>
                <dd className="whitespace-pre-wrap">{inquiry.dispositionReason}</dd>
              </div>
            ) : null}
          </dl>
          <section className="space-y-3">
            <h2 className="text-subheading font-semibold">{copy.activity}</h2>
            <ol className="space-y-4">
              {detail.activity.map((entry) => (
                <li key={entry.id}>
                  <p>
                    {entry.contact
                      ? contact[entry.contact.result]
                      : (copy.events[entry.messageKey as keyof typeof copy.events] ??
                        copy.changeSaved)}
                  </p>
                  {entry.contact ? (
                    <dl className="space-y-2 break-words text-caption">
                      <div>
                        <dt className="font-semibold">{contact.observed}</dt>
                        <dd>
                          <When date={new Date(entry.contact.contactedAt)} locale={locale} />
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold">{contact.contact}</dt>
                        <dd>
                          <bdi>{entry.contact.contact.value}</bdi>
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold">{contact.note}</dt>
                        <dd className="whitespace-pre-wrap">{entry.contact.note}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold">{contact.followUp}</dt>
                        <dd>
                          <a href={`/${locale}/tasks/${entry.contact.taskId}`} className={link}>
                            {entry.contact.nextAction}
                          </a>{" "}
                          · <When date={new Date(entry.contact.dueAt)} locale={locale} /> ·{" "}
                          {entry.contact.promisedToClient
                            ? contact.clientPromise
                            : contact.internal}
                        </dd>
                      </div>
                    </dl>
                  ) : null}
                  <p className="text-caption text-text-muted">
                    <When date={entry.at} locale={locale} />
                  </p>
                  {entry.actorName ? (
                    <p className="text-caption text-text-muted">
                      {copy.actor}: {entry.actorName}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </Page>
  );
}

export async function TasksScreen({
  locale,
  session,
  page,
  mine,
  awaitingAcceptance = false,
}: {
  locale: string;
  session: Session;
  page: number;
  mine: boolean;
  awaitingAcceptance?: boolean;
}) {
  const copy = workCopy(locale);
  const queue = await listTasks(getDb(), session, { page, mine, awaitingAcceptance });
  const href = `/${locale}/tasks${awaitingAcceptance ? "?view=handovers" : mine ? "?view=mine" : ""}`;
  return (
    <Page title={copy.tasks} locale={locale}>
      <nav className="flex flex-wrap gap-5" aria-label={copy.tasks}>
        <a className={link} href={`/${locale}/tasks`}>
          {copy.tasks}
        </a>
        <a className={link} href={`/${locale}/tasks?view=mine`}>
          {copy.mine}
        </a>
        <a className={link} href={`/${locale}/tasks?view=handovers`}>
          {taskHandoverCopy(locale).inbox}
        </a>
      </nav>
      <TaskList locale={locale} rows={queue.rows} />
      <Pagination {...queue} href={href} locale={locale} />
    </Page>
  );
}

export async function TaskScreen({
  locale,
  session,
  id,
}: {
  locale: string;
  session: Session;
  id: string;
}) {
  const view = await privateRead(() => readTaskHandover(getDb(), session, id));
  const { task, ownerName, needsCoverage } = view;
  const copy = workCopy(locale);
  const guarded =
    task.evidenceRequired || (highImpactTaskTypes as readonly string[]).includes(task.type);
  const targets = (["in_progress", "waiting", "done", "cancelled"] as const).filter(
    (state) =>
      taskMachine.check(task.state, state).outcome === "allowed" && !(state === "done" && guarded),
  );
  return (
    <Page title={task.title} locale={locale}>
      <dl className="space-y-3">
        <div>
          <dt className="font-semibold">{copy.state}</dt>
          <dd>{copy.states[task.state]}</dd>
        </div>
        <div>
          <dt className="font-semibold">{copy.owner}</dt>
          <dd>
            <CoverageOwner
              name={ownerName}
              needsCoverage={needsCoverage && !["done", "cancelled"].includes(task.state)}
              locale={locale}
            />
          </dd>
        </div>
        <div>
          <dt className="font-semibold">{copy.followUp}</dt>
          <dd>
            <When date={task.state === "waiting" ? task.followUpAt : task.dueAt} locale={locale} />
          </dd>
        </div>
        {task.outcomeNote || task.waitingOn || task.cancelReason ? (
          <div>
            <dt className="font-semibold">{copy.outcome}</dt>
            <dd>{task.outcomeNote ?? task.waitingOn ?? task.cancelReason}</dd>
          </div>
        ) : null}
      </dl>
      {task.inquiryId ? (
        <a className={link} href={`/${locale}/inquiries/${task.inquiryId}`}>
          {copy.inbox}
        </a>
      ) : null}
      {guarded ? <p>{copy.guardedTask}</p> : null}
      {!["done", "cancelled"].includes(task.state) ? (
        <TaskHandoverScreen locale={locale} session={session} id={id} view={view} />
      ) : null}
      {targets.length ? (
        <section className="max-w-2xl space-y-4 rounded-card border border-border p-5">
          <h2 className="text-subheading font-semibold">{copy.taskChange}</h2>
          <TaskForm
            locale={locale}
            id={id}
            action={taskAction.bind(null, locale, id)}
            states={targets}
            initialState={initialFormState(
              `work.task.${id}`,
              { state: targets[0] as TaskState, note: "", followUpAt: "" },
              task.version,
            )}
          />
        </section>
      ) : null}
    </Page>
  );
}

export async function ContactsScreen({
  locale,
  session,
  page,
}: {
  locale: string;
  session: Session;
  page: number;
}) {
  const copy = workCopy(locale);
  const queue = await listContacts(getDb(), session, page);
  return (
    <Page title={copy.contacts} locale={locale}>
      <p>{copy.contactScope}</p>
      {queue.rows.length ? (
        <ul className="divide-y divide-border">
          {queue.rows.map((row) => (
            <li key={row.id} className="py-4">
              <a className={link} href={`/${locale}/contacts/${row.id}`}>
                {row.name}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p>{copy.noContacts}</p>
      )}
      <Pagination {...queue} href={`/${locale}/contacts`} locale={locale} />
    </Page>
  );
}

export async function ContactScreen({
  locale,
  session,
  id,
}: {
  locale: string;
  session: Session;
  id: string;
}) {
  const copy = workCopy(locale);
  const contact = await privateRead(() => readContact(getDb(), session, id));
  return (
    <Page title={contact.party.displayName} locale={locale}>
      <p>{copy.contactScope}</p>
      <section className="space-y-3">
        <h2 className="text-subheading font-semibold">{copy.methods}</h2>
        <ul className="space-y-3">
          {contact.methods.map((method) => (
            <li key={method.id}>
              <bdi>{method.value}</bdi>{" "}
              <span className="text-text-muted">
                ({method.kind}, {method.verification})
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="text-subheading font-semibold">{copy.linkedInquiries}</h2>
        <ul className="space-y-3">
          {contact.inquiries.map((inquiry) => (
            <li key={inquiry.id}>
              <a className={link} href={`/${locale}/inquiries/${inquiry.id}`}>
                {inquiry.reference}
              </a>{" "}
              · {copy.states[inquiry.state]}
            </li>
          ))}
        </ul>
      </section>
    </Page>
  );
}

export async function OperationScreen({
  locale,
  session,
  id,
  type,
  operationKey,
  task = false,
}: {
  locale: string;
  session: Session;
  id: string;
  type: string | string[] | undefined;
  operationKey: string | string[] | undefined;
  task?: boolean;
}) {
  if (
    typeof operationKey !== "string" ||
    !(task
      ? type === "task" || type === "handover"
      : type === "accept" || type === "triage" || type === "contact")
  )
    notFound();
  const operationType =
    type === "handover"
      ? "work.task.handover"
      : type === "task"
        ? "work.task.change"
        : type === "accept"
          ? "work.inquiry.accept"
          : type === "contact"
            ? "work.inquiry.contact"
            : "work.inquiry.triage";
  const receipt = await privateRead(() =>
    readWorkOperation(getDb(), session, operationType, id, operationKey),
  );
  const copy = workCopy(locale);
  return (
    <Page
      title={
        (type === "accept" || type === "contact") && receipt?.status === "succeeded"
          ? copy.changeSaved
          : copy.statusTitle
      }
      locale={locale}
    >
      <p>
        {!receipt
          ? copy.statusMissing
          : receipt.status === "succeeded"
            ? copy.statusSucceeded
            : receipt.status === "failed"
              ? copy.statusFailed
              : copy.statusPending}
      </p>
      <a className={link} href={`/${locale}/${task ? "tasks" : "inquiries"}/${id}`}>
        {copy.openRecord}
      </a>
    </Page>
  );
}
