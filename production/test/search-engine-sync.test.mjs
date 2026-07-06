import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import {
  assertSearchEngineQueryReport,
  assertSearchEngineSyncReport,
  runSearchEngineQuerySmoke,
  runSearchEngineSync,
  syncTypesense,
} from "../lib/search-engine-sync.mjs";
import { fromRoot } from "../lib/paths.mjs";

function fakeFetch(calls, statuses = []) {
  return async (url, options) => {
    const status = statuses.shift() || 202;
    calls.push({ url, options, body: options.body });
    return { ok: status >= 200 && status < 300, status };
  };
}

function runScript(script, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [fromRoot("production", "scripts", script)], {
      cwd: fromRoot(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

async function withSearchServer(fn) {
  const calls = [];
  const hit = {
    id: "MS-CRAWL-0001:bg",
    source_listing_id: "MS-CRAWL-0001",
    locale: "bg",
    locale_path: "/bg/imoti/MS-CRAWL-0001",
    title: "Reviewed listing",
  };
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      calls.push({ method: request.method, url: request.url, body });
      response.setHeader("content-type", "application/json");
      if (request.url.includes("/documents/search?")) {
        response.end(JSON.stringify({ found: 1, hits: [{ document: hit }] }));
      } else if (request.url.endsWith("/search")) {
        response.end(JSON.stringify({ estimatedTotalHits: 1, hits: [hit] }));
      } else {
        response.statusCode = 201;
        response.end(JSON.stringify({ ok: true }));
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await fn(`http://${address.address}:${address.port}`, calls);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("search engine sync posts existing fixtures to Typesense and Meilisearch", async () => {
  const calls = [];
  const report = await runSearchEngineSync({
    fetchImpl: fakeFetch(calls),
    typesense: { baseUrl: "http://typesense.local", apiKey: "type-key" },
    meilisearch: { baseUrl: "http://meili.local", apiKey: "meili-key" },
  });

  assert.equal(assertSearchEngineSyncReport(report), true);
  assert.deepEqual(report.summary.documents_per_engine, [167, 167]);
  assert.equal(calls.length, 4);
  assert.equal(calls[0].url, "http://typesense.local/collections");
  assert.equal(calls[1].url, "http://typesense.local/collections/ms_realty_listings/documents/import?action=upsert");
  assert.equal(calls[2].url, "http://meili.local/indexes/ms_realty_listings/settings");
  assert.equal(calls[3].url, "http://meili.local/indexes/ms_realty_listings/documents?primaryKey=id");
  assert.equal(calls[1].options.headers["x-typesense-api-key"], "type-key");
  assert.equal(calls[3].options.headers.authorization, "Bearer meili-key");
  assert.match(calls[1].body, /MS-CRAWL-0001:bg/);
  assert.match(calls[3].body, /MS-CRAWL-0001:bg/);
});

test("Typesense sync accepts existing collection response before upsert import", async () => {
  const calls = [];
  const report = await syncTypesense({
    baseUrl: "http://typesense.local/",
    apiKey: "type-key",
    fetchImpl: fakeFetch(calls, [409, 201]),
  });

  assert.equal(report.documents, 167);
  assert.equal(report.operations[0].status, 409);
  assert.equal(report.operations[1].status, 201);
});

test("generated search sync smoke report is valid when present", () => {
  const file = fromRoot("production", "data", "search-engine-sync-smoke.json");
  if (!fs.existsSync(file)) return;
  assert.equal(assertSearchEngineSyncReport(JSON.parse(fs.readFileSync(file, "utf8"))), true);
});

test("search engine query smoke normalizes Typesense and Meilisearch hits", async () => {
  const calls = [];
  const hit = {
    id: "MS-CRAWL-0001:bg",
    source_listing_id: "MS-CRAWL-0001",
    locale: "bg",
    locale_path: "/bg/imoti/MS-CRAWL-0001",
    title: "Reviewed listing",
  };
  const report = await runSearchEngineQuerySmoke({
    typesense: { baseUrl: "http://typesense.local", apiKey: "type-key" },
    meilisearch: { baseUrl: "http://meili.local", apiKey: "meili-key" },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.includes("typesense.local")) {
        return { ok: true, status: 200, async json() { return { found: 1, hits: [{ document: hit }] }; } };
      }
      return { ok: true, status: 200, async json() { return { estimatedTotalHits: 1, hits: [hit] }; } };
    },
  });

  assert.equal(assertSearchEngineQueryReport(report), true);
  assert.equal(calls[0].url.includes("/documents/search?"), true);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[1].url, "http://meili.local/indexes/ms_realty_listings/search");
  assert.equal(calls[1].options.method, "POST");
  assert.equal(JSON.parse(calls[1].options.body).filter, "translation_indexable = true AND locale = bg");
});

test("generated search query smoke report is valid when present", () => {
  const file = fromRoot("production", "data", "search-engine-query-smoke.json");
  if (!fs.existsSync(file)) return;
  assert.equal(assertSearchEngineQueryReport(JSON.parse(fs.readFileSync(file, "utf8"))), true);
});

test("live search engine CLIs fail closed when provisioning env is missing", () => {
  const env = { ...process.env, TYPESENSE_URL: "", TYPESENSE_API_KEY: "", MEILI_URL: "", MEILI_API_KEY: "" };
  const cases = [
    ["run-search-engine-sync.mjs", /SEARCH ENGINE SYNC FAILED: TYPESENSE_URL is required/],
    ["run-search-engine-query.mjs", /SEARCH ENGINE QUERY FAILED: TYPESENSE_URL is required/],
  ];

  for (const [script, message] of cases) {
    const result = spawnSync(process.execPath, [fromRoot("production", "scripts", script)], {
      cwd: fromRoot(),
      encoding: "utf8",
      env,
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, message);
  }
});

test("live search engine CLIs write reports to configured paths", async () => {
  await withSearchServer(async (baseUrl) => {
    const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-search-cli-reports-`);
    const syncReportPath = `${dir}/search-engine-sync-report.json`;
    const queryReportPath = `${dir}/search-engine-query-report.json`;
    const env = {
      ...process.env,
      TYPESENSE_URL: baseUrl,
      TYPESENSE_API_KEY: "typesense-test",
      MEILI_URL: baseUrl,
      MEILI_API_KEY: "meili-test",
      MS_REALTY_SEARCH_SYNC_REPORT_PATH: syncReportPath,
      MS_REALTY_SEARCH_QUERY_REPORT_PATH: queryReportPath,
    };

    const sync = await runScript("run-search-engine-sync.mjs", env);
    const query = await runScript("run-search-engine-query.mjs", env);

    assert.equal(sync.status, 0, sync.stderr);
    assert.equal(query.status, 0, query.stderr);
    assert.equal(assertSearchEngineSyncReport(JSON.parse(fs.readFileSync(syncReportPath, "utf8"))), true);
    assert.equal(assertSearchEngineQueryReport(JSON.parse(fs.readFileSync(queryReportPath, "utf8"))), true);
  });
});
