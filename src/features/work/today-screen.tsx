// O01 Today (Figma 10:203 desktop, 40:157 laptop, 14:4343 mobile, states 605:37146): one
// prioritized worklist in contract order — unassigned requests, due commitments (my overdue
// tasks, overdue key returns, work offered to me), viewings, corrections and reviews, delivery
// exceptions — then my own work to continue: open inquiries, Cases and listing drafts. Each
// group carries the server's authorized total for its queue. A list that did not load says so
// and is never drawn as empty or as zero; lists that loaded empty are named on one line. A
// count links only to a page that lists exactly the same work: a queue page, or for
// translation reviews the O01 focus view that pages the same queue (today-focus.tsx).
// Elsewhere the rows link and the group says when the full list is not available here. Butler
// only opens the O32 draft review for one selected record; it never acts.
import "server-only";
import { unstable_rethrow } from "next/navigation";
import { type ComponentType, Fragment, type ReactNode } from "react";
import { z } from "zod";
import { getDb } from "@/db/client";
import { aiCopy } from "@/features/ai/copy";
import { caseCopy } from "@/features/cases/copy";
import { caseEmailCopy } from "@/features/cases/email-copy";
import { inventoryCopy } from "@/features/inventory/copy";
import { custodyCopy } from "@/features/key-custody/copy";
import { readAssistanceSource } from "@/server/ai/assistance";
import { assistanceAvailability } from "@/server/ai/config";
import type { Session } from "@/server/auth/sessions";
import { can } from "@/server/authz";
import type { Executor } from "@/server/db";
import { isAppError } from "@/server/errors";
import { readToday } from "@/server/work/queries";
import type { TodayQueue } from "@/server/work/today-queries";
import { buttonClass } from "@/ui/button-class";
import { cx } from "@/ui/cx";
import {
  AssistIcon,
  CalendarIcon,
  ChevronEndIcon,
  ClockIcon,
  DocumentIcon,
  ExternalIcon,
  FolderIcon,
  HomeIcon,
  InboxIcon,
  LanguageIcon,
  LockIcon,
  MessageIcon,
  SendIcon,
} from "@/ui/icons";
import { Notice } from "@/ui/notice";
import { workCopy } from "./copy";
import { coverageCopy } from "./coverage-copy";
import { taskHandoverCopy } from "./handover-copy";
import { todayCopy } from "./today-copy";
import { When } from "./when";

type Queues = Awaited<ReturnType<typeof readToday>>;
type Item<K extends keyof Queues> =
  NonNullable<Queues[K]> extends TodayQueue<infer Row> ? Row : never;
type InquiryItem = Item<"unassigned">;
type TaskItem = Item<"due">;
type KeyItem = Item<"keyReturns">;
type ViewingItem = Item<"viewings">;
type ListingReviewItem = Item<"listingReviews">;
type TranslationItem = Item<"translationReviews">;
type EmailItem = Item<"deliveryExceptions">;
type PublicationItem = Item<"publicationExceptions">;
type OperationItem = Item<"operatorDeliveryExceptions">;
type CaseItem = Item<"caseContinue">;
type DraftItem = Item<"draftContinue">;
type ButlerSource = { id: string; reference: string; enabled: boolean };
type Detail = [key: string, node: ReactNode];
/** One queue as Today draws it: its rows are already rendered, in the server's order. */
type Group = {
  id: string;
  title: string;
  queue: TodayQueue<unknown>;
  /** A page listing exactly the work this group counts; the heading opens it. Without one,
   * no route continues the list, so only the rows link. */
  href?: string;
  /** The O01 focus view that pages this same queue: the heading opens it, and so does the
   * line after the loaded rows, which Today keeps in place. */
  focus?: string;
  rows: ReactNode[];
  notice?: ReactNode;
  keyReturns?: boolean;
};
type Worklist = { attention: Group[]; continued: Group[] };

