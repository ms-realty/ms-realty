#!/usr/bin/env node
// Checks the extracted legacy artefacts: the counts the launch freeze fixed,
// referential integrity between the files, and the data-protection rules that
// apply to everything in this directory.
//
// Run: node data/legacy/verify.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "..", "..");

/** The only phone number that may appear anywhere: the public brand line. */
const ALLOWED_PHONE = "+359879696870";
/** Business addresses allowed by data/legacy/README.md § Data-protection rules. */
const ALLOWED_EMAILS = new Set(["ms.realty.bg@gmail.com"]);

const failures = [];
const checks = [];

function check(label, actual, expected) {
  const ok = actual === expected;
  checks.push({ label, actual, expected, ok });
  if (!ok) failures.push(`${label}: expected ${expected}, got ${actual}`);
}

function assert(label, ok, detail = "") {
  checks.push({ label, actual: ok ? "ok" : "failed", expected: "ok", ok });
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ""}`);
}

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DIR, name), "utf8"));
}

const listings = readJson("listings.json");
const urlDecisions = readJson("url-decisions.json");
const media = readJson("media-manifest.json");
const geography = readJson("geography.json");
const content = readJson("content.json");

// ---------------------------------------------------------------- counts ---

check("listings", listings.listings.length, 165);
check("listings summary total", listings.summary.listings, 165);
check("listings active at freeze", listings.summary.lifecycle_at_freeze.active, 30);
check("listings archived at freeze", listings.summary.lifecycle_at_freeze.archived, 135);
check("listings with an area on the legacy record", listings.summary.with_area_on_the_listing_record, 0);
check("listings with a recorded room count", listings.summary.with_recorded_rooms, 0);
check("listings with a recorded bedroom count", listings.summary.with_recorded_bedrooms, 74);
check(
  "recorded bedroom counts match the summary",
  listings.listings.filter((l) => l.bedrooms.recorded).length,
  listings.summary.with_recorded_bedrooms,
);
assert(
  "no zero-value placeholder is carried as a recorded bedroom count",
  listings.listings.every((l) => !(l.bedrooms.zero_value_placeholder && l.bedrooms.recorded)),
);
check("listings merged into another listing", listings.summary.merged_into_another_listing, 38);
check("translation records excluding the source locale", listings.summary.translation_records_excluding_source_locale, 990);
check("translations human-approved (non-source locale)", listings.summary.translations_human_approved_excluding_source_locale, 0);
check("translations indexable (non-source locale)", listings.summary.translations_public_indexable_excluding_source_locale, 0);

check("url decisions", urlDecisions.decisions.length, 457);
check("url decisions 301", urlDecisions.summary.by_status["301"], 179);
check("url decisions 410", urlDecisions.summary.by_status["410"], 268);
check("url decisions 200", urlDecisions.summary.by_status["200"], 10);
check("listing 301s", urlDecisions.summary.listing_301s, 165);
check("listing 301s from makler-realty.ru", urlDecisions.summary.listing_301s_from_ru, 52);

check("R2 media objects", media.objects.length, 1725);
check("R2 media objects reported present", media.r2_evidence.present_count, 1725);
check("R2 media objects reported missing", media.r2_evidence.missing_count, 0);
check("crawl media inventory rows", media.summary.crawl_inventory_rows, 11859);

check("geography places", geography.places.length, 31);
check("geography places without a register entry", geography.summary.without_registry_entry, 0);
check("settlement coordinates available", geography.coordinates.available, false);

check("approved team profiles", content.summary.team_profiles, 0);
check("approved financing partners", content.summary.financing_partners, 0);
check("approved purchase fee lines", content.summary.purchase_fee_lines, 0);

// ------------------------------------------------- referential integrity ---

const listingIds = new Set(listings.listings.map((l) => l.reference.id));
const objectKeys = new Set(media.objects.map((o) => o.r2_key));
const objectUrls = new Set(media.objects.map((o) => o.original_url));
const unmirroredUrls = new Set(media.unmirrored_references.map((u) => u.original_url));
const decisionByUrl = new Map(urlDecisions.decisions.map((d) => [d.source_url, d]));
const placeKeys = new Set(geography.places.map((p) => p.place_key));
const geographyIds = new Set(geography.places.map((p) => p.geography_id));

const danglingMedia = [];
const danglingUrls = [];
const danglingPlaces = [];
for (const listing of listings.listings) {
  for (const item of listing.media) {
    const known = item.r2_key
      ? objectKeys.has(item.r2_key)
      : objectUrls.has(item.original_url) || unmirroredUrls.has(item.original_url);
    if (!known) danglingMedia.push(`${listing.reference.id} -> ${item.r2_key ?? item.original_url}`);
  }
  for (const entry of listing.legacy_urls) {
    const decision = decisionByUrl.get(entry.url);
    if (!decision) {
      danglingUrls.push(`${listing.reference.id} -> ${entry.url} (no decision and no explanation)`);
      continue;
    }
    if (entry.decision && entry.decision.status !== decision.status) {
      danglingUrls.push(`${listing.reference.id} -> ${entry.url} (status ${entry.decision.status} != ${decision.status})`);
    }
  }
  const place = listing.location.place_key;
  if (place === null || !placeKeys.has(place)) danglingPlaces.push(`${listing.reference.id} -> ${place}`);
  const geographyId = listing.location.settlement.geography_id;
  if (geographyId !== null && !geographyIds.has(geographyId)) {
    danglingPlaces.push(`${listing.reference.id} -> ${geographyId}`);
  }
}

assert("every listing media reference exists in the manifest", danglingMedia.length === 0, danglingMedia.slice(0, 5).join("; "));
assert("every listing legacy URL has a matching decision", danglingUrls.length === 0, danglingUrls.slice(0, 5).join("; "));
assert("every listing location resolves in geography.json", danglingPlaces.length === 0, danglingPlaces.slice(0, 5).join("; "));

const badManifestRefs = media.objects
  .concat(media.unmirrored_references)
  .flatMap((o) => o.listing_references.filter((id) => !listingIds.has(id)));
assert("every manifest listing reference exists", badManifestRefs.length === 0, badManifestRefs.slice(0, 5).join("; "));

const badDecisionRefs = urlDecisions.decisions
  .map((d) => d.listing_reference)
  .filter((id) => id !== null && !listingIds.has(id));
assert("every URL decision listing reference exists", badDecisionRefs.length === 0, badDecisionRefs.slice(0, 5).join("; "));

const listingUrls = new Set(listings.listings.flatMap((l) => l.legacy_urls.map((u) => u.url)));
const unlinkedListingDecisions = urlDecisions.decisions.filter(
  (d) => d.url_type === "listing" && !listingUrls.has(d.source_url),
);
assert(
  "every listing URL decision points at an extracted listing",
  unlinkedListingDecisions.length === 0,
  unlinkedListingDecisions.slice(0, 5).map((d) => d.source_url).join("; "),
);

const geographyListingRefs = geography.places.flatMap((p) => p.legacy_listings).filter((id) => !listingIds.has(id));
assert("every geography listing reference exists", geographyListingRefs.length === 0, geographyListingRefs.slice(0, 5).join("; "));

// ------------------------------------------------- data-protection rules ---

const HEX_DIGEST = /^[0-9a-f]{32,}$/i;
// A digit run with the separators a written phone number uses. Hashes are
// skipped above, so a run this long that parses as a phone is a real one.
const NUMBER_RUN = /[+\d][\d\s().\-/]{5,}\d/g;

function phoneCandidates(text) {
  const found = [];
  for (const match of text.match(NUMBER_RUN) ?? []) {
    const plus = match.startsWith("+");
    const digits = match.replace(/\D/g, "");
    if (plus && digits.length >= 8 && digits.length <= 15) found.push(`+${digits}`);
    else if (digits.startsWith("00") && digits.length >= 10 && digits.length <= 15) found.push(`+${digits.slice(2)}`);
    else if (/^0(?:8[7-9]|9[789])\d{7}$/.test(digits)) found.push(`+359${digits.slice(1)}`);
  }
  return found;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

const phoneHits = [];
const emailHits = [];

function scanText(text, where) {
  for (const phone of phoneCandidates(text)) {
    if (phone !== ALLOWED_PHONE) phoneHits.push(`${where}: ${phone}`);
  }
  for (const email of text.match(EMAIL) ?? []) {
    if (!ALLOWED_EMAILS.has(email.toLowerCase())) emailHits.push(`${where}: ${email}`);
  }
}

function scanValue(value, where) {
  if (typeof value === "string") {
    if (HEX_DIGEST.test(value)) return;
    scanText(value, where);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanValue(item, `${where}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) scanValue(nested, `${where}.${key}`);
  }
}

