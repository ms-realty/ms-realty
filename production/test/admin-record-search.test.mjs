import test from "node:test";
import assert from "node:assert/strict";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { ADMIN_SEARCH_MIN_QUERY, searchAdminRecords } from "../lib/admin-record-search.mjs";

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
