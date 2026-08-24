import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import {
  assertBrokerAvailabilityLedger,
  brokerAvailabilityFor,
  canEditBrokerAvailability,
  readBrokerAvailability,
  resetBrokerAvailability,
} from "../lib/broker-availability.mjs";
import { assertViewingTripRequests, readViewingTripRequests, resetViewingTripRequests } from "../lib/viewing-trip-requests.mjs";
import { readAuditLog, resetAuditLog } from "../lib/audit-log.mjs";
import { readPublicContacts } from "../lib/public-contact-vault.mjs";
import { readConsentLedger, resetConsentLedger } from "../lib/consent-ledger.mjs";
import { resetPublicRequestOutcomes } from "../lib/public-request-outcomes.mjs";
import { approvedPublicSeedFixtureOptions } from "./approved-public-seed.fixture.mjs";

const ADMIN = { authorization: "Bearer local-admin-smoke" };
const SAME_ORIGIN = { host: "localhost", origin: "http://localhost", "sec-fetch-site": "same-origin" };
const PUBLIC_CONTACT_KEY = "b5-public-contact-key-at-least-32-bytes";

function workspace() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-b5-"));
  const at = (name) => path.join(directory, name);
  resetBrokerAvailability(at("broker-availability.jsonl"));
  resetViewingTripRequests(at("viewing-trip-requests.jsonl"));
  resetAuditLog(at("audit-log.jsonl"));
  resetConsentLedger(at("consent-ledger.jsonl"));
  resetPublicRequestOutcomes(at("public-request-outcomes.jsonl"));
  fs.writeFileSync(at("viewings.jsonl"), "");
  fs.writeFileSync(at("viewing-follow-ups.jsonl"), "");
  fs.writeFileSync(at("public-contact-vault.jsonl"), "");
  return {
    directory,
    at,
    options: {
      ...approvedPublicSeedFixtureOptions(),
      brokerAvailabilityLedgerPath: at("broker-availability.jsonl"),
      viewingTripLedgerPath: at("viewing-trip-requests.jsonl"),
      viewingLedgerPath: at("viewings.jsonl"),
      viewingFollowUpLedgerPath: at("viewing-follow-ups.jsonl"),
      auditLogPath: at("audit-log.jsonl"),
      consentLedgerPath: at("consent-ledger.jsonl"),
      publicRequestOutcomeLedgerPath: at("public-request-outcomes.jsonl"),
      publicContactVaultPath: at("public-contact-vault.jsonl"),
      publicContactKey: PUBLIC_CONTACT_KEY,
      brokerAvailabilityAt: "2026-08-23T09:00:00.000Z",
      viewingTripRequestedAt: "2026-08-23T09:00:00.000Z",
      receivedAt: "2026-08-23T09:00:00.000Z",
    },
  };
}

const WEEKLY_HOURS = [
  { weekday: 1, start: "09:00", end: "13:00" },
  { weekday: 1, start: "14:00", end: "18:00" },
  { weekday: 2, start: "09:00", end: "17:00" },
];