const agencyZone = "Europe/Sofia";
// Today starts the day: the oldest few of each queue stay in view together, so a long queue
// cannot push a later group's overdue work out of sight. The count covers the whole queue.
const rowsPerGroup = 5;
// The page guard ran just before: these mean access changed meanwhile, not that a queue failed.
export const accessErrors = ["unauthenticated", "forbidden", "not_found"];
const inlineLink = "font-semibold text-action underline underline-offset-4";
const listingSnapshot = z.object({
  listing: z.object({ reference: z.string() }).nullable().optional(),
});
/** The O01 focus view of the translation reviews: its first page, or the page after a cursor. */
export const translationReviewsHref = (locale: string, after?: string) =>
  `/${locale}/today?queue=translation-reviews${after === undefined ? "" : `&after=${encodeURIComponent(after)}`}`;

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
  const worklist = loaded ? worklistOf(locale, loaded.queues, now) : null;
  const empty =
    worklist !== null &&
    [...worklist.attention, ...worklist.continued].every(({ queue }) => quiet(queue));
  const shownName = name?.trim().replace(/\.$/, "");
  const tabs = [
    { href: `/${locale}/today`, label: t.forAction, current: true },
    { href: `/${locale}/tasks?view=mine`, label: t.myTasks, current: false },
    // Team scope only where the person may read the agency's Cases (Figma: O04).
    ...(loaded?.mayViewTeam ? [{ href: `/${locale}/cases`, label: t.team, current: false }] : []),
  ];
  return (
    <div className="mx-auto flex min-w-0 max-w-page flex-col gap-6 break-words p-gutter sm:gap-8 sm:p-gutter-wide">
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
        <p className="text-text-muted">
          {loaded && worklist ? headline(locale, loaded.queues, worklist, now) : t.leadFailed}
        </p>
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
      {!worklist ? (
        <div className="flex flex-col items-start gap-4" data-today-state="failed">
          <Notice tone="error" className="w-full">
            {t.failed}
          </Notice>
          <a href={`/${locale}/today`} className={buttonClass("primary")}>
            {t.reload}
          </a>
        </div>
      ) : empty ? (
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
            <Section
              id="attention"
              title={t.attention}
              intro={<p className="text-dense text-text-muted">{t.order}</p>}
              groups={worklist.attention}
              locale={locale}
            />
            <Section id="continue" title={t.continue} groups={worklist.continued} locale={locale} />
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
  // Butler is offered for the first inquiry of a list that loaded, only when its own source
  // check passes.
  const first = [queues.unassigned, queues.mine].find(
    (queue) => queue.status === "ready" && queue.rows.length,
  )?.rows[0]?.inquiry;
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

/** A queue the read model returned (null means the role does not have it) with its rows. */
function group<Row>(
  queue: TodayQueue<Row> | null,
  { row, ...spec }: Omit<Group, "queue" | "rows"> & { row: (item: Row) => ReactNode },
): Group[] {
  return queue ? [{ ...spec, queue, rows: queue.rows.map(row) }] : [];
}

/** Contract order (ux-spec O01): requests, due commitments, viewings, reviews, deliveries. */
function worklistOf(locale: string, queues: Queues, now: Date): Worklist {
  const t = todayCopy(locale);
  const work = workCopy(locale);
  const custody = custodyCopy(locale);
  // Only these headings link: each page lists exactly the work its count covers. The other
  // groups have no such page yet (Calendar, Cases and Inventory are broader or filtered
  // differently), so their counts stay plain and the rows open each record.
  return {
    attention: [
      ...group(queues.unassigned, {
        id: "unassigned",
        title: t.unassigned,
        href: `/${locale}/inquiries?view=unassigned`,
        notice: <Overload locale={locale} queue={queues.unassigned} now={now} />,
        row: (item) => <InquiryRow key={item.inquiry.id} locale={locale} item={item} now={now} />,
      }),
      ...group(queues.due, {
        id: "due",
        title: work.due,
        href: `/${locale}/tasks?view=overdue`,
        row: (item) => <TaskRow key={item.task.id} locale={locale} item={item} now={now} />,
      }),
      ...group(queues.keyReturns, {
        id: "keys",
        title: custody.returnReminders,
        href: `/${locale}/operations/keys?state=overdue`,
        notice: <p className="text-dense text-text-muted">{custody.reminderHint}</p>,
        keyReturns: true,
        row: (item) => <KeyRow key={item.id} locale={locale} item={item} />,
      }),
      ...group(queues.handovers, {
        id: "handovers",
        title: taskHandoverCopy(locale).inbox,
        href: `/${locale}/tasks?view=handovers`,
        row: (item) => (
          <TaskRow key={item.task.id} locale={locale} item={item} now={now} handover />
        ),
      }),
      ...group(queues.viewings, {
        id: "viewings",
        title: t.groups.viewings,
        row: (item) => <ViewingRow key={item.id} locale={locale} item={item} />,
      }),
      ...group(queues.listingReviews, {
        id: "listing-reviews",
        title: t.groups.listingReviews,
        row: (item) => <ListingReviewRow key={item.id} locale={locale} item={item} now={now} />,
      }),
      // Rows open the translation workbench the grant allows. No Inventory link: a reviewer
      // scoped to one language cannot open the Inventory, and it lists other work as well. The
      // focus view pages the same authorized queue, so the count and the rest open there.
      ...group(queues.translationReviews, {
        id: "translation-reviews",
        title: t.groups.translationReviews,
        focus: translationReviewsHref(locale),
        row: (item) => <TranslationRow key={item.id} locale={locale} item={item} now={now} />,
      }),
      ...group(queues.deliveryExceptions, {
        id: "email-deliveries",
        title: t.groups.deliveryExceptions,
        row: (item) => <EmailRow key={item.id} locale={locale} item={item} now={now} />,
      }),
      ...group(queues.publicationExceptions, {
        id: "publication-deliveries",
        title: t.groups.publicationExceptions,
        row: (item) => <PublicationRow key={item.id} locale={locale} item={item} now={now} />,
      }),
      // O27 pages the same failed and unknown-outcome actions, oldest first, for report readers.
      ...group(queues.operatorDeliveryExceptions, {
        id: "delivery-operations",
        title: t.groups.operatorDeliveryExceptions,
        href: `/${locale}/operations/jobs?view=exceptions#external-action-exceptions`,
        row: (item) => <OperationRow key={item.id} locale={locale} item={item} now={now} />,
      }),
    ],
    continued: [
      // The server puts follow-ups that are due first, so the rows in view never hide one.
      ...group(queues.mine, {
        id: "mine",
        title: work.mineInquiries,
        href: `/${locale}/inquiries?view=mine`,
        row: (item) => (
          <InquiryRow key={item.inquiry.id} locale={locale} item={item} now={now} mine />
        ),
      }),
      ...group(queues.caseContinue, {
        id: "case-continue",
        title: caseCopy(locale).overview,
        row: (item) => <CaseRow key={item.id} locale={locale} item={item} now={now} />,
      }),
      ...group(queues.draftContinue, {
        id: "draft-continue",
        title: t.groups.draftContinue,
        row: (item) => <DraftRow key={item.id} locale={locale} item={item} now={now} />,
      }),
    ],
  };
}

/**
 * The next-step line from every list Today read: work for my attention, plus what is already
 * overdue in my own work. A list that did not load keeps the line from reading as a clear day.
 */
function headline(locale: string, queues: Queues, { attention, continued }: Worklist, now: Date) {
  const t = todayCopy(locale);
  const count = (n: number, more: boolean) =>
    `${new Intl.NumberFormat(locale).format(n)}${more ? "+" : ""}`;
  let waiting = 0;
  let waitingMore = false;
  for (const { queue } of attention) {
    if (queue.status !== "ready") continue;
    waiting += queue.total ?? queue.rows.length;
    waitingMore ||= queue.total === null && queue.hasMore;
  }
  const own = [
    overdueIn(queues.mine, (item) => item.inquiry.followUpAt, now),
    overdueIn(queues.caseContinue, (item) => item.dueAt, now),
  ];
  const overdue = own.reduce((sum, { n }) => sum + n, 0);
  const overdueMore = own.some(({ more }) => more);
  const all = count(waiting + overdue, waitingMore || overdueMore);
  if ([...attention, ...continued].some(({ queue }) => queue.status === "unavailable"))
    return waiting + overdue ? t.leadPartialWaiting.replace("{n}", all) : t.leadPartial;
  if (waiting) return t.leadWaiting.replace("{n}", all);
  if (overdue) return t.leadOverdue.replace("{n}", count(overdue, overdueMore));
  return continued.some(({ queue }) => !quiet(queue)) ? t.leadNothing : t.leadEmpty;
}

/** Loaded and holding nothing: the server's authorized total decides, not the loaded rows. */
function quiet(queue: TodayQueue<unknown>) {
  return queue.status === "ready" && !queue.hasMore && (queue.total ?? queue.rows.length) === 0;
}

/** Overdue rows of one's own queue; they come first, so a full page of them may continue. */
function overdueIn<Row>(queue: TodayQueue<Row>, at: (row: Row) => Date | null, now: Date) {
  if (queue.status !== "ready") return { n: 0, more: false };
  const n = queue.rows.filter((row) => {
    const date = at(row);
    return date !== null && date <= now;
  }).length;
  return { n, more: n > 0 && n === queue.rows.length && queue.hasMore };
}

function Section({
  id,
  title,
  intro,
  groups,
  locale,
}: {
  id: string;
  title: string;
  intro?: ReactNode;
  groups: Group[];
  locale: string;
}) {
  const t = todayCopy(locale);
  const idle = groups.filter(({ queue }) => quiet(queue));
  return (
    <section aria-labelledby={`today-${id}`} className="flex flex-col gap-4">
      <h2 id={`today-${id}`} className="text-subheading font-semibold">
        {title}
      </h2>
      {intro}
      {groups
        .filter((entry) => !idle.includes(entry))
        .map((entry) => (
          <QueueGroup key={entry.id} locale={locale} group={entry} />
        ))}
      {idle.length ? (
        <p className="text-dense text-text-muted" data-today-quiet={id}>
          {t.nothingIn}{" "}
          {idle.map((entry, index) => (
            <Fragment key={entry.id}>
              {index ? " · " : null}
              {entry.title}
            </Fragment>
          ))}
        </p>
      ) : null}
    </section>
  );
}

/** One queue: a heading with its count (or "not loaded"), then its oldest rows. */
function QueueGroup({ locale, group }: { locale: string; group: Group }) {
  const t = todayCopy(locale);
  const { id, title, queue, href, focus, rows, notice, keyReturns } = group;
  const opens = href ?? focus;
  const number = new Intl.NumberFormat(locale);
  const failed = queue.status === "unavailable";
  const known = queue.total ?? queue.rows.length;
  const count = `${number.format(known)}${queue.total === null && queue.hasMore ? "+" : ""}`;
  const label = (
    <>
      <span className="min-w-0 flex-1">{title}</span>
      {failed ? (
        <span className="rounded-full bg-error-soft px-2 text-caption font-semibold text-error">
          {t.notLoaded}
        </span>
      ) : (
        <span className="min-w-6 rounded-full bg-subtle px-2 text-center text-caption font-semibold tabular-nums text-text-muted">
          <span className="sr-only">{t.inQueue} </span>
          {count}
        </span>
      )}
    </>
  );
  return (
    <div
      className="flex flex-col gap-4"
      data-today-group={id}
      data-today-status={queue.status}
      data-key-return-reminders={keyReturns ? "" : undefined}
    >
      <h3 className="text-dense font-semibold">
        {opens ? (
          <a
            href={opens}
            className="flex min-h-control items-center gap-3 text-text no-underline hover:text-action"
          >
            {label}
            <ChevronEndIcon directional className="size-5 text-text-muted" />
          </a>
        ) : (
          <span className="flex min-h-control items-center gap-3">{label}</span>
        )}
      </h3>
      {failed ? (
        <Notice
          tone="error"
          action={
            <a href={`/${locale}/today`} className={inlineLink}>
              {t.reload}
            </a>
          }
        >
          {t.queueFailed}
        </Notice>
      ) : (
        <>
          {notice}
          <ul aria-label={title} className="flex flex-col gap-4">
            {rows.slice(0, rowsPerGroup)}
          </ul>
          {href ? (
            queue.hasMore || rows.length > rowsPerGroup ? (
              <a href={href} className={cx(inlineLink, "w-fit text-dense")}>
                {t.more}
              </a>
            ) : null
          ) : (
            <>
              {/* No queue page reproduces this list: the rest of what was read opens in place. */}
              {rows.length > rowsPerGroup ? (
                <details>
                  <summary className={cx(inlineLink, "w-fit cursor-pointer text-dense")}>
                    {t.showMore.replace("{n}", number.format(rows.length - rowsPerGroup))}
                  </summary>
                  <ul className="mt-4 flex flex-col gap-4">{rows.slice(rowsPerGroup)}</ul>
                </details>
              ) : null}
              {/* Beyond the loaded page only a focus view continues this list; without one, say
                  so and promise nothing. */}
              {queue.hasMore ? (
                <p className="text-dense text-text-muted">
                  {focus ? (
                    <>
                      {t.firstShown
                        .replace("{n}", number.format(rows.length))
                        .replace("{total}", count)}{" "}
                      <a href={focus} className={inlineLink}>
                        {t.fullList}
                      </a>
                    </>
                  ) : (
                    t.firstLoaded
                      .replace("{n}", number.format(rows.length))
                      .replace("{total}", count)
                  )}
                </p>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}

/** More unassigned requests than Today lists: their age and the escalation route. */
function Overload({
  locale,
  queue,
  now,
}: {
  locale: string;
  queue: Queues["unassigned"];
  now: Date;
}) {
  const t = todayCopy(locale);
  const oldest = queue.rows[0]?.inquiry.createdAt;
  if (queue.status !== "ready" || !queue.hasMore || !oldest) return null;
  return (
    <Notice
      tone="warning"
      title={t.overload.replace(
        "{n}",
        new Intl.NumberFormat(locale).format(queue.total ?? queue.rows.length),
      )}
      action={
        <a href={`/${locale}/coverage`} className={inlineLink}>
          {coverageCopy(locale).title}
        </a>
      }
    >
      {place(t.overloadBody, <Ago locale={locale} date={oldest} now={now} />)}
    </Notice>
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

const owner = (locale: string, name: string | null, needsCoverage: boolean): Detail => [
  "owner",
  todayCopy(locale).owner.replace("{name}", () => ownerText(locale, name, needsCoverage)),
];
const next = (locale: string, action: string): Detail => [
  "next",
  todayCopy(locale).next.replace("{action}", () => action),
];
const listingPath = (locale: string, reference: string) =>
  `/${locale}/inventory/${encodeURIComponent(reference)}`;

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
        owner(locale, ownerName, needsCoverage),
        ...(["received", "assigned"].includes(inquiry.state)
          ? []
          : [["state", work.states[inquiry.state]] satisfies Detail]),
        [
          "time",
          followUp
            ? due(locale, followUp, now)
            : place(t.received, <Ago locale={locale} date={inquiry.createdAt} now={now} />),
        ],
        next(locale, action),
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
        owner(locale, ownerName, needsCoverage),
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
        next(
          locale,
          handover
            ? t.actions.handover
            : task.state === "waiting"
              ? t.actions.dependency
              : t.actions.outcome,
        ),
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
        next(locale, t.actions.keyReturn),
      ]}
    />
  );
}

function ViewingRow({ locale, item }: { locale: string; item: ViewingItem }) {
  const t = todayCopy(locale);
  // Hosting offered to me comes before the arrangement's own next step.
  const reason = item.awaitingAcceptance ? "offered" : item.reason;
  const action = {
    arrange_viewing: t.actions.proposeTime,
    review_slot: t.actions.confirmTime,
    upcoming_viewing: t.actions.arrangements,
    record_outcome: t.actions.outcome,
    offered: t.actions.handover,
  }[reason];
  return (
    <Row
      href={`/${locale}/calendar/${item.id}`}
      Icon={CalendarIcon}
      data={{ "data-appointment-id": item.id }}
      title={
        <>
          {t.viewing[reason]} · <bdi>{item.reference}</bdi>
        </>
      }
      details={[
        [
          "owner",
          t.host.replace("{name}", () => ownerText(locale, item.ownerName, item.needsCoverage)),
        ],
        [
          "time",
          item.startsAt ? (
            <When key="time" locale={locale} date={item.startsAt} zone={item.timezone} />
          ) : (
            t.noTime
          ),
        ],
        ["case", place(t.caseRef, <bdi>{item.caseReference}</bdi>)],
        next(locale, action),
      ]}
    />
  );
}

function ListingReviewRow({
  locale,
  item,
  now,
}: {
  locale: string;
  item: ListingReviewItem;
  now: Date;
}) {
  const t = todayCopy(locale);
  // The same precedence as the O10 row action; a passed review date is an availability check.
  const kind =
    item.editorialState === "changes_requested"
      ? "changes"
      : item.editorialState === "in_review"
        ? "review"
        : item.editorialState === "needs_facts"
          ? "facts"
          : "availability";
  const path = listingPath(locale, item.reference);
  return (
    <Row
      href={
        kind === "review" ? `${path}?tab=review` : kind === "facts" ? `${path}?tab=facts` : path
      }
      Icon={HomeIcon}
      data={{ "data-listing-review": item.id }}
      title={
        <>
          {inventoryCopy(locale).o10.actions[kind]} · <bdi>{item.reference}</bdi>
        </>
      }
      details={[
        owner(locale, item.ownerName, item.needsCoverage),
        ...(item.dueAt ? [["time", due(locale, item.dueAt, now)] satisfies Detail] : []),
        next(locale, t.actions[kind]),
      ]}
    />
  );
}

/** One translation review, as Today and its focus view list it. */
export function TranslationRow({
  locale,
  item,
  now,
}: {
  locale: string;
  item: TranslationItem;
  now: Date;
}) {
  const t = todayCopy(locale);
  return (
    <Row
      href={`${listingPath(locale, item.reference)}/translations/${item.locale}`}
      Icon={LanguageIcon}
      data={{ "data-translation-review": item.id }}
      title={
        <>
          {inventoryCopy(locale).o10.actions.translation_review.replace(
            "{locale}",
            item.locale.toUpperCase(),
          )}{" "}
          · <bdi>{item.reference}</bdi>
        </>
      }
      details={[
        owner(locale, item.ownerName, item.needsCoverage),
        ["time", place(t.requested, <Ago locale={locale} date={item.requestedAt} now={now} />)],
        next(locale, t.actions.translation),
      ]}
    />
  );
}

function EmailRow({ locale, item, now }: { locale: string; item: EmailItem; now: Date }) {
  const t = todayCopy(locale);
  const email = caseEmailCopy(locale);
  const unknown = item.state === "outcome_unknown";
  return (
    <Row
      href={`/${locale}/cases/${item.caseId}/email`}
      Icon={MessageIcon}
      data={{ "data-email-delivery": item.id }}
      title={
        <>
          {unknown
            ? email.outcome_unknown
            : item.state === "bounced"
              ? email.bounced
              : email.failed}{" "}
          · <bdi>{item.reference}</bdi>
        </>
      }
      details={[
        owner(locale, item.ownerName, item.needsCoverage),
        ["time", place(t.recorded, <Ago locale={locale} date={item.recordedAt} now={now} />)],
        next(locale, unknown ? t.actions.reconcile : t.actions.delivery),
      ]}
    />
  );
}

function PublicationRow({
  locale,
  item,
  now,
}: {
  locale: string;
  item: PublicationItem;
  now: Date;
}) {
  const t = todayCopy(locale);
  const unknown = item.state === "outcome_unknown";
  return (
    <Row
      href={`${listingPath(locale, item.reference)}?tab=review`}
      Icon={SendIcon}
      data={{ "data-publication-delivery": item.id }}
      title={
        <>
          {t.deliveryKind[item.kind]} · <bdi>{item.reference}</bdi>
        </>
      }
      details={[
        owner(locale, item.ownerName, item.needsCoverage),
        ["state", unknown ? t.outcome.outcome_unknown : t.outcome.failed],
        ["destination", `${t.destination[item.destination]} · ${item.locale.toUpperCase()}`],
        ...(item.generation < item.currentGeneration
          ? [["earlier", t.earlierVersion] satisfies Detail]
          : []),
        ["time", place(t.recorded, <Ago locale={locale} date={item.recordedAt} now={now} />)],
        next(locale, unknown ? t.actions.reconcile : t.actions.delivery),
      ]}
    />
  );
}

function OperationRow({ locale, item, now }: { locale: string; item: OperationItem; now: Date }) {
  const t = todayCopy(locale);
  return (
    <Row
      // O27 opens this one exception while it is still failed or unknown, for report readers.
      href={`/${locale}/operations/jobs?action=${encodeURIComponent(item.id)}#external-action-${item.id}`}
      Icon={SendIcon}
      data={{ "data-delivery-operation": item.id }}
      title={t.operation[item.kind]}
      details={[
        ["state", item.state === "outcome_unknown" ? t.outcome.outcome_unknown : t.outcome.failed],
        [
          "attempts",
          t.attempts.replace("{n}", new Intl.NumberFormat(locale).format(item.attempts)),
        ],
        [
          "time",
          item.lastAttemptAt
            ? place(t.lastAttempt, <Ago locale={locale} date={item.lastAttemptAt} now={now} />)
            : t.noAttempt,
        ],
        next(locale, t.actions.operations),
      ]}
    />
  );
}

function CaseRow({ locale, item, now }: { locale: string; item: CaseItem; now: Date }) {
  const t = todayCopy(locale);
  const paused = item.disposition === "paused";
  return (
    <Row
      href={`/${locale}/cases/${item.id}`}
      Icon={FolderIcon}
      data={{ "data-case-id": item.id }}
      title={<bdi>{item.title || item.reference}</bdi>}
      details={[
        ["reference", <bdi key="reference">{item.reference}</bdi>],
        owner(locale, item.ownerName, item.needsCoverage),
        ...(paused ? [["state", t.paused] satisfies Detail] : []),
        ...(item.dueAt ? [["time", due(locale, item.dueAt, now)] satisfies Detail] : []),
        ...(item.waitingOn
          ? [
              [
                "waiting",
                t.waitingOn.replace("{what}", () => item.waitingOn ?? ""),
              ] satisfies Detail,
            ]
          : []),
        // The recorded next action (or the shared summary without internal access) is the step.
        next(locale, item.nextAction ?? (paused ? t.actions.resume : t.actions.openCase)),
      ]}
    />
  );
}

/**
 * A draft I am still writing. Requested changes and missing facts are review work, listed and
 * counted once under corrections and reviews; the same listing appears here as well only for
 * its own, differently named task.
 */
function DraftRow({ locale, item, now }: { locale: string; item: DraftItem; now: Date }) {
  const t = todayCopy(locale);
  return (
    <Row
      href={listingPath(locale, item.reference)}
      Icon={HomeIcon}
      data={{ "data-listing-draft": item.id }}
      title={
        <>
          {t.draft} · <bdi>{item.reference}</bdi>
        </>
      }
      details={[
        owner(locale, item.ownerName, item.needsCoverage),
        ["time", place(t.saved, <Ago locale={locale} date={item.updatedAt} now={now} />)],
        next(locale, t.actions.editing),
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
      {/* Figma draws a free composer here; O32/F29 keep assistance inside one record's review. */}
      <p className="text-dense text-text-muted" data-today-butler-boundary>
        {t.butlerBoundary}
      </p>
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
