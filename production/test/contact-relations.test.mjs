// A contact's record shows what the person is connected to - their enquiries,
// the properties those name, their viewings and their deals - each one click
// from the related record, read only from the operator's own enquiries.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { contactRelations, withContactRelations } from "../lib/contact-relations.mjs";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { LEAD_OPERATIONS } from "../lib/lead-ops-durable-store.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { createPayloadDraftRuntime } from "./payload-draft-runtime.fixture.mjs";

const seed = loadCmsSeed();

test("relations are the contact's own enquiries, viewings and deals, and the properties they name", async () => {
  const contact = { id: "contact-a", lead_ids: ["lead-1", "lead-2"] };
  const leads = [
    { lead_id: "lead-1", received_at: "2026-09-01T10:00:00Z", lead_type: "buyer", listing_reference: "MS-00815" },
    { lead_id: "lead-2", received_at: "2026-09-10T10:00:00Z", lead_type: "buyer", listing_reference: " Near the park " },
    { lead_id: "lead-other", received_at: "2026-09-12T10:00:00Z", listing_reference: "MS-00907" },
  ];
  const viewings = [
    { id: "v-old", lead_id: "lead-1", listing_reference: "MS-00815", starts_at: "2026-09-05T10:00:00Z", status: "completed" },
    { id: "v-new", lead_id: "lead-1", listing_reference: "MS-00922", starts_at: "2026-09-20T10:00:00Z", status: "booked" },
    { id: "v-foreign", lead_id: "lead-other", listing_reference: "MS-00907", starts_at: "2026-09-21T10:00:00Z" },
  ];
  const deals = [{ id: "deal-lead-2", lead_id: "lead-2", closed_at: "2026-09-15T10:00:00Z", status: "closed", listing_reference: "MS-00815" }];
  const [withAll] = await withContactRelations([contact], {
    leads,
    loadViewings: async () => viewings,
    loadDeals: async () => deals,
    loadListings: async () => [{ id: "MS-00815" }, { id: "MS-00922" }],
  });
  const relations = withAll.relations;
  assert.deepEqual(relations.enquiries.map((row) => row.id), ["lead-2", "lead-1"]);
  assert.equal(relations.enquiries[0].listing_reference, "Near the park");
  assert.deepEqual(relations.viewings.map((row) => row.id), ["v-new", "v-old"], "another contact's viewing stays out");
  assert.deepEqual(relations.deals.map((row) => row.id), ["deal-lead-2"]);
  // Newest mention first; a typed reference that is not a listing is not "known".
  assert.deepEqual(relations.listings, [
    { id: "MS-00922", known: true },
    { id: "MS-00815", known: true },
    { id: "Near the park", known: false },
  ]);
  assert.equal(relations.listing_count, 3);
  assert.deepEqual(
    Object.fromEntries(Object.entries(relations.sources).map(([key, value]) => [key, value.status])),
    { enquiries: "read", viewings: "read", deals: "read" },
  );

  // A source that fails, or that nobody may read here, is unavailable - not empty.
  const [broken] = await withContactRelations([contact], {
    leads,
    loadViewings: async () => { throw new Error("viewing store offline"); },
    loadDeals: null,
    loadListings: async () => { throw new Error("listing store offline"); },
  });
  assert.equal(broken.relations.sources.viewings.status, "unavailable");
  assert.equal(broken.relations.viewing_count, null);
  assert.equal(broken.relations.sources.deals.status, "unavailable");
  assert.equal(broken.relations.deal_count, null);
  // Nobody could check which references are listings, so none is claimed either way.
  assert.deepEqual(broken.relations.listings, [{ id: "Near the park", known: null }, { id: "MS-00815", known: null }]);

  // Read but empty is a different fact.
  const empty = contactRelations(contact, { leadIndex: new Map(), viewingIndex: new Map(), dealIndex: new Map() });
  assert.equal(empty.viewing_count, 0);
  assert.equal(empty.sources.viewings.status, "read");
});

