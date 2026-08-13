import assert from "node:assert/strict";
import test from "node:test";
import {
  VIEWING_COLLECTION,
  ViewingConflictError,
  persistViewingDurably,
  recordViewingCalendarSync,
  readViewingsDurably,
  viewingSemanticHash,
} from "../lib/viewing-durable-store.mjs";

function viewing(overrides = {}) {
  return {
    id: "viewing-lead-durable",
    lead_id: "lead-durable",
    listing_reference: "MS-DURABLE-1",
    original_language: "bg",
    admin_locale: "en",
    broker: "broker-bg",
    starts_at: "2026-08-15T10:00:00.000Z",
    booked_at: "2026-08-13T16:00:00.000Z",
    channel: "property_viewing",
    status: "booked",
    follow_up_task: { id: "task-lead-durable", owner: "broker-bg", status: "open", due_at: "2026-08-15T11:00:00.000Z" },
    feedback_request: {
      id: "feedback-lead-durable",
      owner: "broker-bg",
      status: "open",
      due_at: "2026-08-15T12:00:00.000Z",
      channel: "email",
    },
    ...overrides,
  };
}

function fakePayload({ raceOnCreate = false } = {}) {
  const rows = [];
  const calls = [];
  let raced = false;
  return {
    rows,
    calls,
    async find(input) {
      calls.push(input);
      const [field, condition] = Object.entries(input.where || {})[0] || [];
      return { docs: field ? rows.filter((row) => row[field] === condition.equals).slice(0, input.limit || rows.length) : rows };
    },
    async create(input) {
      calls.push(input);
      const row = { id: rows.length + 1, ...input.data };
      rows.push(row);
      if (raceOnCreate && !raced) {
        raced = true;
        throw new Error("unique constraint race");
      }
      return row;
    },
    async update(input) {
      calls.push(input);
      const index = rows.findIndex((row) => row.id === input.id);
      rows[index] = { ...rows[index], ...input.data };
      return rows[index];
    },
  };
}

test("durable viewings are private, idempotent, race-safe, and reject reused ids", async () => {
  for (const operation of ["create", "read", "update", "delete"]) {
    assert.equal(VIEWING_COLLECTION.access[operation]({}), false);
  }
  assert.equal(VIEWING_COLLECTION.fields.some((field) => field.type === "json"), false);

  const payload = fakePayload();
  const row = viewing({ contact: { email: "must-not-persist@example.invalid" } });
  const first = await persistViewingDurably(row, { payload });
  assert.equal(first.idempotent, false);
  assert.equal(first.durable, true);
  assert.equal(JSON.stringify(payload.rows).includes("must-not-persist"), false);
  assert.equal(payload.calls.every((call) => call.overrideAccess === true), true);

  const replay = await persistViewingDurably(viewing({ id: "client-retry-id" }), { payload });
  assert.equal(replay.id, row.id);
  assert.equal(replay.idempotent, true);
  assert.equal(payload.rows.length, 1);
  assert.equal(viewingSemanticHash(row), viewingSemanticHash(viewing({ id: "ignored-id", booked_at: "2026-08-13T17:00:00.000Z" })));

  await assert.rejects(
    () => persistViewingDurably(viewing({ starts_at: "2026-08-16T10:00:00.000Z" }), { payload }),
    (error) => error instanceof ViewingConflictError && error.code === "viewing_conflict" && error.status === 409,
  );
  assert.deepEqual(await readViewingsDurably({ payload }), [viewing()]);

  const receipt = await recordViewingCalendarSync(
    row.id,
    { status: "synced", calendar_event_id: "calendar-event-1" },
    { payload, recordedAt: "2026-08-13T18:00:00.000Z" },
  );
  assert.equal(receipt.calendar_event_id, "calendar-event-1");
  const [withCalendar] = await readViewingsDurably({ payload });
  assert.deepEqual(withCalendar.calendar_sync, {
    status: "synced",
    provider: "google",
    calendar_event_id: "calendar-event-1",
    recorded_at: "2026-08-13T18:00:00.000Z",
  });

  const racedPayload = fakePayload({ raceOnCreate: true });
  const raced = await persistViewingDurably(viewing(), { payload: racedPayload });
  assert.equal(raced.idempotent, true);
  assert.equal(racedPayload.rows.length, 1);
});
