import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { hermesReplyAvailability } from "../lib/hermes-availability.mjs";
import {
  LEAD_CHANNELS,
  buildChannelAttribution,
  leadChannelForSource,
  normalizeFirstTouchPath,
  normalizeLeadAttribution,
  normalizeLeadChannel,
} from "../lib/lead-attribution.mjs";
import { buildOperationsReport } from "../lib/operations-report.mjs";
import { readLeadLedger, resetLeadLedger } from "../lib/lead-ledger.mjs";
import { PUBLIC_APP_JS } from "../lib/ui/client.mjs";
import { renderReactAdminBody } from "../lib/react-admin-site.mjs";
import { renderAdminLeadsPayload } from "../lib/admin-payloads.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { approvedPublicSeedFixture } from "./approved-public-seed.fixture.mjs";

// Enquiries carry a source. They now also carry the surface family (channel)
// and the site path where the visit started, so a report can answer which
// channel converts. Neither field identifies a visitor, and neither is ever
// placed in a URL.

const SAME_ORIGIN = Object.freeze({ host: "localhost", origin: "http://localhost", "sec-fetch-site": "same-origin" });
const registry = loadLocaleRegistry();

function tempFile(prefix) {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-${prefix}-`)}/${prefix}.jsonl`;
  fs.writeFileSync(file, "");
  return file;
}

test("a channel is one of a closed list, defaulted from the source contract", () => {
  assert.equal(leadChannelForSource("website_listing_detail"), "listing_detail");
  assert.equal(leadChannelForSource("website_seller_valuation"), "seller_page");
  assert.equal(leadChannelForSource("broker_phone"), "broker_direct");
  assert.equal(leadChannelForSource("something_new"), "unknown");
  assert.equal(normalizeLeadChannel("", "website_search_result"), "search_results");
  assert.equal(normalizeLeadChannel("Home", "website_listing_detail"), "home");
  assert.throws(() => normalizeLeadChannel("paid_facebook_retargeting", "website_listing_detail"), /channel must be one of/);
  assert.ok(LEAD_CHANNELS.includes("unknown"));
});

test("a first-touch path keeps the route and drops everything that could identify a visitor", () => {
  // A query string is where campaign and visitor ids live, so it never lands.
  assert.equal(normalizeFirstTouchPath("/en/properties?utm_source=x&visitor=42"), "/en/properties");
  assert.equal(normalizeFirstTouchPath("/en/properties/MS-CRAWL-0001#gallery"), "/en/properties/MS-CRAWL-0001");
  assert.equal(normalizeFirstTouchPath("/bg/"), "/bg");
  assert.equal(normalizeFirstTouchPath("/"), "/");
  assert.equal(normalizeFirstTouchPath(""), null);
  assert.equal(normalizeFirstTouchPath(undefined), null);
  for (const bad of ["https://tracker.example/hit", "//tracker.example/hit", "en/properties", "/en/../../etc/passwd", `/${"x".repeat(250)}`]) {
    assert.throws(() => normalizeFirstTouchPath(bad), /firstTouchPath/, bad);
  }
  assert.deepEqual(normalizeLeadAttribution({ channel: "guide", firstTouchPath: "/en/guides/foreign-buyers?ref=z" }, "website_listing_detail"), {
    channel: "guide",
    first_touch_path: "/en/guides/foreign-buyers",
  });
});

