import fs from "node:fs";
import path from "node:path";
import { listingSourceSnapshot } from "./content.mjs";
import { requiredPublicLocales } from "./locales.mjs";
import { fromRoot } from "./paths.mjs";
import { contentHash } from "./translations.mjs";

export const DEFAULT_LISTING_TRANSLATIONS_DIR = fromRoot("production", "data", "listing-translations");
export const LISTING_TRANSLATION_STATUSES = Object.freeze(["human_review_pending", "published"]);
export const EXPECTED_LISTING_COUNT = 165;
export const EXPECTED_TRANSLATIONS_PER_LISTING = 6;

const BATCH_FILE = /^batch-\d{3,}\.json$/;
const HEBREW = /[\u0590-\u05ff]/u;
const PLACEHOLDER = /(?:\b(?:todo|tbd|placeholder|lorem ipsum|translation pending|needs translation)\b|нужен перевод|очаква превод|דרוש תרגום)/iu;
const REQUIRED_FIELDS = [
  "listing_id",
  "source_locale",
  "locale",
  "source_hash",
  "title",
  "description",
  "seo_title",
  "meta_description",
  "translator",
  "content_origin",
  "reviewed_by",
  "reviewed_at",
  "publication_authorized_by",
  "publication_authorized_at",
  "status",
  "citations",
];

function text(value, field, id) {
  if (typeof value !== "string") throw new Error(`${id} requires string ${field}`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`${id} requires ${field}`);
  if (PLACEHOLDER.test(normalized)) throw new Error(`${id} contains placeholder ${field}`);
  return normalized;
}

function nullableText(value, field, id) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error(`${id} requires string or null ${field}`);
  const normalized = value.trim();
  return normalized || null;
}

function validDate(value, field, id) {
  const normalized = nullableText(value, field, id);
  if (normalized && !Number.isFinite(Date.parse(normalized))) throw new Error(`${id} has invalid ${field}`);
  return normalized;
}

function charLength(value) {
  return [...value].length;
}

function translatedHash(record) {
  return contentHash({
    title: record.title,
    description: record.description,
    seo_title: record.seo_title,
    meta_description: record.meta_description,
  });
}

function assertCitations(citations, listing, id) {
  if (!Array.isArray(citations) || !citations.length) throw new Error(`${id} citations must be a non-empty array`);
  const sourceCitation = citations.find(
    (citation) =>
      citation === listing.url ||
      (citation &&
        typeof citation === "object" &&
        String(citation.source_url || "") === listing.url),
  );
  if (!sourceCitation) throw new Error(`${id} citations must preserve the exact source URL`);
}

function factDigits(value) {
  return [
    ...String(value || "")
      .replace(/(?<!\p{L})([mм])\s*[²2](?=\b|\p{P}|\s|$)/giu, "$1²")
      .matchAll(/\p{Nd}/gu),
  ]
    .map((match) => match[0])
    .sort()
    .join("");
}

