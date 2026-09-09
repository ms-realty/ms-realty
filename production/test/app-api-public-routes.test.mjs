// Production serves the App Router adapter, never the Node server in http.mjs.
// These routes existed only in http.mjs, so in production they answered 405
// while their tests stayed green against the runtime nobody runs. Every
// assertion below drives the adapter the App Router route files call.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { appApiConfigFromEnv, renderAppApiResponse } from "../lib/app-api-adapter.mjs";
import { readAuditLog } from "../lib/audit-log.mjs";
import { readBrokerAvailability, resetBrokerAvailability, appendBrokerAvailability, createBrokerAvailability } from "../lib/broker-availability.mjs";
import { readPublicContacts } from "../lib/public-contact-vault.mjs";
import { readSavedSearches } from "../lib/saved-searches.mjs";
import { savedSearchAccessVerifier } from "../lib/saved-search-access.mjs";
import { readSavedSearchManageEvents } from "../lib/saved-search-manage.mjs";
import { readViewingTripRequests } from "../lib/viewing-trip-requests.mjs";
import { approvedPublicSeedFixtureEnv } from "./approved-public-seed.fixture.mjs";

const SECRET = "app-api-public-routes-manage-secret-00001";
const VAULT_KEY = "app-api-public-routes-vault-key-000000001";
const SAME_ORIGIN = { host: "localhost", origin: "http://localhost", "sec-fetch-site": "same-origin" };

function workspace(overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-app-public-"));
  const at = (name) => path.join(directory, name);
  for (const name of [
    "public-contact-vault.jsonl",
    "saved-searches.jsonl",
    "saved-search-manage-events.jsonl",
    "saved-search-alert-deliveries.jsonl",
    "consent-ledger.jsonl",
    "event-ledger.jsonl",
    "audit-log.jsonl",
    "viewings.jsonl",
    "viewing-follow-ups.jsonl",
    "viewing-trip-requests.jsonl",
  ]) {
    fs.writeFileSync(at(name), "");
  }
  resetBrokerAvailability(at("broker-availability.jsonl"));
  return {
    at,
    config: {
      ...appApiConfigFromEnv({ ...process.env, ...approvedPublicSeedFixtureEnv() }),
      rateLimit: null,
      publicContactVaultPath: at("public-contact-vault.jsonl"),
      publicContactKey: VAULT_KEY,
      savedSearchLedgerPath: at("saved-searches.jsonl"),
      savedSearchManageEventLedgerPath: at("saved-search-manage-events.jsonl"),
      savedSearchAlertDeliveryLedgerPath: at("saved-search-alert-deliveries.jsonl"),
      savedSearchManageSecret: SECRET,
      savedSearchManageLinkTemplate: "/{locale}/alerts",
      savedSearchManageLinkTtlDays: 30,
      savedSearchPublicOrigin: "https://makler-realty.com",
      consentLedgerPath: at("consent-ledger.jsonl"),
      eventLedgerPath: at("event-ledger.jsonl"),
      auditLogPath: at("audit-log.jsonl"),
      brokerAvailabilityLedgerPath: at("broker-availability.jsonl"),
      viewingLedgerPath: at("viewings.jsonl"),
      viewingFollowUpLedgerPath: at("viewing-follow-ups.jsonl"),
      viewingTripLedgerPath: at("viewing-trip-requests.jsonl"),
      brokerAvailabilityAt: "2026-08-23T09:00:00.000Z",
      viewingTripRequestedAt: "2026-08-23T09:00:00.000Z",
      savedAt: "2026-08-01T09:00:00.000Z",
      receivedAt: "2026-08-01T09:00:00.000Z",
      savedSearchManagedAt: "2026-08-02T09:00:00.000Z",
      ...overrides,
    },
  };
}

function get(url, config, headers = {}) {
  return renderAppApiResponse(new Request(`http://localhost${url}`, { headers }), { config });
}