function durableConfig(directory, overrides = {}) {
  const principal = { id: "broker-contacts", roles: ["broker"], workspace_ids: ["sandanski"], source: "payload_session", can_mutate: true };
  const store = {
    payloadSecret: "payload-secret-for-test",
    databaseUrl: "postgres://test.invalid/ms_realty",
    contactSecret: "lead-contact-secret-longer-than-thirty-two-characters",
    workspaceId: "sandanski",
  };
  const dealLedgerPath = path.join(directory, "deals.jsonl");
  fs.writeFileSync(dealLedgerPath, `${JSON.stringify({ id: "deal-own", lead_id: "lead-own", closed_at: "2026-09-18T10:00:00.000Z", status: "closed", listing_reference: "MS-00815" })}\n`);
  return {
    ...appAdminConfigFromEnv({ NODE_ENV: "test" }),
    seed,
    dealLedgerPath,
    replyOutboxPath: path.join(directory, "reply-outbox.jsonl"),
    replyDeliveryOutcomeLedgerPath: path.join(directory, "reply-outcomes.jsonl"),
    accountLedgerPath: path.join(directory, "accounts.jsonl"),
    leadAssignmentLedgerPath: path.join(directory, "assignments.jsonl"),
    payloadAdminAuth: { async resolve() { return { principal, user: { id: 7, roles: ["broker"] } }; } },
    leadDurableStore: { ...store, leadDurableStoreEnabled: true },
    viewingDurableStore: { ...store, viewingDurableStoreEnabled: true },
    readLeadIntakesDurably: async ({ admin, workspaceIds }) => {
      assert.equal(admin, false);
      assert.deepEqual(workspaceIds, ["sandanski"]);
      const person = { contact: { name: "Kalina Petrova", email: "k@example.test" }, contact_fingerprint: "kalina-fingerprint-0001" };
      return [
        { lead_id: "lead-own", ...person, lead_type: "buyer", listing_reference: "MS-00815", received_at: "2026-09-15T10:00:00Z" },
        { lead_id: "lead-own-typed", ...person, lead_type: "buyer", listing_reference: "Somewhere by the river", received_at: "2026-09-16T08:00:00Z" },
      ];
    },
    readViewingsDurably: async () => [
      { id: "viewing-own", lead_id: "lead-own", broker: "broker-contacts", listing_reference: "MS-00815", starts_at: "2026-09-20T10:00:00Z", status: "booked" },
      { id: "viewing-foreign", lead_id: "somebody-elses-lead", broker: "someone", contact_name: "Hidden Person", listing_reference: "MS-00815", starts_at: "2026-09-21T10:00:00Z" },
    ],
    ...overrides,
  };
}

async function contactPages(config) {
  const headers = { cookie: "ms_admin=contacts-fixture", accept: "text/html" };
  const url = "/admin/contacts?locale=en";
  return [
    ["standalone", String((await dispatchHttp(createHttpApp(config), { url, headers })).body)],
    ["next-adapter", await (await renderAppAdminResponse(new Request(`https://example.test${url}`, { headers }), { config })).text()],
  ];
}

test("both runtimes put a broker's own related records on the contact, each one click away", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "msr-contact-relations-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const [runtime, html] of await contactPages(durableConfig(directory))) {
    assert.match(html, /data-contact-relations="contact-kalina-fingerpri"/, runtime);
    assert.match(html, /data-contact-lead="lead-own-typed"[^>]*><a href="\/admin\/leads\?locale=en#lead-lead-own-typed">/, runtime);
    assert.match(html, /data-contact-lead="lead-own"[^>]*><a href="\/admin\/leads\?locale=en#lead-lead-own">/, runtime);
    assert.match(html, /data-contact-viewing="viewing-own"[^>]*><a href="\/admin\/viewings#viewing-viewing-own">/, runtime);
    assert.doesNotMatch(html, /viewing-foreign|Hidden Person/, `${runtime}: another broker's viewing stays out`);
    // The deal opens the enquiry it closed.
    assert.match(html, /data-contact-deal="deal-own"[^>]*><a href="\/admin\/leads\?locale=en#lead-lead-own">/, runtime);
    // A real listing opens its record; a typed place that is not a listing does not.
    assert.match(html, /<a href="\/admin\/listings\/edit\?listingId=MS-00815" data-contact-listing="MS-00815">MS-00815<\/a>/, runtime);
    assert.match(html, /<span data-contact-listing="Somewhere by the river">Somewhere by the river<\/span>/, runtime);
    assert.doesNotMatch(html, /data-contact-relation-unavailable=/, runtime);
  }
});

