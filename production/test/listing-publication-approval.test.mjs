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
import { freezeActivePublicationSql } from "../lib/listing-publication-sql.mjs";

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

test("publication SQL copies Payload join rows and source photos for freeze-active listings", () => {
  const sql = freezeActivePublicationSql(["MS-CRAWL-0004", "MS-CRAWL-0117"]);
  assert.match(sql, /INSERT INTO listings_rels \("order"/);
  assert.match(sql, /version\.translations/);
  assert.match(sql, /approved_imported_photo/);
  assert.match(sql, /MS-CRAWL-0004/);
  assert.match(sql, /MS-CRAWL-0117/);
  assert.doesNotMatch(sql, /MS-CRAWL-0005/);
});
