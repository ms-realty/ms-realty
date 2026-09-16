import test from "node:test";
import assert from "node:assert/strict";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { ADMIN_SEARCH_MIN_QUERY, searchAdminRecords, searchAuthorizedAdminRecords } from "../lib/admin-record-search.mjs";
import { renderAppAdminResponse, appAdminConfigFromEnv } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";

const seed = loadCmsSeed();
const listings = seed.records.filter((record) => record.collection === "listings");

test("one entry finds a record by its reference, its name and its place", () => {
  const listing = listings.find((record) => (record.facts || {}).location);
  const byId = searchAdminRecords({ query: listing.id, listings });
  assert.equal(byId.results[0].type, "listing");
  assert.equal(byId.results[0].id, listing.id);
  // The result carries what a person needs to recognise it and a way in.
  assert.equal(byId.results[0].href, `/admin/listings/edit?listingId=${listing.id}`);
  assert.ok(byId.results[0].title);
  const byPlace = searchAdminRecords({ query: listing.facts.location, listings });
  assert.ok(byPlace.results.some((row) => row.id === listing.id));
});

// An identifier beats a passing mention: someone who types a reference wants
// that record, not every listing whose text happens to contain it.
test("an exact identifier outranks a mention", () => {
  const listing = listings[0];
  const ranked = searchAdminRecords({
    query: listing.id,
    listings,
    leads: [{ id: "lead-1", contact_name: "Someone", message: `asked about ${listing.id}` }],
  });
  assert.equal(ranked.results[0].type, "listing");
  assert.equal(ranked.results[0].id, listing.id);
  assert.ok(ranked.results.some((row) => row.type === "lead"));
});

test("every term has to land, so unrelated words do not widen the search", () => {
  const listing = listings.find((record) => (record.facts || {}).location);
  const both = searchAdminRecords({ query: `${listing.id} ${listing.facts.location}`, listings });
  assert.ok(both.results.some((row) => row.id === listing.id));
  assert.equal(searchAdminRecords({ query: `${listing.id} zzzznotaword`, listings }).results.length, 0);
});

test("accents and case do not decide whether a Bulgarian place is found", () => {
  const listing = listings.find((record) => /[А-Яа-я]/.test((record.facts || {}).location || ""));
  if (!listing) return;
  const locality = listing.facts.location;
  const folded = locality.normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase();
  assert.ok(searchAdminRecords({ query: folded, listings }).results.some((row) => row.id === listing.id));
});

// A source the caller could not read is not the same as a source with no
// matches. Reporting it as searched would let an operator conclude there are no
// enquiries about a property when enquiries were never looked at.
test("sources the caller could not read are reported, not silently dropped", () => {
  const partial = searchAdminRecords({ query: listings[0].id, listings });
  assert.equal(partial.sources.listing.status, "searched");
  assert.equal(partial.sources.lead.status, "unavailable");
  assert.equal(partial.sources.lead.reason_key, "lead_store_unavailable");
  assert.equal(partial.sources.contact.status, "unavailable");
  assert.equal(partial.sources.viewing.status, "unavailable");
  const full = searchAdminRecords({ query: listings[0].id, listings, leads: [], contacts: [], viewings: [] });
  for (const type of ["listing", "lead", "contact", "viewing"]) {
    assert.equal(full.sources[type].status, "searched", type);
  }
});

test("a query too short to mean anything returns nothing and says so", () => {
  const short = searchAdminRecords({ query: "a", listings });
  assert.equal(short.too_short, true);
  assert.deepEqual(short.results, []);
  assert.equal(ADMIN_SEARCH_MIN_QUERY, 2);
  assert.equal(searchAdminRecords({ query: "   ", listings }).too_short, true);
});

