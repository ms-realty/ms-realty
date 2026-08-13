import test from "node:test";
import assert from "node:assert/strict";
import { publicSeedFor } from "../lib/public-inventory.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { approvedPublicSeedFixturePath } from "./approved-public-seed.fixture.mjs";

test("public inventory requires explicit active status and every human publication gate", () => {
  const imported = loadCmsSeed();
  const approved = loadCmsSeed(approvedPublicSeedFixturePath());
  const approvedListing = approved.records.find((record) => record.collection === "listings");
  const publicListings = publicSeedFor(approved).records.filter((record) => record.collection === "listings");
  const blockedListingIds = approved.records
    .filter((record) => record.collection === "listings" && !publicListings.some((listing) => listing.id === record.id))
    .map((record) => record.id);

  assert.equal(publicSeedFor(imported).records.filter((record) => record.collection === "listings").length, 0);
  assert.equal(publicListings.length, 163);
  assert.deepEqual(blockedListingIds, ["MS-CRAWL-0127", "MS-CRAWL-0159"]);
  assert.equal(
    publicSeedFor({ ...approved, records: [{ ...approvedListing, facts: { ...approvedListing.facts, listing_status: undefined } }] }).records.length,
    0,
  );
});
