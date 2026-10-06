// O01 Today (Figma 10:203 desktop, 40:157 laptop, 14:4343 mobile, states 605:37146): one
// prioritized worklist in contract order — unassigned requests, then due commitments (my overdue
// tasks, overdue key returns, work offered to me) — and my open inquiries to continue. Counts are
// the bounded real queues from readToday and link to those queues. A failed read says so and
// never looks like a day without work. Butler only opens the O32 draft review; it never acts.
import "server-only";
import { unstable_rethrow } from "next/navigation";
import { type ComponentType, Fragment, type ReactNode } from "react";
import { z } from "zod";
import { getDb } from "@/db/client";
import { aiCopy } from "@/features/ai/copy";
import { custodyCopy } from "@/features/key-custody/copy";
import { readAssistanceSource } from "@/server/ai/assistance";
import { assistanceAvailability } from "@/server/ai/config";
import type { Session } from "@/server/auth/sessions";
import { can } from "@/server/authz";
import type { Executor } from "@/server/db";
import { isAppError } from "@/server/errors";
import { readToday } from "@/server/work/queries";
import { buttonClass } from "@/ui/button-class";
import { cx } from "@/ui/cx";
import {
  AssistIcon,
  ChevronEndIcon,
  ClockIcon,
  DocumentIcon,
  ExternalIcon,
  InboxIcon,
  LockIcon,
} from "@/ui/icons";
import { Notice } from "@/ui/notice";
import { workCopy } from "./copy";
import { coverageCopy } from "./coverage-copy";
import { taskHandoverCopy } from "./handover-copy";
import { todayCopy } from "./today-copy";
import { When } from "./when";

type Queues = Awaited<ReturnType<typeof readToday>>;
type Queue<T> = { rows: T[]; hasMore: boolean };
type InquiryItem = Queues["unassigned"]["rows"][number];
type TaskItem = Queues["due"]["rows"][number];
type KeyItem = NonNullable<Queues["keyReturns"]>["rows"][number];
type ButlerSource = { id: string; reference: string; enabled: boolean };
type Detail = [key: string, node: ReactNode];

const agencyZone = "Europe/Sofia";
// Today starts the day: the oldest few of each queue stay in view together, so a long queue
// cannot push a later group's overdue work out of sight. The count links to the whole queue.
const rowsPerGroup = 5;
// The page guard ran just before: these mean access changed meanwhile, not that a queue failed.
const accessErrors = ["unauthenticated", "forbidden", "not_found"];
const listingSnapshot = z.object({
  listing: z.object({ reference: z.string() }).nullable().optional(),
});