function post(url, body, config) {
  return renderAppApiResponse(
    new Request(`http://localhost${url}`, {
      method: "POST",
      headers: { ...SAME_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { config },
  );
}

async function saveSearch(config, overrides = {}) {
  const response = await post(
    "/api/saved-searches",
    {
      locale: "en",
      query: "Sandanski",
      filters: { property_type: "apartment" },
      contact: { name: "Elena Petrova", email: "elena.petrova@example.test", phone: "+359 888 111 222" },
      contactPreference: "email",
      alertConsent: true,
      alertFrequency: "weekly",
      ...overrides,
    },
    config,
  );
  return { response, body: await response.json() };
}

test("the public adapter answers the purchase-fee estimate instead of 405", async () => {
  const { config } = workspace();

  const estimate = await get("/api/purchase-fees/estimate?price_eur=120000&municipality=Sandanski&buyer=eu", config);
  const body = await estimate.json();
  // The shipped table is deliberately unapproved, so this is the refusal that
  // names the blocking lines — never a 405 and never a guessed total.
  assert.equal([200, 409].includes(estimate.status), true);
  assert.equal(body.kind, "purchase_fee_estimate");

  const badScope = await get("/api/purchase-fees/estimate?price_eur=1000&buyer=uk", config);
  assert.equal(badScope.status, 400);
  assert.equal((await badScope.json()).kind, "bad_request");

  const badPrice = await get("/api/purchase-fees/estimate?price_eur=abc", config);
  assert.equal(badPrice.status, 400);
});

test("the public adapter mints a manage link when a search is saved", async () => {
  const { config, at } = workspace();

  const { response, body } = await saveSearch(config);
  assert.equal(response.status, 201);
  assert.equal(body.manage_unavailable_reason, null);
  assert.equal(body.manage.path, `/en/alerts?token=${encodeURIComponent(body.manage.token)}`);
  assert.equal(body.manage.url, `https://makler-realty.com${body.manage.path}`);
  assert.equal(body.manage.expires_at, "2026-08-31T09:00:00.000Z");
  // The link carries no personal data.
  for (const value of ["elena", "petrova", "example.test", "359"]) {
    assert.equal(body.manage.url.toLowerCase().includes(value), false);
  }

  // Only the derived verifier is stored; the raw token never reaches a ledger.
  const stored = readSavedSearches(at("saved-searches.jsonl"));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].manage_access.verifier, savedSearchAccessVerifier(body.manage.token));
  assert.equal(stored[0].manage_access.token, undefined);
  assert.equal(fs.readFileSync(at("saved-searches.jsonl"), "utf8").includes(body.manage.token), false);
});

test("the public adapter serves the saved-search manage route in both directions", async () => {
  const { config, at } = workspace();
  const { body: created } = await saveSearch(config);
  const token = created.manage.token;

  const read = await get(`/api/saved-searches/manage?token=${encodeURIComponent(token)}`, config);
  const readBody = await read.json();
  assert.equal(read.status, 200);
  assert.equal(read.headers.get("cache-control"), "no-store");
  assert.equal(readBody.kind, "saved_search_manage");
  assert.equal(readBody.saved_search.id, created.id);
  assert.equal(readBody.saved_search.status, "active");
  // Masked echoes only, never the stored values.
  assert.equal(readBody.contact.channels.email, "e••••••@e••••••.test");
  assert.equal(JSON.stringify(readBody).includes("elena.petrova@example.test"), false);

  const paused = await post("/api/saved-searches/manage", { token, action: "pause" }, config);
  const pausedBody = await paused.json();
  assert.equal(paused.status, 200);
  assert.equal(pausedBody.action, "pause");
  assert.equal(pausedBody.idempotent, false);
  assert.equal(pausedBody.saved_search.status, "paused");

  // A repeat of the same change is idempotent, not a second ledger row.
  const again = await post("/api/saved-searches/manage", { token, action: "pause" }, config);
  assert.equal((await again.json()).idempotent, true);
  assert.equal(readSavedSearchManageEvents(at("saved-search-manage-events.jsonl")).length, 1);

  const retuned = await post("/api/saved-searches/manage", { token, action: "update_frequency", frequency: "daily" }, config);
  assert.equal((await retuned.json()).saved_search.alert_frequency, "daily");

  // A channel the visitor never supplied is refused by name.
  const badChannel = await post("/api/saved-searches/manage", { token, action: "update_channel", channel: "viber" }, config);
  assert.equal(badChannel.status, 400);
  assert.match((await badChannel.json()).message, /contact channels supplied/);

  // Every change is audited against the capability link, not an operator.
  const audit = readAuditLog(at("audit-log.jsonl"));
  assert.deepEqual(
    audit.map((row) => row.action),
    ["saved_search_paused", "saved_search_frequency_updated"],
  );
  assert.equal(audit.every((row) => row.actor === "saved_search_link"), true);

  const deleted = await post("/api/saved-searches/manage", { token, action: "delete" }, config);
  assert.equal((await deleted.json()).deleted, true);
  // The tombstone invalidates the link: the same token now reads as unknown.
  const afterDelete = await get(`/api/saved-searches/manage?token=${encodeURIComponent(token)}`, config);
  assert.equal(afterDelete.status, 404);
  assert.equal((await afterDelete.json()).kind, "saved_search_link_invalid");
});

test("a forged manage token is refused exactly like an unknown one", async () => {
  const { config } = workspace();
  const { body: created } = await saveSearch(config);
  const [version, id, expiry] = created.manage.token.split(".");

  for (const token of ["", "not-a-token", `${version}.${id}.${expiry}.${Buffer.from("nope").toString("base64url")}`]) {
    const refused = await get(`/api/saved-searches/manage?token=${encodeURIComponent(token)}`, config);
    assert.equal(refused.status, 404, token);
    assert.equal((await refused.json()).kind, "saved_search_link_invalid", token);
  }

  const wrongMethod = await renderAppApiResponse(
    new Request("http://localhost/api/saved-searches/manage", { method: "DELETE", headers: SAME_ORIGIN }),
    { config },
  );
  assert.equal(wrongMethod.status, 405);
});

test("the public adapter offers a listing broker's free slots and never books", async () => {
  const { config, at } = workspace();
  appendBrokerAvailability(
    createBrokerAvailability(
      {
        brokerId: "broker_en",
        actor: "operations_lead",
        timezone: "Europe/Sofia",
        weeklyHours: [{ weekday: 1, start: "09:00", end: "13:00" }],
      },
      { recordedAt: "2026-08-23T09:00:00.000Z" },
    ),
    { filePath: at("broker-availability.jsonl") },
  );
  assert.equal(readBrokerAvailability(at("broker-availability.jsonl")).length, 1);

  const slots = await get("/api/viewing-slots?listing=MS-00865&locale=en", config);
  const body = await slots.json();
  assert.equal(slots.status, 200);
  assert.equal(body.kind, "viewing_slots");
  assert.equal(body.listing_reference, "MS-00865");
  assert.equal(body.locale, "en");
  // Software never commits the agency to a time.
  assert.equal(body.confirmation, "human_required");
  assert.equal(Array.isArray(body.slots), true);
  assert.equal(typeof body.timezone, "string");

  // No published listing, no slots — and never a guessed broker.
  const unknown = await get("/api/viewing-slots?listing=MS-NOT-A-LISTING", config);
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).kind, "listing_not_found");

  const missing = await get("/api/viewing-slots", config);
  assert.equal(missing.status, 400);

  const wrongMethod = await post("/api/viewing-slots", {}, config);
  assert.equal(wrongMethod.status, 405);
});

