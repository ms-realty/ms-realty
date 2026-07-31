import test from "node:test";
import assert from "node:assert/strict";
import { publicSeedFor } from "../lib/public-inventory.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { approvedPublicSeedFixturePath } from "./approved-public-seed.fixture.mjs";

test("public inventory requires explicit active status and every human publication gate", () => {
  const imported = loadCmsSeed();
  const approved = loadCmsSeed(approvedPublicSeedFixturePath());
  const approvedListing = approved.records.find((record) => record.collection === "listings");

  assert.equal(publicSeedFor(imported).records.filter((record) => record.collection === "listings").length, 0);
  assert.equal(publicSeedFor(approved).records.filter((record) => record.collection === "listings").length, 165);
  assert.equal(
    publicSeedFor({ ...approved, records: [{ ...approvedListing, facts: { ...approvedListing.facts, listing_status: undefined } }] }).records.length,
    0,
  );
});