export async function TodayScreen({
  locale,
  session,
  name,
  now = new Date(),
}: {
  locale: string;
  session: Session;
  /** The signed-in staff member's display name, for the greeting. */
  name: string | null;
  now?: Date;
}) {
  const t = todayCopy(locale);
  let loaded: Awaited<ReturnType<typeof loadToday>> | null = null;
  try {
    loaded = await loadToday(getDb(), session, now);
  } catch (error) {
    unstable_rethrow(error);
    if (isAppError(error) && accessErrors.includes(error.code)) throw error;
    // Name the failure class only: queue rows never reach a log line.
    console.error(
      "[O01] Today queues unavailable:",
      isAppError(error) ? error.code : error instanceof Error ? error.name : typeof error,
    );
  }
  const queues = loaded?.queues ?? null;
  const attention = queues
    ? [
        queues.unassigned,
        queues.due,
        queues.handovers,
        ...(queues.keyReturns ? [queues.keyReturns] : []),
      ]
    : [];
  const waiting = attention.reduce((sum, queue) => sum + queue.rows.length, 0);
  const more = attention.some((queue) => queue.hasMore);
  const lead = !queues
    ? t.leadFailed
    : waiting
      ? t.leadWaiting.replace(
          "{n}",
          `${new Intl.NumberFormat(locale).format(waiting)}${more ? "+" : ""}`,
        )
      : queues.mine.rows.length
        ? t.leadNothing
        : t.leadEmpty;
  const shownName = name?.trim().replace(/\.$/, "");
  const tabs = [
    { href: `/${locale}/today`, label: t.forAction, current: true },
    { href: `/${locale}/tasks?view=mine`, label: t.myTasks, current: false },
    // Team scope only where the person may read the agency's Cases (Figma: O04).
    ...(loaded?.mayViewTeam ? [{ href: `/${locale}/cases`, label: t.team, current: false }] : []),
  ];
  return (
    <div className="mx-auto flex min-w-0 max-w-page flex-col gap-6 break-words px-gutter py-6 sm:gap-8 sm:px-gutter-wide sm:py-8">
      <header className="flex flex-col gap-6 sm:gap-8">
        <h1 className="text-heading font-semibold sm:text-title">
          {greeting(locale, now)}
          {shownName ? (
            <>
              , <bdi>{shownName}</bdi>
            </>
          ) : null}
          .
        </h1>
        <p className="text-text-muted">{lead}</p>
      </header>
      <nav aria-label={t.scope}>
        <ul className="grid auto-cols-fr grid-flow-col gap-1 rounded-control bg-subtle p-1">
          {tabs.map((tab) => (
            <li key={tab.href} className="flex">
              <a
                href={tab.href}
                aria-current={tab.current ? "page" : undefined}
                className={cx(
                  "flex min-h-[2.875rem] w-full items-center justify-center rounded-control p-3 text-center text-dense font-semibold no-underline",
                  tab.current
                    ? "bg-canvas text-text"
                    : "text-text-muted hover:bg-canvas/60 hover:text-text",
                )}
              >
                {tab.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {!queues ? (
        <div className="flex flex-col items-start gap-4" data-today-state="failed">
          <Notice tone="error" className="w-full">
            {t.failed}
          </Notice>
          <a href={`/${locale}/today`} className={buttonClass("primary")}>
            {t.reload}
          </a>
        </div>
      ) : !waiting && !queues.mine.rows.length ? (
        <div className="flex flex-col items-start gap-4" data-today-state="empty">
          <div className="flex w-full flex-col gap-4 p-6">
            <InboxIcon className="size-7 text-text-muted" />
            <h2 className="text-heading font-semibold">{t.emptyTitle}</h2>
            <p className="text-text-muted">{workCopy(locale).queueNote}</p>
          </div>
          <a href={`/${locale}/inquiries`} className={buttonClass("primary")}>
            {t.emptyAction}
          </a>
        </div>
      ) : (
        <div className="grid min-w-0 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_23.1875rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <Worklist locale={locale} queues={queues} now={now} />
            <p className="text-dense text-text-muted">{workCopy(locale).queueNote}</p>
            <a href={`/${locale}/tasks`} className={buttonClass("tertiary", "w-fit text-text")}>
              {t.allTasks}
            </a>
          </div>
          {loaded?.butler ? <ButlerPanel locale={locale} source={loaded.butler} /> : null}
        </div>
      )}
    </div>
  );
}

async function loadToday(db: Executor, session: Session, now: Date) {
  const [queues, mayViewTeam] = await Promise.all([
    readToday(db, session, now),
    can(db, session.actor, "case.read", { type: "case", audience: "internal" }),
  ]);
  // Butler is offered for the first inquiry in the list, only when its own source check passes.
  const first = queues.unassigned.rows[0]?.inquiry ?? queues.mine.rows[0]?.inquiry;
  return { queues, mayViewTeam, butler: first ? await butlerSource(db, session, first) : null };
}

async function butlerSource(
  db: Executor,
  session: Session,
  inquiry: { id: string; reference: string },
): Promise<ButlerSource | null> {
  try {
    await readAssistanceSource(db, session, inquiry.id);
  } catch (error) {
    if (isAppError(error) && error.code === "unauthenticated") throw error;
    // Not permitted for this source: no entry. Any other failure leaves the queues, which
    // were read, in view; the entry is supplementary and the rail still opens Butler.
    if (!isAppError(error) || !["not_found", "forbidden"].includes(error.code))
      console.error(
        "[O01] Butler entry unavailable:",
        isAppError(error) ? error.code : error instanceof Error ? error.name : typeof error,
      );
    return null;
  }
  return {
    id: inquiry.id,
    reference: inquiry.reference,
    enabled: assistanceAvailability().enabled,
  };
}

function Worklist({ locale, queues, now }: { locale: string; queues: Queues; now: Date }) {
  const t = todayCopy(locale);
  const work = workCopy(locale);
  const oldest = queues.unassigned.rows[0]?.inquiry.createdAt;
  // Open inquiries arrive oldest first. Any whose follow-up time has passed moves to the front,
  // oldest follow-up first, so the rows in view never hide an overdue follow-up.
  const followUpDue = (item: InquiryItem) =>
    item.inquiry.followUpAt !== null && item.inquiry.followUpAt <= now;
  const mine = {
    ...queues.mine,
    rows: [
      ...queues.mine.rows
        .filter(followUpDue)
        .sort(
          (a, b) => (a.inquiry.followUpAt?.getTime() ?? 0) - (b.inquiry.followUpAt?.getTime() ?? 0),
        ),
      ...queues.mine.rows.filter((item) => !followUpDue(item)),
    ],
  };
  return (
    <>
      <section aria-labelledby="today-attention" className="flex flex-col gap-4">
        <h2 id="today-attention" className="text-subheading font-semibold">
          {t.attention}
        </h2>
        <p className="text-dense text-text-muted">{t.order}</p>
        <Group
          id="unassigned"
          locale={locale}
          title={t.unassigned}
          href={`/${locale}/inquiries?view=unassigned`}
          queue={queues.unassigned}
          notice={
            queues.unassigned.hasMore && oldest ? (
              <Notice
                tone="warning"
                title={t.overload.replace(
                  "{n}",
                  new Intl.NumberFormat(locale).format(queues.unassigned.rows.length),
                )}
                action={
                  <a
                    href={`/${locale}/coverage`}
                    className="font-semibold text-action underline underline-offset-4"
                  >
                    {coverageCopy(locale).title}
                  </a>
                }
              >
                {place(t.overloadBody, <Ago locale={locale} date={oldest} now={now} />)}
              </Notice>
            ) : null
          }
          row={(item) => <InquiryRow key={item.inquiry.id} locale={locale} item={item} now={now} />}
        />
        <Group
          id="due"
          locale={locale}
          title={work.due}
          href={`/${locale}/tasks?view=overdue`}
          queue={queues.due}
          row={(item) => <TaskRow key={item.task.id} locale={locale} item={item} now={now} />}
        />
        {queues.keyReturns ? (
          <Group
            id="keys"
            locale={locale}
            title={custodyCopy(locale).returnReminders}
            href={`/${locale}/operations/keys?state=overdue`}
            queue={queues.keyReturns}
            notice={
              <p className="text-dense text-text-muted">{custodyCopy(locale).reminderHint}</p>
            }
            keyReturns
            row={(item) => <KeyRow key={item.id} locale={locale} item={item} />}
          />
        ) : null}
        <Group
          id="handovers"
          locale={locale}
          title={taskHandoverCopy(locale).inbox}
          href={`/${locale}/tasks?view=handovers`}
          queue={queues.handovers}
          row={(item) => (
            <TaskRow key={item.task.id} locale={locale} item={item} now={now} handover />
          )}
        />
      </section>
      <section aria-labelledby="today-continue" className="flex flex-col gap-4">
        <h2 id="today-continue" className="text-subheading font-semibold">
          {t.continue}
        </h2>
        <Group
          id="mine"
          locale={locale}
          title={work.mineInquiries}
          href={`/${locale}/inquiries?view=mine`}
          queue={mine}
          row={(item) => (
            <InquiryRow key={item.inquiry.id} locale={locale} item={item} now={now} mine />
          )}
        />
      </section>
    </>
  );
}

/** One queue: a heading that links to the whole queue with its count, then its oldest rows. */
function Group<T>({
  id,
  locale,
  title,
  href,
  queue,
  row,
  notice,
  keyReturns = false,
}: {
  id: string;
  locale: string;
  title: string;
  href: string;
  queue: Queue<T>;
  row: (item: T) => ReactNode;
  notice?: ReactNode;
  keyReturns?: boolean;
}) {
  const t = todayCopy(locale);
  const count = `${new Intl.NumberFormat(locale).format(queue.rows.length)}${queue.hasMore ? "+" : ""}`;
  return (
    <div
      className="flex flex-col gap-4"
      data-today-group={id}
      data-key-return-reminders={keyReturns ? "" : undefined}
    >
      <h3 className="text-dense font-semibold">
        <a
          href={href}
          className="flex min-h-control items-center gap-3 text-text no-underline hover:text-action"
        >
          <span className="min-w-0 flex-1">{title}</span>
          <span className="min-w-6 rounded-full bg-subtle px-2 text-center text-caption font-semibold tabular-nums text-text-muted">
            <span className="sr-only">{t.inQueue} </span>
            {count}
          </span>
          <ChevronEndIcon directional className="size-5 text-text-muted" />
        </a>
      </h3>
      {notice}
      {queue.rows.length ? (
        <ul aria-label={title} className="flex flex-col gap-4">
          {queue.rows.slice(0, rowsPerGroup).map((item) => row(item))}
        </ul>
      ) : (
        <p className="text-dense text-text-muted">{t.none}</p>
      )}
      {queue.hasMore || queue.rows.length > rowsPerGroup ? (
        <a
          href={href}
          className="w-fit text-dense font-semibold text-action underline underline-offset-4"
        >
          {t.more}
        </a>
      ) : null}
    </div>
  );
}

/** A whole-row link (Figma "Go / …" rows): reason, then owner · due or age · next step. */
function Row({
  href,
  Icon,
  title,
  details,
  data,
}: {
  href: string;
  Icon: ComponentType<{ className?: string }>;
  title: ReactNode;
  details: Detail[];
  data: Record<`data-${string}`, string>;
}) {
  return (
    <li className="border-b border-divider pb-4" {...data}>
      <a
        href={href}
        className="flex min-h-19 items-center gap-4 p-4 text-dense text-text no-underline hover:bg-subtle"
      >
        <Icon className="size-5" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-semibold">{title}</span>
          <span className="font-medium text-text-muted">
            {details.map(([key, node], index) => (
              <Fragment key={key}>
                {index ? " · " : null}
                {node}
              </Fragment>
            ))}
          </span>
        </span>
        <ChevronEndIcon directional className="size-5" />
      </a>
    </li>
  );
}

function InquiryRow({
  locale,
  item: { inquiry, ownerName, needsCoverage },
  now,
  mine = false,
}: {
  locale: string;
  item: InquiryItem;
  now: Date;
  mine?: boolean;
}) {
  const t = todayCopy(locale);
  const work = workCopy(locale);
  const parsed = listingSnapshot.safeParse(inquiry.context);
  const listing = parsed.success ? parsed.data.listing?.reference : undefined;
  const followUp = mine ? inquiry.followUpAt : null;
  const action =
    inquiry.state === "received"
      ? t.actions.accept
      : inquiry.state === "assigned"
        ? inquiry.firstResponseAt
          ? t.actions.conversation
          : t.actions.firstReply
        : inquiry.state === "awaiting_client"
          ? t.actions.clientReply
          : t.actions.review;
  return (
    <Row
      href={`/${locale}/inquiries/${inquiry.id}`}
      Icon={InboxIcon}
      data={{ "data-inquiry-id": inquiry.id }}
      title={
        <>
          {work.purposes[inquiry.purpose]}
          {inquiry.preferredName ? (
            <>
              {" · "}
              <bdi>{inquiry.preferredName}</bdi>
            </>
          ) : null}
          {" · "}
          <bdi>{listing ?? inquiry.reference}</bdi>
        </>
      }
      details={[
        ["owner", t.owner.replace("{name}", () => ownerText(locale, ownerName, needsCoverage))],
        ...(["received", "assigned"].includes(inquiry.state)
          ? []
          : [["state", work.states[inquiry.state]] satisfies Detail]),
        [
          "time",
          followUp
            ? due(locale, followUp, now)
            : place(t.received, <Ago locale={locale} date={inquiry.createdAt} now={now} />),
        ],
        ["next", t.next.replace("{action}", action)],
      ]}
    />
  );
}

function TaskRow({
  locale,
  item: { task, ownerName, needsCoverage },
  now,
  handover = false,
}: {
  locale: string;
  item: TaskItem;
  now: Date;
  handover?: boolean;
}) {
  const t = todayCopy(locale);
  // The same earliest outstanding time the queue is ordered by (least(dueAt, followUpAt)).
  const dueAt =
    [task.dueAt, task.followUpAt]
      .filter((date): date is Date => date !== null)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  return (
    <Row
      href={`/${locale}/tasks/${task.id}`}
      Icon={ClockIcon}
      data={{ "data-task-id": task.id }}
      title={task.title}
      details={[
        ["owner", t.owner.replace("{name}", () => ownerText(locale, ownerName, needsCoverage))],
        ["time", due(locale, dueAt, now)],
        ...(task.promisedToClient
          ? [["promise", coverageCopy(locale).promise] satisfies Detail]
          : []),
        ...(task.waitingOn
          ? [
              [
                "waiting",
                t.waitingOn.replace("{what}", () => task.waitingOn ?? ""),
              ] satisfies Detail,
            ]
          : []),
        [
          "next",
          t.next.replace(
            "{action}",
            handover
              ? t.actions.handover
              : task.state === "waiting"
                ? t.actions.dependency
                : t.actions.outcome,
          ),
        ],
      ]}
    />
  );
}

function KeyRow({ locale, item }: { locale: string; item: KeyItem }) {
  const t = todayCopy(locale);
  // Physical keys stay with the recorded holder until a return is recorded; coverage only
  // follows up, so the holder keeps their name here.
  const holder = `${item.holderName ?? workCopy(locale).noOwner}${
    item.needsCoverage ? ` (${coverageCopy(locale).title})` : ""
  }`;
  return (
    <Row
      href={`/${locale}/operations/keys/${item.id}`}
      Icon={LockIcon}
      data={{ "data-key-return": item.id }}
      title={place(t.keys, <bdi>{item.reference}</bdi>)}
      details={[
        ["property", place(t.property, <bdi>{item.propertyReference}</bdi>)],
        ["holder", t.holder.replace("{name}", () => holder)],
        [
          "time",
          place(t.overdueSince, <When locale={locale} date={item.dueAt} zone={agencyZone} />),
        ],
        ["next", t.next.replace("{action}", t.actions.keyReturn)],
      ]}
    />
  );
}

function ButlerPanel({ locale, source }: { locale: string; source: ButlerSource }) {
  const t = todayCopy(locale);
  const inquiry = `/${locale}/inquiries/${source.id}`;
  return (
    <aside
      aria-labelledby="today-butler"
      className="flex min-w-0 flex-col items-start gap-5 rounded-card bg-subtle p-5"
      data-today-butler
    >
      <h2 id="today-butler" className="flex items-center gap-3 text-subheading font-semibold">
        <AssistIcon className="size-5 text-assist" />
        Butler
      </h2>
      <p className="w-full rounded-control bg-assist-soft p-2 text-dense font-medium text-assist">
        {t.butlerStatus}
      </p>
      <p>{place(t.butlerOffer, <bdi>{source.reference}</bdi>)}</p>
      <a
        href={inquiry}
        className="flex w-full items-start gap-3 rounded-control bg-subtle p-3 text-dense text-text no-underline hover:bg-selected"
      >
        <DocumentIcon className="size-5" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-semibold">
            <bdi>{source.reference}</bdi>
          </span>
          <span className="font-medium text-text-muted">{t.butlerScope}</span>
        </span>
        <ExternalIcon className="size-4" />
      </a>
      <p className="text-dense text-text-muted">{t.butlerNote}</p>
      {source.enabled ? (
        <a
          href={`/${locale}/operations/assistance?source=${source.id}`}
          className={buttonClass("assist")}
        >
          <AssistIcon className="size-[1.125rem]" />
          {t.butlerPrepare}
        </a>
      ) : (
        <>
          <button
            type="button"
            disabled
            aria-describedby="today-butler-unavailable"
            className={buttonClass("assist")}
          >
            <AssistIcon className="size-[1.125rem]" />
            {t.butlerPrepare}
          </button>
          <p id="today-butler-unavailable" className="text-dense text-text-muted">
            {aiCopy(locale).disabled}
          </p>
        </>
      )}
      <hr className="w-full border-divider" />
      <p className="text-dense font-semibold">{t.manualHeading}</p>
      <a href={inquiry} className={buttonClass("secondary")}>
        {t.manual}
      </a>
    </aside>
  );
}

/** Due or overdue: the recorded time stays exact and names its zone. */
function due(locale: string, date: Date | null, now: Date) {
  const t = todayCopy(locale);
  if (!date) return <When locale={locale} date={null} />;
  return place(date <= now ? t.overdueSince : t.dueAt, <When locale={locale} date={date} />);
}

/** Age for scanning ("12 min ago"); the exact instant stays in the time element. */
function Ago({ locale, date, now }: { locale: string; date: Date; now: Date }) {
  // A record written after the read began is "now", never "in 1 minute".
  const minutes = Math.min(0, Math.round((date.getTime() - now.getTime()) / 60000));
  const hours = Math.round(minutes / 60);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  return (
    <time dateTime={date.toISOString()}>
      {Math.abs(minutes) < 60
        ? format.format(minutes, "minute")
        : Math.abs(hours) < 48
          ? format.format(hours, "hour")
          : format.format(Math.round(hours / 24), "day")}
    </time>
  );
}

function ownerText(locale: string, name: string | null, needsCoverage: boolean) {
  if (!needsCoverage) return name ?? workCopy(locale).noOwner;
  const coverage = coverageCopy(locale);
  return name ? `${coverage.title} (${coverage.owner}: ${name})` : coverage.title;
}

/** The greeting follows the agency's clock, not the server's zone. */
function greeting(locale: string, now: Date) {
  const t = todayCopy(locale);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: agencyZone,
    }).format(now),
  );
  return hour >= 5 && hour < 12 ? t.morning : hour >= 12 && hour < 18 ? t.afternoon : t.evening;
}

/** Puts one node where the template's single {placeholder} is. */
function place(template: string, node: ReactNode) {
  const [before, after] = template.split(/\{\w+\}/);
  return (
    <>
      {before}
      {node}
      {after}
    </>
  );
}
