import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SLOT_STEP_MINUTES,
  MAX_SLOT_RANGE_DAYS,
  addDays,
  computeFreeSlots,
  timeZoneOffsetMs,
  zonedParts,
  zonedWallClockToUtc,
} from "../lib/broker-free-slots.mjs";
import { DEFAULT_OFFICE_HOURS, brokerAvailabilityFor } from "../lib/broker-availability.mjs";

const SOFIA = "Europe/Sofia";
// Europe/Sofia moves the clock on the last Sunday of March (03:00 -> 04:00,
// EET to EEST) and the last Sunday of October (04:00 -> 03:00, EEST to EET).
const SPRING_FORWARD = "2026-03-29";
const FALL_BACK = "2026-10-25";
const PLAIN_SUNDAY = "2026-04-05";

function availability(weeklyHours, { exceptions = [], timezone = SOFIA, brokerId = "broker_bg", source = "broker_recorded" } = {}) {
  return { broker_id: brokerId, timezone, weekly_hours: weeklyHours, exceptions, source };
}

function slotsOn(result, date) {
  return result.days.find((day) => day.date === date)?.slots || [];
}

test("wall clock conversion follows the office time zone across both transitions", () => {
  // Winter: Europe/Sofia is UTC+2. Summer: UTC+3.
  assert.equal(new Date(zonedWallClockToUtc("2026-01-15", "10:00", SOFIA)).toISOString(), "2026-01-15T08:00:00.000Z");
  assert.equal(new Date(zonedWallClockToUtc("2026-07-15", "10:00", SOFIA)).toISOString(), "2026-07-15T07:00:00.000Z");
  assert.equal(timeZoneOffsetMs(Date.parse("2026-01-15T08:00:00Z"), SOFIA), 2 * 60 * 60 * 1000);
  assert.equal(timeZoneOffsetMs(Date.parse("2026-07-15T07:00:00Z"), SOFIA), 3 * 60 * 60 * 1000);

  // The same wall clock on either side of the spring transition is an hour
  // apart in real time, and reads back as the same local time.
  const before = zonedWallClockToUtc("2026-03-28", "10:00", SOFIA);
  const after = zonedWallClockToUtc("2026-03-30", "10:00", SOFIA);
  assert.equal(after - before, 2 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000);
  assert.equal(zonedParts(before, SOFIA).time, "10:00");
  assert.equal(zonedParts(after, SOFIA).time, "10:00");

  // 03:00 does not exist on the spring-forward day; it resolves to the instant
  // the clock jumps to rather than to a time in the past.
  const gap = zonedWallClockToUtc(SPRING_FORWARD, "03:00", SOFIA);
  assert.equal(new Date(gap).toISOString(), "2026-03-29T01:00:00.000Z");
  assert.equal(zonedParts(gap, SOFIA).time, "04:00");
});

test("a working window that spans the daylight-saving change keeps real time, not wall clock", () => {
  // Sunday 01:00 to 06:00 brackets both transitions.
  const sundayNights = availability([{ weekday: 7, start: "01:00", end: "06:00" }]);
  const options = { durationMinutes: 60, stepMinutes: 60, now: "2026-01-01T00:00:00.000Z" };

  const plain = computeFreeSlots({ availability: sundayNights, from: PLAIN_SUNDAY, to: PLAIN_SUNDAY, ...options });
  assert.equal(plain.summary.available_slots, 5, "an ordinary Sunday holds five one-hour slots");

  const spring = computeFreeSlots({ availability: sundayNights, from: SPRING_FORWARD, to: SPRING_FORWARD, ...options });
  assert.equal(spring.summary.available_slots, 4, "the spring-forward day is one real hour shorter");
  assert.deepEqual(
    slotsOn(spring, SPRING_FORWARD).map((slot) => [slot.local_start, slot.starts_at]),
    [
      ["01:00", "2026-03-28T23:00:00.000Z"],
      ["02:00", "2026-03-29T00:00:00.000Z"],
      // 03:00 local never happens; the clock jumps straight to 04:00.
      ["04:00", "2026-03-29T01:00:00.000Z"],
      ["05:00", "2026-03-29T02:00:00.000Z"],
    ],
  );

  const fall = computeFreeSlots({ availability: sundayNights, from: FALL_BACK, to: FALL_BACK, ...options });
  assert.equal(fall.summary.available_slots, 6, "the fall-back day is one real hour longer");
  assert.deepEqual(
    slotsOn(fall, FALL_BACK).map((slot) => [slot.local_start, slot.starts_at]),
    [
      ["01:00", "2026-10-24T22:00:00.000Z"],
      ["02:00", "2026-10-24T23:00:00.000Z"],
      // 03:00 local happens twice, as two distinct bookable instants.
      ["03:00", "2026-10-25T00:00:00.000Z"],
      ["03:00", "2026-10-25T01:00:00.000Z"],
      ["04:00", "2026-10-25T02:00:00.000Z"],
      ["05:00", "2026-10-25T03:00:00.000Z"],
    ],
  );
  assert.equal(new Set(slotsOn(fall, FALL_BACK).map((slot) => slot.starts_at)).size, 6, "no repeated instant");
});