test("admin availability records a broker week, refuses bad input, and audits the change", async () => {
  const space = workspace();
  const app = createHttpApp(space.options);

  const empty = await dispatchHttp(app, { url: "/api/admin/availability", headers: ADMIN });
  assert.equal(empty.status, 200);
  assert.equal(empty.body.kind, "admin_broker_availability");
  assert.equal(empty.body.timezone, "Europe/Sofia");
  // A broker with nothing recorded falls back to the documented office week,
  // and the payload says so rather than passing it off as their own diary.
  assert.deepEqual(
    empty.body.brokers.map((broker) => broker.source),
    ["office_default", "office_default", "office_default"],
  );

  const body = {
    brokerId: "broker_bg",
    actor: "operations_lead",
    weeklyHours: WEEKLY_HOURS,
    exceptions: [
      { date: "2026-08-27", kind: "closed", reason: "public holiday" },
      { date: "2026-08-28", kind: "hours", windows: [{ start: "14:00", end: "18:00" }], reason: "blocked morning" },
    ],
    note: "Sandanski office",
  };
  const created = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/availability",
    headers: { ...ADMIN, ...SAME_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.availability.broker_id, "broker_bg");
  assert.equal(created.body.resolved.source, "broker_recorded");
  assert.equal(created.body.availability.exceptions.length, 2);

  // A retried submission of the same week is the same record, not a second one.
  const retry = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/availability",
    headers: { ...ADMIN, ...SAME_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.availability.id, created.body.availability.id);
  assert.equal(readBrokerAvailability(space.at("broker-availability.jsonl")).length, 1);
  assertBrokerAvailabilityLedger(readBrokerAvailability(space.at("broker-availability.jsonl")));

  const audits = readAuditLog(space.at("audit-log.jsonl")).filter((row) => row.action === "broker_availability_updated");
  assert.equal(audits.length, 1, "one audit entry for one real change");
  assert.equal(audits[0].object_id, created.body.availability.id);
  assert.equal(audits[0].metadata.broker_id, "broker_bg");

  for (const invalid of [
    { brokerId: "broker_bg", actor: "operations_lead", weeklyHours: [{ weekday: 9, start: "09:00", end: "10:00" }] },
    { brokerId: "broker_bg", actor: "operations_lead", weeklyHours: [{ weekday: 1, start: "18:00", end: "09:00" }] },
    { brokerId: "broker_bg", actor: "operations_lead", weeklyHours: [{ weekday: 1, start: "09:00", end: "12:00" }, { weekday: 1, start: "11:00", end: "14:00" }] },
    { brokerId: "broker_bg", actor: "operations_lead", weeklyHours: [], exceptions: [] },
    { brokerId: "", actor: "operations_lead", weeklyHours: WEEKLY_HOURS },
  ]) {
    const refused = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/availability",
      headers: { ...ADMIN, ...SAME_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify(invalid),
    });
    assert.equal(refused.status, 400, `refuses ${JSON.stringify(invalid)}`);
    assert.equal(refused.body.kind, "bad_request");
  }
  assert.equal(readBrokerAvailability(space.at("broker-availability.jsonl")).length, 1, "a refusal writes nothing");
});

test("availability needs the write capability, and a broker may only set their own hours", async () => {
  const space = workspace();
  const app = createHttpApp(space.options);

  const anonymous = await dispatchHttp(app, { url: "/api/admin/availability" });
  assert.equal(anonymous.status, 401);
  const anonymousWrite = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/availability",
    headers: { ...SAME_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({ brokerId: "broker_bg", actor: "operations_lead", weeklyHours: WEEKLY_HOURS }),
  });
  assert.equal(anonymousWrite.status, 401);

  // The capability table has to carry the new paths, or a broker cannot reach
  // their own hours and every other role could reach everyone's.
  const { requiredAdminCapability } = await import("../lib/admin-auth.mjs");
  assert.equal(requiredAdminCapability("GET", "/api/admin/availability"), "operations:read");
  assert.equal(requiredAdminCapability("POST", "/api/admin/availability"), "operations:write");
  assert.equal(requiredAdminCapability("GET", "/api/admin/viewings/week"), "operations:read");

  const manager = { id: "operations_lead", roles: ["admin"] };
  const broker = { id: "broker_bg", roles: ["broker"] };
  const translator = { id: "translator_de", roles: ["translator"] };
  assert.equal(canEditBrokerAvailability(manager, "broker_ru"), true, "a manager may set anyone's hours");
  assert.equal(canEditBrokerAvailability(broker, "broker_bg"), true, "a broker may set their own");
  assert.equal(canEditBrokerAvailability(broker, "broker_ru"), false, "a broker may not set another's");
  assert.equal(canEditBrokerAvailability(translator, "translator_de"), false);
  assert.equal(canEditBrokerAvailability(null, "broker_bg"), false);
});

