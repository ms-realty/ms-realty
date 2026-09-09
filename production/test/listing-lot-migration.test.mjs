import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const name = "20260909_140000_listing_lot_identity";
const source = fs.readFileSync(new URL(`../../migrations/${name}.ts`, import.meta.url), "utf8");
const statement = source.match(/db.execute\(sql`([\s\S]*?)`\)/)[1];

test("lot identity migration covers current and versioned Payload reads without erasing history", () => {
  const index = fs.readFileSync(new URL("../../migrations/index.ts", import.meta.url), "utf8");
  assert.ok(index.includes(`name: '${name}'`));
  for (const field of ["lot_number", "lot_suffix", "migration_id", "legacy_lot_id", "legacy_post_id", "merged_into"]) {
    assert.ok(statement.includes(`ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "${field}"`));
    assert.ok(statement.includes(`ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_${field}"`));
  }
  assert.ok(statement.includes('CREATE TABLE IF NOT EXISTS "listings_legacy_urls"'));
  assert.ok(statement.includes('CREATE TABLE IF NOT EXISTS "_listings_v_version_legacy_urls"'));
  assert.doesNotMatch(source.split("export async function down")[1], /DROP|DELETE|TRUNCATE/);
});

test("lot migration reruns safely and preserves old rows and versioned URLs", { skip: !process.env.MS_REALTY_LOT_TEST_DATABASE_URL }, async () => {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: process.env.MS_REALTY_LOT_TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query('CREATE TEMP TABLE listings (id varchar PRIMARY KEY); CREATE TEMP TABLE _listings_v (id serial PRIMARY KEY)');
    // Use a private schema for the new child tables and their indexes.
    await client.query('CREATE SCHEMA lot_migration_check; SET LOCAL search_path = pg_temp, lot_migration_check');
    await client.query("INSERT INTO listings VALUES ('legacy-preserved'); INSERT INTO _listings_v DEFAULT VALUES");
    await client.query(statement);
    await client.query(statement);
    await client.query(`INSERT INTO listings_legacy_urls (_order, _parent_id, id, domain, url) VALUES (1, 'legacy-preserved', 'url-1', 'makler-realty.com', '/old');
      INSERT INTO _listings_v_version_legacy_urls (_order, _parent_id, domain, url, _uuid) VALUES (1, 1, 'makler-realty.ru', '/old-ru', 'url-1')`);
    const rows = await client.query('SELECT id, lot_number, migration_id FROM listings');
    assert.deepEqual(rows.rows, [{ id: 'legacy-preserved', lot_number: null, migration_id: null }]);
    assert.equal((await client.query('SELECT url FROM _listings_v_version_legacy_urls')).rows[0].url, '/old-ru');
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});