test("ordinary working days keep their local hours while their UTC instants move with the season", () => {
  const weekdays = availability([
    { weekday: 4, start: "09:00", end: "12:00" },
    { weekday: 6, start: "09:00", end: "12:00" },
  ]);
  const winter = computeFreeSlots({
    availability: weekdays,
    from: "2026-03-26",
    to: "2026-03-26",
    durationMinutes: 60,
    stepMinutes: 60,
    now: "2026-01-01T00:00:00.000Z",
  });
  const summer = computeFreeSlots({
    availability: weekdays,
    from: "2026-04-04",
    to: "2026-04-04",
    durationMinutes: 60,
    stepMinutes: 60,
    now: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(winter.summary.available_slots, 3);
  assert.equal(summer.summary.available_slots, 3);
  assert.equal(winter.slots[0].local_start, "09:00");
  assert.equal(summer.slots[0].local_start, "09:00");
  assert.equal(winter.slots[0].starts_at, "2026-03-26T07:00:00.000Z");
  assert.equal(summer.slots[0].starts_at, "2026-04-04T06:00:00.000Z");
});

test("an all-day exception closes the day and a part-day exception replaces its hours", () => {
  const withHoliday = availability(
    [
      { weekday: 1, start: "09:00", end: "17:00" },
      { weekday: 2, start: "09:00", end: "17:00" },
    ],
    {
      exceptions: [
        { date: "2026-06-01", kind: "closed", reason: "public holiday", windows: [] },
        { date: "2026-06-02", kind: "hours", windows: [{ start: "14:00", end: "17:00" }], reason: "blocked morning" },
      ],
    },
  );
  const result = computeFreeSlots({
    availability: withHoliday,
    from: "2026-06-01",
    to: "2026-06-02",
    durationMinutes: 60,
    stepMinutes: 60,
    now: "2026-01-01T00:00:00.000Z",
  });

  const holiday = result.days.find((day) => day.date === "2026-06-01");
  assert.equal(holiday.closed, true);
  assert.equal(holiday.reason, "public holiday");
  assert.deepEqual(holiday.slots, []);

  const blockedMorning = result.days.find((day) => day.date === "2026-06-02");
  assert.equal(blockedMorning.closed, false);
  assert.equal(blockedMorning.reason, "blocked morning");
  assert.deepEqual(blockedMorning.slots.map((slot) => slot.local_start), ["14:00", "15:00", "16:00"]);
  assert.equal(result.summary.available_slots, 3);
});

test("a broker with no recorded availability falls back to the documented office week", () => {
  const fallback = brokerAvailabilityFor([], "broker_international", { env: {} });
  assert.equal(fallback.source, "office_default");
  assert.equal(fallback.timezone, "Europe/Sofia");
  assert.deepEqual(fallback.weekly_hours, DEFAULT_OFFICE_HOURS.map((row) => ({ ...row })));
  assert.equal(fallback.recorded_at, null);

  // Monday 2026-06-01 through Sunday 2026-06-07: five office days, nine hours each.
  const result = computeFreeSlots({
    availability: fallback,
    from: "2026-06-01",
    to: "2026-06-07",
    durationMinutes: 60,
    now: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(result.availability_source, "office_default");
  assert.equal(result.step_minutes, DEFAULT_SLOT_STEP_MINUTES);
  assert.equal(result.summary.open_days, 5);
  assert.deepEqual(
    result.days.filter((day) => day.closed).map((day) => day.date),
    ["2026-06-06", "2026-06-07"],
  );
  // 09:00 to 18:00 with a 30 minute step and a 60 minute viewing: 17 starts a day.
  assert.equal(result.summary.available_slots, 5 * 17);

  // Recording hours replaces the fallback and says so.
  const recorded = brokerAvailabilityFor(
    [
      {
        id: "broker-availability-broker_international-1",
        recorded_at: "2026-05-01T08:00:00.000Z",
        broker_id: "broker_international",
        actor: "broker_international",
        timezone: SOFIA,
        weekly_hours: [{ weekday: 3, start: "10:00", end: "12:00" }],
        exceptions: [],
      },
    ],
    "broker_international",
    { env: {} },
  );
  assert.equal(recorded.source, "broker_recorded");
  assert.equal(recorded.recorded_by, "broker_international");
});

test("a fully booked day returns no slots while the surrounding days stay open", () => {
  const shortDays = availability([
    { weekday: 1, start: "09:00", end: "11:00" },
    { weekday: 2, start: "09:00", end: "11:00" },
  ]);
  const booked = [
    { id: "viewing-a", broker: "broker_bg", starts_at: "2026-06-01T06:00:00.000Z", status: "booked" },
    { id: "viewing-b", broker: "broker_bg", starts_at: "2026-06-01T07:00:00.000Z", status: "booked" },
    // Another broker's calendar must not block this one.
    { id: "viewing-c", broker: "broker_ru", starts_at: "2026-06-02T06:00:00.000Z", status: "booked" },
    // A no-show does not reserve the time.
    { id: "viewing-d", broker: "broker_bg", starts_at: "2026-06-02T07:00:00.000Z", status: "no_show" },
  ];
  const result = computeFreeSlots({
    availability: shortDays,
    viewings: booked,
    from: "2026-06-01",
    to: "2026-06-02",
    durationMinutes: 60,
    stepMinutes: 60,
    now: "2026-01-01T00:00:00.000Z",
  });

  const monday = result.days.find((day) => day.date === "2026-06-01");
  assert.equal(monday.closed, false, "the day is open, it is simply full");
  assert.equal(monday.open_slots, 0);
  assert.deepEqual(monday.slots.map((slot) => [slot.local_start, slot.available, slot.blocked_by, slot.viewing_id]), [
    ["09:00", false, "viewing", "viewing-a"],
    ["10:00", false, "viewing", "viewing-b"],
  ]);

  const tuesday = result.days.find((day) => day.date === "2026-06-02");
  assert.equal(tuesday.open_slots, 2);
  assert.equal(result.summary.available_slots, 2);
  assert.equal(result.summary.blocked_by_viewings, 2);
  assert.deepEqual(result.slots.map((slot) => slot.local_start), ["09:00", "10:00"]);
});

test("slots before the lead time are not offered and the range is bounded", () => {
  const weekdays = availability([{ weekday: 1, start: "09:00", end: "13:00" }]);
  const result = computeFreeSlots({
    availability: weekdays,
    from: "2026-06-01",
    to: "2026-06-01",
    durationMinutes: 60,
    stepMinutes: 60,
    now: "2026-06-01T06:30:00.000Z", // 09:30 in Sofia
    leadTimeMinutes: 120,
  });
  assert.deepEqual(result.days[0].slots.map((slot) => [slot.local_start, slot.available, slot.blocked_by]), [
    ["09:00", false, "lead_time"],
    ["10:00", false, "lead_time"],
    ["11:00", false, "lead_time"],
    ["12:00", true, null],
  ]);

  assert.throws(
    () => computeFreeSlots({ availability: weekdays, from: "2026-06-02", to: "2026-06-01" }),
    /to cannot precede from/,
  );
  assert.throws(
    () => computeFreeSlots({ availability: weekdays, from: "2026-06-01", to: addDays("2026-06-01", MAX_SLOT_RANGE_DAYS) }),
    new RegExp(`must not exceed ${MAX_SLOT_RANGE_DAYS} days`),
  );
  assert.throws(() => computeFreeSlots({ availability: weekdays, from: "01-06-2026", to: "2026-06-01" }), /YYYY-MM-DD/);
  assert.throws(
    () => computeFreeSlots({ availability: { ...weekdays, timezone: "Mars/Olympus" }, from: "2026-06-01", to: "2026-06-01" }),
    /not a known IANA time zone/,
  );
  assert.throws(
    () => computeFreeSlots({ availability: weekdays, from: "2026-06-01", to: "2026-06-01", durationMinutes: 3 }),
    /durationMinutes/,
  );
  assert.equal(
    computeFreeSlots({ availability: weekdays, from: "2026-06-01", to: "2026-06-01", durationMinutes: 60, stepMinutes: 60, now: "2026-01-01T00:00:00.000Z", limit: 2 }).slots.length,
    2,
  );
});
