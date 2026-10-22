import type { CalendarAppointment, CalendarData } from "@/server/appointments/calendar";
import { buttonClass } from "@/ui/button-class";
import { controlClass, fieldClass, labelClass } from "@/ui/field-class";
import { Notice } from "@/ui/notice";
import { caseCopy } from "../cases/copy";
import { calendarCopy } from "./calendar-copy";
import {
  type CalendarQuery,
  calendarDay,
  calendarHref,
  calendarPeriod,
  calendarZones,
  shiftCalendarDay,
  validCalendarDay,
} from "./calendar-period";

const field = `${controlClass} min-w-0`;
const link =
  "inline-flex min-h-control items-center font-semibold text-link underline underline-offset-4";
const language = (locale: string) =>
  locale === "ru" ? "ru-RU" : locale === "en" ? "en-GB" : "bg-BG";
const dayText = (day: string, locale: string) =>
  new Intl.DateTimeFormat(language(locale), {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${day}T12:00:00Z`));

export function CalendarTime({ at, locale, zone }: { at: Date; locale: string; zone: string }) {
  return (
    <time dateTime={at.toISOString()} className="tabular-nums">
      {new Intl.DateTimeFormat(language(locale), {
        timeZone: zone,
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZoneName: "shortOffset",
      }).format(at)}
    </time>
  );
}
function TimeRange({
  start,
  end,
  locale,
  zone,
}: {
  start: Date;
  end: Date;
  locale: string;
  zone: string;
}) {
  return (
    <span>
      <CalendarTime at={start} locale={locale} zone={zone} />
      {" – "}
      <CalendarTime at={end} locale={locale} zone={zone} />
    </span>
  );
}

export function calendarAppointmentOnDay(row: CalendarAppointment, day: string, zone: string) {
  return calendarAppointmentPosition(row, day, zone) < Number.POSITIVE_INFINITY;
}
export function calendarAppointmentPosition(row: CalendarAppointment, day: string, zone: string) {
  const intervals = [
    { start: row.confirmedStartsAt, end: row.confirmedEndsAt },
    { start: row.proposedStartsAt, end: row.proposedEndsAt },
    ...row.resources,
  ];
  return Math.min(
    ...intervals.flatMap(({ start, end }) => {
      if (!start || !end) return [];
      const first = calendarDay(start, zone);
      if (first > day || calendarDay(new Date(end.getTime() - 1), zone) < day) return [];
      return [first < day ? Number.NEGATIVE_INFINITY : start.getTime()];
    }),
  );
}

function CalendarControls({
  locale,
  query,
  now,
}: {
  locale: string;
  query: CalendarQuery;
  now: Date;
}) {
  const c = calendarCopy(locale);
  const step = query.view === "day" ? 1 : 7;
  const reset = { page: 1, requestPage: 1 };
  return (
    <div className="space-y-5">
      <form
        action={`/${locale}/calendar`}
        method="get"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1.3fr_1.3fr_auto] lg:items-end"
      >
        <input type="hidden" name="view" value={query.view} />
        <div className={fieldClass}>
          <label className={labelClass} htmlFor="calendar-date">
            {c.date}
          </label>
          <input
            id="calendar-date"
            name="date"
            type="date"
            required
            min="2000-01-01"
            max="2099-12-31"
            defaultValue={query.date}
            className={field}
          />
        </div>
        <div className={fieldClass}>
          <label className={labelClass} htmlFor="calendar-zone">
            {c.zone}
          </label>
          <select id="calendar-zone" name="zone" defaultValue={query.zone} className={field}>
            {calendarZones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </div>
        <div className={fieldClass}>
          <label className={labelClass} htmlFor="calendar-scope">
            {c.scope}
          </label>
          <select id="calendar-scope" name="scope" defaultValue={query.scope} className={field}>
            <option value="team">{c.team}</option>
            <option value="mine">{c.mine}</option>
          </select>
        </div>
        <button type="submit" className={buttonClass("primary")}>
          {c.apply}
        </button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav aria-label={c.views} className="flex flex-wrap gap-2">
          {(["agenda", "day", "week"] as const).map((view) => (
            <a
              key={view}
              href={calendarHref(locale, query, { ...reset, view })}
              aria-current={view === query.view ? "page" : undefined}
              className={buttonClass(view === query.view ? "primary" : "secondary")}
            >
              {c[view]}
            </a>
          ))}
        </nav>
        <nav aria-label={c.navigation} className="flex flex-wrap gap-2">
          {validCalendarDay(shiftCalendarDay(query.date, -step)) ? (
            <a
              href={calendarHref(locale, query, {
                ...reset,
                date: shiftCalendarDay(query.date, -step),
              })}
              className={buttonClass("secondary")}
            >
              {c.previous}
            </a>
          ) : null}
          <a
            href={calendarHref(locale, query, { ...reset, date: calendarDay(now, query.zone) })}
            className={buttonClass("secondary")}
          >
            {c.today}
          </a>
          {validCalendarDay(shiftCalendarDay(query.date, step)) ? (
            <a
              href={calendarHref(locale, query, {
                ...reset,
                date: shiftCalendarDay(query.date, step),
              })}
              className={buttonClass("secondary")}
            >
              {c.next}
            </a>
          ) : null}
        </nav>
      </div>
      <p className="max-w-prose text-compact text-text-muted">{c.scopeNote}</p>
    </div>
  );
}

function CalendarItem({
  row,
  locale,
  query,
}: {
  row: CalendarAppointment;
  locale: string;
  query: CalendarQuery;
}) {
  const c = calendarCopy(locale);
  const states = caseCopy(locale);
  const historical = ["completed", "no_show", "cancelled", "declined"].includes(row.state);
  const access = {
    unknown: c.accessUnknown,
    requested: c.accessRequested,
    confirmed: c.accessConfirmed,
    unavailable: c.accessUnavailable,
  };
  const broker = row.resources.find((resource) => resource.kind === "broker");
  const minutes = (value: number) =>
    new Intl.NumberFormat(language(locale), { maximumFractionDigits: 1 }).format(
      Math.max(0, value / 60000),
    );
  const current = row.confirmedStartsAt && row.confirmedEndsAt;
  const proposal = row.proposedStartsAt && row.proposedEndsAt;
  return (
    <article
      aria-label={row.reference}
      className="min-w-0 space-y-4 border-b border-border py-5 first:pt-0 last:border-b-0 last:pb-0 [overflow-wrap:anywhere]"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h4 className="text-subheading font-semibold">
            <a className={link} href={`/${locale}/calendar/${row.id}`}>
              <bdi>{row.reference}</bdi>
            </a>
          </h4>
          <p className="font-semibold">{states[row.state]}</p>
        </div>
        <p className="text-caption text-text-muted">
          {c.version}: <bdi>{row.version}</bdi>
        </p>
      </header>
      {current ? (
        <div className="space-y-1">
          <p className="font-semibold">{historical ? c.previousTime : c.current}</p>
          <p>
            <TimeRange
              start={row.confirmedStartsAt as Date}
              end={row.confirmedEndsAt as Date}
              locale={locale}
              zone={query.zone}
            />
          </p>
          {row.timezone !== query.zone ? (
            <p className="text-compact text-text-muted">
              {c.locality}: {row.timezone}
              <br />
              <TimeRange
                start={row.confirmedStartsAt as Date}
                end={row.confirmedEndsAt as Date}
                locale={locale}
                zone={row.timezone}
              />
            </p>
          ) : null}
        </div>
      ) : null}
      {proposal ? (
        <div className="space-y-1">
          <p className="font-semibold">{current ? c.replacement : c.proposed}</p>
          <p>
            <TimeRange
              start={row.proposedStartsAt as Date}
              end={row.proposedEndsAt as Date}
              locale={locale}
              zone={query.zone}
            />
          </p>
          {row.timezone !== query.zone ? (
            <p className="text-compact text-text-muted">
              {c.locality}: {row.timezone}
              <br />
              <TimeRange
                start={row.proposedStartsAt as Date}
                end={row.proposedEndsAt as Date}
                locale={locale}
                zone={row.timezone}
              />
            </p>
          ) : null}
          <p className="max-w-prose text-compact text-text-muted">{c.proposalNote}</p>
        </div>
      ) : null}
      <dl className="grid gap-x-8 gap-y-3 text-compact sm:grid-cols-2">
        <div>
          <dt className="text-text-muted">{c.host}</dt>
          <dd>{row.hostName ?? c.noHost}</dd>
        </div>
        <div>
          <dt className="text-text-muted">{c.access}</dt>
          <dd>{access[row.propertyAccess]}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-text-muted">{c.external}</dt>
          <dd>
            {row.externalBusyCheckedAt ? (
              <CalendarTime at={row.externalBusyCheckedAt} locale={locale} zone={query.zone} />
            ) : (
              c.externalMissing
            )}
          </dd>
        </div>
      </dl>
      {row.resources.length ? (
        <div className="space-y-2 text-compact">
          <p className="font-semibold">{c.reserved}</p>
          <ul className="space-y-2">
            {row.resources.map((resource) => (
              <li key={resource.kind}>
                {resource.kind === "broker" ? c.broker : c.property}:{" "}
                <TimeRange
                  start={resource.start}
                  end={resource.end}
                  locale={locale}
                  zone={query.zone}
                />
              </li>
            ))}
          </ul>
          {broker && current ? (
            <p>
              {c.buffer}:{" "}
              {minutes((row.confirmedStartsAt as Date).getTime() - broker.start.getTime())} /{" "}
              {minutes(broker.end.getTime() - (row.confirmedEndsAt as Date).getTime())}
            </p>
          ) : null}
        </div>
      ) : null}
      {!historical &&
      current &&
      (!row.resources.some((resource) => resource.kind === "broker") ||
        !row.resources.some((resource) => resource.kind === "property_access")) ? (
        <Notice tone="warning">{c.incomplete}</Notice>
      ) : null}
      {row.conflicts.length ? (
        <Notice tone="warning">
          {c.overlap}:{" "}
          {row.conflicts.map((kind) => (kind === "broker" ? c.broker : c.property)).join(", ")}.
        </Notice>
      ) : null}
      <nav aria-label={`${c.open} ${row.reference}`} className="flex flex-wrap gap-x-5 gap-y-2">
        <a className={link} href={`/${locale}/calendar/${row.id}`}>
          {c.open}
        </a>
        {row.caseId ? (
          <a className={link} href={`/${locale}/cases/${row.caseId}`}>
            {c.deal}: <bdi>{row.caseReference}</bdi>
          </a>
        ) : null}
      </nav>
    </article>
  );
}

export function CalendarView({
  locale,
  query,
  data,
  adjusted = false,
  now = new Date(),
}: {
  locale: string;
  query: CalendarQuery;
  data: CalendarData | null;
  adjusted?: boolean;
  now?: Date;
}) {
  const c = calendarCopy(locale);
  const period = calendarPeriod(query);
  return (
    <div className="min-w-0 space-y-8 [overflow-wrap:anywhere]">
      <CalendarControls locale={locale} query={query} now={now} />
      {adjusted ? <Notice tone="warning">{c.adjusted}</Notice> : null}
      <section aria-labelledby="calendar-period-title" className="space-y-3">
        <h2 id="calendar-period-title" className="text-subheading font-semibold">
          {dayText(period.first, locale)}
          {period.first !== period.last ? ` – ${dayText(period.last, locale)}` : ""}
        </h2>
        <p>
          {c.zone}: <bdi>{query.zone}</bdi>
        </p>
        <p className="max-w-prose text-compact text-text-muted">{c.manualNote}</p>
        {data ? (
          <p className="text-compact text-text-muted">
            {c.snapshot}: <CalendarTime at={data.checkedAt} locale={locale} zone={query.zone} />.{" "}
            {c.snapshotNote}
          </p>
        ) : null}
        <a className={link} href={calendarHref(locale, query)}>
          {c.refresh}
        </a>
      </section>
      {!data ? (
        <Notice
          tone="error"
          title={c.failure}
          action={
            <a className={link} href={calendarHref(locale, query)}>
              {c.refresh}
            </a>
          }
        >
          {c.failureNote}
        </Notice>
      ) : (
        <>
          <section aria-label={c.itinerary} className="space-y-6">
            <h2 className="text-subheading font-semibold">{c.itinerary}</h2>
            <p className="max-w-prose text-compact text-text-muted">{c.mobileNote}</p>
            {query.view === "week" ? (
              <nav aria-label={c.weekOverview} className="hidden gap-2 lg:grid lg:grid-cols-7">
                {period.days.map((day) => (
                  <a
                    key={day}
                    className={`${buttonClass("secondary", "min-w-0 px-2 text-center")} [overflow-wrap:anywhere]`}
                    href={calendarHref(locale, query, { date: day, view: "day", page: 1 })}
                  >
                    {dayText(day, locale)}
                  </a>
                ))}
              </nav>
            ) : null}
            {!data.rows.length ? (
              <Notice tone="info" title={query.page > 1 ? c.emptyPage : c.empty}>
                {c.emptyNote}
              </Notice>
            ) : (
              period.days.map((day) => {
                const rows = data.rows
                  .filter((row) => calendarAppointmentOnDay(row, day, query.zone))
                  .sort((first, second) => {
                    const a = calendarAppointmentPosition(first, day, query.zone);
                    const b = calendarAppointmentPosition(second, day, query.zone);
                    return a === b ? first.id.localeCompare(second.id) : a < b ? -1 : 1;
                  });
                return (
                  <section
                    key={day}
                    aria-labelledby={`calendar-day-${day}`}
                    className="min-w-0 border-t border-border pt-5 lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-6"
                  >
                    <h3 id={`calendar-day-${day}`} className="mb-5 font-semibold lg:mb-0">
                      <time dateTime={day}>{dayText(day, locale)}</time>
                    </h3>
                    <div className="min-w-0">
                      {rows.length ? (
                        rows.map((row) => (
                          <CalendarItem key={row.id} row={row} locale={locale} query={query} />
                        ))
                      ) : (
                        <p className="text-compact text-text-muted">{c.emptyDay}</p>
                      )}
                    </div>
                  </section>
                );
              })
            )}
            {query.page > 1 || data.hasMore ? (
              <div className="space-y-3">
                <p className="text-compact text-text-muted">{c.bounded}</p>
                <nav aria-label={c.itinerary} className="flex flex-wrap gap-3">
                  {query.page > 1 ? (
                    <a
                      className={buttonClass("secondary")}
                      href={calendarHref(locale, query, { page: query.page - 1 })}
                    >
                      {c.back}
                    </a>
                  ) : null}
                  {data.hasMore ? (
                    <a
                      className={buttonClass("secondary")}
                      href={calendarHref(locale, query, { page: query.page + 1 })}
                    >
                      {c.more}
                    </a>
                  ) : null}
                </nav>
              </div>
            ) : null}
          </section>
          <section
            aria-labelledby="calendar-requests-title"
            className="space-y-4 border-t border-border pt-6"
          >
            <h2 id="calendar-requests-title" className="text-subheading font-semibold">
              {c.requests}
            </h2>
            <p className="max-w-prose text-compact text-text-muted">{c.requestsNote}</p>
            {data.requests.length ? (
              <ul className="divide-y divide-border">
                {data.requests.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <bdi>{row.reference}</bdi>
                      <p className="text-compact text-text-muted">
                        {c.host}: {row.hostName ?? c.noHost}
                      </p>
                    </div>
                    <a className={link} href={`/${locale}/calendar/${row.id}`}>
                      {c.open} <bdi>{row.reference}</bdi>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-compact text-text-muted">{c.noRequests}</p>
            )}
            <nav aria-label={c.requests} className="flex flex-wrap gap-3">
              {query.requestPage > 1 ? (
                <a
                  className={buttonClass("secondary")}
                  href={calendarHref(locale, query, { requestPage: query.requestPage - 1 })}
                >
                  {c.backRequests}
                </a>
              ) : null}
              {data.hasMoreRequests ? (
                <a
                  className={buttonClass("secondary")}
                  href={calendarHref(locale, query, { requestPage: query.requestPage + 1 })}
                >
                  {c.moreRequests}
                </a>
              ) : null}
            </nav>
          </section>
        </>
      )}
    </div>
  );
}
