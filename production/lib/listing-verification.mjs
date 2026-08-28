import fs from "node:fs";
import path from "node:path";
import { readListingEdits } from "./listing-edits.mjs";
import { publicationReadinessFor } from "./listing-facts.mjs";
import { loadCmsSeed } from "./runtime.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_LISTING_VERIFICATION_REPORT = fromRoot("production", "data", "listing-verification-report.json");
export const UNASSIGNED_REVIEW_OWNER = "unassigned";
const FIXTURE_BROKER_IDS = new Set(["broker_bg", "broker_ru", "broker_international"]);

function listingRecords(seed) {
  return new Map(seed.records.filter((record) => record.collection === "listings").map((record) => [record.id, record]));
}

function editsByListing(edits) {
  return edits.reduce((rows, edit) => {
    rows.set(edit.listing_id, [...(rows.get(edit.listing_id) || []), edit]);
    return rows;
  }, new Map());
}

function normalizedLocale(value) {
  return String(value || "").trim().toLowerCase().split(/[-_]/)[0];
}

function profileLocales(profile) {
  const values = [
    ...(Array.isArray(profile?.languages) ? profile.languages : []),
    ...(Array.isArray(profile?.locales) ? profile.locales : []),
    ...(Array.isArray(profile?.supported_locales) ? profile.supported_locales : []),
    ...(Array.isArray(profile?.supportedLocales) ? profile.supportedLocales : []),
    profile?.language,
    profile?.locale,
  ];
  return new Set(values.map(normalizedLocale).filter(Boolean));
}

export function isFixtureBrokerId(value) {
  return FIXTURE_BROKER_IDS.has(String(value || "").trim().toLowerCase());
}

function configuredBrokerProfiles(value) {
  return (Array.isArray(value) ? value : [])
    .filter((profile) => {
      const id = String(profile?.id || "").trim();
      return Boolean(id) && !isFixtureBrokerId(id);
    })
    .map((profile) => ({ profile, locales: profileLocales(profile) }));
}

export function resolveListingVerificationOwner(locale, brokerProfiles = []) {
  const requestedLocale = normalizedLocale(locale);
  const eligible = configuredBrokerProfiles(brokerProfiles);
  const match = eligible.find(({ locales }) => requestedLocale && locales.has(requestedLocale));
  if (match) return String(match.profile.id).trim();
  // A single real configured broker is an honest fallback even when the
  // directory has not yet captured language metadata. Multiple unknown
  // brokers must remain unassigned rather than receiving invented routing.
  if (eligible.length === 1 && eligible[0].locales.size === 0) return String(eligible[0].profile.id).trim();
  return UNASSIGNED_REVIEW_OWNER;
}

export function listingVerificationOwnerForRow(row, brokerProfiles = []) {
  const existing = String(row?.verification_task?.owner || "").trim();
  if (existing && !isFixtureBrokerId(existing)) return existing;
  return resolveListingVerificationOwner(row?.source_locale, brokerProfiles);
}

function priorityForEdit(edit) {
  const fields = new Set([...Object.keys(edit.patch || {}), ...Object.keys(edit.listing_patch || {}), ...Object.keys(edit.property_patch || {})]);
  if (Number(edit.stale_translation_count || 0) > 0) return "high";
  if (fields.has("price_eur") || fields.has("price_on_request") || fields.has("listing_status")) return "high";
  if (fields.has("location") || fields.has("property_type")) return "normal";
  return "low";
}

function isLegacyDescriptionRestoration(edit) {
  const fields = Object.keys(edit.patch || {});
  return edit.review_source === "legacy_wordpress_content_capture" && fields.length === 1 && fields[0] === "description";
}

function verificationPriority(edits) {
  const rank = { low: 0, normal: 1, high: 2 };
  const relevantEdits = isLegacyDescriptionRestoration(edits.at(-1)) ? edits.slice(-2) : edits.slice(-1);
  return relevantEdits.reduce(
    (current, edit) => {
      const candidate = priorityForEdit(edit);
      return rank[candidate] > rank[current] ? candidate : current;
    },
    "low",
  );
}

function dueAt(generatedAt, rowPriority) {
  const hours = rowPriority === "high" ? 24 : 72;
  return new Date(Date.parse(generatedAt) + hours * 60 * 60 * 1000).toISOString();
}

