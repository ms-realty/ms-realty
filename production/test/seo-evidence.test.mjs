import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import {
  assertSeoEvidencePreflightReport,
  assertSeoEvidence,
  buildSeoEvidencePreflightReport,
  buildSeoEvidence,
  loadMigrationRecords,
  readSeoExportTemplate,
  validateSeoEvidenceInputs,
  writeExternalSeoExport,
} from "../lib/seo-evidence.mjs";
import { fromRoot } from "../lib/paths.mjs";

function legacyDomainSampleUrls() {
  const records = loadMigrationRecords();
  const com = records.find((row) => row.source_domain === "makler-realty.com");
  const ru = records.find((row) => row.source_domain === "makler-realty.ru");
  assert.ok(com?.old_url);
  assert.ok(ru?.old_url);
  return { com: com.old_url, ru: ru.old_url };
}

function writeCompleteSeoInputFixture(dir) {
  const { com, ru } = legacyDomainSampleUrls();
  fs.writeFileSync(`${dir}/search-console.csv`, `url,clicks,impressions,position\n${com},3,30,7\n${ru},2,20,8\n`);
  fs.writeFileSync(`${dir}/yandex-webmaster.csv`, `url,indexed,issue\n${com},yes,\n${ru},yes,\n`);
  fs.writeFileSync(`${dir}/backlinks.csv`, `target_url,source_url\n${com},https://regionalbroker.bg/a\n${ru},https://partnerrealty.de/b\n`);
  return { com, ru };
}

test("SEO evidence joins external exports and privacy events to crawled URLs", () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-seo-evidence-`);
  fs.writeFileSync(`${dir}/search-console.csv`, "url,clicks,impressions,position\nhttps://makler-realty.com/p/1,3,30,7\n");
  fs.writeFileSync(`${dir}/yandex-webmaster.csv`, "url,indexed,issue\nhttps://makler-realty.com/p/1,yes,\n");
  fs.writeFileSync(`${dir}/backlinks.csv`, "target_url,source_url\nhttps://makler-realty.com/p/1,https://regionalbroker.bg/a\n");

  const evidence = buildSeoEvidence({
    inputDir: dir,
    generatedAt: "2026-07-05T00:00:00Z",
    records: [{ old_url: "https://makler-realty.com/p/1", source_domain: "makler-realty.com", url_type: "listing" }],
    routeMap: [{ old_url: "https://makler-realty.com/p/1", target_path: "/bg/imoti/MS-1" }],
    events: [
      { type: "page_view", path: "/bg/imoti/MS-1" },
      { type: "lead_submitted", path: "/api/leads", listing_reference: "MS-1" },
    ],
  });

  assert.equal(evidence.summary.crawl_urls, 1);
  assert.equal(evidence.summary.sources.search_console.matched_rows, 1);
  assert.deepEqual(evidence.summary.sources.search_console.matched_source_domains, ["makler-realty.com"]);
  assert.equal(evidence.summary.sources.privacy_events.matched_rows, 2);
  assert.equal(evidence.url_evidence[0].search_console.clicks, 3);
  assert.equal(evidence.url_evidence[0].analytics.page_views, 1);
  assert.equal(evidence.url_evidence[0].analytics.leads, 1);
});

test("external SEO evidence ignores exact duplicate rows without collapsing distinct rows", () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-deduped-seo-evidence-`);
  fs.writeFileSync(
    `${dir}/search-console.csv`,
    [
      "url,clicks,impressions,position",
      "https://makler-realty.com/p/1,3,30,7",
      "https://makler-realty.com/p/1,3,30,7",
      "https://makler-realty.com/p/1,1,10,8",
    ].join("\n"),
  );
  fs.writeFileSync(
    `${dir}/yandex-webmaster.csv`,
    [
      "url,indexed,issue",
      "https://makler-realty.com/p/1,no,duplicate-title",
      "https://makler-realty.com/p/1,no,duplicate-title",
      "https://makler-realty.com/p/1,yes,",
    ].join("\n"),
  );
  fs.writeFileSync(
    `${dir}/backlinks.csv`,
    [
      "target_url,source_url",
      "https://makler-realty.com/p/1,https://regionalbroker.bg/a",
      "https://makler-realty.com/p/1,https://regionalbroker.bg/a",
      "https://makler-realty.com/p/1,https://partnerrealty.de/b",
    ].join("\n"),
  );

  const evidence = buildSeoEvidence({
    inputDir: dir,
    generatedAt: "2026-07-05T00:00:00Z",
    records: [{ old_url: "https://makler-realty.com/p/1", source_domain: "makler-realty.com", url_type: "listing" }],
    routeMap: [],
    events: [],
  });

  assert.equal(evidence.summary.sources.search_console.row_count, 3);
  assert.equal(evidence.summary.sources.search_console.matched_rows, 2);
  assert.equal(evidence.summary.sources.search_console.duplicate_rows, 1);
  assert.equal(evidence.summary.sources.search_console.unmatched_rows, 0);
  assert.equal(evidence.url_evidence[0].search_console.clicks, 4);
  assert.equal(evidence.url_evidence[0].search_console.impressions, 40);
  assert.equal(evidence.summary.sources.yandex_webmaster.matched_rows, 2);
  assert.equal(evidence.summary.sources.yandex_webmaster.duplicate_rows, 1);
  assert.equal(evidence.url_evidence[0].yandex_webmaster.rows, 2);
  assert.equal(evidence.url_evidence[0].yandex_webmaster.issues, 1);
  assert.equal(evidence.summary.sources.backlinks.matched_rows, 2);
  assert.equal(evidence.summary.sources.backlinks.duplicate_rows, 1);
  assert.equal(evidence.url_evidence[0].backlinks.backlinks, 2);
  assert.equal(evidence.url_evidence[0].backlinks.referring_domains, 2);
});