function normalizeRecord(record, { listing, locale, sourceHash }) {
  const id = `${record.listing_id}:${record.locale}`;
  for (const field of REQUIRED_FIELDS) {
    if (!Object.hasOwn(record, field)) throw new Error(`${id} is missing catalog field ${field}`);
  }

  const normalized = {
    ...record,
    listing_id: text(record.listing_id, "listing_id", id),
    source_locale: text(record.source_locale, "source_locale", id),
    locale: text(record.locale, "locale", id),
    source_hash: text(record.source_hash, "source_hash", id),
    title: text(record.title, "title", id),
    description: text(record.description, "description", id),
    seo_title: text(record.seo_title, "seo_title", id),
    meta_description: text(record.meta_description, "meta_description", id),
    translator: text(record.translator, "translator", id),
    content_origin: text(record.content_origin, "content_origin", id),
    reviewed_by: nullableText(record.reviewed_by, "reviewed_by", id),
    reviewed_at: validDate(record.reviewed_at, "reviewed_at", id),
    publication_authorized_by: nullableText(record.publication_authorized_by, "publication_authorized_by", id),
    publication_authorized_at: validDate(record.publication_authorized_at, "publication_authorized_at", id),
    status: text(record.status, "status", id),
  };

  if (normalized.listing_id !== listing.id) throw new Error(`${id} does not match listing ${listing.id}`);
  if (normalized.source_locale !== listing.locale) throw new Error(`${id} has stale source_locale`);
  if (normalized.locale === normalized.source_locale) throw new Error(`${id} cannot translate into its source locale`);
  if (normalized.source_hash !== sourceHash) throw new Error(`${id} has stale source_hash`);
  if (!LISTING_TRANSLATION_STATUSES.includes(normalized.status)) throw new Error(`${id} has invalid status ${normalized.status}`);
  if (normalized.content_origin !== "manual_translation") throw new Error(`${id} must be a manual translation`);
  if (!normalized.publication_authorized_by || !normalized.publication_authorized_at) {
    throw new Error(`${id} requires publication authorization`);
  }
  if (charLength(normalized.seo_title) > 60) throw new Error(`${id} seo_title exceeds 60 characters`);
  const metaLength = charLength(normalized.meta_description);
  const minimumMetaLength = normalized.locale === "he" ? 90 : 120;
  if (metaLength < minimumMetaLength || metaLength > 160) {
    throw new Error(`${id} meta_description must contain ${minimumMetaLength}-160 characters`);
  }

  const source = listingSourceSnapshot(listing);
  if (normalized.description === String(source.description || "").trim()) {
    throw new Error(`${id} description matches the source placeholder`);
  }
  if (
    normalized.title === String(source.title || "").trim() &&
    normalized.description === String(source.description || "").trim()
  ) {
    throw new Error(`${id} translated copy matches the source placeholder`);
  }
  if (
    factDigits(`${source.title || source.h1 || ""}\n${source.description || ""}`) !==
    factDigits(`${normalized.title}\n${normalized.description}`)
  ) {
    throw new Error(`${id} does not preserve every numeric source fact`);
  }
  if (normalized.locale === "he") {
    if (locale.direction !== "rtl") throw new Error("Hebrew locale metadata must be RTL");
    if (!HEBREW.test(`${normalized.title}\n${normalized.description}\n${normalized.meta_description}`)) {
      throw new Error(`${id} must contain Hebrew copy`);
    }
  }

  assertCitations(record.citations, listing, id);

  if (normalized.status === "published") {
    if (!normalized.reviewed_by || !normalized.reviewed_at) throw new Error(`${id} published copy requires human review`);
    if (!normalized.publication_authorized_by || !normalized.publication_authorized_at) {
      throw new Error(`${id} published copy requires publication authorization`);
    }
  }

  return normalized;
}

function schemaRow(record, locale) {
  const published = record.status === "published";
  return {
    listing: record.listing_id,
    locale: record.locale,
    source_locale: record.source_locale,
    status: record.status,
    translation_state: record.status,
    source_hash: record.source_hash,
    translated_hash: translatedHash(record),
    title: record.title,
    description: record.description,
    seo_title: record.seo_title,
    meta_description: record.meta_description,
    translator: record.translator,
    content_origin: record.content_origin,
    reviewer: record.reviewed_by,
    approved_at: record.reviewed_at,
    human_approved: published,
    publication_authorized_by: record.publication_authorized_by,
    publication_authorized_at: record.publication_authorized_at,
    published_at: published ? record.publication_authorized_at : null,
    direction: locale.direction,
    public_indexable: published,
    citations: record.citations,
  };
}

