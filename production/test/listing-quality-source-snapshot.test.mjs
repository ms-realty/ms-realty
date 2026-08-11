import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import {
  buildListingQualitySourceSnapshot,
  writeListingQualitySourceSnapshot,
} from "../lib/listing-quality-source-snapshot.mjs";
import { fromRoot } from "../lib/paths.mjs";

function seedFixture() {
  return {
    records: [
      {
        id: "listing-1",
        collection: "listings",
        source_locale: "bg",
        source_domain: "makler-realty.com",
        source_url: "https://makler-realty.com/listing-1",
        facts: { area_sqm: 1, location: "Seed location", description: "Seed description" },
        workflow: {},
        property: "property-1",
        location: "location-1",
        seo: {},
        translations: [],
        media: [],
        migration: {},
        routing: { target_path: "/bg/imoti/listing-1" },
      },
    ],
    properties: [{ id: "property-1", facts: {}, fact_verification: [], zero_value_audit: [] }],
    locations: [{ id: "location-1", label: "Seed location" }],
    enrichment_tasks: [],
    summary: { listings: 1 },
  };
}

function payloadFixture({ listings = null } = {}) {
  const docs = {
    locales: [{ id: "locale-bg", code: "bg" }],
    locations: [{ id: "location-1", label: "Payload location" }],
    properties: [{ id: "property-1", facts: {}, fact_verification: [], zero_value_audit: [] }],
    listings:
      listings ??
      [
        {
          id: "listing-1",
          cms_status: "source_imported_review_required",
          source_locale: "locale-bg",
          source_domain: "makler-realty.com",
          source_url: "https://makler-realty.com/listing-1",
          facts: { area_sqm: 99, location: "Payload location", description: "Payload description" },
          workflow: {},
          property: "property-1",
          location: "location-1",
          seo: {},
          translations: [],
          media: [],
          migration: {},
          routing: { target_path: "/bg/imoti/listing-1" },
        },
      ],
    listing_translations: [],
    media_assets: [],
    listing_tours: [],
    listing_enrichment_tasks: [],
    search_outbox: [],
  };
  return {
    db: {
      beginTransaction: async () => "read-transaction",
      commitTransaction: async () => undefined,
      rollbackTransaction: async () => undefined,
    },
    find: async ({ collection }) => ({ docs: docs[collection] || [] }),
    create: async () => undefined,
    update: async () => undefined,
  };
}

test("listing-quality source snapshot uses the repeatable-read Payload authority", async () => {
  const snapshot = await buildListingQualitySourceSnapshot({
    capturedAt: "2026-08-11T00:00:00Z",
    payload: payloadFixture(),
    seed: seedFixture(),
  });

  assert.equal(snapshot.source.authority, "payload_postgres");
  assert.equal(snapshot.source.listings, 1);
  assert.deepEqual(snapshot.payload_overlay.listing_ids, ["listing-1"]);
  assert.equal(snapshot.records[0].facts.area_sqm, 99);
  assert.equal(snapshot.records[0].facts.location, "Payload location");
});

test("listing-quality source snapshot fails closed when Payload is incomplete", async () => {
  await assert.rejects(
    buildListingQualitySourceSnapshot({ payload: payloadFixture({ listings: [] }), seed: seedFixture() }),
    /complete Payload listing authority/,
  );
});

test("listing-quality source snapshot writer persists only the validated authority projection", async () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-listing-quality-source-`);
  const outputPath = `${dir}/snapshot.json`;
  const snapshot = await buildListingQualitySourceSnapshot({ payload: payloadFixture(), seed: seedFixture() });

  assert.equal(writeListingQualitySourceSnapshot(snapshot, outputPath), outputPath);
  assert.equal(JSON.parse(fs.readFileSync(outputPath, "utf8")).records[0].facts.area_sqm, 99);
});

test("Payload listing-quality packet CLI fails closed without Neon runtime authority", () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-listing-quality-payload-cli-`);
  const result = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-payload-listing-quality-review-packet.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: "",
      PAYLOAD_SECRET: "",
      MS_REALTY_LISTING_QUALITY_SOURCE_SNAPSHOT_PATH: `${dir}/snapshot.json`,
      MS_REALTY_LISTING_QUALITY_REPORT_PATH: `${dir}/report.json`,
      MS_REALTY_LISTING_QUALITY_WORKBOOK_PATH: `${dir}/workbook.csv`,
      MS_REALTY_LISTING_QUALITY_REVIEW_PACKET_PATH: `${dir}/packet.json`,
      MS_REALTY_LISTING_QUALITY_REVIEW_DRAFT_PATH: `${dir}/draft.csv`,
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Payload runtime is not configured/);
  assert.deepEqual(fs.readdirSync(dir), []);
});