test("required SEO exports need matched coverage for both legacy domains", () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-two-domain-seo-evidence-`);
  fs.writeFileSync(
    `${dir}/search-console.csv`,
    "url,clicks,impressions,position\nhttps://makler-realty.com/p/1,3,30,7\nhttps://makler-realty.ru/p/2,2,20,8\n",
  );
  fs.writeFileSync(
    `${dir}/yandex-webmaster.csv`,
    "url,indexed,issue\nhttps://makler-realty.com/p/1,yes,\nhttps://makler-realty.ru/p/2,yes,\n",
  );
  fs.writeFileSync(
    `${dir}/backlinks.csv`,
    "target_url,source_url\nhttps://makler-realty.com/p/1,https://regionalbroker.bg/a\nhttps://makler-realty.ru/p/2,https://partnerrealty.de/b\n",
  );

  const records = [
    { old_url: "https://makler-realty.com/p/1", source_domain: "makler-realty.com", url_type: "listing" },
    { old_url: "https://makler-realty.ru/p/2", source_domain: "makler-realty.ru", url_type: "listing" },
  ];
  const evidence = buildSeoEvidence({
    inputDir: dir,
    generatedAt: "2026-07-05T00:00:00Z",
    records,
    routeMap: [],
    events: [{ type: "page_view", path: "https://makler-realty.com/p/1" }],
  });

  assert.deepEqual(evidence.summary.missing_required_sources, []);
  assert.deepEqual(evidence.summary.sources.backlinks.matched_source_domains, ["makler-realty.com", "makler-realty.ru"]);
});

test("SEO evidence input preflight passes complete local exports without writing output", () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-valid-seo-preflight-`);
  const { com } = writeCompleteSeoInputFixture(dir);
  const evidencePath = fromRoot("production", "data", "seo-evidence.json");
  const existingEvidence = fs.existsSync(evidencePath) ? fs.readFileSync(evidencePath, "utf8") : null;

  const result = validateSeoEvidenceInputs({
    inputDir: dir,
    events: [{ type: "page_view", path: com }],
    generatedAt: "2026-07-05T00:00:00Z",
  });

  assert.equal(result.ready, true);
  assert.deepEqual(result.missing_required_sources, []);
  assert.equal(result.sources.search_console.matched_rows, 2);
  assert.deepEqual(result.sources.search_console.matched_source_domains, ["makler-realty.com", "makler-realty.ru"]);
  assert.equal(fs.existsSync(evidencePath) ? fs.readFileSync(evidencePath, "utf8") : null, existingEvidence);
});

