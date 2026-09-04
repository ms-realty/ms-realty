import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { listingSourceSnapshot } from "../lib/content.mjs";
import { buildListingIdMap, loadListingIdentityInputs } from "../lib/listing-identity.mjs";
import { contentHash } from "../lib/translations.mjs";
import { CRAWL_ERA_TOKEN, KEYED_FILES, rewriteListingIds } from "../../migration/rename_listing_ids.mjs";

const identityInputs = loadListingIdentityInputs();
const idMap = buildListingIdMap(identityInputs);

function write(root, relative, content) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function read(root, relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function listing(id, locale = "bg") {
  return {
    id,
    locale,
    url: `https://example.test/listing/${id.toLowerCase()}`,
    title: `Source title ${id}`,
    h1: `Source title ${id}`,
    description: `Source description ${id}`,
    location: "Sandanski",
  };
}

function fixtureRoot(listings) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-rename-ids-"));
  write(root, "search/data/listings.json", `${JSON.stringify(listings, null, 2)}\n`);
  write(
    root,
    "production/data/listing-translations/batch-001.json",
    `${JSON.stringify(
      [
        { listing_id: "MS-CRAWL-0001", locale: "en", source_hash: "stale", title: "One", citations: ["https://example.test/listing/ms-crawl-0001"] },
        { listing_id: "MS-CRAWL-0147", locale: "en", source_hash: "stale", title: "Retired twin" },
      ],
      null,
      2,
    )}\n`,
  );
  write(
    root,
    "production/data/listing-edits.jsonl",
    `${JSON.stringify({ id: "listing-edit-MS-CRAWL-0001", listing_id: "MS-CRAWL-0001", patch: { location: "Hotovo" } })}\n` +
      `${JSON.stringify({ id: "listing-edit-MS-3000", listing_id: "MS-3000", patch: { price_eur: 1 } })}\n`,
  );
  write(
    root,
    "production/data/location-reviews.json",
    `${JSON.stringify({ listing_overrides: { "MS-CRAWL-0013": "hotovo" }, listing_statuses: { "MS-CRAWL-0026": { status: "legacy_area_only" } } }, null, 2)}\n`,
  );
  write(
    root,
    "production/data/listing-publication-approval.json",
    `${JSON.stringify({ approval_id: "MSR-LISTING-PUBLICATION-1", listing_ids: ["MS-3000", "MS-CRAWL-0001", "MS-CRAWL-0147"] }, null, 2)}\n`,
  );
  write(root, "production/data/lead-ledger.jsonl", `${JSON.stringify({ id: "lead-1", listing_reference: "MS-CRAWL-0001" })}\n`);
  write(
    root,
    "production/data/slug-history.jsonl",
    `${JSON.stringify({ id: "slug-change-MS-CRAWL-0001", listing_id: "MS-CRAWL-0001", old_path: "/he/properties/old", new_path: "/he/properties/MS-CRAWL-0001" })}\n`,
  );
  write(root, "production/data/saved-searches.jsonl", `${JSON.stringify({ id: "saved-search-1", query: "Sandanski" })}\n`);
  return root;
}