test("a Payload-only runtime shows contacts from the durable stores and nothing from disk", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "msr-contact-relations-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const base = durableConfig(directory);
  // What a disk that is not the authority might still hold.
  fs.writeFileSync(base.dealLedgerPath, `${JSON.stringify({ id: "deal-from-disk", lead_id: "lead-own", closed_at: "2026-09-18T10:00:00.000Z", status: "closed" })}\n`);
  fs.writeFileSync(base.replyOutboxPath, `${JSON.stringify({ id: "reply-from-disk", lead_id: "lead-own", body: "Disk-only reply text", created_at: "2026-09-15T11:00:00.000Z" })}\n`);
  fs.writeFileSync(base.accountLedgerPath, `${JSON.stringify({ action: "account_created", id: "account-from-disk", label: "Disk Family", type: "family", recorded_at: "2026-09-15T11:00:00.000Z" })}\n`);
  const operations = [];
  const config = {
    ...base,
    runtimeDataDurableOnly: true,
    payloadListingRuntime: createPayloadDraftRuntime(seed).payload,
    leadOperationsDurableStore: {
      leadOperationsDurableStoreEnabled: true,
      payloadSecret: "payload-secret-for-test-0123456789",
      databaseUrl: "postgres://test.invalid/ms_realty",
      workspaceId: "sandanski",
    },
    readLeadOperationsDurably: async ({ operation, workspaceId }) => {
      operations.push(operation);
      assert.equal(workspaceId, "sandanski");
      if (operation === LEAD_OPERATIONS.deal) {
        return [
          { id: "deal-durable", lead_id: "lead-own", actor: "broker-contacts", closed_at: "2026-09-19T10:00:00.000Z", recorded_at: "2026-09-19T10:00:00.000Z" },
          { id: "deal-foreign", lead_id: "somebody-elses-lead", actor: "someone", closed_at: "2026-09-19T11:00:00.000Z", recorded_at: "2026-09-19T11:00:00.000Z" },
        ];
      }
      return [];
    },
  };
  for (const [runtime, html] of await contactPages(config)) {
    assert.match(html, /<main[^>]*data-kind="admin-contacts"/, `${runtime}: contacts are not refused`);
    assert.match(html, /data-contact-relations="contact-kalina-fingerpri"/, runtime);
    assert.match(html, /data-contact-deal="deal-durable"[^>]*><a href="\/admin\/leads\?locale=en#lead-lead-own">/, runtime);
    assert.match(html, /data-contact-viewing="viewing-own"/, runtime);
    assert.match(html, /<a href="\/admin\/listings\/edit\?listingId=MS-00815" data-contact-listing="MS-00815">/, runtime);
    assert.doesNotMatch(html, /deal-from-disk|deal-foreign|Disk-only reply text|Disk Family|account-from-disk/, `${runtime}: nothing is read from disk`);
    // Threads and accounts have no durable home yet, and the page says so.
    assert.match(html, /data-unavailable-data="communicationThreads,accounts"/, runtime);
    assert.match(html, /data-contact-thread-unavailable="true"/, runtime);
    assert.match(html, /data-contact-accounts-unavailable="true"/, runtime);
    assert.doesNotMatch(html, /data-account-create=|data-daily-tags="(with|no)_account"/, `${runtime}: no account claims or forms`);
  }
  assert.ok(operations.includes(LEAD_OPERATIONS.assignment), "assignments come from the durable store");
  assert.ok(operations.includes(LEAD_OPERATIONS.deal), "deals come from the durable store");
});

test("a viewing store that cannot be read is reported on the contact, and the contact still shows", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "msr-contact-relations-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const config = durableConfig(directory, { readViewingsDurably: async () => { throw new Error("viewing store offline"); } });
  for (const [runtime, html] of await contactPages(config)) {
    assert.match(html, /data-contact-lead="lead-own"/, runtime);
    assert.match(html, /data-contact-relation-unavailable="viewings"/, runtime);
    assert.doesNotMatch(html, /data-contact-relation-empty="viewings"/, runtime);
  }
});
