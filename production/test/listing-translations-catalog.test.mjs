import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listingSourceSnapshot } from "../lib/content.mjs";
import {
  EXPECTED_LISTING_COUNT,
  EXPECTED_TRANSLATIONS_PER_LISTING,
  loadListingTranslationsCatalog,
  validateListingTranslationsCatalog,
} from "../lib/listing-translations-catalog.mjs";
import { loadLocaleRegistry, requiredPublicLocales } from "../lib/locales.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { contentHash } from "../lib/translations.mjs";

const registry = loadLocaleRegistry();
const publicLocales = requiredPublicLocales(registry);

function sourceListings() {
  return Array.from({ length: EXPECTED_LISTING_COUNT }, (_, index) => {
    const number = index + 1;
    return {
      id: `MS-CRAWL-${String(number).padStart(4, "0")}`,
      locale: number <= 113 ? "bg" : "ru",
      url: `https://example.test/listing/${number}`,
      title: `Source title ${number}`,
      h1: `Source title ${number}`,
      description: `Source description ${number} with source-faithful property details.`,
      location: "Sandanski",
    };
  });
}

function fixedLength(value, length = 130) {
  return value.repeat(Math.ceil(length / value.length)).slice(0, length);
}

function catalogRecord(listing, locale) {
  const fact = String(Number(listing.id.slice(-4)));
  const localeWord = {
    bg: "Имот",
    en: "Property",
    de: "Immobilie",
    nl: "Woning",
    ru: "Объект",
    el: "Ακίνητο",
    he: "נכס",
  }[locale];
  return {
    listing_id: listing.id,
    source_locale: listing.locale,
    locale,
    source_hash: contentHash(listingSourceSnapshot(listing)),
    title: `${localeWord} translated title ${fact}`,
    description: `${localeWord} translated description with every source property detail preserved, including value ${fact}.`,
    seo_title: `${localeWord} ${listing.id}`,
    meta_description: fixedLength(
      `${localeWord} accurate property summary for ${listing.id}, preserving the source location and stated facts only. `,
    ),
    translator: "catalog-test-translator",
    content_origin: "manual_translation",
    reviewed_by: null,
    reviewed_at: null,
    publication_authorized_by: "agency_owner",
    publication_authorized_at: "2026-08-30T00:00:00Z",
    status: "human_review_pending",
    citations: [{ source: "cms_seed", object_id: listing.id, source_url: listing.url }],
  };
}

function completeCatalog(listings = sourceListings()) {
  return listings.flatMap((listing) =>
    publicLocales.filter((locale) => locale !== listing.locale).map((locale) => catalogRecord(listing, locale)),
  );
}

function temporaryCatalog(records) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-listing-translations-"));
  const middle = Math.ceil(records.length / 2);
  // Write in reverse order to prove filesystem order cannot affect the canonical output.
  fs.writeFileSync(path.join(directory, "batch-002.json"), `${JSON.stringify(records.slice(middle), null, 2)}\n`);
  fs.writeFileSync(path.join(directory, "batch-001.json"), `${JSON.stringify(records.slice(0, middle), null, 2)}\n`);
  return directory;
}

test("complete manual translation batches load deterministically and project pending schema rows", (t) => {
  const listings = sourceListings();
  const directory = temporaryCatalog(completeCatalog(listings));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const catalog = loadListingTranslationsCatalog({ directory, listings, registry });

  assert.deepEqual(catalog.batchFiles, ["batch-001.json", "batch-002.json"]);
  assert.equal(catalog.summary.translations, EXPECTED_LISTING_COUNT * EXPECTED_TRANSLATIONS_PER_LISTING);
  assert.equal(catalog.summary.complete, true);
  assert.equal(catalog.summary.publication_ready, false);
  assert.equal(catalog.summary.human_review_pending, 990);
  assert.equal(catalog.records[0].listing_id, "MS-CRAWL-0001");
  assert.equal(catalog.records[0].locale, "en");
  const hebrew = catalog.translationRows.find((record) => record.listing === "MS-CRAWL-0001" && record.locale === "he");
  assert.equal(hebrew.direction, "rtl");
  assert.equal(hebrew.human_approved, false);
  assert.equal(hebrew.public_indexable, false);
  assert.equal(hebrew.reviewer, null);
  assert.equal(hebrew.translator, "catalog-test-translator");
  assert.equal(hebrew.publication_authorized_at, "2026-08-30T00:00:00Z");
  assert.equal(hebrew.published_at, null);
  assert.equal(hebrew.citations[0].source_url, listings[0].url);
  assert.match(hebrew.translated_hash, /^[a-f0-9]{64}$/);
});