test("SEO evidence preflight CLI fails missing exports and passes complete exports", () => {
  const script = fromRoot("production", "scripts", "validate-seo-evidence-inputs.mjs");
  const missingDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-missing-seo-preflight-`);
  const missing = spawnSync(process.execPath, [script, missingDir], { cwd: fromRoot(), encoding: "utf8" });

  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /SEO EVIDENCE PREFLIGHT FAILED/);
  assert.match(missing.stderr, /Missing required SEO evidence/);
  assert.match(missing.stderr, /search_console: 0 rows, 0 matched, 0 unmatched, 0 duplicates, status missing_export, domains none/);
  assert.match(missing.stderr, /yandex_webmaster: 0 rows, 0 matched, 0 unmatched, 0 duplicates, status missing_export, domains none/);
  assert.match(missing.stderr, /backlinks: 0 rows, 0 matched, 0 unmatched, 0 duplicates, status missing_export, domains none/);

  const validDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-cli-seo-preflight-`);
  writeCompleteSeoInputFixture(validDir);
  const valid = spawnSync(process.execPath, [script, validDir], { cwd: fromRoot(), encoding: "utf8" });
  const validFromEnv = spawnSync(process.execPath, [script], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: { ...process.env, MS_REALTY_SEO_EVIDENCE_INPUT_DIR: validDir },
  });

  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /SEO evidence inputs valid/);
  assert.match(valid.stdout, /search_console: 2 rows, 2 matched, 0 unmatched, 0 duplicates, status imported/);
  assert.equal(validFromEnv.status, 0, validFromEnv.stderr);
  assert.match(validFromEnv.stdout, /SEO evidence inputs valid/);
});

test("SEO evidence preflight report records missing and valid export state", () => {
  const missingDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-seo-preflight-report-missing-`);
  const missingReport = buildSeoEvidencePreflightReport({
    inputDir: missingDir,
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.equal(assertSeoEvidencePreflightReport(missingReport), true);
  assert.equal(missingReport.ready, false);
  assert.equal(missingReport.status, "blocked");
  assert.deepEqual(missingReport.summary.missing_required_sources, ["search_console", "yandex_webmaster", "backlinks"]);

  const validDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-seo-preflight-report-valid-`);
  const outputPath = `${validDir}/seo-evidence-preflight-report.json`;
  writeCompleteSeoInputFixture(validDir);
  const result = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-seo-evidence-preflight-report.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...process.env,
      MS_REALTY_SEO_EVIDENCE_INPUT_DIR: validDir,
      MS_REALTY_SEO_PREFLIGHT_REPORT_PATH: outputPath,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(outputPath));
  const readyReport = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(assertSeoEvidencePreflightReport(readyReport), true);
  assert.equal(readyReport.ready, true);
  assert.deepEqual(readyReport.summary.missing_required_sources, []);
});

