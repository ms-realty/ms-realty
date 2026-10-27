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
  HistoryIcon,
  InfoIcon,
} from "@/ui/icons";
import { Notice } from "@/ui/notice";
import s from "./calendar.module.css";
import { calendarCopy } from "./calendar-copy";
import { CalendarFilterDisclosure } from "./calendar-filter-disclosure";
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
const clockText = (at: Date, locale: string, zone: string, withOffset = false) =>
  new Intl.DateTimeFormat(language(locale), {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...(withOffset ? { timeZoneName: "shortOffset" as const } : {}),
  }).format(at);
const offsetText = (at: Date, zone: string) =>
  new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "shortOffset" })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value;

function appointmentHeading(
  row: Pick<CalendarAppointment, "purpose" | "caseTitle" | "reference">,
  photography: string,
) {
  const title = row.caseTitle || row.reference;
  return row.purpose === "photography" ? `${photography} · ${title}` : title;
}
function showCalendarOffsets(start: Date, end: Date, zone: CalendarQuery["zone"]) {
  if (offsetText(start, zone) !== offsetText(end, zone)) return true;
  // A viewing wholly inside either repeated hour also needs an explicit offset.
  return [start, end].some((at) => {
    const bounds = calendarPeriod({
      date: calendarDay(at, zone),
      zone,
      view: "day",
      scope: "team",
      page: 1,
      requestPage: 1,
    });
    return bounds.end.getTime() - bounds.start.getTime() !== 86400000;
  });
}
function previewRange(start: Date, end: Date, locale: string, zone: CalendarQuery["zone"]) {
  const withOffset = showCalendarOffsets(start, end, zone);
  return `${clockText(start, locale, zone, withOffset)}–${clockText(end, locale, zone, withOffset)}`;
}

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
  data,
}: {
  locale: string;
  query: CalendarQuery;
  now: Date;
  data: CalendarData | null;
}) {
  const c = calendarCopy(locale);
  const period = calendarPeriod(query);
  const step = query.view === "day" ? 1 : 7;
  const reset = { page: 1, requestPage: 1 };
  const periodText = new Intl.DateTimeFormat(language(locale), {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(civilDate(query.date));
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
            <a
              href={calendarHref(locale, query, { ...reset, date: calendarDay(now, query.zone) })}
              className={s.todayButton}
            >
              {c.today}
            </a>
          </nav>
        </div>
        <div className={s.viewControls}>
          <span className={s.scopeLabel}>{query.scope === "mine" ? c.mine : c.teamShort}</span>
          <nav aria-label={c.views} className={s.views}>
            {(["week", "day", "agenda"] as const).map((view) => (
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
      </div>
      <div className={s.contextLine}>
        <div className={s.calendarStatus}>
          <bdi>{query.zone}</bdi>
        </div>
        <div className={s.legend}>
          <span>{c.states.confirmed}</span>
          <span>
            {c.states.proposed} · {c.notReserved}
          </span>
        </div>
        <a className={s.contextAction} href={calendarHref(locale, query)}>
          <HistoryIcon />
          <span className="sr-only">{c.refresh}</span>
        </a>
        <details className={s.calendarDetails}>
          <summary>
            <InfoIcon />
            <span className={s.detailsLabel}>{c.details}</span>
          </summary>
          <div>
            {data ? (
              <p>
                {c.snapshot}: <CalendarTime at={data.checkedAt} locale={locale} zone={query.zone} />
              </p>
            ) : null}
            <p>{c.scopeNote}</p>
            <p>{c.manualCompact}</p>
            <p>{c.manualNote}</p>
            <p>{c.snapshotNote}</p>
            <p>{c.mobileNote}</p>
          </div>
        </details>
        <CalendarFilterDisclosure
          label={c.filtersShort}
          selection={`${c.filters} · ${query.zone} · ${query.scope === "mine" ? c.mine : c.team}`}
        >
          <form action={`/${locale}/calendar`} method="get" className={s.filters}>
            <div className={s.field}>
              <label htmlFor="calendar-view">{c.views}</label>
              <select id="calendar-view" name="view" defaultValue={query.view}>
                {(["week", "day", "agenda"] as const).map((view) => (
                  <option key={view} value={view}>
                    {c[view]}
                  </option>
                ))}
              </select>
            </div>
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
        </CalendarFilterDisclosure>
      </div>
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
  const historical = ["completed", "no_show", "cancelled", "declined"].includes(row.state);
  const access = {
    unknown: c.accessUnknown,
    requested: c.accessRequested,
    confirmed: c.accessConfirmed,
    unavailable: c.accessUnavailable,
  };
  const broker = row.resources.find((resource) => resource.kind === "broker");
  const current = row.confirmedStartsAt && row.confirmedEndsAt;
  const proposal = row.proposedStartsAt && row.proposedEndsAt;
  const incomplete =
    !historical &&
    current &&
    (!row.resources.some((resource) => resource.kind === "broker") ||
      !row.resources.some((resource) => resource.kind === "property_access"));
  const review =
    row.conflicts.length ||
    incomplete ||
    (!historical && (row.propertyAccess !== "confirmed" || !row.externalBusyCheckedAt));
  const minutes = (value: number) =>
    new Intl.NumberFormat(language(locale), { maximumFractionDigits: 1 }).format(
      Math.max(0, value / 60000),
    );
  const compact = (start: Date, end: Date, label: string, proposed = false) => {
    const first = calendarDay(start, query.zone);
    const last = calendarDay(end, query.zone);
    const showOffset = showCalendarOffsets(start, end, query.zone);
    const clock = (at: Date) =>
      `${clockText(at, locale, query.zone)}${showOffset ? ` ${offsetText(at, query.zone)}` : ""}`;
    return (
      <div className={s.compactArrangement} data-proposed={proposed || undefined}>
        <p>{label}</p>
        <div>
          <time dateTime={start.toISOString()}>
            {first !== query.date ? `${shortDay(first, locale)} · ` : ""}
            {clock(start)}
          </time>
          {"–"}
          <time dateTime={end.toISOString()}>
            {last !== first ? `${shortDay(last, locale)} · ` : ""}
            {clock(end)}
          </time>
        </div>
      </div>
    );
  };
  const exact = (start: Date, end: Date, label: string, proposed = false) => (
    <div className={cx(s.timeBlock, proposed ? s.proposedTime : s.confirmedTime)}>
      <p className={s.timeLabel}>{label}:</p>
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
      <div className={s.compactSchedule}>
        {current
          ? compact(
              row.confirmedStartsAt as Date,
              row.confirmedEndsAt as Date,
              historical ? c.previousTime : c.current,
            )
          : null}
        {proposal
          ? compact(
              row.proposedStartsAt as Date,
              row.proposedEndsAt as Date,
              current ? c.replacement : c.proposed,
              true,
            )
          : null}
      </div>
      <header className={s.appointmentHeader}>
        <h4>
          <a className={s.appointmentTitle} href={`/${locale}/calendar/${row.id}`}>
            {appointmentHeading(row, c.photography)}
            <ChevronEndIcon directional />
          </a>
        </h4>
        <p className={s.caseContext}>
          <bdi>{row.reference}</bdi>
          {row.caseReference ? (
            <>
              {" "}
              · <bdi>{row.caseReference}</bdi>
            </>
          ) : null}
        </p>
        <p className={s.appointmentContext}>
          <span className={s.state} data-state={row.state}>
            {c.states[row.state]}
          </span>
          <span>{row.hostName ?? c.noHost}</span>
        </p>
      </header>
      <div className={s.appointmentTools}>
        <details className={s.appointmentDetails}>
          <summary>
            {review ? <InfoIcon /> : null}
            {row.conflicts.length ? c.conflictShort : review ? c.reviewShort : c.appointmentDetails}
            <ChevronDownIcon />
          </summary>
          <div>
            <div className={s.arrangements}>
              {current
                ? exact(
                    row.confirmedStartsAt as Date,
                    row.confirmedEndsAt as Date,
                    historical ? c.previousTime : c.current,
                  )
                : null}
              {proposal
                ? exact(
                    row.proposedStartsAt as Date,
                    row.proposedEndsAt as Date,
                    current ? c.replacement : c.proposed,
                    true,
                  )
                : null}
            </div>
            <p className={s.version}>
              {c.version}: <bdi>{row.version}</bdi>
            </p>
            {proposal ? <p className={s.proposalNote}>{c.proposalNote}</p> : null}
            <dl className={s.facts}>
              <div>
                <dt>{c.host}</dt>
                <dd>{row.hostName ?? c.noHost}</dd>
              </div>
              <div>
                <dt>{c.access}</dt>
                <dd>{access[row.propertyAccess]}</dd>
              </div>
              <div>
                <dt>{c.external}</dt>
                <dd>
                  {row.externalBusyCheckedAt ? (
                    <CalendarTime
                      at={row.externalBusyCheckedAt}
                      locale={locale}
                      zone={query.zone}
                    />
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
                      {minutes((row.confirmedStartsAt as Date).getTime() - broker.start.getTime())}{" "}
                      / {minutes(broker.end.getTime() - (row.confirmedEndsAt as Date).getTime())}
                    </strong>
                  </p>
                ) : null}
              </div>
            ) : null}
            {incomplete ? <Notice tone="warning">{c.incomplete}</Notice> : null}
            {row.conflicts.length ? (
              <Notice tone="warning">
                {c.overlap}:{" "}
                {row.conflicts
                  .map((kind) => (kind === "broker" ? c.broker : c.property))
                  .join(", ")}
                .
              </Notice>
            ) : null}
            {row.caseId ? (
              <a className={s.textLink} href={`/${locale}/cases/${row.caseId}`}>
                {row.purpose === "photography" ? c.property : c.deal}:{" "}
                <bdi>{row.caseReference}</bdi>
              </a>
            ) : null}
          </div>
        </details>
        <a className={s.openLink} href={`/${locale}/calendar/${row.id}`} title={c.open}>
          <span className={s.openLabel}>{c.open}</span>
          <ChevronEndIcon directional />
        </a>
      </div>
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

type TimelineSegment = {
  row: CalendarAppointment;
  start: Date;
  end: Date;
  proposed: boolean;
  reserved: boolean;
};
function daySegments(data: CalendarData, day: string, query: CalendarQuery): TimelineSegment[] {
  const bounds = calendarPeriod({ ...query, date: day, view: "day" });
  return rowsOnDay(data, day, query.zone)
    .flatMap((row) => {
      const intervals = [
        {
          start: row.confirmedStartsAt,
          end: row.confirmedEndsAt,
          proposed: false,
          reserved: false,
        },
        { start: row.proposedStartsAt, end: row.proposedEndsAt, proposed: true, reserved: false },
      ].flatMap((interval) =>
        interval.start && interval.end && interval.start < bounds.end && interval.end > bounds.start
          ? [
              {
                row,
                ...interval,
                start: new Date(Math.max(interval.start.getTime(), bounds.start.getTime())),
                end: new Date(Math.min(interval.end.getTime(), bounds.end.getTime())),
              },
            ]
          : [],
      );
      if (intervals.length) return intervals;
      const resources = row.resources.filter(
        (resource) => resource.start < bounds.end && resource.end > bounds.start,
      );
      return resources.length
        ? [
            {
              row,
              start: new Date(
                Math.max(
                  bounds.start.getTime(),
                  Math.min(...resources.map((resource) => resource.start.getTime())),
                ),
              ),
              end: new Date(
                Math.min(
                  bounds.end.getTime(),
                  Math.max(...resources.map((resource) => resource.end.getTime())),
                ),
              ),
              proposed: false,
              reserved: true,
            },
          ]
        : [];
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime() || a.row.id.localeCompare(b.row.id));
}

/** The vertical canvas uses each civil day's real elapsed instants, including a 25-hour day.
 * Transition-day ticks carry their own offset; the native itinerary retains the complete range.
 */
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
  const days = calendarPeriod(query).days.map((day) => ({
    day,
    bounds: calendarPeriod({ ...query, date: day, view: "day" }),
    segments: daySegments(data, day, query),
  }));
  const relative = days.flatMap(({ bounds, segments }) =>
    segments.flatMap((segment) => [
      (segment.start.getTime() - bounds.start.getTime()) / 3600000,
      (segment.end.getTime() - bounds.start.getTime()) / 3600000,
    ]),
  );
  const dayLengths = days.map(
    ({ bounds }) => (bounds.end.getTime() - bounds.start.getTime()) / 3600000,
  );
  const mixedDayLengths = new Set(dayLengths).size > 1;
  const firstHour = relative.length ? Math.max(0, Math.floor(Math.min(...relative))) : 9;
  const lastHour = Math.min(
    Math.max(...dayLengths),
    relative.length ? Math.max(firstHour + 8, Math.ceil(Math.max(...relative)) + 1) : 18,
  );
  const hourCount = lastHour - firstHour;
  const hours = Array.from({ length: Math.ceil(hourCount) }, (_, index) => firstHour + index);
  const representative =
    days.find(({ bounds }) => (bounds.end.getTime() - bounds.start.getTime()) / 3600000 === 24) ??
    days[0];
  if (!representative) return null;
  const stripDays = calendarPeriod({ ...query, view: "week" }).days;
  return (
    <section
      aria-label={query.view === "day" ? c.dayOverview : c.weekOverview}
      className={s.overview}
    >
      <nav aria-label={c.weekOverview} className={s.phoneWeekStrip}>
        {stripDays.map((day) => (
          <a
            key={day}
            className={s.weekDayLink}
            aria-current={day === query.date ? "date" : undefined}
            href={calendarHref(locale, query, { date: day, view: "day", page: 1 })}
          >
            <span>{shortDay(day, locale, true)}</span>
            <strong>{Number(day.slice(-2))}</strong>
            <span className="sr-only"> · {dayText(day, locale)}</span>
            {rowsOnDay(data, day, query.zone).length ? <i aria-hidden="true" /> : null}
          </a>
        ))}
      </nav>
      <div className={s.weekCanvas} data-days={days.length}>
        <div
          className={s.weekHead}
          style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}
        >
          <span className={s.zoneCell}>{offsetText(representative.bounds.start, query.zone)}</span>
          {days.map(({ day, bounds }) => (
            <a
              key={day}
              className={s.dayHead}
              data-today={day === calendarDay(now, query.zone) || undefined}
              data-selected={day === query.date || undefined}
              data-weekend={[0, 6].includes(civilDate(day).getUTCDay()) || undefined}
              href={calendarHref(locale, query, { date: day, view: "day", page: 1 })}
            >
              <span>{shortDay(day, locale, true)}</span>
              <strong>{Number(day.slice(-2))}</strong>
              <span className="sr-only">
                {" "}
                · {dayText(day, locale)} · {query.zone} ·{" "}
                {(bounds.end.getTime() - bounds.start.getTime()) / 3600000} h
              </span>
            </a>
          ))}
        </div>
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: the labelled scroll region needs keyboard scrolling when the timetable exceeds its viewport. */}
        <section className={s.weekScroll} tabIndex={0} aria-label={c.weekScroll}>
          <div
            className={s.weekGrid}
            style={{
              gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))`,
              height: `calc(${hourCount} * var(--calendar-hour))`,
            }}
          >
            <div className={s.timeColumn} aria-hidden="true">
              {!mixedDayLengths &&
                hours.map((hour) => (
                  <span
                    key={hour}
                    style={{ top: `calc(${hour - firstHour} * var(--calendar-hour))` }}
                  >
                    {clockText(
                      new Date(representative.bounds.start.getTime() + hour * 3600000),
                      locale,
                      query.zone,
                    )}
                  </span>
                ))}
            </div>
            {days.map(({ day, bounds, segments }) => {
              const laneEnds: number[] = [];
              const placed = segments.map((segment) => {
                let lane = laneEnds.findIndex((end) => end <= segment.start.getTime());
                if (lane < 0) lane = laneEnds.length;
                laneEnds[lane] = segment.end.getTime();
                return { ...segment, lane };
              });
              const lanes = Math.max(1, laneEnds.length);
              const transition =
                offsetText(bounds.start, query.zone) !==
                offsetText(new Date(bounds.end.getTime() - 1), query.zone);
              return (
                <div
                  key={day}
                  className={s.dayColumn}
                  data-weekend={[0, 6].includes(civilDate(day).getUTCDay()) || undefined}
                  data-selected={day === query.date || undefined}
                  data-transition={transition || undefined}
                  style={{
                    height: `calc(${Math.max(0, Math.min(lastHour, (bounds.end.getTime() - bounds.start.getTime()) / 3600000) - firstHour)} * var(--calendar-hour))`,
                  }}
                >
                  {transition || mixedDayLengths
                    ? Array.from({ length: Math.ceil(hourCount) }, (_, index) => {
                        const at = bounds.start.getTime() + (firstHour + index) * 3600000;
                        return at < bounds.end.getTime() ? (
                          <span
                            className={s.transitionTick}
                            key={at}
                            style={{ top: `calc(${index} * var(--calendar-hour))` }}
                          >
                            {clockText(new Date(at), locale, query.zone, true)}
                          </span>
                        ) : null;
                      })
                    : null}
                  {placed.map((segment) => (
                    <a
                      key={`${segment.row.id}-${segment.start.toISOString()}-${segment.proposed ? "proposed" : segment.reserved ? "reserved" : "confirmed"}`}
                      className={s.weekEvent}
                      data-overlap={lanes > 1 || undefined}
                      data-compact={
                        segment.end.getTime() - segment.start.getTime() < 5400000 || undefined
                      }
                      data-proposed={segment.proposed || undefined}
                      data-reserved={segment.reserved || undefined}
                      href={`/${locale}/calendar/${segment.row.id}`}
                      title={`${appointmentHeading(segment.row, c.photography)} · ${previewRange(segment.start, segment.end, locale, query.zone)} · ${segment.row.reference}`}
                      style={{
                        top: `calc(${(segment.start.getTime() - bounds.start.getTime()) / 3600000 - firstHour} * var(--calendar-hour) + 2px)`,
                        height: `max(2.75rem, calc(${(segment.end.getTime() - segment.start.getTime()) / 3600000} * var(--calendar-hour) - 4px))`,
                        insetInlineStart: `calc(${(segment.lane / lanes) * 100}% + 4px)`,
                        width: `calc(${100 / lanes}% - 8px)`,
                      }}
                    >
                      <span className={s.eventTime}>
                        {previewRange(segment.start, segment.end, locale, query.zone)}
                      </span>
                      <strong className={s.eventTitle}>
                        {appointmentHeading(segment.row, c.photography)}
                      </strong>
                      <span className={s.eventReference}>
                        <bdi>{segment.row.reference}</bdi>
                        {segment.row.caseReference ? (
                          <>
                            {" "}
                            · <bdi>{segment.row.caseReference}</bdi>
                          </>
                        ) : null}
                      </span>
                      <span className={s.eventFooter}>{segment.row.hostName ?? c.noHost}</span>
                      <span className={s.eventState}>
                        {segment.reserved
                          ? c.reserved
                          : segment.proposed
                            ? `${c.states[segment.row.state]} · ${c.notReserved}`
                            : c.states[segment.row.state]}
                      </span>
                    </a>
                  ))}
                </div>
              );
            })}
          </div>
          {!data.rows.length ? (
            <div className={s.canvasEmpty}>
              <CalendarIcon />
              <h3>{c.canvasEmpty}</h3>
              <p>{c.emptyNote}</p>
            </div>
          ) : null}
        </section>
        <footer className={s.calendarFooter}>
          <span>{mixedDayLengths ? `${c.transitionNote} ${c.timelineNote}` : c.timelineNote}</span>
          <a href="#calendar-itinerary">
            {c.fullItinerary}
            <ChevronDownIcon />
          </a>
        </footer>
      </div>
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
    <div className={s.calendar} data-staff-calendar="">
      <div className={s.calendarTopbar}>
        <p className={s.mobileTitle}>{c.heading}</p>
        {data ? (
          <details className={s.requestDisclosure} open={query.requestPage > 1}>
            <summary>
              <span>{c.requestsShort}</span>
              <b>
                {data.requests.length}
                {data.hasMoreRequests ? "+" : ""}
              </b>
              <span className="sr-only"> {c.onPage}</span>
              <ChevronDownIcon />
            </summary>
            <section aria-labelledby="calendar-requests-title" className={s.requests}>
              <header className={s.requestsHeading}>
                <h2 id="calendar-requests-title">{c.requests}</h2>
                <p>
                  {c.requestsScope} · {data.requests.length} {c.onPage}
                </p>
              </header>
              {data.requests.length ? (
                <ul className={s.requestList}>
                  {data.requests.map((row) => (
                    <li key={row.id}>
                      <a href={`/${locale}/calendar/${row.id}`}>
                        <strong>{appointmentHeading(row, c.photography)}</strong>
                        <span>
                          <bdi>{row.reference}</bdi> · <bdi>{row.caseReference}</bdi>
                        </span>
                        <span>{row.hostName ?? c.noHost}</span>
                        <span className={s.openLink}>
                          {c.open}
                          <ChevronEndIcon directional />
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={s.noRequests}>{c.noRequests}</p>
              )}
              <p className={s.requestNote}>{c.requestsNote}</p>
              {query.requestPage > 1 || data.hasMoreRequests ? (
                <nav aria-label={c.requests} className={s.requestNavigation}>
                  {query.requestPage > 1 ? (
                    <a
                      className={s.pageButton}
                      href={calendarHref(locale, query, { requestPage: query.requestPage - 1 })}
                    >
                      {c.backRequests}
                    </a>
                  ) : null}
                  {data.hasMoreRequests ? (
                    <a
                      className={s.pageButton}
                      href={calendarHref(locale, query, { requestPage: query.requestPage + 1 })}
                    >
                      {c.moreRequests}
                    </a>
                  ) : null}
                </nav>
              ) : null}
            </section>
          </details>
        ) : null}
      </div>
      <CalendarControls locale={locale} query={query} now={now} data={data} />
      {adjusted ? <Notice tone="warning">{c.adjusted}</Notice> : null}
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
        <div className={s.calendarBody}>
          <section aria-label={c.itinerary} className={s.itinerary} data-view={query.view}>
            {query.view === "week" || query.view === "day" ? (
              <WeekOverview locale={locale} query={query} data={data} now={now} />
            ) : null}
            <details open className={s.fullItinerary} id="calendar-itinerary">
              <summary>
                {c.fullItinerary}
                <ChevronDownIcon />
              </summary>
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
                      page: 1,
                      requestPage: 1,
                      date: calendarDay(now, query.zone),
                    })}
                  >
                    {c.today}
                    <ChevronEndIcon directional />
                  </a>
                </div>
              ) : (
                <div className={s.agendaDays}>
                  {period.days
                    .filter((day) => rowsOnDay(data, day, query.zone).length)
                    .map((day) => (
                      <section
                        key={day}
                        aria-labelledby={`calendar-day-${day}`}
                        className={s.agendaDay}
                      >
                        <h3 id={`calendar-day-${day}`} className={s.dayHeading}>
                          <time dateTime={day}>
                            {new Intl.DateTimeFormat(language(locale), {
                              timeZone: "UTC",
                              weekday: "long",
                              day: "numeric",
                              month: "long",
                            }).format(civilDate(day))}
                          </time>
                        </h3>
                        <div className={s.dayAppointments}>
                          {rowsOnDay(data, day, query.zone).map((row) => (
                            <CalendarItem key={row.id} row={row} locale={locale} query={query} />
                          ))}
                        </div>
                      </section>
                    ))}
                </div>
              )}
            </details>
            {query.page > 1 || data.hasMore ? (
              <div className={s.pagination}>
                <p>{c.bounded}</p>
                <nav aria-label={c.itinerary}>
                  {query.page > 1 ? (
                    <a
                      className={s.pageButton}
                      href={calendarHref(locale, query, { page: query.page - 1 })}
                    >
                      {c.back}
                    </a>
                  ) : null}
                  {data.hasMore ? (
                    <a
                      className={s.pageButton}
                      href={calendarHref(locale, query, { page: query.page + 1 })}
                    >
                      {c.more}
                    </a>
                  ) : null}
                </nav>
              </div>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