test("published catalog rows require review and publication authorization", () => {
  const listings = sourceListings();
  const pending = catalogRecord(listings[0], "en");
  assert.throws(
    () => validateListingTranslationsCatalog([pending], { listings, registry, requireComplete: false, requirePublished: true }),
    /still require human review/,
  );

  const published = {
    ...pending,
    status: "published",
    reviewed_by: "translator_en",
    reviewed_at: "2026-08-30T08:00:00Z",
    publication_authorized_by: "agency_owner",
    publication_authorized_at: "2026-08-30T09:00:00Z",
  };
  const catalog = validateListingTranslationsCatalog([published], {
    listings,
    registry,
    requireComplete: false,
    requirePublished: true,
  });
  assert.deepEqual(
    {
      reviewer: catalog.translationRows[0].reviewer,
      approved_at: catalog.translationRows[0].approved_at,
      published_at: catalog.translationRows[0].published_at,
      human_approved: catalog.translationRows[0].human_approved,
      public_indexable: catalog.translationRows[0].public_indexable,
    },
    {
      reviewer: "translator_en",
      approved_at: "2026-08-30T08:00:00Z",
      published_at: "2026-08-30T09:00:00Z",
      human_approved: true,
      public_indexable: true,
    },
  );
});

test("catalog validation rejects incomplete, duplicate, stale, placeholder, SEO, Hebrew, and citation defects", () => {
  const listings = sourceListings();
  const records = completeCatalog(listings);
  assert.throws(
    () => validateListingTranslationsCatalog(records.slice(0, -1), { listings, registry }),
    /Expected 990 listing translations/,
  );
  assert.throws(
    () => validateListingTranslationsCatalog([records[0], records[0]], { listings, registry, requireComplete: false }),
    /Duplicate listing translation/,
  );
  assert.throws(
    () =>
      validateListingTranslationsCatalog([{ ...records[0], source_hash: "stale" }], {
        listings,
        registry,
        requireComplete: false,
      }),
    /stale source_hash/,
  );
  assert.throws(
    () =>
      validateListingTranslationsCatalog([{ ...records[0], description: listings[0].description }], {
        listings,
        registry,
        requireComplete: false,
      }),
    /description matches the source placeholder/,
  );
  assert.throws(
    () =>
      validateListingTranslationsCatalog([{ ...records[0], meta_description: "Too short" }], {
        listings,
        registry,
        requireComplete: false,
      }),
    /120-160 characters/,
  );
  const hebrew = records.find((record) => record.locale === "he");
  assert.throws(
    () =>
      validateListingTranslationsCatalog(
        [{ ...hebrew, title: "English 1", description: "English description 1", meta_description: fixedLength("English metadata. ") }],
        { listings, registry, requireComplete: false },
      ),
    /title must contain Hebrew script/,
  );
  assert.throws(
    () =>
      validateListingTranslationsCatalog(
        [
          {
            ...records[0],
            title: "Объект 1",
            description: "Описание объекта с сохранением исходных данных 1.",
            seo_title: "Объект 1",
            meta_description: fixedLength("Описание объекта с сохранением исходных данных. "),
          },
        ],
        { listings, registry, requireComplete: false },
      ),
    /title must contain Latin script/,
  );
  assert.throws(
    () =>
      validateListingTranslationsCatalog([{ ...records[0], citations: [{ object_id: "wrong", source_url: "https://wrong.test" }] }], {
        listings,
        registry,
        requireComplete: false,
      }),
    /citations must preserve the exact source URL/,
  );
  assert.throws(
    () =>
      validateListingTranslationsCatalog([{ ...records[0], description: `${records[0].description} 9` }], {
        listings,
        registry,
        requireComplete: false,
      }),
    /does not preserve every numeric source fact/,
  );
  const russianWithWordEndingEm = records.find(
    (record) => record.listing_id === "MS-CRAWL-0002" && record.locale === "ru",
  );
  assert.doesNotThrow(() =>
    validateListingTranslationsCatalog(
      [{ ...russianWithWordEndingEm, title: "Объект 2", description: "В нем 2 этажа." }],
      { listings, registry, requireComplete: false },
    ),
  );
  assert.throws(
    () =>
      validateListingTranslationsCatalog([{ ...records[0], publication_authorized_by: null, publication_authorized_at: null }], {
        listings,
        registry,
        requireComplete: false,
      }),
    /requires publication authorization/,
  );
});

test("catalog CLI validates a complete catalog without publishing pending rows", (t) => {
  const listings = sourceListings();
  const directory = temporaryCatalog(completeCatalog(listings));
  const listingsPath = path.join(directory, "source-listings.data");
  fs.writeFileSync(listingsPath, `${JSON.stringify(listings, null, 2)}\n`);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const output = execFileSync(process.execPath, [fromRoot("production", "scripts", "build-listing-translations.mjs")], {
    cwd: fromRoot(),
    env: {
      ...process.env,
      MS_REALTY_LISTING_TRANSLATIONS_DIR: directory,
      MS_REALTY_LISTINGS_PATH: listingsPath,
    },
    encoding: "utf8",
  });
  assert.match(output, /Validated 990 listing translations across 2 batches/);
  assert.match(output, /990 awaiting review/);
});