test("SEO evidence build CLI honors mounted input and output paths", () => {
  const inputDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-cli-seo-build-input-`);
  const outputPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-cli-seo-build-output-`)}/seo-evidence.json`;
  writeCompleteSeoInputFixture(inputDir);

  const result = spawnSync(process.execPath, [fromRoot("production", "scripts", "build-seo-evidence.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: {
      ...process.env,
      MS_REALTY_SEO_EVIDENCE_INPUT_DIR: inputDir,
      MS_REALTY_SEO_EVIDENCE_OUTPUT_PATH: outputPath,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(outputPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const evidence = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(assertSeoEvidence(evidence), true);
  assert.deepEqual(evidence.summary.missing_required_sources, []);
});

test("single-domain SEO exports remain launch blockers", () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-single-domain-seo-evidence-`);
  fs.writeFileSync(`${dir}/search-console.csv`, "url,clicks,impressions,position\nhttps://makler-realty.com/p/1,3,30,7\n");
  fs.writeFileSync(`${dir}/yandex-webmaster.csv`, "url,indexed,issue\nhttps://makler-realty.com/p/1,yes,\n");
  fs.writeFileSync(`${dir}/backlinks.csv`, "target_url,source_url\nhttps://makler-realty.com/p/1,https://regionalbroker.bg/a\n");

  const evidence = buildSeoEvidence({
    inputDir: dir,
    generatedAt: "2026-07-05T00:00:00Z",
    records: [{ old_url: "https://makler-realty.com/p/1", source_domain: "makler-realty.com", url_type: "listing" }],
    routeMap: [],
    events: [{ type: "page_view", path: "https://makler-realty.com/p/1" }],
  });

  assert.deepEqual(evidence.summary.missing_required_sources, ["search_console", "yandex_webmaster", "backlinks"]);
});

test("generated SEO evidence file records missing external launch exports", () => {
  const file = fromRoot("production", "data", "seo-evidence.json");
  if (!fs.existsSync(file)) return;
  const evidence = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(assertSeoEvidence(evidence), true);
  assert.deepEqual(evidence.summary.missing_required_sources, ["search_console", "yandex_webmaster", "backlinks"]);
  assert.equal(evidence.summary.sources.privacy_events.status, "imported");
});

test("empty required SEO export files remain launch blockers", () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-empty-seo-evidence-`);
  for (const file of ["search-console.csv", "yandex-webmaster.csv", "backlinks.csv"]) {
    fs.writeFileSync(`${dir}/${file}`, "url\n");
  }

  const evidence = buildSeoEvidence({
    inputDir: dir,
    generatedAt: "2026-07-05T00:00:00Z",
    records: [{ old_url: "https://makler-realty.com/p/1", source_domain: "makler-realty.com", url_type: "listing" }],
    routeMap: [],
    events: [{ type: "page_view", path: "https://makler-realty.com/p/1" }],
  });

  assert.deepEqual(evidence.summary.missing_required_sources, ["search_console", "yandex_webmaster", "backlinks"]);
  assert.equal(evidence.summary.sources.search_console.status, "empty_export");
});

test("copied SEO export templates remain launch blockers", () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-template-seo-evidence-`);
  fs.copyFileSync(fromRoot("migration", "external", "seo", "search-console.csv.example"), `${dir}/search-console.csv`);
  fs.copyFileSync(fromRoot("migration", "external", "seo", "yandex-webmaster.csv.example"), `${dir}/yandex-webmaster.csv`);
  fs.copyFileSync(fromRoot("migration", "external", "seo", "backlinks.csv.example"), `${dir}/backlinks.csv`);

  const evidence = buildSeoEvidence({
    inputDir: dir,
    generatedAt: "2026-07-05T00:00:00Z",
    events: [{ type: "page_view", path: "https://makler-realty.com/" }],
  });

  assert.ok(evidence.summary.missing_required_sources.includes("search_console"));
  assert.ok(evidence.summary.missing_required_sources.includes("backlinks"));
  assert.equal(evidence.summary.sources.search_console.signal_rows, 0);
  assert.equal(evidence.summary.sources.backlinks.placeholder_rows, 2);
});