export function validateListingTranslationsCatalog(
  records,
  { listings, registry, requireComplete = true, requirePublished = false } = {},
) {
  if (!Array.isArray(records)) throw new Error("Listing translation catalog records must be an array");
  if (!Array.isArray(listings)) throw new Error("Listing translation catalog requires source listings");
  if (!registry?.locales) throw new Error("Listing translation catalog requires the locale registry");
  if (requireComplete && listings.length !== EXPECTED_LISTING_COUNT) {
    throw new Error(`Expected ${EXPECTED_LISTING_COUNT} source listings, got ${listings.length}`);
  }

  const publicLocales = requiredPublicLocales(registry);
  const locales = new Map(registry.locales.map((locale) => [locale.code, locale]));
  const listingById = new Map(listings.map((listing) => [listing.id, listing]));
  if (listingById.size !== listings.length) throw new Error("Source listings contain duplicate ids");

  const expected = new Set();
  for (const listing of listings) {
    if (!publicLocales.includes(listing.locale)) throw new Error(`${listing.id} has unsupported source locale ${listing.locale}`);
    for (const locale of publicLocales) {
      if (locale !== listing.locale) expected.add(`${listing.id}:${locale}`);
    }
  }

  const seen = new Set();
  const normalized = records.map((record) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error("Listing translation catalog rows must be objects");
    }
    const id = `${record?.listing_id || "unknown"}:${record?.locale || "unknown"}`;
    if (seen.has(id)) throw new Error(`Duplicate listing translation ${id}`);
    seen.add(id);
    if (!expected.has(id)) throw new Error(`Unexpected listing translation ${id}`);
    const listing = listingById.get(record.listing_id);
    const locale = locales.get(record.locale);
    if (!listing) throw new Error(`Unknown listing ${record.listing_id}`);
    if (!locale || !publicLocales.includes(locale.code) || !locale.public_enabled || !locale.indexable) {
      throw new Error(`${id} uses a non-public locale`);
    }
    return normalizeRecord(record, {
      listing,
      locale,
      sourceHash: contentHash(listingSourceSnapshot(listing)),
    });
  });

  if (requireComplete) {
    const expectedCount = EXPECTED_LISTING_COUNT * EXPECTED_TRANSLATIONS_PER_LISTING;
    if (records.length !== expectedCount) throw new Error(`Expected ${expectedCount} listing translations, got ${records.length}`);
    const missing = [...expected].filter((id) => !seen.has(id));
    if (missing.length) throw new Error(`Missing listing translations: ${missing.slice(0, 10).join(", ")}`);
  }
  if (requirePublished) {
    const pending = normalized.filter((record) => record.status !== "published");
    if (pending.length) throw new Error(`${pending.length} listing translations still require human review`);
  }

  const localeRank = new Map(publicLocales.map((locale, index) => [locale, index]));
  normalized.sort(
    (left, right) =>
      left.listing_id.localeCompare(right.listing_id) ||
      localeRank.get(left.locale) - localeRank.get(right.locale),
  );
  const translationRows = normalized.map((record) => schemaRow(record, locales.get(record.locale)));
  const byLocale = Object.fromEntries(publicLocales.map((locale) => [locale, 0]));
  for (const record of normalized) byLocale[record.locale] += 1;
  const published = normalized.filter((record) => record.status === "published").length;
  const metaDescriptionBelowTarget = normalized.filter((record) => charLength(record.meta_description) < 120).length;

  return {
    records: normalized,
    translationRows,
    summary: {
      listings: listings.length,
      translations: normalized.length,
      expected_translations: expected.size,
      by_locale: byLocale,
      human_review_pending: normalized.length - published,
      published,
      complete: normalized.length === expected.size,
      publication_ready: normalized.length === expected.size && published === normalized.length,
      meta_description_below_target: metaDescriptionBelowTarget,
    },
  };
}

export function loadListingTranslationsCatalog({
  directory = DEFAULT_LISTING_TRANSLATIONS_DIR,
  listings,
  registry,
  requireComplete = true,
  requirePublished = false,
} = {}) {
  if (!fs.existsSync(directory)) throw new Error(`Listing translation catalog directory is missing: ${directory}`);
  const jsonFiles = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name);
  const invalidFiles = jsonFiles.filter((file) => !BATCH_FILE.test(file));
  if (invalidFiles.length) throw new Error(`Invalid listing translation batch filename: ${invalidFiles.join(", ")}`);
  const batchFiles = jsonFiles.sort();
  if (!batchFiles.length) throw new Error(`Listing translation catalog has no batch files: ${directory}`);

  const records = batchFiles.flatMap((file) => {
    const value = JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"));
    if (!Array.isArray(value)) throw new Error(`${file} must contain a JSON array`);
    return value;
  });
  const catalog = validateListingTranslationsCatalog(records, {
    listings,
    registry,
    requireComplete,
    requirePublished,
  });
  return { ...catalog, batchFiles };
}
