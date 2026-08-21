import { publicationReadinessFor } from "./listing-facts.mjs";
import {
  freezeActiveListingIdSet,
  hasOperatorPublicationListingEvidence,
  operatorPublicationListingEvidence,
} from "./listing-publication-approval.mjs";

const PUBLIC_LISTING_STATUSES = new Set(["available", "reserved"]);

function operatorPublishedAsIs(record, { freezeActive, operatorApproved }) {
  return (
    operatorApproved === true &&
    freezeActive === true &&
    record.cms_status === "published" &&
    record.workflow?.publish_approved === true
  );
}

function publicListingStatus(record, operatorPublished) {
  const status = String(record.facts?.listing_status || "").trim();
  if (status) return status;
  return operatorPublished ? "available" : "";
}

export function publicSeedFor(seed, { now = new Date().toISOString() } = {}) {
  const properties = new Map((seed.properties || []).map((property) => [property.id, property]));
  const operatorApproved = hasOperatorPublicationListingEvidence(operatorPublicationListingEvidence());
  const freezeActiveIds = operatorApproved ? freezeActiveListingIdSet() : new Set();
  return {
    ...seed,
    records: (seed.records || []).filter((record) => {
      if (record.collection !== "listings") return true;
      const freezeActive = freezeActiveIds.has(record.id);
      const operatorPublished = operatorPublishedAsIs(record, { freezeActive, operatorApproved });
      const status = publicListingStatus(record, operatorPublished);
      if (!PUBLIC_LISTING_STATUSES.has(status)) return false;
      if (operatorPublished) return true;
      const property = typeof record.property === "object" ? record.property : properties.get(record.property);
      return publicationReadinessFor({ listing: record, property, now, requirePublishApproval: true }).ready;
    }),
  };
}