test("rename script maps crawl era ids to lot number ids and recomputes translation source hashes", (t) => {
  const listings = [listing("MS-CRAWL-0001"), listing("MS-3000"), listing("MS-CRAWL-0147", "ru")];
  const root = fixtureRoot(listings);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const result = rewriteListingIds({ root, identityInputs });

  assert.equal(result.public_ids, 127);
  assert.equal(result.retired_ids, 38);
  assert.deepEqual(result.changed.sort(), [
    "production/data/lead-ledger.jsonl",
    "production/data/listing-edits.jsonl",
    "production/data/listing-publication-approval.json",
    "production/data/listing-translations/batch-001.json",
    "production/data/location-reviews.json",
    "production/data/slug-history.jsonl",
  ]);

  const batch = JSON.parse(read(root, "production/data/listing-translations/batch-001.json"));
  assert.equal(batch[0].listing_id, "MS-00815");
  assert.equal(batch[0].source_hash, contentHash(listingSourceSnapshot({ ...listings[0], id: "MS-00815" })));
  assert.equal(batch[0].citations[0], "https://example.test/listing/ms-crawl-0001", "URLs are not ids and stay untouched");
  assert.equal(batch[1].listing_id, "MS-CRAWL-0147", "a retired twin keeps its crawl era id");
  assert.equal(batch[1].source_hash, contentHash(listingSourceSnapshot(listings[2])));

  const edits = read(root, "production/data/listing-edits.jsonl").trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(
    edits.map((row) => [row.id, row.listing_id]),
    [
      ["listing-edit-MS-00815", "MS-00815"],
      ["listing-edit-MS-00356", "MS-00356"],
    ],
  );

  const reviews = JSON.parse(read(root, "production/data/location-reviews.json"));
  assert.deepEqual(reviews.listing_overrides, { "MS-00567-1": "hotovo" });
  assert.deepEqual(reviews.listing_statuses, { "MS-01001": { status: "legacy_area_only" } });

  const approval = JSON.parse(read(root, "production/data/listing-publication-approval.json"));
  assert.deepEqual(approval.listing_ids, ["MS-00356", "MS-00815", "MS-CRAWL-0147"]);

  assert.equal(JSON.parse(read(root, "production/data/lead-ledger.jsonl")).listing_reference, "MS-00815");
  const slug = JSON.parse(read(root, "production/data/slug-history.jsonl"));
  assert.equal(slug.id, "slug-change-MS-00815");
  assert.equal(slug.new_path, "/he/properties/MS-00815");
  assert.equal(read(root, "production/data/saved-searches.jsonl"), `${JSON.stringify({ id: "saved-search-1", query: "Sandanski" })}\n`);

  const again = rewriteListingIds({ root, identityInputs });
  assert.deepEqual(again.changed, [], "a second run is a no-op");
  const check = rewriteListingIds({ root, identityInputs, check: true });
  assert.equal(check.check, true);
});

test("rename script refuses to write while a crawl era id has no lot number decision", (t) => {
  const root = fixtureRoot([listing("MS-CRAWL-0001"), listing("MS-3000"), listing("MS-CRAWL-0147", "ru")]);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, "production/data/lead-ledger.jsonl", `${JSON.stringify({ id: "lead-2", listing_reference: "MS-CRAWL-9999" })}\n`);
  const before = read(root, "production/data/listing-edits.jsonl");

  assert.throws(() => rewriteListingIds({ root, identityInputs }), /Refusing to rename: no lot number decision for MS-CRAWL-9999/);
  assert.equal(read(root, "production/data/listing-edits.jsonl"), before, "nothing is written when any id is unmapped");
});

test("rename script refuses when a translation row names a listing the fixture does not carry", (t) => {
  const root = fixtureRoot([listing("MS-CRAWL-0001"), listing("MS-3000")]);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.throws(() => rewriteListingIds({ root, identityInputs }), /translation rows name listings absent from listings.json: MS-CRAWL-0147/);
});

test("crawl era token matches whole ids only", () => {
  assert.deepEqual("MS-CRAWL-0001 MS-3000 MS-30001 MS-00815 MS-CRAWL-01".match(CRAWL_ERA_TOKEN), ["MS-CRAWL-0001", "MS-3000"]);
  assert.ok(KEYED_FILES.some((entry) => entry.path === "production/data/listing-translations"));
  assert.ok(KEYED_FILES.some((entry) => entry.path === "production/data/listing-publication-approval.json"));
  assert.equal(idMap.get("MS-CRAWL-0001").id, "MS-00815");
  assert.equal(idMap.get("MS-CRAWL-0147").merged_into, "MS-00662");
});
