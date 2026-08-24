// Broker working hours: a recurring weekly pattern plus dated exceptions,
// recorded in the office time zone.
//
// The ledger is append-only, like every other ledger in this repo. The latest
// row for a broker is that broker's current availability; earlier rows stay as
// the audit trail of what the hours used to be.
//
// Default when a broker has none
// ------------------------------
// A broker with no recorded row falls back to DEFAULT_OFFICE_HOURS, which is the
// agency's published office week (Monday to Friday, 09:00 to 18:00, Europe/Sofia)
// and NOT a claim about that individual broker. Everything derived from the
// fallback is tagged `source: "office_default"` so a screen can say so, and a
// public visitor is told a broker still confirms the time. Both the time zone and
// the default week can be set by the operator:
//
//   MS_REALTY_OFFICE_TIMEZONE   IANA zone, default Europe/Sofia
//   MS_REALTY_OFFICE_HOURS      "1-5:09:00-18:00" style list, see parseOfficeHours

import fs from "node:fs";
import path from "node:path";
import { assertClockTime, assertIsoDate, assertTimeZone, clockMinutes } from "./broker-free-slots.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_BROKER_AVAILABILITY_LEDGER_PATH = fromRoot("production", "data", "broker-availability.jsonl");

export const OFFICE_TIMEZONE = "Europe/Sofia";

// ISO weekday numbering: 1 = Monday ... 7 = Sunday.
export const DEFAULT_OFFICE_HOURS = Object.freeze([
  Object.freeze({ weekday: 1, start: "09:00", end: "18:00" }),
  Object.freeze({ weekday: 2, start: "09:00", end: "18:00" }),
  Object.freeze({ weekday: 3, start: "09:00", end: "18:00" }),
  Object.freeze({ weekday: 4, start: "09:00", end: "18:00" }),
  Object.freeze({ weekday: 5, start: "09:00", end: "18:00" }),
]);

const EXCEPTION_KINDS = new Set(["closed", "hours"]);
const MAX_WEEKLY_WINDOWS = 28;
const MAX_EXCEPTIONS = 200;

export function officeTimeZone(env = process.env) {
  const configured = String(env.MS_REALTY_OFFICE_TIMEZONE || "").trim();
  return assertTimeZone(configured || OFFICE_TIMEZONE);
}

// "1-5:09:00-13:00,1-5:14:00-18:00,6:10:00-14:00" -> weekly window rows.
export function parseOfficeHours(value) {
  const text = String(value || "").trim();
  if (!text) return DEFAULT_OFFICE_HOURS.map((row) => ({ ...row }));
  const rows = [];
  for (const chunk of text.split(",").map((part) => part.trim()).filter(Boolean)) {
    const match = /^([1-7])(?:-([1-7]))?:(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(chunk);
    if (!match) throw new Error("MS_REALTY_OFFICE_HOURS entries must look like 1-5:09:00-18:00");
    const first = Number(match[1]);
    const last = match[2] ? Number(match[2]) : first;
    if (last < first) throw new Error("MS_REALTY_OFFICE_HOURS weekday ranges must not run backwards");
    for (let weekday = first; weekday <= last; weekday += 1) {
      rows.push({ weekday, start: assertClockTime(match[3], "start"), end: assertClockTime(match[4], "end") });
    }
  }
  return normalizeWeeklyHours(rows);
}

export function defaultOfficeHours(env = process.env) {
  return parseOfficeHours(env.MS_REALTY_OFFICE_HOURS);
}

export function resetBrokerAvailability(filePath = DEFAULT_BROKER_AVAILABILITY_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readBrokerAvailability(filePath = DEFAULT_BROKER_AVAILABILITY_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function requiredText(value, label, max = 160) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  if (text.length > max) throw new Error(`${label} must be ${max} characters or fewer`);
  return text;
}

function optionalText(value, label, max) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.length > max) throw new Error(`${label} must be ${max} characters or fewer`);
  return text;
}

function assertWindow(window, label) {
  const start = assertClockTime(window?.start, `${label} start`);
  const end = assertClockTime(window?.end, `${label} end`);
  if (clockMinutes(end) <= clockMinutes(start)) throw new Error(`${label} must end after it starts`);
  return { start, end };
}