test("the admin week view carries days, slots, viewings and the follow-ups due", async () => {
  const space = workspace();
  fs.writeFileSync(
    space.at("viewings.jsonl"),
    [
      {
        id: "viewing-week-1",
        lead_id: "lead-week-1",
        listing_reference: "MS-CRAWL-0001",
        original_language: "en",
        admin_locale: "en",
        broker: "broker_bg",
        starts_at: "2026-08-25T07:00:00.000Z",
        booked_at: "2026-08-21T09:00:00.000Z",
        channel: "property_viewing",
        status: "booked",
        follow_up_task: { id: "task-week-1", owner: "broker_bg", status: "open", due_at: "2026-08-25T07:00:00.000Z" },
        feedback_request: { id: "feedback-week-1", owner: "broker_bg", status: "open", due_at: "2026-08-25T09:00:00.000Z", channel: "whatsapp" },
      },
    ]
      .map((row) => JSON.stringify(row))
      .join("\n") + "\n",
  );
  const app = createHttpApp(space.options);
  await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/availability",
    headers: { ...ADMIN, ...SAME_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({
      brokerId: "broker_bg",
      actor: "operations_lead",
      weeklyHours: WEEKLY_HOURS,
      exceptions: [{ date: "2026-08-27", kind: "closed", reason: "public holiday" }],
    }),
  });

  const response = await dispatchHttp(app, { url: "/api/admin/viewings/week?week=2026-08-24", headers: ADMIN });
  assert.equal(response.status, 200);
  const week = response.body.week;
  assert.equal(week.week_start, "2026-08-24");
  assert.equal(week.week_end, "2026-08-30");
  assert.equal(week.timezone, "Europe/Sofia");
  assert.equal(week.days.length, 7);
  assert.equal(week.previous_week, "2026-08-17");
  assert.equal(week.next_week, "2026-08-31");

  const tuesday = week.days.find((day) => day.date === "2026-08-25");
  assert.equal(tuesday.viewings.length, 1);
  assert.equal(tuesday.viewings[0].local_start, "10:00", "the instant is shown in the office time zone");
  assert.equal(tuesday.follow_ups_due.length, 2, "the follow-up and the feedback request both fall due");
  assert.ok(tuesday.open_slots > 0);

  const holiday = week.days.find((day) => day.date === "2026-08-27");
  assert.ok(holiday.closed_brokers.includes("broker_bg"), "the dated exception closes the day");

  const brokerWeek = week.brokers.find((row) => row.broker_id === "broker_bg");
  assert.equal(brokerWeek.availability_source, "broker_recorded");
  assert.equal(brokerWeek.days.find((day) => day.date === "2026-08-27").reason, "public holiday");
  assert.equal(week.summary.viewings, 1);
  assert.equal(week.summary.follow_ups_due, 2);
  assert.ok(week.summary.brokers_without_availability >= 1, "brokers still on the office default are counted");

  // The viewings screen carries the same payload, so the week view has its data.
  const screen = await dispatchHttp(app, { url: "/api/admin/viewings?view=week&week=2026-08-24", headers: ADMIN });
  assert.equal(screen.status, 200);
  assert.equal(screen.body.viewingLayout, "week");
  assert.equal(screen.body.viewingWeek.week_start, "2026-08-24");
  const listScreen = await dispatchHttp(app, { url: "/api/admin/viewings", headers: ADMIN });
  assert.equal(listScreen.body.viewingLayout, "list", "the list stays the default");
});

