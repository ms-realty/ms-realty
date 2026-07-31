import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadCmsSeed } from "../lib/runtime.mjs";

const VERIFIED_FIELDS = [
  "primary_area_sqm",
  "living_area_sqm",
  "built_area_sqm",
  "usable_area_sqm",
  "gross_floor_area_sqm",
  "land_area_sqm",
  "bedrooms_count",
];

let fixturePath;
let fixtureEnv;

export function approvedPublicSeedFixturePath() {
  if (fixturePath) return fixturePath;
  const seed = loadCmsSeed();
  const properties = (seed.properties || []).map((property) => ({
    ...property,
    property_family: property.property_family || "apartment",
    property_subtype: property.property_subtype || property.property_family || "apartment",
    taxonomy_review_status: "mapped",
    facts: {
      ...property.facts,
      ...Object.fromEntries(VERIFIED_FIELDS.map((field) => [field, Number(property.facts?.[field]) > 0 ? property.facts[field] : 1])),
    },
    fact_verification: [
      ...VERIFIED_FIELDS.map((field) => ({ field, state: "broker_verified" })),
      ...(property.fact_verification || []).filter((row) => !VERIFIED_FIELDS.includes(row.field)),
    ],
  }));
  const records = seed.records.map((record) =>
    record.collection !== "listings"
      ? record
      : {
          ...record,
          facts: { ...record.facts, listing_status: "available", price_on_request: false, price_eur: Number(record.facts?.price_eur) > 0 ? record.facts.price_eur : 1 },
          seo: { ...record.seo, human_approved: true },
          workflow: {
            ...record.workflow,
            location_verified_at: "2026-07-01T00:00:00Z",
            price_verified_at: "2026-07-01T00:00:00Z",
            availability_verified_at: "2026-07-01T00:00:00Z",
            publish_approved: true,
          },
          media_workflow: { ...record.media_workflow, review_gated_assets: 0 },
        },
  );
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-approved-public-seed-"));
  fixturePath = path.join(directory, "cms-seed.json");
  fs.writeFileSync(fixturePath, `${JSON.stringify({ ...seed, records, properties })}\n`);
  const listingEditLedgerPath = path.join(directory, "listing-edits.jsonl");
  const mediaReviewLedgerPath = path.join(directory, "media-reviews.jsonl");
  fs.writeFileSync(listingEditLedgerPath, "");
  fs.writeFileSync(mediaReviewLedgerPath, "");
  fixtureEnv = {
    MS_REALTY_CMS_SEED_PATH: fixturePath,
    MS_REALTY_LISTING_EDIT_LEDGER_PATH: listingEditLedgerPath,
    MS_REALTY_MEDIA_REVIEW_LEDGER_PATH: mediaReviewLedgerPath,
  };
  return fixturePath;
}

export function approvedPublicSeedFixtureEnv() {
  approvedPublicSeedFixturePath();
  return fixtureEnv;
}

export function approvedPublicSeedFixture() {
  return loadCmsSeed(approvedPublicSeedFixturePath());
}

export function approvedPublicSeedFixtureOptions() {
  const env = approvedPublicSeedFixtureEnv();
  return {
    seed: approvedPublicSeedFixture(),
    listingEditLedgerPath: env.MS_REALTY_LISTING_EDIT_LEDGER_PATH,
    mediaReviewLedgerPath: env.MS_REALTY_MEDIA_REVIEW_LEDGER_PATH,
  };
}
