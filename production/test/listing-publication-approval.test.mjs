import assert from "node:assert/strict";
import test from "node:test";
import { APPROVED_LAUNCH_FREEZE_SHA256, loadApprovedLaunchFreeze } from "../lib/launch-freeze.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  freezeActiveListingIds,
  freezeCatalogListingIds,
  hasOperatorPublicationListingEvidence,
  LISTING_PUBLICATION_APPROVAL_ID,
  loadListingPublicationApproval,
  operatorPublicationListingEvidence,
  operatorPublishedListingIds,
} from "../lib/listing-publication-approval.mjs";
import { freezeActivePublicationSql } from "../lib/listing-publication-sql.mjs";

function approvalFixture(overrides = {}) {
  const approval = { ...loadListingPublicationApproval(), ...overrides };
  delete approval.path;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-publication-approval-"));
  const filePath = path.join(directory, "listing-publication-approval.json");
  fs.writeFileSync(filePath, `${JSON.stringify(approval, null, 2)}\n`);
  return filePath;
}

test("the owner's full-catalog approval names every catalogued listing", () => {
  const freeze = loadApprovedLaunchFreeze();
  const approval = loadListingPublicationApproval();
  const catalogIds = freezeCatalogListingIds(freeze);

  assert.equal(approval.approval_id, LISTING_PUBLICATION_APPROVAL_ID);
  assert.equal(approval.based_on_freeze_sha256, APPROVED_LAUNCH_FREEZE_SHA256);
  assert.equal(approval.scope, "full_freeze_catalog");
  assert.equal(approval.decision, "publish_source_as_is");
  assert.equal(approval.approved_by, "agency_owner");
  assert.equal(approval.reason, "owner directive 2026-08-24");
  assert.equal(catalogIds.length, 165);
  assert.deepEqual(approval.listing_ids, catalogIds);
  assert.deepEqual(approval.excluded_listings, []);
  // The narrower freeze-active scope stays a strict subset of the approved set.
  assert.equal(freezeActiveListingIds(freeze).every((id) => approval.listing_ids.includes(id)), true);
  assert.equal(hasOperatorPublicationListingEvidence(operatorPublicationListingEvidence(freeze)), true);
  assert.equal(operatorPublishedListingIds(freeze).length, 165);
});

test("full-catalog publication must account for every catalogued listing", () => {
  const freeze = loadApprovedLaunchFreeze();
  const catalogIds = freezeCatalogListingIds(freeze);

  const droppedPath = approvalFixture({ listing_ids: catalogIds.slice(1), excluded_listings: [] });
  assert.throws(() => loadListingPublicationApproval(droppedPath, freeze), /account for all 165/);
  assert.equal(operatorPublishedListingIds(freeze, droppedPath).length, 0);

  const unknownPath = approvalFixture({ listing_ids: [...catalogIds.slice(1), "MS-CRAWL-9999"] });
  assert.throws(() => loadListingPublicationApproval(unknownPath, freeze), /absent from the approved freeze catalog/);

  const unreasonedPath = approvalFixture({
    listing_ids: catalogIds.slice(1),
    excluded_listings: [{ id: catalogIds[0], reason: "" }],
  });
  assert.throws(() => loadListingPublicationApproval(unreasonedPath, freeze), /reason is required/);
});

test("an explicit exclusion keeps its listing out of the published set", () => {
  const freeze = loadApprovedLaunchFreeze();
  const catalogIds = freezeCatalogListingIds(freeze);
  const filePath = approvalFixture({
    listing_ids: catalogIds.slice(1),
    excluded_listings: [{ id: catalogIds[0], reason: "cannot render publicly" }],
  });
  const approval = loadListingPublicationApproval(filePath, freeze);

  assert.equal(approval.listing_ids.length, 164);
  assert.deepEqual(approval.excluded_listings, [{ id: catalogIds[0], reason: "cannot render publicly" }]);
  assert.equal(hasOperatorPublicationListingEvidence(operatorPublicationListingEvidence(freeze, filePath)), true);
  assert.equal(operatorPublishedListingIds(freeze, filePath).includes(catalogIds[0]), false);
});

test("a tampered approval publishes nothing", () => {
  const freeze = loadApprovedLaunchFreeze();
  const filePath = approvalFixture({ based_on_freeze_sha256: "0".repeat(64) });

  assert.equal(hasOperatorPublicationListingEvidence(operatorPublicationListingEvidence(freeze, filePath)), false);
  assert.deepEqual(operatorPublishedListingIds(freeze, filePath), []);
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