test("the public slot route offers a listing broker's real free slots and never books", async () => {
  const space = workspace();
  const app = createHttpApp(space.options);
  await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/availability",
    headers: { ...ADMIN, ...SAME_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({ brokerId: "broker_bg", actor: "operations_lead", weeklyHours: WEEKLY_HOURS }),
  });

  const slots = await dispatchHttp(app, {
    url: "/api/viewing-slots?listing=MS-CRAWL-0001&locale=bg&from=2026-08-25&to=2026-08-25&limit=50",
  });
  assert.equal(slots.status, 200);
  assert.equal(slots.body.kind, "viewing_slots");
  assert.equal(slots.body.broker_id, "broker_bg");
  assert.equal(slots.body.availability_source, "broker_recorded");
  // The route hands out times to ask for. It never creates a viewing.
  assert.equal(slots.body.confirmation, "human_required");
  assert.equal(slots.body.timezone, "Europe/Sofia");
  assert.ok(slots.body.slots.length > 0);
  assert.equal(slots.body.slots[0].local_start, "09:00");
  assert.equal(slots.body.slots[0].starts_at, "2026-08-25T06:00:00.000Z", "09:00 Sofia in August is 06:00 UTC");
  assert.equal(fs.readFileSync(space.at("viewings.jsonl"), "utf8"), "", "asking for slots books nothing");

  // Fail closed on a listing the public catalogue does not carry.
  const unknown = await dispatchHttp(app, { url: "/api/viewing-slots?listing=NOT-A-LISTING" });
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.kind, "listing_not_found");
  const missing = await dispatchHttp(app, { url: "/api/viewing-slots" });
  assert.equal(missing.status, 400);
  const wrongMethod = await dispatchHttp(app, {
    method: "POST",
    url: "/api/viewing-slots",
    headers: { ...SAME_ORIGIN, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(wrongMethod.status, 405);
});

test("a booked viewing disappears from the slots the public route offers", async () => {
  const space = workspace();
  fs.writeFileSync(
    space.at("viewings.jsonl"),
    JSON.stringify({
      id: "viewing-taken",
      lead_id: "lead-taken",
      listing_reference: "MS-CRAWL-0002",
      original_language: "bg",
      admin_locale: "bg",
      broker: "broker_bg",
      starts_at: "2026-08-25T06:00:00.000Z",
      booked_at: "2026-08-21T09:00:00.000Z",
      channel: "property_viewing",
      status: "booked",
      follow_up_task: { id: "task-taken", owner: "broker_bg", status: "open", due_at: "2026-08-25T06:00:00.000Z" },
      feedback_request: { id: "feedback-taken", owner: "broker_bg", status: "open", due_at: "2026-08-25T08:00:00.000Z", channel: "phone" },
    }) + "\n",
  );
  const app = createHttpApp(space.options);
  await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/availability",
    headers: { ...ADMIN, ...SAME_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({ brokerId: "broker_bg", actor: "operations_lead", weeklyHours: WEEKLY_HOURS }),
  });

  const slots = await dispatchHttp(app, {
    url: "/api/viewing-slots?listing=MS-CRAWL-0001&locale=bg&from=2026-08-25&to=2026-08-25&limit=50",
  });
  const offered = slots.body.slots.map((slot) => slot.local_start);
  assert.ok(!offered.includes("09:00"), "the booked hour is gone");
  assert.ok(!offered.includes("09:30"), "so is every start that would overlap it");
  assert.ok(offered.includes("10:00"), "the hour after it is still free");
});