function assertDisjoint(windows, label) {
  const sorted = [...windows].sort((left, right) => clockMinutes(left.start) - clockMinutes(right.start));
  for (let index = 1; index < sorted.length; index += 1) {
    if (clockMinutes(sorted[index].start) < clockMinutes(sorted[index - 1].end)) {
      throw new Error(`${label} windows must not overlap`);
    }
  }
  return sorted;
}

export function normalizeWeeklyHours(value) {
  const rows = Array.isArray(value) ? value : [];
  if (rows.length > MAX_WEEKLY_WINDOWS) throw new Error(`A weekly pattern must not exceed ${MAX_WEEKLY_WINDOWS} windows`);
  const normalized = rows.map((row, index) => {
    const weekday = Number(row?.weekday);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
      throw new Error(`weekly_hours[${index}].weekday must be 1 (Monday) through 7 (Sunday)`);
    }
    return { weekday, ...assertWindow(row, `weekly_hours[${index}]`) };
  });
  for (let weekday = 1; weekday <= 7; weekday += 1) {
    assertDisjoint(normalized.filter((row) => row.weekday === weekday), `Weekday ${weekday}`);
  }
  return normalized.sort((left, right) => left.weekday - right.weekday || clockMinutes(left.start) - clockMinutes(right.start));
}

export function normalizeExceptions(value) {
  const rows = Array.isArray(value) ? value : [];
  if (rows.length > MAX_EXCEPTIONS) throw new Error(`A broker must not carry more than ${MAX_EXCEPTIONS} dated exceptions`);
  const seen = new Set();
  const normalized = rows.map((row, index) => {
    const date = assertIsoDate(row?.date, `exceptions[${index}].date`);
    if (seen.has(date)) throw new Error(`exceptions must not repeat ${date}`);
    seen.add(date);
    const kind = String(row?.kind || "").trim();
    if (!EXCEPTION_KINDS.has(kind)) throw new Error(`exceptions[${index}].kind must be closed or hours`);
    const reason = optionalText(row?.reason, `exceptions[${index}].reason`, 200);
    if (kind === "closed") return { date, kind, windows: [], reason };
    const windows = Array.isArray(row?.windows) ? row.windows : [];
    if (!windows.length) throw new Error(`exceptions[${index}] with kind hours needs at least one window`);
    return { date, kind, windows: assertDisjoint(windows.map((window, position) => assertWindow(window, `exceptions[${index}].windows[${position}]`)), date), reason };
  });
  return normalized.sort((left, right) => left.date.localeCompare(right.date));
}

export function normalizeBrokerAvailabilityInput(input = {}, { env = process.env } = {}) {
  const brokerId = requiredText(input.brokerId ?? input.broker_id ?? input.broker, "brokerId", 80);
  const actor = requiredText(input.actor, "actor", 80);
  const timezone = assertTimeZone(String(input.timezone || "").trim() || officeTimeZone(env));
  return {
    broker_id: brokerId,
    actor,
    timezone,
    weekly_hours: normalizeWeeklyHours(parseMaybeJson(input.weeklyHours ?? input.weekly_hours)),
    exceptions: normalizeExceptions(parseMaybeJson(input.exceptions)),
    note: optionalText(input.note, "note", 500),
  };
}

// Admin forms post JSON strings; the JSON API posts arrays. Accept both.
function parseMaybeJson(value) {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text) return [];
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("weekly_hours and exceptions must be valid JSON arrays");
  }
}

export function createBrokerAvailability(input, { recordedAt = new Date().toISOString(), env = process.env } = {}) {
  const normalized = normalizeBrokerAvailabilityInput(input, { env });
  if (Number.isNaN(Date.parse(recordedAt))) throw new Error("recordedAt must be an ISO timestamp");
  if (!normalized.weekly_hours.length && !normalized.exceptions.length) {
    throw new Error("Broker availability needs at least one weekly window or one dated exception");
  }
  return { recorded_at: new Date(recordedAt).toISOString(), ...normalized };
}