export function buildListingVerificationReport({
  seed = loadCmsSeed(),
  edits = readListingEdits(),
  generatedAt = new Date().toISOString(),
  brokerProfiles = [],
} = {}) {
  const records = listingRecords(seed);
  const properties = new Map((seed.properties || []).map((property) => [property.id, property]));
  const rows = [...editsByListing(edits).entries()]
    .filter(([listingId]) => records.has(listingId))
    .map(([listingId, listingEdits]) => {
      const edit = listingEdits.at(-1);
      const record = records.get(listingId);
      const rowPriority = verificationPriority(listingEdits);
      const owner = resolveListingVerificationOwner(edit.source_locale || record.source_locale, brokerProfiles);
      const publicationReadiness = publicationReadinessFor({
        listing: record,
        property: properties.get(record.property),
        now: generatedAt,
      });
      return {
        listing_id: edit.listing_id,
        latest_edit_id: edit.id,
        edited_at: edit.edited_at,
        source_locale: edit.source_locale || record.source_locale,
        changed_fields: Object.keys(edit.patch || {}).sort(),
        changed_property_fields: Object.keys(edit.property_patch || {}).sort(),
        source_hash_after: edit.source_hash_after,
        stale_translation_count: Number(edit.stale_translation_count || 0),
        stale_locales: edit.stale_locales || [],
        priority: rowPriority,
        admin_path: `/admin/listings/edit?listingId=${encodeURIComponent(edit.listing_id)}`,
        publication_readiness: {
          ready: publicationReadiness.ready,
          blocking_fields: publicationReadiness.blocking_fields,
        },
        canonical_fact_completion: {
          property_family: publicationReadiness.fact_completion.property_family,
          property_subtype: publicationReadiness.fact_completion.property_subtype,
          taxonomy_review_status: publicationReadiness.fact_completion.taxonomy_review_status,
          incomplete_fields: publicationReadiness.fact_completion.incomplete_fields,
          complete: publicationReadiness.fact_completion.complete,
        },
        verification_task: {
          id: `verify-${edit.listing_id}`,
          owner,
          status: "open",
          due_at: dueAt(generatedAt, rowPriority),
        },
      };
    })
    .sort((a, b) => a.listing_id.localeCompare(b.listing_id));

  return {
    generated_at: generatedAt,
    summary: {
      edited_listings: rows.length,
      broker_verification_tasks: rows.length,
      high_priority: rows.filter((row) => row.priority === "high").length,
      stale_translation_tasks: rows.filter((row) => row.stale_translation_count > 0).length,
      publication_blocked: rows.filter((row) => !row.publication_readiness.ready).length,
      by_owner: rows.reduce((counts, row) => {
        counts[row.verification_task.owner] = (counts[row.verification_task.owner] || 0) + 1;
        return counts;
      }, {}),
    },
    rows,
  };
}

export function assertListingVerificationReport(report) {
  if (!report.rows.length) throw new Error("Listing verification report must contain edited listings");
  if (report.summary.edited_listings !== report.rows.length) throw new Error("Listing verification summary must match rows");
  if (report.summary.broker_verification_tasks !== report.rows.length) {
    throw new Error("Every edited listing must create a broker verification task");
  }
  for (const row of report.rows) {
    if (!row.listing_id || !row.source_hash_after || !row.admin_path.startsWith("/admin/listings/edit?listingId=")) {
      throw new Error("Listing verification rows must preserve editor routing data");
    }
    if (row.verification_task?.status !== "open" || !row.verification_task.owner || !row.verification_task.due_at) {
      throw new Error("Listing verification rows must create open broker tasks");
    }
    if (row.stale_translation_count > 0 && row.priority !== "high") {
      throw new Error("Stale translation verification rows must be high priority");
    }
    if (!row.publication_readiness || typeof row.publication_readiness.ready !== "boolean" || !Array.isArray(row.publication_readiness.blocking_fields)) {
      throw new Error("Listing verification rows must expose publication readiness");
    }
    if (!row.canonical_fact_completion || !Array.isArray(row.canonical_fact_completion.incomplete_fields)) {
      throw new Error("Listing verification rows must expose canonical fact completion");
    }
  }
  return true;
}

export function writeListingVerificationReport(report, filePath = DEFAULT_LISTING_VERIFICATION_REPORT) {
  assertListingVerificationReport(report);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
  return filePath;
}
