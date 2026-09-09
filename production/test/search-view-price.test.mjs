import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Render the public search view SQL through the real migration builder with a
// recording db, so the price rule is pinned where it is written.
function renderViewSql(options) {
  const script = `
    const { up } = await import("./migrations/20260811_153000_postgres_public_search.ts");
    const statements = [];
    const db = { execute: async (query) => { statements.push(typeof query === "string" ? query : JSON.stringify(query.queryChunks ?? query)); } };
    await up({ db }, ${JSON.stringify(options)});
    process.stdout.write(statements.join("\\n---\\n"));
  `;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("the live search view publishes the source-stated price, as the listing page and the in-memory projection already do", () => {
  const sql = renderViewSql({ localizedTranslations: true, sourceStatedPrice: true });
  const priceColumn = sql.slice(sql.indexOf('AS \\"geography_path\\"'), sql.indexOf('AS \\"price_currency\\"'));
  assert.match(priceColumn, /facts_price_eur/);
  assert.doesNotMatch(priceColumn, /workflow_price_verified_at/, "the price no longer waits for a broker verification stamp");
  assert.match(priceColumn, /facts_price_on_request.*IS DISTINCT FROM true/, "a price on request still publishes no amount");
});

test("the previous rule stays available for the rollback path", () => {
  const sql = renderViewSql({ localizedTranslations: true });
  const priceColumn = sql.slice(sql.indexOf('AS \\"geography_path\\"'), sql.indexOf('AS \\"price_currency\\"'));
  assert.match(priceColumn, /workflow_price_verified_at/);
});

test("the migration is registered after the last applied one", async () => {
  const script = `const mod = await import("./migrations/index.ts"); const migrations = mod.migrations ?? mod.default; process.stdout.write(JSON.stringify(migrations.map((m) => m.name)));`;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const names = JSON.parse(result.stdout);
  assert.equal(names.filter((name) => name === "20260909_120000_source_stated_price_search_view").length, 1);
  assert.ok(names.indexOf("20260909_120000_source_stated_price_search_view") > names.indexOf("20260901_130000_provider_connection_workspace_scope"));
  assert.deepEqual([...names].sort(), names, "migrations stay in chronological order");
});
