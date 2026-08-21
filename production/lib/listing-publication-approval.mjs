import fs from "node:fs";
import { APPROVED_LAUNCH_FREEZE_SHA256, loadApprovedLaunchFreeze } from "./launch-freeze.mjs";
import { fromRoot, repoRelativePath } from "./paths.mjs";

export const LISTING_PUBLICATION_APPROVAL_ID = "MSR-LISTING-PUBLICATION-1";
export const DEFAULT_LISTING_PUBLICATION_APPROVAL_PATH = fromRoot(
  "production",
  "data",
  "listing-publication-approval.json",
);

const EXPECTED_ACTIVE = 30;
const EXPECTED_ARCHIVED = 135;
const EXPECTED_TOTAL = 165;

function requiredText(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function isoTimestamp(value, label) {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.valueOf())) throw new Error(`${label} must be a valid timestamp`);
  return parsed.toISOString();
}

export function freezeActiveListingIds(freeze = loadApprovedLaunchFreeze()) {
  return freeze.catalog
    .filter((listing) => listing.catalog_state === "active")
    .map((listing) => listing.id)
    .sort((left, right) => left.localeCompare(right));
}

export function freezeActiveListingIdSet(freeze = loadApprovedLaunchFreeze()) {
  return new Set(freezeActiveListingIds(freeze));
}

export function loadListingPublicationApproval(
  filePath = DEFAULT_LISTING_PUBLICATION_APPROVAL_PATH,
  freeze = loadApprovedLaunchFreeze(),
) {
  const approval = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const expectedIds = freezeActiveListingIds(freeze);
  const listingIds = Array.isArray(approval.listing_ids) ? approval.listing_ids.map((id) => String(id).trim()) : [];
  if (approval.schema_version !== 1) throw new Error("Listing publication approval schema_version must be 1");
  if (approval.approval_id !== LISTING_PUBLICATION_APPROVAL_ID) {
    throw new Error(`Listing publication approval_id must be ${LISTING_PUBLICATION_APPROVAL_ID}`);
  }
  if (approval.based_on_freeze_sha256 !== APPROVED_LAUNCH_FREEZE_SHA256) {
    throw new Error("Listing publication approval must match the approved launch-freeze digest");
  }
  if (approval.based_on_freeze_approval_id !== freeze.route_approval?.approval_id) {
    throw new Error("Listing publication approval must cite MSR-LAUNCH-FREEZE-1");
  }
  if (approval.scope !== "freeze_active_catalog") throw new Error("Listing publication scope must be freeze_active_catalog");
  if (approval.decision !== "publish_source_as_is") throw new Error("Listing publication decision must be publish_source_as_is");
  requiredText(approval.approved_by, "approved_by");
  isoTimestamp(approval.approved_at, "approved_at");
  requiredText(approval.publication_boundary, "publication_boundary");
  if (listingIds.join("\n") !== expectedIds.join("\n")) {
    throw new Error("Listing publication approval must name the exact 30 freeze-active listing ids");
  }
  if (
    freeze.summary?.catalog?.total !== EXPECTED_TOTAL ||
    freeze.summary?.catalog?.by_state?.active !== EXPECTED_ACTIVE ||
    freeze.summary?.catalog?.by_state?.archived !== EXPECTED_ARCHIVED
  ) {
    throw new Error("Listing publication approval requires the locked 30/135 freeze catalog");
  }
  return {
    ...approval,
    path: repoRelativePath(filePath),
    listing_ids: expectedIds,
  };
}

export function operatorPublicationListingEvidence(
  launchFreeze = loadApprovedLaunchFreeze(),
  filePath = DEFAULT_LISTING_PUBLICATION_APPROVAL_PATH,
) {
  try {
    const approval = loadListingPublicationApproval(filePath, launchFreeze);
    return {
      status: "pass",
      mode: "operator_publication_of_freeze_active",
      path: approval.path,
      approval_id: approval.approval_id,
      freeze_sha256: APPROVED_LAUNCH_FREEZE_SHA256,
      freeze_approval_id: approval.based_on_freeze_approval_id,
      approved_by: approval.approved_by,
      approved_at: approval.approved_at,
      decision: approval.decision,
      publication_boundary: approval.publication_boundary,
      summary: {
        expected_review_rows: EXPECTED_TOTAL,
        review_rows: launchFreeze.catalog.length,
        missing_review_rows: 0,
        facts_review_rows: launchFreeze.catalog.filter((listing) => listing.source_review_status === "pass").length,
        media_review_rows: 0,
        active_listings: EXPECTED_ACTIVE,
        archived_listings: EXPECTED_ARCHIVED,
        published_listing_ids: approval.listing_ids.length,
        source_locales_only: true,
      },
    };
  } catch (error) {
    return {
      status: "blocked",
      mode: "operator_publication_of_freeze_active",
      path: repoRelativePath(filePath),
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function hasOperatorPublicationListingEvidence(evidence) {
  const summary = evidence?.summary || {};
  return (
    evidence?.status === "pass" &&
    evidence?.mode === "operator_publication_of_freeze_active" &&
    evidence?.approval_id === LISTING_PUBLICATION_APPROVAL_ID &&
    evidence?.freeze_sha256 === APPROVED_LAUNCH_FREEZE_SHA256 &&
    evidence?.freeze_approval_id === "MSR-LAUNCH-FREEZE-1" &&
    summary.expected_review_rows === EXPECTED_TOTAL &&
    summary.active_listings === EXPECTED_ACTIVE &&
    summary.archived_listings === EXPECTED_ARCHIVED &&
    summary.published_listing_ids === EXPECTED_ACTIVE &&
    summary.source_locales_only === true
  );
}
