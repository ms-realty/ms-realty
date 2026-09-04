import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import {
  assertListingPublicationReport,
  buildListingPublicationReport,
} from "../lib/listing-publication.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { fromRoot } from "../lib/paths.mjs";

test("listing publication report covers sitemap entries and internal-link suggestions", () => {
  const report = buildListingPublicationReport({ seed: loadCmsSeed(), generatedAt: "2026-07-05T00:00:00Z" });
  const row = report.rows.find((candidate) => candidate.listing_id === "MS-00815");

  assert.equal(assertListingPublicationReport(report), true);
  assert.equal(report.summary.listings, 165);
  assert.equal(report.summary.missing_sitemap_entries, 0);
  assert.ok(row.sitemap_paths.includes("/bg/imoti/MS-00815"));
  assert.ok(row.internal_link_suggestions.some((link) => link.kind === "homepage_feature"));
  assert.ok(row.internal_link_suggestions.some((link) => link.kind === "location_page"));
  assert.equal(row.publication_readiness.ready, false);
  assert.ok(row.publication_readiness.blocking_fields.includes("primary_area_sqm"));
  assert.equal(report.summary.ready_for_publish + report.summary.blocked_for_publish, report.summary.listings);
});

test("new listing records inherit sitemap coverage and editor link suggestions", () => {
  const seed = loadCmsSeed();
  const source = seed.records.find((record) => record.collection === "listings" && record.id === "MS-00815");
  const newListing = {
    ...source,
    id: "MS-NEW-0001",
    facts: { ...source.facts, id: "MS-NEW-0001", listing_status: "available" },
    translations: source.translations.filter((translation) => translation.locale === "bg"),
  };
  const report = buildListingPublicationReport({
    seed: { ...seed, records: [...seed.records, newListing], summary: { ...seed.summary, listings: seed.summary.listings + 1 } },
    generatedAt: "2026-07-05T00:00:00Z",
  });
  const row = report.rows.find((candidate) => candidate.listing_id === "MS-NEW-0001");

  assert.equal(report.summary.listings, 166);
  assert.equal(row.primary_path, "/bg/imoti/MS-NEW-0001");
  assert.ok(row.internal_link_suggestions.length > 0);
  assert.equal(assertListingPublicationReport(report), true);
});

test("listing publication build honors mounted listing edits and output path", () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-listing-publication-`);
  const editPath = `${dir}/listing-edits.jsonl`;
  const reportPath = `${dir}/listing-publication-report.json`;
  fs.writeFileSync(
    editPath,
    `${JSON.stringify({ listing_id: "MS-00815", patch: { listing_status: "reserved" } })}\n`,
  );

  const result = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-listing-publication-report.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...process.env,
      MS_REALTY_LISTING_EDIT_LEDGER_PATH: editPath,
      MS_REALTY_LISTING_PUBLICATION_REPORT_PATH: reportPath,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(reportPath));
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(assertListingPublicationReport(report), true);
  assert.equal(report.rows.find((row) => row.listing_id === "MS-00815").listing_status, "reserved");
});

test("generated listing publication report is valid when present", () => {
  const file = fromRoot("production", "data", "listing-publication-report.json");
  if (!fs.existsSync(file)) return;
  assert.equal(assertListingPublicationReport(JSON.parse(fs.readFileSync(file, "utf8"))), true);
});