test("a viewing trip is a request that reaches the admin queue with its own vocabulary", async () => {
  const space = workspace();
  const app = createHttpApp(space.options);
  const submission = {
    locale: "en",
    arrivalDate: "2026-10-05",
    departureDate: "2026-10-08",
    areas: ["Sandanski", "Petrich"],
    listingReferences: ["MS-CRAWL-0001", "MS-CRAWL-0002"],
    partySize: 2,
    note: "Flying in on the Monday.",
    contact: { name: "Trip Visitor", phone: "+31612345678" },
    contact_preference: "phone",
    idempotencyKey: "trip-retry-1",
  };
  const created = await dispatchHttp(app, {
    method: "POST",
    url: "/api/viewing-trips",
    headers: { ...SAME_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(submission),
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.status, "requested");
  assert.equal(created.body.confirmation, "human_required", "software never commits the agency to a date");
  assert.equal(created.body.nights, 3);
  assert.deepEqual(created.body.areas, ["Sandanski", "Petrich"]);
  assert.equal(created.body.contact, undefined, "the ledger keeps no raw contact");
  assert.equal(created.body.contact_available, true);

  const ledger = readViewingTripRequests(space.at("viewing-trip-requests.jsonl"));
  assert.equal(ledger.length, 1);
  assertViewingTripRequests(ledger);
  const vault = readPublicContacts(space.at("public-contact-vault.jsonl"), PUBLIC_CONTACT_KEY, "viewing_trip");
  assert.equal(vault.get(created.body.id).contact.phone, "+31612345678", "the contact went to the vault");
  const consents = readConsentLedger(space.at("consent-ledger.jsonl"));
  assert.equal(consents.at(-1).consent_type, "viewing_trip_request");

  const retry = await dispatchHttp(app, {
    method: "POST",
    url: "/api/viewing-trips",
    headers: { ...SAME_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(submission),
  });
  assert.equal(retry.status, 201);
  assert.equal(retry.body.ledger.id, created.body.id, "a retry replays the first request");
  assert.equal(readViewingTripRequests(space.at("viewing-trip-requests.jsonl")).length, 1);

  for (const invalid of [
    { ...submission, idempotencyKey: null, arrivalDate: "2026-10-09", departureDate: "2026-10-08" },
    { ...submission, idempotencyKey: null, arrivalDate: "2020-01-01", departureDate: "2020-01-03" },
    { ...submission, idempotencyKey: null, areas: [], listingReferences: [] },
    { ...submission, idempotencyKey: null, contact: { name: "No Channel" } },
    { ...submission, idempotencyKey: null, partySize: 99 },
  ]) {
    const refused = await dispatchHttp(app, {
      method: "POST",
      url: "/api/viewing-trips",
      headers: { ...SAME_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify(invalid),
    });
    assert.equal(refused.status, 400, `refuses ${JSON.stringify(invalid).slice(0, 80)}`);
  }
  assert.equal(readViewingTripRequests(space.at("viewing-trip-requests.jsonl")).length, 1);

  const queue = await dispatchHttp(app, { url: "/api/admin/requests", headers: ADMIN });
  assert.equal(queue.status, 200);
  const row = queue.body.publicRequestQueue.rows.find((entry) => entry.request_type === "viewing_trip");
  assert.ok(row, "the trip lands in the same queue as the other public requests");
  assert.equal(row.request_id, created.body.id);
  assert.equal(row.trip.arrival_date, "2026-10-05");
  assert.deepEqual(row.trip.listing_references, ["MS-CRAWL-0001", "MS-CRAWL-0002"]);
  assert.equal(queue.body.publicRequestQueue.summary.viewing_trip_open, 1);

  // Its own outcome vocabulary: the saved-search verbs do not apply.
  const wrongVerb = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/public-requests/outcome",
    headers: { ...ADMIN, ...SAME_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({ requestType: "viewing_trip", requestId: created.body.id, actor: "operations_lead", action: "complete", note: "done" }),
  });
  assert.equal(wrongVerb.status, 400);
  assert.match(wrongVerb.body.message, /itinerary_drafted/);

  const drafted = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/public-requests/outcome",
    headers: { ...ADMIN, ...SAME_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({
      requestType: "viewing_trip",
      requestId: created.body.id,
      actor: "operations_lead",
      action: "itinerary_drafted",
      note: "Three mornings around Sandanski.",
    }),
  });
  assert.equal(drafted.status, 201);
  assert.equal(drafted.body.request.status, "itinerary_drafted");

  const completed = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/public-requests/outcome",
    headers: { ...ADMIN, ...SAME_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({
      requestType: "viewing_trip",
      requestId: created.body.id,
      actor: "operations_lead",
      action: "trip_completed",
      note: "Trip ran, two offers to follow.",
    }),
  });
  assert.equal(completed.status, 201);
  assert.equal(completed.body.request.status, "completed");
  assert.equal(completed.body.request.next_follow_up_at, null);
});

test("the office default is documented, overridable, and never claims a broker's own diary", () => {
  const fallback = brokerAvailabilityFor([], "broker_ru", { env: {} });
  assert.equal(fallback.source, "office_default");
  assert.equal(fallback.recorded_by, null);

  const custom = brokerAvailabilityFor([], "broker_ru", {
    env: { MS_REALTY_OFFICE_TIMEZONE: "Europe/Berlin", MS_REALTY_OFFICE_HOURS: "1-4:10:00-16:00,6:10:00-13:00" },
  });
  assert.equal(custom.timezone, "Europe/Berlin");
  assert.deepEqual(custom.weekly_hours, [
    { weekday: 1, start: "10:00", end: "16:00" },
    { weekday: 2, start: "10:00", end: "16:00" },
    { weekday: 3, start: "10:00", end: "16:00" },
    { weekday: 4, start: "10:00", end: "16:00" },
    { weekday: 6, start: "10:00", end: "13:00" },
  ]);
  assert.throws(() => brokerAvailabilityFor([], "broker_ru", { env: { MS_REALTY_OFFICE_HOURS: "nonsense" } }), /1-5:09:00-18:00/);
  assert.throws(() => brokerAvailabilityFor([], "broker_ru", { env: { MS_REALTY_OFFICE_TIMEZONE: "Mars/Olympus" } }), /IANA/);
});