for (const name of ["listings.json", "url-decisions.json", "media-manifest.json", "geography.json", "content.json"]) {
  scanValue(readJson(name), name);
}
for (const name of ["README.md", "verify.mjs"]) {
  scanText(fs.readFileSync(path.join(DIR, name), "utf8"), name);
}
for (const name of fs.readdirSync(path.join(ROOT, "public", "brand"))) {
  if (!name.endsWith(".svg")) continue;
  scanText(fs.readFileSync(path.join(ROOT, "public", "brand", name), "utf8"), `public/brand/${name}`);
}

assert(`no phone number other than ${ALLOWED_PHONE}`, phoneHits.length === 0, phoneHits.slice(0, 10).join("; "));
assert("no email address outside the allowed business addresses", emailHits.length === 0, emailHits.slice(0, 10).join("; "));

// ------------------------------------------------------------- brand ------

for (const asset of ["logo-ms-realty.png", "logo-ms-realty-reversed.png", "favicon.svg"]) {
  assert(`public/brand/${asset} exists`, fs.existsSync(path.join(ROOT, "public", "brand", asset)));
}

// ------------------------------------------------------------- report -----

for (const c of checks) {
  if (!c.ok) console.error(`FAIL  ${c.label}: expected ${c.expected}, got ${c.actual}`);
}
console.log(`${checks.length - failures.length}/${checks.length} checks passed`);
if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
