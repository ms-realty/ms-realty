import test from "node:test";
import assert from "node:assert/strict";
import { freezeActiveListingIds } from "../lib/listing-publication-approval.mjs";
import { publicSeedFor } from "../lib/public-inventory.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { approvedPublicSeedFixturePath } from "./approved-public-seed.fixture.mjs";

test("imported inventory stays private until freeze-active rows are published", () => {
  const imported = loadCmsSeed();
  assert.equal(publicSeedFor(imported).records.filter((record) => record.collection === "listings").length, 0);
});

test("operator publication exposes freeze-active listings without broker verification", () => {
  const imported = loadCmsSeed();
  const listingId = freezeActiveListingIds()[0];
  const source = imported.records.find((record) => record.id === listingId);
  const published = {
    ...imported,
    records: [
      {
        ...source,
        cms_status: "published",
        facts: { ...source.facts, listing_status: "available" },
        workflow: { ...(source.workflow || {}), publish_approved: true },
      },
    ],
  };
  const publicListings = publicSeedFor(published).records.filter((record) => record.collection === "listings");
  assert.deepEqual(publicListings.map((listing) => listing.id), [listingId]);
});

test("broker-verified inventory still requires every human publication gate", () => {
  const approved = loadCmsSeed(approvedPublicSeedFixturePath());
  const approvedListing = approved.records.find((record) => record.collection === "listings");
  const publicListings = publicSeedFor(approved).records.filter((record) => record.collection === "listings");
  const blockedListingIds = approved.records
    .filter((record) => record.collection === "listings" && !publicListings.some((listing) => listing.id === record.id))
    .map((record) => record.id);

  assert.equal(publicListings.length, 163);
  assert.deepEqual(blockedListingIds, ["MS-CRAWL-0127", "MS-CRAWL-0159"]);
  assert.equal(
    publicSeedFor({
      ...approved,
      records: [{ ...approvedListing, facts: { ...approvedListing.facts, listing_status: undefined } }],
    }).records.length,
    0,
  );
});
