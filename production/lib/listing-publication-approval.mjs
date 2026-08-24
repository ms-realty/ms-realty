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

// `freeze_active_catalog` publishes only the 30 listings whose manual source
// review passed. `full_freeze_catalog` is the owner-directed scope: every
// catalogued listing is published as-is, minus listings the approval names as
// excluded with a recorded reason. Both scopes still require a signed artifact
// that cites the approved launch-freeze digest, so the publication gate itself
// is unchanged - only the size of the approved set moves.
const APPROVAL_SCOPES = Object.freeze({
  FREEZE_ACTIVE: "freeze_active_catalog",
  FULL_CATALOG: "full_freeze_catalog",
});

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

function sortedIds(ids) {
  return [...ids].sort((left, right) => left.localeCompare(right));
}

export function freezeActiveListingIds(freeze = loadApprovedLaunchFreeze()) {
  return sortedIds(freeze.catalog.filter((listing) => listing.catalog_state === "active").map((listing) => listing.id));
}

export function freezeActiveListingIdSet(freeze = loadApprovedLaunchFreeze()) {
  return new Set(freezeActiveListingIds(freeze));
}

export function freezeCatalogListingIds(freeze = loadApprovedLaunchFreeze()) {
  return sortedIds(freeze.catalog.map((listing) => listing.id));
}

function normalizeExclusions(approval, catalogIds) {
  const rows = Array.isArray(approval.excluded_listings) ? approval.excluded_listings : [];
  const known = new Set(catalogIds);
  const seen = new Set();
  return rows.map((row) => {
    const id = requiredText(row?.id, "excluded_listings[].id");
    if (!known.has(id)) throw new Error(`Excluded listing is absent from the approved freeze catalog: ${id}`);
    if (seen.has(id)) throw new Error(`Excluded listing is named twice: ${id}`);
    seen.add(id);
    return { id, reason: requiredText(row?.reason, `excluded_listings[${id}].reason`) };
  });
}

function resolveApprovedListingIds(approval, freeze) {
  if (approval.scope === APPROVAL_SCOPES.FREEZE_ACTIVE) {
    const expectedIds = freezeActiveListingIds(freeze);
    const listingIds = Array.isArray(approval.listing_ids) ? approval.listing_ids.map((id) => String(id).trim()) : [];
    if (listingIds.join("\n") !== expectedIds.join("\n")) {
      throw new Error("Listing publication approval must name the exact 30 freeze-active listing ids");
    }
    return { listing_ids: expectedIds, excluded_listings: [] };
  }

  if (approval.schema_version !== 2) throw new Error("Full-catalog listing publication requires schema_version 2");
  requiredText(approval.reason, "reason");
  const catalogIds = freezeCatalogListingIds(freeze);
  const known = new Set(catalogIds);
  const listingIds = Array.isArray(approval.listing_ids) ? approval.listing_ids.map((id) => String(id).trim()) : [];
  if (!listingIds.length) throw new Error("Full-catalog listing publication must name at least one listing id");
  if (new Set(listingIds).size !== listingIds.length) throw new Error("Listing publication approval repeats a listing id");
  for (const id of listingIds) {
    if (!known.has(id)) throw new Error(`Approved listing is absent from the approved freeze catalog: ${id}`);
  }
  const excluded = normalizeExclusions(approval, catalogIds);
  const approvedSet = new Set(listingIds);
  for (const row of excluded) {
    if (approvedSet.has(row.id)) throw new Error(`Listing is both approved and excluded: ${row.id}`);
  }
  if (listingIds.length + excluded.length !== catalogIds.length) {
    throw new Error(
      `Full-catalog listing publication must account for all ${catalogIds.length} catalogued listings as approved or excluded`,
    );
  }
  return { listing_ids: sortedIds(listingIds), excluded_listings: excluded };
}