test("reserved example backlink domains remain launch blockers", () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-placeholder-backlinks-`);
  fs.writeFileSync(
    `${dir}/search-console.csv`,
    "url,clicks,impressions,position\nhttps://makler-realty.com/p/1,3,30,7\nhttps://makler-realty.ru/p/2,2,20,8\n",
  );
  fs.writeFileSync(
    `${dir}/yandex-webmaster.csv`,
    "url,indexed,issue\nhttps://makler-realty.com/p/1,yes,\nhttps://makler-realty.ru/p/2,yes,\n",
  );
  fs.writeFileSync(
    `${dir}/backlinks.csv`,
    "target_url,source_url\nhttps://makler-realty.com/p/1,https://example.com/a\nhttps://makler-realty.ru/p/2,https://example.org/b\n",
  );

  const evidence = buildSeoEvidence({
    inputDir: dir,
    generatedAt: "2026-07-05T00:00:00Z",
    records: [
      { old_url: "https://makler-realty.com/p/1", source_domain: "makler-realty.com", url_type: "listing" },
      { old_url: "https://makler-realty.ru/p/2", source_domain: "makler-realty.ru", url_type: "listing" },
    ],
    routeMap: [],
    events: [{ type: "page_view", path: "https://makler-realty.com/p/1" }],
  });

  assert.deepEqual(evidence.summary.missing_required_sources, ["backlinks"]);
  assert.equal(evidence.summary.sources.backlinks.matched_rows, 2);
  assert.equal(evidence.summary.sources.backlinks.signal_rows, 0);
  assert.equal(evidence.summary.sources.backlinks.placeholder_rows, 2);
});

test("unmatched required SEO export files remain launch blockers", () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-unmatched-seo-evidence-`);
  fs.writeFileSync(`${dir}/search-console.csv`, "url,clicks,impressions,position\nhttps://unrelated.example/page,3,30,7\n");
  fs.writeFileSync(`${dir}/yandex-webmaster.csv`, "url,indexed,issue\nhttps://unrelated.example/page,yes,\n");
  fs.writeFileSync(`${dir}/backlinks.csv`, "target_url,source_url\nhttps://unrelated.example/page,https://example.com/a\n");

  const evidence = buildSeoEvidence({
    inputDir: dir,
    generatedAt: "2026-07-05T00:00:00Z",
    records: [{ old_url: "https://makler-realty.com/p/1", source_domain: "makler-realty.com", url_type: "listing" }],
    routeMap: [],
    events: [{ type: "page_view", path: "https://makler-realty.com/p/1" }],
  });

  assert.deepEqual(evidence.summary.missing_required_sources, ["search_console", "yandex_webmaster", "backlinks"]);
  assert.equal(evidence.summary.sources.search_console.status, "imported");
  assert.equal(evidence.summary.sources.search_console.matched_rows, 0);
});

test("external SEO export templates are present but real CSVs stay local", () => {
  const dir = fromRoot("migration", "external", "seo");
  for (const file of ["search-console.csv", "yandex-webmaster.csv", "backlinks.csv"]) {
    assert.equal(fs.existsSync(`${dir}/${file}.example`), true);
    const template = fs.readFileSync(`${dir}/${file}.example`, "utf8");
    assert.match(template, /makler-realty\.com/);
    assert.match(template, /makler-realty\.ru/);
  }
  assert.match(fs.readFileSync(fromRoot(".gitignore"), "utf8"), /migration\/external\/seo\/\*\.csv/);
});

test("external SEO export writer only writes known source files", () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-write-seo-export-`);
  const result = writeExternalSeoExport("search_console", "url,clicks\nhttps://makler-realty.com/,1\n", { inputDir: dir });

  assert.equal(result.row_count, 1);
  assert.equal(fs.existsSync(`${dir}/search-console.csv`), true);
  assert.throws(() => writeExternalSeoExport("../bad", "url\n", { inputDir: dir }), /Unknown SEO export source/);
});

test("external SEO export templates are read only for known committed sources", () => {
  const template = readSeoExportTemplate("backlinks");

  assert.equal(template.filename, "backlinks.csv.example");
  assert.match(template.csv, /target_url,source_url,referring_domain/);
  assert.throws(() => readSeoExportTemplate("../bad"), /Unknown SEO export source/);
});
