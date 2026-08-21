import assert from "node:assert/strict";
import test from "node:test";
import { APPROVED_LAUNCH_FREEZE_SHA256, loadApprovedLaunchFreeze } from "../lib/launch-freeze.mjs";
import {
  freezeActiveListingIds,
  hasOperatorPublicationListingEvidence,
  LISTING_PUBLICATION_APPROVAL_ID,
  loadListingPublicationApproval,
  operatorPublicationListingEvidence,
} from "../lib/listing-publication-approval.mjs";

test("operator publication approval names the exact freeze-active catalog", () => {
  const freeze = loadApprovedLaunchFreeze();
  const approval = loadListingPublicationApproval();
  const ids = freezeActiveListingIds(freeze);

  assert.equal(approval.approval_id, LISTING_PUBLICATION_APPROVAL_ID);
  assert.equal(approval.based_on_freeze_sha256, APPROVED_LAUNCH_FREEZE_SHA256);
  assert.deepEqual(ids, approval.listing_ids);
  assert.equal(ids.length, 30);
  assert.equal(hasOperatorPublicationListingEvidence(operatorPublicationListingEvidence(freeze)), true);
});