test("the public adapter records a viewing trip as a request a human confirms", async () => {
  const { config, at } = workspace();

  const created = await post(
    "/api/viewing-trips",
    {
      locale: "en",
      arrivalDate: "2026-10-05",
      departureDate: "2026-10-08",
      areas: ["Sandanski"],
      partySize: 2,
      contact: { name: "Trip Visitor", phone: "+31612345678" },
      contact_preference: "phone",
    },
    config,
  );
  const body = await created.json();
  assert.equal(created.status, 201);
  assert.equal(body.status, "requested");
  assert.equal(body.confirmation, "human_required");
  assert.equal(body.nights, 3);
  assert.equal(body.contact, undefined, "the ledger keeps no raw contact");

  assert.equal(readViewingTripRequests(at("viewing-trip-requests.jsonl")).length, 1);
  const vault = readPublicContacts(at("public-contact-vault.jsonl"), VAULT_KEY, "viewing_trip");
  assert.equal(vault.get(body.id).contact.phone, "+31612345678");

  // Neither an area nor a shortlisted property is a refusal that names it.
  const withoutScope = await post(
    "/api/viewing-trips",
    {
      locale: "en",
      arrivalDate: "2026-10-05",
      departureDate: "2026-10-08",
      contact: { name: "Trip Visitor", phone: "+31612345678" },
    },
    config,
  );
  assert.equal(withoutScope.status, 400);
  assert.match((await withoutScope.json()).message, /at least one area or one shortlisted property/);

  const wrongMethod = await get("/api/viewing-trips", config);
  assert.equal(wrongMethod.status, 405);
});
