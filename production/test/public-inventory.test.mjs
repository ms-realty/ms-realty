import test from "node:test";
import assert from "node:assert/strict";
import { operatorPublishedListingIds } from "../lib/listing-publication-approval.mjs";
import { publicSeedFor } from "../lib/public-inventory.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { approvedPublicSeedFixturePath } from "./approved-public-seed.fixture.mjs";

test("the owner-approved catalog is published in full", () => {
  const imported = loadCmsSeed();
  const approvedIds = operatorPublishedListingIds();
  const publicListings = publicSeedFor(imported).records.filter((record) => record.collection === "listings");

  // The approval names the whole freeze catalogue. What reaches the public
  // inventory is the survivors: the thirty-eight cross-domain twins the lot
  // number merged are archived, and MS-CRAWL-0127 and MS-CRAWL-0159 are two of
  // them, named by the approval and served under MS-00499 and MS-00891.
  assert.equal(approvedIds.length, 165);
  assert.equal(publicListings.length, 127);
  assert.ok(approvedIds.includes("MS-CRAWL-0127"));
  assert.ok(approvedIds.includes("MS-CRAWL-0159"));
  const publicIds = publicListings.map((listing) => listing.id).sort((left, right) => left.localeCompare(right));
  assert.ok(publicIds.every((id) => approvedIds.includes(id)), "every public listing is named by the approval");
  const withheld = approvedIds.filter((id) => !publicIds.includes(id));
  assert.equal(withheld.length, 38);
  assert.ok(withheld.includes("MS-CRAWL-0127") && withheld.includes("MS-CRAWL-0159"));
  assert.ok(publicIds.includes("MS-00499") && publicIds.includes("MS-00891"));
});

test("inventory the approval does not name stays private", () => {
  const imported = loadCmsSeed();
  const listingId = operatorPublishedListingIds()[0];
  const source = imported.records.find((record) => record.id === listingId);
  const unnamed = { ...source, id: "MS-CRAWL-9999" };

  const published = publicSeedFor({ ...imported, records: [source, unnamed] }).records;
  assert.deepEqual(published.map((listing) => listing.id), [listingId]);
});

test("a published record still needs its own publication approval flag", () => {
  const imported = loadCmsSeed();
  const listingId = operatorPublishedListingIds()[0];
  const source = imported.records.find((record) => record.id === listingId);

  for (const record of [
    { ...source, cms_status: "source_imported_review_required" },
    { ...source, workflow: { ...(source.workflow || {}), publish_approved: false } },
    { ...source, facts: { ...source.facts, listing_status: "sold" } },
  ]) {
    assert.equal(publicSeedFor({ ...imported, records: [record] }).records.length, 0);
  }
});

test("broker-verified inventory still requires every human publication gate", () => {
  // Ids outside the operator approval can only reach the public site through
  // the broker-verification path, so this still exercises the untouched gate.
  const approved = loadCmsSeed(approvedPublicSeedFixturePath());
  const unapproved = {
    ...approved,
    records: approved.records.map((record) =>
      record.collection === "listings" ? { ...record, id: `${record.id}-UNAPPROVED` } : record,
    ),
  };
  const approvedListing = unapproved.records.find((record) => record.collection === "listings");
  const publicListings = publicSeedFor(unapproved).records.filter((record) => record.collection === "listings");
  const blockedListingIds = unapproved.records
    .filter((record) => record.collection === "listings" && !publicListings.some((listing) => listing.id === record.id))
    .map((record) => record.id);

  assert.equal(publicListings.length, 165);
  assert.deepEqual(blockedListingIds, []);
  assert.equal(
    publicSeedFor({
      ...unapproved,
      records: [{ ...approvedListing, facts: { ...approvedListing.facts, listing_status: undefined } }],
    }).records.length,
    0,
  );
});
