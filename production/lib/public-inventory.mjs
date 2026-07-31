import { publicationReadinessFor } from "./listing-facts.mjs";

const PUBLIC_LISTING_STATUSES = new Set(["available", "reserved"]);

export function publicSeedFor(seed, { now = new Date().toISOString() } = {}) {
  const properties = new Map((seed.properties || []).map((property) => [property.id, property]));
  return {
    ...seed,
    records: (seed.records || []).filter((record) => {
      if (record.collection !== "listings") return true;
      const status = String(record.facts?.listing_status || "").trim();
      const property = typeof record.property === "object" ? record.property : properties.get(record.property);
      return (
        PUBLIC_LISTING_STATUSES.has(status) &&
        publicationReadinessFor({ listing: record, property, now, requirePublishApproval: true }).ready
      );
    }),
  };
}
