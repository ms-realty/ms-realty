// O08 / L12 / F22: native navigation with a complete, resource-aware itinerary.
import type { CalendarAppointment, CalendarData } from "@/server/appointments/calendar";
import { buttonClass } from "@/ui/button-class";
import { cx } from "@/ui/cx";
import {
  CalendarIcon,
  ChevronDownIcon,
  ChevronEndIcon,
  ChevronStartIcon,
  ClockIcon,
  InfoIcon,
  UserIcon,
} from "@/ui/icons";
import { Notice } from "@/ui/notice";
import { caseCopy } from "../cases/copy";
import s from "./calendar.module.css";
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

const language = (locale: string) =>
  locale === "ru" ? "ru-RU" : locale === "en" ? "en-GB" : "bg-BG";
const civilDate = (day: string) => new Date(`${day}T12:00:00Z`);
const dayText = (day: string, locale: string) =>
  new Intl.DateTimeFormat(language(locale), {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(civilDate(day));
const shortDay = (day: string, locale: string, weekday = false) =>
  new Intl.DateTimeFormat(language(locale), {
    timeZone: "UTC",
    ...(weekday
      ? { weekday: "short" as const }
      : { day: "numeric" as const, month: "short" as const }),
  }).format(civilDate(day));
const clockText = (at: Date, locale: string, zone: string) =>
  new Intl.DateTimeFormat(language(locale), {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);

export function CalendarTime({
  at,
  locale,
  zone,
  withDate = true,
}: {
  at: Date;
  locale: string;
  zone: string;
  withDate?: boolean;
}) {
  return (
    <time dateTime={at.toISOString()} className="tabular-nums">
      {new Intl.DateTimeFormat(language(locale), {
        timeZone: zone,
        ...(withDate
          ? { year: "numeric" as const, month: "short" as const, day: "numeric" as const }
          : {}),
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
      <CalendarTime
        at={end}
        locale={locale}
        zone={zone}
        withDate={calendarDay(start, zone) !== calendarDay(end, zone)}
      />
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
  const period = calendarPeriod(query);
  const step = query.view === "day" ? 1 : 7;
  const reset = { page: 1, requestPage: 1 };
  const periodText = new Intl.DateTimeFormat(language(locale), {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).formatRange(civilDate(period.first), civilDate(period.last));
  return (
    <div className={s.controls}>
      <div className={s.toolbar}>
        <div className={s.periodGroup}>
          <h2
            id="calendar-period-title"
            className={s.periodTitle}
            aria-label={`${dayText(period.first, locale)}${period.first !== period.last ? ` – ${dayText(period.last, locale)}` : ""}`}
          >
            {periodText}
          </h2>
          <nav aria-label={c.navigation} className={s.periodNavigation}>
            {validCalendarDay(shiftCalendarDay(query.date, -step)) ? (
              <a
                aria-label={c.previous}
                title={c.previous}
                href={calendarHref(locale, query, {
                  ...reset,
                  date: shiftCalendarDay(query.date, -step),
                })}
                className={s.iconButton}
              >
                <ChevronStartIcon directional />
              </a>
            ) : null}
            <a
              href={calendarHref(locale, query, { ...reset, date: calendarDay(now, query.zone) })}
              className={s.todayButton}
            >
              {c.today}
            </a>
            {validCalendarDay(shiftCalendarDay(query.date, step)) ? (
              <a
                aria-label={c.next}
                title={c.next}
                href={calendarHref(locale, query, {
                  ...reset,
                  date: shiftCalendarDay(query.date, step),
                })}
                className={s.iconButton}
              >
                <ChevronEndIcon directional />
              </a>
            ) : null}
          </nav>
        </div>
        <nav aria-label={c.views} className={s.views}>
          {(["agenda", "day", "week"] as const).map((view) => (
            <a
              key={view}
              href={calendarHref(locale, query, { ...reset, view })}
              aria-current={view === query.view ? "page" : undefined}
            >
              {c[view]}
            </a>
          ))}
        </nav>
      </div>
      <form action={`/${locale}/calendar`} method="get" className={s.filters}>
        <input type="hidden" name="view" value={query.view} />
        <div className={s.field}>
          <label htmlFor="calendar-date">{c.date}</label>
          <input
            id="calendar-date"
            name="date"
            type="date"
            required
            min="2000-01-01"
            max="2099-12-31"
            defaultValue={query.date}
          />
        </div>
        <div className={s.field}>
          <label htmlFor="calendar-zone">{c.zone}</label>
          <select id="calendar-zone" name="zone" defaultValue={query.zone}>
            {calendarZones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </div>
        <div className={s.field}>
          <label htmlFor="calendar-scope">{c.scope}</label>
          <select id="calendar-scope" name="scope" defaultValue={query.scope}>
            <option value="team">{c.team}</option>
            <option value="mine">{c.mine}</option>
          </select>
        </div>
        <button type="submit" className={buttonClass("primary", s.applyButton)}>
          {c.apply}
        </button>
      </form>
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
  const arrangement = (start: Date, end: Date, label: string, proposed = false) => (
    <div className={cx(s.timeBlock, proposed ? s.proposedTime : s.confirmedTime)}>
      <p className={s.timeLabel}>{label}</p>
      <p className={s.arrangement}>
        <TimeRange start={start} end={end} locale={locale} zone={query.zone} />
      </p>
      {row.timezone !== query.zone ? (
        <p className={s.localTime}>
          {c.locality}: <bdi>{row.timezone}</bdi>
          <br />
          <TimeRange start={start} end={end} locale={locale} zone={row.timezone} />
        </p>
      ) : null}
    </div>
  );
  return (
    <article aria-label={row.reference} className={s.appointment} data-state={row.state}>
      <header className={s.appointmentHeader}>
        <div className={s.identity}>
          <h4>
            <a className={s.reference} href={`/${locale}/calendar/${row.id}`}>
              <bdi>{row.reference}</bdi>
            </a>
          </h4>
          <p className={s.state} data-state={row.state}>
            {states[row.state]}
          </p>
        </div>
        <p className={s.version}>
          {c.version}: <bdi>{row.version}</bdi>
        </p>
      </header>
      <div className={s.arrangements}>
        {current
          ? arrangement(
              row.confirmedStartsAt as Date,
              row.confirmedEndsAt as Date,
              historical ? c.previousTime : c.current,
            )
          : null}
        {proposal
          ? arrangement(
              row.proposedStartsAt as Date,
              row.proposedEndsAt as Date,
              current ? c.replacement : c.proposed,
              true,
            )
          : null}
      </div>
      {proposal ? <p className={s.proposalNote}>{c.proposalNote}</p> : null}
      <dl className={s.facts}>
        <div>
          <dt>
            <UserIcon />
            {c.host}
          </dt>
          <dd>{row.hostName ?? c.noHost}</dd>
        </div>
        <div>
          <dt>{c.access}</dt>
          <dd>{access[row.propertyAccess]}</dd>
        </div>
        <div className={s.externalCheck}>
          <dt>{c.external}</dt>
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
        <div className={s.resources}>
          <p className={s.resourceTitle}>
            <ClockIcon />
            {c.reserved}
          </p>
          <ul>
            {row.resources.map((resource) => (
              <li key={resource.kind}>
                <span>{resource.kind === "broker" ? c.broker : c.property}</span>
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
            <p className={s.buffer}>
              {c.buffer}:{" "}
              <strong>
                {minutes((row.confirmedStartsAt as Date).getTime() - broker.start.getTime())} /{" "}
                {minutes(broker.end.getTime() - (row.confirmedEndsAt as Date).getTime())}
              </strong>
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
      <nav aria-label={`${c.open} ${row.reference}`} className={s.itemActions}>
        <a className={s.openLink} href={`/${locale}/calendar/${row.id}`}>
          {c.open}
          <ChevronEndIcon directional />
        </a>
        {row.caseId ? (
          <a className={s.textLink} href={`/${locale}/cases/${row.caseId}`}>
            {c.deal}: <bdi>{row.caseReference}</bdi>
          </a>
        ) : null}
      </nav>
    </article>
  );
}

function rowsOnDay(data: CalendarData, day: string, zone: string) {
  return data.rows
    .filter((row) => calendarAppointmentOnDay(row, day, zone))
    .sort((first, second) => {
      const a = calendarAppointmentPosition(first, day, zone);
      const b = calendarAppointmentPosition(second, day, zone);
      return a === b ? first.id.localeCompare(second.id) : a < b ? -1 : 1;
    });
}

/** A scannable week projection supplements, never replaces, the full resource itinerary. */
function WeekOverview({
  locale,
  query,
  data,
  now,
}: {
  locale: string;
  query: CalendarQuery;
  data: CalendarData;
  now: Date;
}) {
  const c = calendarCopy(locale);
  const states = caseCopy(locale);
  const today = calendarDay(now, query.zone);
  return (
    <section aria-label={c.weekOverview} className={s.weekBoard}>
      {calendarPeriod(query).days.map((day) => (
        <div key={day} className={s.weekColumn} data-today={day === today || undefined}>
          <a
            className={s.weekDayLink}
            aria-label={dayText(day, locale)}
            href={calendarHref(locale, query, { date: day, view: "day", page: 1 })}
          >
            <span>{shortDay(day, locale, true)}</span>
            <strong>{Number(day.slice(-2))}</strong>
          </a>
          <div className={s.weekEvents}>
            {rowsOnDay(data, day, query.zone).length ? (
              rowsOnDay(data, day, query.zone).map((row) => {
                const previews = [
                  { start: row.confirmedStartsAt, end: row.confirmedEndsAt, proposed: false },
                  { start: row.proposedStartsAt, end: row.proposedEndsAt, proposed: true },
                ].filter(
                  (interval) =>
                    interval.start &&
                    interval.end &&
                    calendarDay(interval.start, query.zone) <= day &&
                    calendarDay(new Date(interval.end.getTime() - 1), query.zone) >= day,
                );
                return (
                  <a
                    key={row.id}
                    className={s.weekEvent}
                    data-proposed={
                      (previews.length && previews.every((interval) => interval.proposed)) ||
                      undefined
                    }
                    href={`/${locale}/calendar/${row.id}`}
                  >
                    <bdi>{row.reference}</bdi>
                    <span className={s.weekState}>{states[row.state]}</span>
                    {previews.length ? (
                      previews.map((interval) => (
                        <span
                          key={interval.proposed ? "proposed" : "confirmed"}
                          className={s.weekTime}
                        >
                          <strong>
                            {clockText(interval.start as Date, locale, query.zone)}–
                            {clockText(interval.end as Date, locale, query.zone)}
                          </strong>
                          <span>{interval.proposed ? c.proposed : c.current}</span>
                        </span>
                      ))
                    ) : (
                      <span>{c.reserved}</span>
                    )}
                  </a>
                );
              })
            ) : (
              <span className={s.weekEmpty}>{c.emptyDayShort}</span>
            )}
          </div>
        </div>
      ))}
    </section>
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
    <div className={s.calendar}>
      <CalendarControls locale={locale} query={query} now={now} />
      {adjusted ? <Notice tone="warning">{c.adjusted}</Notice> : null}
      <div className={s.calendarStatus}>
        <div className={s.statusText}>
          <span>
            <ClockIcon />
            {c.manualShort}
          </span>
          {data ? (
            <span>
              {c.snapshot}: <CalendarTime at={data.checkedAt} locale={locale} zone={query.zone} />
            </span>
          ) : null}
        </div>
        <a className={s.textLink} href={calendarHref(locale, query)}>
          {c.refresh}
        </a>
      </div>
      <details className={s.calendarDetails}>
        <summary>
          <InfoIcon />
          <span>{c.details}</span>
          <ChevronDownIcon />
        </summary>
        <div>
          <p>{c.scopeNote}</p>
          <p>{c.manualNote}</p>
          <p>{c.snapshotNote}</p>
          <p>{c.mobileNote}</p>
        </div>
      </details>
      {!data ? (
        <Notice
          tone="error"
          title={c.failure}
          action={
            <a className={s.textLink} href={calendarHref(locale, query)}>
              {c.refresh}
            </a>
          }
        >
          {c.failureNote}
        </Notice>
      ) : (
        <>
          <section aria-label={c.itinerary} className={s.itinerary} data-view={query.view}>
            {query.view === "week" ? (
              <WeekOverview locale={locale} query={query} data={data} now={now} />
            ) : null}
            <div className={s.sectionHeader}>
              <h2>{c.itinerary}</h2>
              <p>{c.internalNote}</p>
            </div>
            {!data.rows.length ? (
              <div className={s.emptyState}>
                <span className={s.emptyIcon}>
                  <CalendarIcon />
                </span>
                <h3>{query.page > 1 ? c.emptyPage : c.empty}</h3>
                <p>{c.emptyNote}</p>
                <a
                  className={s.textLink}
                  href={calendarHref(locale, query, {
                    ...{ page: 1, requestPage: 1 },
                    date: calendarDay(now, query.zone),
                  })}
                >
                  {c.today}
                  <ChevronEndIcon directional />
                </a>
              </div>
            ) : (
              <div className={s.agendaDays}>
                {period.days.map((day) => {
                  const rows = rowsOnDay(data, day, query.zone);
                  return (
                    <section
                      key={day}
                      aria-labelledby={`calendar-day-${day}`}
                      className={s.agendaDay}
                      data-empty={!rows.length || undefined}
                    >
                      <h3 id={`calendar-day-${day}`} className={s.dayHeading}>
                        <time dateTime={day}>
                          <span className={s.dayNumber}>{Number(day.slice(-2))}</span>
                          <span className={s.dayName}>
                            {shortDay(day, locale, true)}
                            <span>
                              {new Intl.DateTimeFormat(language(locale), {
                                timeZone: "UTC",
                                month: "short",
                                year: "numeric",
                              }).format(civilDate(day))}
                            </span>
                          </span>
                        </time>
                      </h3>
                      <div className={s.dayAppointments}>
                        {rows.length ? (
                          rows.map((row) => (
                            <CalendarItem key={row.id} row={row} locale={locale} query={query} />
                          ))
                        ) : (
                          <p className={s.emptyDay}>{c.emptyDay}</p>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
            {query.page > 1 || data.hasMore ? (
              <div className={s.pagination}>
                <p>{c.bounded}</p>
                <nav aria-label={c.itinerary}>
                  {query.page > 1 ? (
                    <a
                      className={buttonClass("secondary", s.pageButton)}
                      href={calendarHref(locale, query, { page: query.page - 1 })}
                    >
                      {c.back}
                    </a>
                  ) : null}
                  {data.hasMore ? (
                    <a
                      className={buttonClass("secondary", s.pageButton)}
                      href={calendarHref(locale, query, { page: query.page + 1 })}
                    >
                      {c.more}
                    </a>
                  ) : null}
                </nav>
              </div>
            ) : null}
          </section>
          <section aria-labelledby="calendar-requests-title" className={s.requests}>
            <div className={s.requestsHeading}>
              <ClockIcon />
              <div>
                <h2 id="calendar-requests-title">{c.requests}</h2>
                <p>{c.requestsNote}</p>
              </div>
            </div>
            {data.requests.length ? (
              <ul className={s.requestList}>
                {data.requests.map((row) => (
                  <li key={row.id}>
                    <div>
                      <bdi className={s.requestReference}>{row.reference}</bdi>
                      <p>
                        {c.host}: {row.hostName ?? c.noHost}
                      </p>
                    </div>
                    <a className={s.openLink} href={`/${locale}/calendar/${row.id}`}>
                      {c.open} <bdi>{row.reference}</bdi>
                      <ChevronEndIcon directional />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={s.noRequests}>{c.noRequests}</p>
            )}
            {query.requestPage > 1 || data.hasMoreRequests ? (
              <nav aria-label={c.requests} className={s.requestNavigation}>
                {query.requestPage > 1 ? (
                  <a
                    className={buttonClass("secondary", s.pageButton)}
                    href={calendarHref(locale, query, { requestPage: query.requestPage - 1 })}
                  >
                    {c.backRequests}
                  </a>
                ) : null}
                {data.hasMoreRequests ? (
                  <a
                    className={buttonClass("secondary", s.pageButton)}
                    href={calendarHref(locale, query, { requestPage: query.requestPage + 1 })}
                  >
                    {c.moreRequests}
                  </a>
                ) : null}
              </nav>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