export function loadListingPublicationApproval(
  filePath = DEFAULT_LISTING_PUBLICATION_APPROVAL_PATH,
  freeze = loadApprovedLaunchFreeze(),
) {
  const approval = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (![1, 2].includes(approval.schema_version)) throw new Error("Listing publication approval schema_version must be 1 or 2");
  if (approval.approval_id !== LISTING_PUBLICATION_APPROVAL_ID) {
    throw new Error(`Listing publication approval_id must be ${LISTING_PUBLICATION_APPROVAL_ID}`);
  }
  if (approval.based_on_freeze_sha256 !== APPROVED_LAUNCH_FREEZE_SHA256) {
    throw new Error("Listing publication approval must match the approved launch-freeze digest");
  }
  if (approval.based_on_freeze_approval_id !== freeze.route_approval?.approval_id) {
    throw new Error("Listing publication approval must cite MSR-LAUNCH-FREEZE-1");
  }
  if (!Object.values(APPROVAL_SCOPES).includes(approval.scope)) {
    throw new Error(`Listing publication scope must be ${Object.values(APPROVAL_SCOPES).join(" or ")}`);
  }
  if (approval.decision !== "publish_source_as_is") throw new Error("Listing publication decision must be publish_source_as_is");
  requiredText(approval.approved_by, "approved_by");
  isoTimestamp(approval.approved_at, "approved_at");
  requiredText(approval.publication_boundary, "publication_boundary");
  if (
    freeze.summary?.catalog?.total !== EXPECTED_TOTAL ||
    freeze.summary?.catalog?.by_state?.active !== EXPECTED_ACTIVE ||
    freeze.summary?.catalog?.by_state?.archived !== EXPECTED_ARCHIVED
  ) {
    throw new Error("Listing publication approval requires the locked 30/135 freeze catalog");
  }
  const resolved = resolveApprovedListingIds(approval, freeze);
  return {
    ...approval,
    path: repoRelativePath(filePath),
    listing_ids: resolved.listing_ids,
    excluded_listings: resolved.excluded_listings,
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
      reason: approval.reason || null,
      publication_boundary: approval.publication_boundary,
      summary: {
        expected_review_rows: EXPECTED_TOTAL,
        review_rows: launchFreeze.catalog.length,
        missing_review_rows: 0,
        facts_review_rows: launchFreeze.catalog.filter((listing) => listing.source_review_status === "pass").length,
        media_review_rows: 0,
        active_listings: EXPECTED_ACTIVE,
        archived_listings: EXPECTED_ARCHIVED,
        scope: approval.scope,
        catalog_listing_ids: launchFreeze.catalog.length,
        published_listing_ids: approval.listing_ids.length,
        excluded_listing_ids: approval.excluded_listings.length,
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

function approvedScopeCovered(summary) {
  if (summary.scope === APPROVAL_SCOPES.FREEZE_ACTIVE) return summary.published_listing_ids === EXPECTED_ACTIVE;
  if (summary.scope !== APPROVAL_SCOPES.FULL_CATALOG) return false;
  return (
    summary.catalog_listing_ids === EXPECTED_TOTAL &&
    summary.published_listing_ids > 0 &&
    summary.published_listing_ids + summary.excluded_listing_ids === EXPECTED_TOTAL
  );
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
    approvedScopeCovered(summary) &&
    summary.source_locales_only === true
  );
}

// The publication gate reads the approved listing set from the signed approval
// artifact, never from the raw catalog: without valid operator evidence the set
// is empty and nothing is published.
export function operatorPublishedListingApproval(
  launchFreeze = loadApprovedLaunchFreeze(),
  filePath = DEFAULT_LISTING_PUBLICATION_APPROVAL_PATH,
) {
  const evidence = operatorPublicationListingEvidence(launchFreeze, filePath);
  if (!hasOperatorPublicationListingEvidence(evidence)) return null;
  const approval = loadListingPublicationApproval(filePath, launchFreeze);
  return {
    approval_id: approval.approval_id,
    scope: approval.scope,
    decision: approval.decision,
    approved_by: approval.approved_by,
    approved_at: isoTimestamp(approval.approved_at, "approved_at"),
    reason: approval.reason || null,
    listing_ids: approval.listing_ids,
    excluded_listings: approval.excluded_listings,
  };
}

export function operatorPublishedListingIds(
  launchFreeze = loadApprovedLaunchFreeze(),
  filePath = DEFAULT_LISTING_PUBLICATION_APPROVAL_PATH,
) {
  return operatorPublishedListingApproval(launchFreeze, filePath)?.listing_ids || [];
}

export function operatorPublishedListingIdSet(
  launchFreeze = loadApprovedLaunchFreeze(),
  filePath = DEFAULT_LISTING_PUBLICATION_APPROVAL_PATH,
) {
  return new Set(operatorPublishedListingIds(launchFreeze, filePath));
}