function sameAvailability(left, right) {
  return (
    left.broker_id === right.broker_id &&
    left.actor === right.actor &&
    left.timezone === right.timezone &&
    (left.note || null) === (right.note || null) &&
    JSON.stringify(left.weekly_hours) === JSON.stringify(right.weekly_hours) &&
    JSON.stringify(left.exceptions) === JSON.stringify(right.exceptions)
  );
}

function nextAvailabilityId(rows, brokerId) {
  let ordinal = rows.filter((row) => row.broker_id === brokerId).length + 1;
  const known = new Set(rows.map((row) => row.id));
  let id = `broker-availability-${brokerId}-${ordinal}`;
  while (known.has(id)) {
    ordinal += 1;
    id = `broker-availability-${brokerId}-${ordinal}`;
  }
  return id;
}

export function appendBrokerAvailability(record, { filePath = DEFAULT_BROKER_AVAILABILITY_LEDGER_PATH } = {}) {
  const rows = readBrokerAvailability(filePath);
  // Re-posting the same week for the same broker is a retry, not a new record.
  const latest = [...rows].reverse().find((row) => row.broker_id === record.broker_id) || null;
  if (latest && sameAvailability(latest, record)) return { ...latest, idempotent: true };
  const persisted = { ...record, id: nextAvailabilityId(rows, record.broker_id) };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(persisted)}\n`);
  return { ...persisted, idempotent: false };
}

export function latestBrokerAvailability(rows, brokerId) {
  return [...(rows || [])].reverse().find((row) => row.broker_id === brokerId) || null;
}

/**
 * The availability the free-slot calculation should use for a broker.
 * Always returns a usable shape; `source` says where it came from.
 */
export function brokerAvailabilityFor(rows, brokerId, { env = process.env, now = null } = {}) {
  const id = requiredText(brokerId, "brokerId", 80);
  const latest = latestBrokerAvailability(rows, id);
  if (latest) {
    return {
      broker_id: id,
      timezone: assertTimeZone(latest.timezone || officeTimeZone(env)),
      weekly_hours: normalizeWeeklyHours(latest.weekly_hours),
      exceptions: dropPastExceptions(normalizeExceptions(latest.exceptions), now),
      source: "broker_recorded",
      recorded_at: latest.recorded_at || null,
      recorded_by: latest.actor || null,
      note: latest.note || null,
    };
  }
  return {
    broker_id: id,
    timezone: officeTimeZone(env),
    weekly_hours: defaultOfficeHours(env),
    exceptions: [],
    source: "office_default",
    recorded_at: null,
    recorded_by: null,
    note: null,
  };
}

function dropPastExceptions(exceptions, now) {
  if (!now) return exceptions;
  const today = String(now).slice(0, 10);
  return exceptions.filter((row) => row.date >= today);
}

export function brokerAvailabilityDirectory(rows, brokerIds, options = {}) {
  return [...new Set(brokerIds)].map((brokerId) => brokerAvailabilityFor(rows, brokerId, options));
}

/**
 * Who may change a broker's hours. A manager (admin role) may change anyone's;
 * a broker may change only their own, and only when the workspace knows which
 * broker they are.
 */
export function canEditBrokerAvailability(principal, brokerId) {
  if (!principal) return false;
  if (principal.roles?.includes("admin")) return true;
  if (!principal.roles?.includes("broker")) return false;
  const operator = String(principal.id || "").trim();
  return Boolean(operator) && operator === String(brokerId || "").trim();
}

export function assertBrokerAvailabilityLedger(rows) {
  const ids = new Set();
  for (const row of rows) {
    if (!row.id || ids.has(row.id)) throw new Error("Broker availability ids must be present and unique");
    ids.add(row.id);
    if (!row.broker_id || !row.actor || !row.recorded_at) throw new Error("Broker availability row is missing audit data");
    if (Number.isNaN(Date.parse(row.recorded_at))) throw new Error("Broker availability recorded_at must be an ISO timestamp");
    assertTimeZone(row.timezone);
    normalizeWeeklyHours(row.weekly_hours);
    normalizeExceptions(row.exceptions);
    if (["contact", "email", "phone", "message", "whatsapp", "viber"].some((field) => field in row)) {
      throw new Error("Broker availability must not contain private contact data");
    }
  }
  return true;
}
