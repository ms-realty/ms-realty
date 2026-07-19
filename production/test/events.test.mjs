import test from "node:test";
import assert from "node:assert/strict";
import { assertEventLedger, createEvent } from "../lib/events.mjs";

test("analytics events keep routing fields and reject contact payloads", () => {
  const event = createEvent(
    {
      type: "search",
      path: "/api/search",
      locale: "he",
      query: "Sandanski +359 88 123 456",
      filters: { property_type: "apartment" },
      sort: "price_desc",
      page: 2,
    },
    "2026-07-05T00:00:00Z",
  );

  assert.equal(event.query.includes("[redacted-phone]"), true);
  assert.equal(event.filters.property_type, "apartment");
  assert.equal(event.sort, "price_desc");
  assert.equal(event.page, 2);
  assert.equal(assertEventLedger([event]), true);
  assert.throws(() => createEvent({ type: "hermes_chat", path: "/api/hermes/chat", locale: "he", query: "Sandanski" }), /Unsupported analytics event type/);
  assert.throws(
    () => createEvent({ type: "cta_click", path: "/he/contact", locale: "he", action: "callback", contact: { name: "Noa" } }),
    /must not include contact/,
  );
  assert.throws(() => createEvent({ type: "cta_click", path: "/he/contact", locale: "he" }), /require an action/);
});