test("people, enquiries and viewings come back as their own kinds", () => {
  const found = searchAdminRecords({
    query: "kalina",
    listings: [],
    leads: [{ id: "lead-9", contact_name: "Kalina Petrova", email: "kalina@example.test", status: "new" }],
    contacts: [{ id: "contact-9", name: "Kalina Petrova", phone: "+359000000" }],
    viewings: [{ id: "viewing-9", listing_id: "MS-00815", contact_name: "Kalina Petrova", status: "scheduled" }],
  });
  assert.deepEqual(
    [...new Set(found.results.map((row) => row.type))].sort(),
    ["contact", "lead", "viewing"],
  );
  for (const row of found.results) assert.ok(row.href.startsWith("/admin/"), row.type);
});

// The entry and the screen, end to end through the real dispatchers. The API
// on its own was a route nothing linked to.
test("every screen carries the search entry and the results page answers in four honest states", async () => {
  const { createHttpApp, dispatchHttp } = await import("../lib/http.mjs");
  const app = createHttpApp({ reviewedAt: "2026-07-19T12:00:00.000Z" });
  const headers = { authorization: "Bearer local-admin-smoke", accept: "text/html" };
  const state = (html) => (html.match(/data-search-state="([a-z_]+)"/) || [])[1];

  // The entry is part of the shell, not of one screen.
  for (const path of ["/admin/listings?locale=en", "/admin/leads?locale=en", "/admin/search?locale=en"]) {
    const page = await dispatchHttp(app, { url: path, headers });
    assert.match(page.body, /<form class="crm-top__search" role="search" method="get"/, path);
    assert.match(page.body, /data-admin-search-input="true"/, path);
  }

  // Empty is an invitation, one character is too short, a miss is a miss, and
  // a hit links to the canonical record.
  for (const [query, want] of [["", "prompt"], ["a", "too_short"], ["zzzznotaword", "empty"], ["MS-00815", "results"]]) {
    const page = await dispatchHttp(app, { url: `/admin/search?q=${encodeURIComponent(query)}&locale=en`, headers });
    assert.equal(page.status, 200, query);
    assert.equal(state(page.body), want, query);
  }
  const hit = await dispatchHttp(app, { url: "/admin/search?q=MS-00815&locale=en", headers });
  assert.match(hit.body, /href="\/admin\/listings\/edit\?listingId=MS-00815"/);
  assert.match(hit.body, /data-search-result="listing"/);
  // Local stores are now wired for every source; they must not be reported as
  // unavailable just because they contain no matching records.
  assert.doesNotMatch(hit.body, /data-search-unavailable=/);

  // Signed out, search is not a way around the front door.
  const closed = await dispatchHttp(app, { url: "/admin/search?q=MS-00815", headers: { accept: "text/html" } });
  assert.equal(closed.status === 401 || closed.status === 303, true);
});

