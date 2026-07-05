import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { assertSeoEvidence, buildSeoEvidence } from "../lib/seo-evidence.mjs";
import { fromRoot } from "../lib/paths.mjs";

test("SEO evidence joins external exports and privacy events to crawled URLs", () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-seo-evidence-`);
  fs.writeFileSync(`${dir}/search-console.csv`, "url,clicks,impressions,position\nhttps://makler-realty.com/p/1,3,30,7\n");
  fs.writeFileSync(`${dir}/yandex-webmaster.csv`, "url,indexed,issue\nhttps://makler-realty.com/p/1,yes,\n");
  fs.writeFileSync(`${dir}/backlinks.csv`, "target_url,source_url\nhttps://makler-realty.com/p/1,https://example.com/a\n");

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
  assert.equal(evidence.summary.sources.privacy_events.matched_rows, 2);
  assert.equal(evidence.url_evidence[0].search_console.clicks, 3);
  assert.equal(evidence.url_evidence[0].analytics.page_views, 1);
  assert.equal(evidence.url_evidence[0].analytics.leads, 1);
});

test("generated SEO evidence file records missing external launch exports", () => {
  const file = fromRoot("production", "data", "seo-evidence.json");
  if (!fs.existsSync(file)) return;
  const evidence = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(assertSeoEvidence(evidence), true);
  assert.deepEqual(evidence.summary.missing_required_sources, ["search_console", "yandex_webmaster", "backlinks"]);
  assert.equal(evidence.summary.sources.privacy_events.status, "imported");
});
