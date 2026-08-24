// The payload a week view needs: seven days in the office time zone, each
// broker's working windows and free slots on those days, the viewings already
// booked, and the follow-ups that fall due inside the week.
//
// It composes the availability ledger and the free-slot calculation; it adds no
// storage of its own.

import { brokerAvailabilityFor, officeTimeZone } from "./broker-availability.mjs";
import { DEFAULT_VIEWING_DURATION_MINUTES, addDays, computeFreeSlots, zonedParts } from "./broker-free-slots.mjs";

export const WEEK_DAYS = 7;

// ISO weekday of a calendar date: 1 = Monday ... 7 = Sunday.
export function isoWeekday(date) {
  const [year, month, day] = String(date).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() || 7;
}

// Monday of the week that contains `date`.
export function weekStartFor(date) {
  return addDays(date, 1 - isoWeekday(date));
}

export function officeToday(now, timeZone) {
  const at = Date.parse(now);
  if (!Number.isFinite(at)) throw new Error("now must be an ISO timestamp");
  return zonedParts(at, timeZone).date;
}

function viewingsOnDay(viewings, brokerId, date, timeZone) {
  return viewings.filter((row) => {
    if (brokerId && row.broker !== brokerId) return false;
    const at = Date.parse(row.starts_at);
    return Number.isFinite(at) && zonedParts(at, timeZone).date === date;
  });
}

function scheduleEntry(row, timeZone) {
  const at = Date.parse(row.starts_at);
  return {
    id: row.id,
    lead_id: row.lead_id || null,
    listing_reference: row.listing_reference || null,
    broker: row.broker,
    status: row.status || "booked",
    channel: row.channel || "property_viewing",
    starts_at: row.starts_at,
    local_date: zonedParts(at, timeZone).date,
    local_start: zonedParts(at, timeZone).time,
  };
}

/**
 * @param {object} options
 * @param {Array}  options.availabilityRows raw broker-availability ledger rows
 * @param {Array}  options.brokers          broker ids the week should cover
 * @param {Array}  options.viewings         viewing rows or derived viewing states
 * @param {object} options.viewingFollowUpQueue output of buildViewingFollowUpQueue
 * @param {string} options.week             any date inside the wanted week (YYYY-MM-DD)
 * @param {string} options.now              ISO instant
 */
export function buildViewingWeekView({
  availabilityRows = [],
  brokers = [],
  viewings = [],
  viewingFollowUpQueue = null,
  week = null,
  now = new Date().toISOString(),
  durationMinutes = DEFAULT_VIEWING_DURATION_MINUTES,
  env = process.env,
} = {}) {
  const timeZone = officeTimeZone(env);
  const today = officeToday(now, timeZone);
  const weekStart = weekStartFor(week || today);
  const weekEnd = addDays(weekStart, WEEK_DAYS - 1);
  const dates = Array.from({ length: WEEK_DAYS }, (unused, index) => addDays(weekStart, index));
  const brokerIds = [...new Set([...brokers, ...viewings.map((row) => row.broker)].map((id) => String(id || "").trim()).filter(Boolean))].sort();

  const followUpRows = (viewingFollowUpQueue?.rows || []).filter((row) => {
    const due = Date.parse(row.due_at);
    if (!Number.isFinite(due)) return false;
    const date = zonedParts(due, timeZone).date;
    return date >= weekStart && date <= weekEnd;
  });

  const brokerWeeks = brokerIds.map((brokerId) => {
    const availability = brokerAvailabilityFor(availabilityRows, brokerId, { env });
    const freeSlots = computeFreeSlots({
      availability,
      viewings,
      from: weekStart,
      to: weekEnd,
      durationMinutes,
      now,
    });
    return {
      broker_id: brokerId,
      availability_source: availability.source,
      timezone: availability.timezone,
      recorded_at: availability.recorded_at,
      recorded_by: availability.recorded_by,
      weekly_hours: availability.weekly_hours,
      days: freeSlots.days.map((day) => ({
        date: day.date,
        weekday: day.weekday,
        closed: day.closed,
        reason: day.reason,
        exception: day.exception,
        windows: day.windows,
        open_slots: day.open_slots,
        slots: day.slots,
        viewings: viewingsOnDay(viewings, brokerId, day.date, timeZone).map((row) => scheduleEntry(row, timeZone)),
      })),
      open_slots: freeSlots.summary.available_slots,
    };
  });

  const days = dates.map((date) => {
    const dayViewings = viewingsOnDay(viewings, null, date, timeZone)
      .map((row) => scheduleEntry(row, timeZone))
      .sort((left, right) => Date.parse(left.starts_at) - Date.parse(right.starts_at));
    const dayFollowUps = followUpRows.filter((row) => zonedParts(Date.parse(row.due_at), timeZone).date === date);
    return {
      date,
      weekday: isoWeekday(date),
      is_today: date === today,
      is_past: date < today,
      viewings: dayViewings,
      follow_ups_due: dayFollowUps,
      open_slots: brokerWeeks.reduce(
        (total, brokerWeek) => total + (brokerWeek.days.find((day) => day.date === date)?.open_slots || 0),
        0,
      ),
      closed_brokers: brokerWeeks
        .filter((brokerWeek) => brokerWeek.days.find((day) => day.date === date)?.closed)
        .map((brokerWeek) => brokerWeek.broker_id),
    };
  });

  return {
    kind: "viewing_week",
    timezone: timeZone,
    week_start: weekStart,
    week_end: weekEnd,
    today,
    previous_week: addDays(weekStart, -WEEK_DAYS),
    next_week: addDays(weekStart, WEEK_DAYS),
    duration_minutes: durationMinutes,
    days,
    brokers: brokerWeeks,
    summary: {
      brokers: brokerWeeks.length,
      brokers_without_availability: brokerWeeks.filter((brokerWeek) => brokerWeek.availability_source === "office_default").length,
      viewings: days.reduce((total, day) => total + day.viewings.length, 0),
      open_slots: days.reduce((total, day) => total + day.open_slots, 0),
      follow_ups_due: followUpRows.length,
      overdue_follow_ups: followUpRows.filter((row) => row.overdue).length,
    },
  };
}
