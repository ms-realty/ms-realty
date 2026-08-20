import assert from "node:assert/strict";
import test from "node:test";
import { createEvent } from "../lib/events.mjs";
import { appApiConfigFromEnv, renderAppApiResponse } from "../lib/app-api-adapter.mjs";
import {
  EventStoreUnavailableError,
  eventDurableStoreConfigFromEnv,
  isEventDurableStoreEnabled,
  persistEventDurably,
  readEventsDurably,
} from "../lib/event-durable-store.mjs";

function fakePayload() {
  const rows = [];
  return {
    rows,
    async create({ collection, data }) {
      assert.equal(collection, "funnel_events");
      const row = { id: rows.length + 1, ...data };
      rows.push(row);
      return row;
    },
    async find({ collection }) {
      assert.equal(collection, "funnel_events");
      return { docs: rows };
    },
  };
}

test("durable funnel events reuse the configured Payload runtime and preserve privacy-safe fields", async () => {
  const payload = fakePayload();
  const event = createEvent(
    {
      type: "cta_click",
      path: "/en/properties/MS-CRAWL-0001",
      locale: "en",
      listingReference: "MS-CRAWL-0001",
      action: "request_viewing",
    },
    "2026-08-13T10:00:00.000Z",
  );

  const stored = await persistEventDurably(event, { payload });
  assert.match(stored.event_id, /^[0-9a-f-]{36}$/);
  assert.equal(stored.durable, true);
  assert.equal(payload.rows.length, 1);
  assert.equal(JSON.stringify(payload.rows).includes("email"), false);

  const readback = await readEventsDurably({ payload });
  assert.deepEqual(readback, [event]);
});

test("durable event configuration shares the already-approved durable runtime boundary", () => {
  const complete = eventDurableStoreConfigFromEnv({
    MS_REALTY_EVENT_DURABLE_STORE_ENABLED: "true",
    PAYLOAD_SECRET: "p".repeat(32),
    DATABASE_URL: "postgres://payload:secret@db.example.test/ms_realty",
  });
  assert.equal(isEventDurableStoreEnabled(complete), true);
  assert.equal(isEventDurableStoreEnabled({ ...complete, databaseUrl: "" }), false);
  assert.equal(isEventDurableStoreEnabled({ ...complete, eventDurableStoreEnabled: false }), false);
});

test("durable event reads and writes fail closed when Payload is unavailable", async () => {
  const payload = {
    async create() {
      throw new Error("database unavailable");
    },
    async find() {
      throw new Error("database unavailable");
    },
  };
  const event = createEvent({ type: "page_view", path: "/bg/", locale: "bg" });

  await assert.rejects(() => persistEventDurably(event, { payload }), EventStoreUnavailableError);
  await assert.rejects(() => readEventsDurably({ payload }), EventStoreUnavailableError);
});

test("public event API writes durably and rejects incomplete durable configuration", async () => {
  const payload = fakePayload();
  const config = appApiConfigFromEnv({
    NODE_ENV: "production",
    MS_REALTY_EVENT_DURABLE_STORE_ENABLED: "true",
    MS_REALTY_RUNTIME_DATA_AUTHORITY: "payload",
    PAYLOAD_SECRET: "p".repeat(32),
    DATABASE_URL: "postgres://payload:secret@db.example.test/ms_realty",
    MS_REALTY_RATE_LIMIT_DISABLED: "true",
  });
  config.eventDurablePayload = payload;
  const request = () => new Request("https://example.test/api/events", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://example.test" },
    body: JSON.stringify({ type: "page_view", path: "/en/", locale: "en" }),
  });

  const response = await renderAppApiResponse(request(), { config });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).durable, true);
  assert.equal(payload.rows.length, 1);

  const unavailable = await renderAppApiResponse(request(), {
    config: { ...config, eventDurableStore: { ...config.eventDurableStore, databaseUrl: "" } },
  });
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).kind, "event_store_unavailable");
});