test("a public enquiry stores its channel and entry path, and refuses invented ones", async () => {
  const leadLedgerPath = tempFile("attribution-leads");
  const leadContactVaultPath = tempFile("attribution-contacts");
  resetLeadLedger(leadLedgerPath);
  const app = createHttpApp({
    seed: approvedPublicSeedFixture(),
    leadDurableStore: { leadDurableStoreEnabled: false },
    payloadListingEnv: {},
    leadLedgerPath,
    leadContactVaultPath,
    leadContactKey: "attribution-test-contact-key-32-characters",
    consentLedgerPath: tempFile("attribution-consents"),
    receivedAt: "2026-07-04T00:00:00.000Z",
  });
  const submit = (body) =>
    dispatchHttp(app, {
      url: "/api/leads",
      method: "POST",
      headers: { ...SAME_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const accepted = await submit({
    source: "website_contact_callback",
    leadType: "general",
    language: "en",
    channel: "contact_page",
    firstTouchPath: "/en/properties?utm_source=leak&visitor=42",
    contact: { name: "Test Person", phone: "+359888123456" },
    message: "Please call me back.",
  });
  assert.equal(accepted.status, 201);
  assert.equal(accepted.body.lead.channel, "contact_page");
  assert.equal(accepted.body.lead.first_touch_path, "/en/properties");

  const stored = readLeadLedger(leadLedgerPath).at(-1);
  assert.equal(stored.channel, "contact_page");
  assert.equal(stored.first_touch_path, "/en/properties");
  // The ledger still holds no raw contact data.
  assert.equal("contact" in stored || "phone" in stored, false);

  const badChannel = await submit({
    source: "website_contact_callback",
    leadType: "general",
    language: "en",
    channel: "paid_facebook_retargeting",
    contact: { name: "Test Person", phone: "+359888123456" },
    message: "x",
  });
  assert.equal(badChannel.status, 400);
  assert.match(badChannel.body.message, /channel must be one of/);

  const badPath = await submit({
    source: "website_contact_callback",
    leadType: "general",
    language: "en",
    firstTouchPath: "https://tracker.example/hit",
    contact: { name: "Test Person", phone: "+359888123456" },
    message: "x",
  });
  assert.equal(badPath.status, 400);
  assert.match(badPath.body.message, /site relative path/);

  // A submission that declares nothing still gets the source's own channel.
  const defaulted = await submit({
    source: "website_contact_callback",
    leadType: "general",
    language: "en",
    contact: { name: "Test Person", phone: "+359888654321" },
    message: "x",
  });
  assert.equal(defaulted.status, 201);
  assert.equal(defaulted.body.lead.channel, "contact_page");
  assert.equal(defaulted.body.lead.first_touch_path, null);
});

test("the public client fills attribution from the page, never from the address bar", () => {
  assert.match(PUBLIC_APP_JS, /function firstTouchPath\(\)/);
  assert.match(PUBLIC_APP_JS, /function leadChannel\(\)/);
  // The stored path is stripped of query and fragment before it is kept.
  assert.match(PUBLIC_APP_JS, /var path = raw\.split\("#"\)\[0\]\.split\("\?"\)\[0\];/);
  assert.match(PUBLIC_APP_JS, /if \(action === "\/api\/leads" \|\| isEnquiry\) applyLeadAttribution\(form\);/);
});

test("the operations report aggregates which channel converts", () => {
  const leads = [
    { lead_id: "l1", source: "website_listing_detail", channel: "listing_detail", first_touch_path: "/en/properties", lead_type: "buyer", original_language: "en", received_at: "2026-07-04T00:00:00Z", sla_due_at: "2026-07-04T00:15:00Z", manager_escalation_due_at: "2026-07-04T01:00:00Z" },
    { lead_id: "l2", source: "website_search_result", channel: "search_results", first_touch_path: "/en/properties", lead_type: "buyer", original_language: "en", received_at: "2026-07-04T00:00:00Z", sla_due_at: "2026-07-04T00:15:00Z", manager_escalation_due_at: "2026-07-04T01:00:00Z" },
    { lead_id: "l3", source: "website_seller_valuation", lead_type: "seller", original_language: "bg", received_at: "2026-07-04T00:00:00Z", sla_due_at: "2026-07-04T00:15:00Z", manager_escalation_due_at: "2026-07-04T01:00:00Z" },
  ];
  const attribution = buildChannelAttribution(leads, {
    deliveryStates: [{ lead_id: "l1", status: "sent" }],
    viewings: [{ lead_id: "l1" }],
    deals: [{ lead_id: "l1" }],
  });
  const listing = attribution.rows.find((row) => row.channel === "listing_detail");
  assert.equal(listing.leads, 1);
  assert.equal(listing.replies_sent, 1);
  assert.equal(listing.closed_deals, 1);
  assert.equal(listing.deal_conversion_pct, 100);
  // A lead that predates the field is still counted, under its source's channel.
  assert.equal(attribution.rows.find((row) => row.channel === "seller_page").leads, 1);
  assert.equal(attribution.attributed_leads, 2);
  assert.deepEqual(attribution.entry_paths, [{ path: "/en/properties", leads: 2 }]);

  const report = buildOperationsReport({ leads, deals: [{ lead_id: "l1" }], generatedAt: "2026-07-05T00:00:00.000Z" });
  assert.equal(report.channel_attribution.rows.reduce((sum, row) => sum + row.leads, 0), report.summary.leads);
  assert.deepEqual(
    report.lead_volume.by_channel.map((row) => row.key).sort(),
    ["listing_detail", "search_results", "seller_page"],
  );
  // Attribution carries no customer values, so the privacy assertion still holds.
  assert.equal(report.privacy.raw_contacts_included, false);
});

test("Hermes availability is derived from configuration, never from a probe request", () => {
  const configured = { HERMES_PROVIDER_MODE: "self_hosted", HERMES_CHAT_COMPLETIONS_URL: "https://hermes.internal/v1/chat/completions", HERMES_API_KEY: "test-key" };
  const available = hermesReplyAvailability({ env: configured, fetchImpl: () => {} });
  assert.equal(available.available, true);
  assert.equal(available.reason_key, "available");
  assert.deepEqual(available.missing, []);

  const missing = hermesReplyAvailability({ env: {}, fetchImpl: () => {} });
  assert.equal(missing.available, false);
  assert.equal(missing.reason_key, "not_configured");
  assert.deepEqual(missing.missing, ["HERMES_CHAT_COMPLETIONS_URL", "HERMES_API_KEY"]);
  // The reason names the variables, never their values.
  assert.match(missing.reason, /HERMES_CHAT_COMPLETIONS_URL, HERMES_API_KEY/);
  assert.doesNotMatch(missing.reason, /test-key/);

  assert.equal(hermesReplyAvailability({ env: { ...configured, HERMES_PROVIDER_MODE: "openrouter" } }).reason_key, "provider_mode_unsupported");
  assert.equal(hermesReplyAvailability({ env: { ...configured, HERMES_PROVIDER_MODE: "wat" } }).reason_key, "provider_mode_invalid");
  assert.equal(hermesReplyAvailability({ env: { ...configured, HERMES_CHAT_COMPLETIONS_URL: "https://hermes.internal/v1/other" } }).reason_key, "endpoint_invalid");
  assert.equal(hermesReplyAvailability({ env: configured, fetchImpl: null }).reason_key, "fetch_unavailable");
  // An injected provider is a configured provider.
  assert.equal(hermesReplyAvailability({ env: {}, provider: async () => ({}) }).available, true);
});

test("the admin lead payload carries Hermes availability, and the button renders from it", async () => {
  const app = createHttpApp({ leadDurableStore: { leadDurableStoreEnabled: false }, reviewedAt: "2026-07-19T12:00:00.000Z", hermesEnv: {} });
  const payload = await dispatchHttp(app, { url: "/api/admin/leads?locale=en", headers: { authorization: "Bearer local-admin-smoke" } });
  assert.equal(payload.status, 200);
  assert.equal(payload.body.hermes.available, false);
  assert.equal(payload.body.hermes.reason_key, "not_configured");

  const unavailable = renderReactAdminBody(payload.body);
  // The composer already knows on first paint, before any draft request.
  assert.match(unavailable, /data-hermes-state="unavailable"/);
  assert.match(unavailable, /data-hermes-reason="not_configured"/);
  assert.match(unavailable, /Hermes is not configured in this environment\. Missing: HERMES_CHAT_COMPLETIONS_URL, HERMES_API_KEY\./);

  const ready = renderReactAdminBody({ ...payload.body, hermes: { available: true, reason_key: "available", reason: "ok", missing: [] } });
  assert.doesNotMatch(ready, /data-hermes-state="unavailable"/);
  assert.match(ready, /data-hermes-draft-request="true"/);
});

test("the payload builder passes Hermes state through to the rendered inbox", () => {
  const payload = renderAdminLeadsPayload(registry, "en", {
    leads: [],
    replies: [],
    communicationThreads: [],
    communicationTemplates: {},
    languageRequests: [],
    translationTasks: [],
    listingEdits: [],
    viewings: [],
    savedSearches: [],
    sellerPipeline: [],
    deals: [],
    brokerContacts: [],
    hermes: { available: false, reason_key: "not_configured", reason: "Hermes is not configured in this environment.", missing: [] },
  });
  assert.equal(payload.hermes.available, false);
  assert.equal(payload.summary.leadsSnoozed, 0);
});