test("the suggestion list is an enhancement, never the only way to search", async () => {
  const { ADMIN_APP_JS } = await import("../lib/ui/client.mjs");
  assert.match(ADMIN_APP_JS, /function initAdminSearchEntry\(\)/);
  // It reads the same route the page uses, and abandons a request rather than
  // racing it when the operator keeps typing.
  assert.match(ADMIN_APP_JS, /\/api\/admin\/search\?q="/);
  assert.match(ADMIN_APP_JS, /inflight\.abort\(\)/);
  assert.match(ADMIN_APP_JS, /requestVersion/);
  // Keyboard reach: arrows move, Escape closes, Enter opens the highlighted row.
  for (const key of ["ArrowDown", "ArrowUp", "Escape", "Enter"]) {
    assert.ok(ADMIN_APP_JS.includes(`"${key}"`), key);
  }
});

test("search applies every result source's capability in both admin runtimes", async () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, MS_REALTY_ADMIN_TOKEN: process.env.MS_REALTY_ADMIN_TOKEN, MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON };
  const credentials = JSON.stringify([
    { id: "search-agent", token: "search-agent-token-0123456789", roles: ["agent"] },
    { id: "search-editor", token: "search-editor-token-0123456789", roles: ["editor"] },
  ]);
  try {
    process.env.NODE_ENV = "production";
    delete process.env.MS_REALTY_ADMIN_TOKEN;
    process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = credentials;
    const agentHeaders = { authorization: "Bearer search-agent-token-0123456789", accept: "application/json" };
    const editorHeaders = { authorization: "Bearer search-editor-token-0123456789", accept: "application/json" };
    const app = createHttpApp({ reviewedAt: "2026-07-19T12:00:00.000Z" });
    const denied = await dispatchHttp(app, { url: "/api/admin/search?q=MS-00815", headers: agentHeaders });
    assert.equal(denied.status, 200);
    assert.equal(denied.body.results.some((row) => row.id === "MS-00815"), false);
    assert.equal(denied.body.sources.listing.status, "unavailable");
    const allowed = await dispatchHttp(app, { url: "/api/admin/search?q=MS-00815", headers: editorHeaders });
    assert.equal(allowed.body.results.some((row) => row.id === "MS-00815"), true);

    const authEnv = { NODE_ENV: "production", MS_REALTY_ADMIN_CREDENTIALS_JSON: credentials };
    const adapterDenied = await renderAppAdminResponse(new Request("https://example.test/api/admin/search?q=MS-00815", { headers: agentHeaders }), {
      config: { ...appAdminConfigFromEnv({ NODE_ENV: "test" }), authEnv },
    });
    const adapterDeniedBody = await adapterDenied.json();
    assert.equal(adapterDeniedBody.results.some((row) => row.id === "MS-00815"), false);
    assert.equal(adapterDeniedBody.sources.listing.status, "unavailable");
    // The same suggestions route still answers an operator who may read content.
    const adapterAllowed = await renderAppAdminResponse(new Request("https://example.test/api/admin/search?q=MS-00815", { headers: editorHeaders }), {
      config: { ...appAdminConfigFromEnv({ NODE_ENV: "test" }), authEnv },
    });
    const adapterAllowedBody = await adapterAllowed.json();
    assert.equal(adapterAllowedBody.results.some((row) => row.id === "MS-00815"), true);
    assert.equal(adapterAllowedBody.sources.listing.status, "searched");
    // A draft title is content: the denied body must not carry it in any field.
    const draftTitle = listings.find((record) => record.id === "MS-00815").facts.title;
    assert.equal(JSON.stringify(denied.body).includes(draftTitle), false);
    assert.equal(JSON.stringify(adapterDeniedBody).includes(draftTitle), false);
    for (const headers of [agentHeaders, editorHeaders]) {
      const expected = headers === editorHeaders;
      const nodePage = await dispatchHttp(app, { url: "/admin/search?q=MS-00815", headers: { ...headers, accept: "text/html" } });
      assert.equal(nodePage.status, 200);
      assert.equal(nodePage.body.includes('data-search-result="listing"'), expected);
      const nextPage = await renderAppAdminResponse(new Request("https://example.test/admin/search?q=MS-00815", { headers: { ...headers, accept: "text/html" } }), {
        config: { ...appAdminConfigFromEnv({ NODE_ENV: "test" }), authEnv },
      });
      assert.equal(nextPage.status, 200);
      assert.equal((await nextPage.text()).includes('data-search-result="listing"'), expected);
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("restricted sources are never loaded, including on short searches", async () => {
  const forbidden = () => { assert.fail("forbidden source was read"); };
  for (const query of ["MS-00815", ""]) {
    const result = await searchAuthorizedAdminRecords({ query, principal: { id: "agent", roles: ["agent"] }, loadListings: forbidden, loadLeads: forbidden, loadViewings: forbidden });
    assert.deepEqual(result.results, []);
    assert.equal(Object.values(result.sources).every(source => source.status === "unavailable"), true);
  }
});

test("real enquiry and contact shapes are searchable and unavailable sources do not erase available results", async () => {
  const leads = [{ lead_id: "lead-kalina", contact: { name: "Kalina Petrova", email: "kalina@example.test" }, listing_reference: "MS-00815", received_at: "2026-09-15T10:00:00Z" }];
  const result = await searchAuthorizedAdminRecords({
    query: "kalina", principal: { id: "broker", roles: ["broker"] },
    loadListings: async () => { throw new Error("Store offline"); },
    loadLeads: async () => leads,
    loadViewings: async visible => {
      assert.deepEqual(visible, leads);
      return [{ id: "viewing-kalina", lead_id: "lead-kalina", listing_reference: "MS-00815", contact_name: "Kalina Petrova" }];
    },
  });
  assert.deepEqual([...new Set(result.results.map(row => row.type))].sort(), ["contact", "lead", "viewing"]);
  assert.equal(result.sources.listing.status, "unavailable");
  assert.equal(result.sources.contact.status, "searched");
  assert.equal(result.results.find(row => row.type === "contact").title, "Kalina Petrova");
  assert.match(result.results.find(row => row.type === "lead").href, /#lead-lead-kalina$/);
});

test("both search routes join all four real sources and exclude viewings outside the broker's leads", async () => {
  const query = "MS-00815";
  const principal = { id: "broker-search", roles: ["broker"], workspace_ids: ["sandanski"], source: "payload_session", can_mutate: true };
  let scopedReads = 0;
  const config = {
    ...appAdminConfigFromEnv({ NODE_ENV: "test" }),
    seed,
    payloadAdminAuth: { async resolve() { return { principal, user: { id: 3, roles: ["broker"] } }; } },
    leadDurableStore: {
      leadDurableStoreEnabled: true, workspaceId: "sandanski",
      payloadSecret: "payload-secret-for-test", databaseUrl: "postgres://test.invalid/ms_realty",
      contactSecret: "lead-contact-secret-longer-than-thirty-two-characters",
    },
    viewingDurableStore: {
      viewingDurableStoreEnabled: true, workspaceId: "sandanski",
      payloadSecret: "payload-secret-for-test", databaseUrl: "postgres://test.invalid/ms_realty",
      contactSecret: "lead-contact-secret-longer-than-thirty-two-characters",
    },
    readLeadIntakesDurably: async ({ admin, workspaceIds }) => {
      assert.equal(admin, false);
      assert.deepEqual(workspaceIds, ["sandanski"]);
      scopedReads += 1;
      return [{ lead_id: "lead-search-visible", contact: { name: query, email: "search@example.test" }, listing_reference: "MS-00815", received_at: "2026-09-15T10:00:00Z" }];
    },
    readViewingsDurably: async () => [
      { id: "viewing-search-visible", lead_id: "lead-search-visible", contact_name: query, listing_reference: "MS-00815" },
      { id: "viewing-search-hidden", lead_id: "another-workspace-lead", contact_name: query, listing_reference: "MS-SECRET" },
    ],
  };
  const app = createHttpApp(config);
  const headers = { cookie: "ms_admin=scoped-search-fixture" };
  for (const path of [`/api/admin/search?q=${query}`, `/admin/search?q=${query}`]) {
    const standalone = await dispatchHttp(app, { url: path, headers });
    const adapter = await renderAppAdminResponse(new Request(`https://example.test${path}`, { headers }), { config });
    assert.equal(standalone.status, 200);
    assert.equal(adapter.status, 200);
    if (path.startsWith("/api/")) {
      for (const body of [standalone.body, await adapter.json()]) {
        assert.deepEqual([...new Set(body.results.map(row => row.type))].sort(), ["contact", "lead", "listing", "viewing"]);
        assert.equal(body.results.some(row => row.id === "viewing-search-hidden"), false);
        assert.equal(Object.values(body.sources).every(source => source.status === "searched"), true);
      }
    } else {
      for (const html of [standalone.body, await adapter.text()]) {
        for (const type of ["contact", "lead", "listing", "viewing"]) assert.ok(html.includes(`data-search-result="${type}"`), type);
        assert.doesNotMatch(html, /viewing-search-hidden|MS-SECRET/);
      }
    }
  }
  assert.equal(scopedReads, 4, "both formats and both runtimes use the scoped lead loader");
});
