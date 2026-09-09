import assert from "node:assert/strict";
import test from "node:test";
import { listingIdentityRekeySql } from "../lib/listing-identity-rekey.mjs";

const seedFor = (id) => ({
  records: [{ id, source_url: "https://makler-realty.com/listing/owner's-flat", property: `property-${id}` }],
  enrichment_tasks: [{ id: `enrichment-${id}`, listing: id, idempotency_key: `listing:${id}:verify_imported_facts` }],
});
const seed = seedFor("MS-00907");

test("identity targets must be unambiguous and source URLs are SQL quoted", () => {
  assert.throws(() => listingIdentityRekeySql({ records: [] }), /empty/);
  assert.throws(() => listingIdentityRekeySql({ records: [...seed.records, ...seed.records] }), /unique/);
  assert.ok(listingIdentityRekeySql(seed).includes("owner''s-flat"));
});

test("rekey preserves current facts, every FK/version and rollback identities", { skip: !process.env.MS_REALTY_LOT_TEST_DATABASE_URL }, async () => {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: process.env.MS_REALTY_LOT_TEST_DATABASE_URL });
  await client.connect();
  const schema = `identity_rekey_${process.pid}`;
  try {
    await client.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};
      CREATE TABLE properties (id varchar PRIMARY KEY, legacy_listing_id varchar, area numeric);
      CREATE TABLE listings (id varchar PRIMARY KEY, source_url varchar UNIQUE, price numeric, property_id varchar REFERENCES properties(id));
      CREATE TABLE listing_enrichment_tasks (id varchar PRIMARY KEY, listing_id varchar REFERENCES listings(id), property_id varchar REFERENCES properties(id), idempotency_key varchar UNIQUE, state text);
      CREATE TABLE task_refs (task_id varchar REFERENCES listing_enrichment_tasks(id));
      CREATE TABLE versions (id integer PRIMARY KEY, parent_id varchar REFERENCES listings(id), body text);
      CREATE TABLE translations (id integer PRIMARY KEY, listing_id varchar REFERENCES listings(id), approved boolean);
      CREATE TABLE public_leads (listing_reference varchar);
      CREATE TABLE viewings (listing_reference varchar);
      CREATE TABLE funnel_events (listing_reference varchar);
      INSERT INTO properties VALUES ('property-MS-CRAWL-0002', 'MS-CRAWL-0002', 88);
      INSERT INTO listings VALUES ('MS-CRAWL-0002', 'https://makler-realty.com/listing/owner''s-flat', 999, 'property-MS-CRAWL-0002');
      INSERT INTO listing_enrichment_tasks VALUES ('enrichment-MS-CRAWL-0002','MS-CRAWL-0002','property-MS-CRAWL-0002','listing:MS-CRAWL-0002:verify_imported_facts','operator-completed');
      INSERT INTO task_refs VALUES ('enrichment-MS-CRAWL-0002');
      INSERT INTO versions VALUES (1, 'MS-CRAWL-0002', 'historical content');
      INSERT INTO translations VALUES (1, 'MS-CRAWL-0002', true);
      INSERT INTO public_leads VALUES ('MS-CRAWL-0002');
      INSERT INTO viewings VALUES ('MS-CRAWL-0002');
      INSERT INTO funnel_events VALUES ('MS-CRAWL-0002');`);
    await client.query(listingIdentityRekeySql(seed));
    await client.query(listingIdentityRekeySql(seed));
    assert.deepEqual((await client.query('SELECT id, price::int FROM listings')).rows, [{ id: 'MS-00907', price: 999 }]);
    assert.deepEqual((await client.query('SELECT parent_id, body FROM versions')).rows, [{ parent_id: 'MS-00907', body: 'historical content' }]);
    assert.deepEqual((await client.query('SELECT listing_id, approved FROM translations')).rows, [{ listing_id: 'MS-00907', approved: true }]);
    for (const table of ['public_leads', 'viewings']) assert.equal((await client.query(`SELECT listing_reference FROM ${table}`)).rows[0].listing_reference, 'MS-00907');
    assert.equal((await client.query('SELECT listing_reference FROM funnel_events')).rows[0].listing_reference, 'MS-CRAWL-0002');
    assert.equal((await client.query("SELECT count(*)::int AS n FROM pg_constraint WHERE connamespace = $1::regnamespace AND contype='f' AND condeferrable", [schema])).rows[0].n, 0);
    assert.deepEqual((await client.query('SELECT id, area::int FROM properties')).rows, [{ id: 'property-MS-00907', area: 88 }]);
    assert.deepEqual((await client.query('SELECT id, idempotency_key, state FROM listing_enrichment_tasks')).rows, [{ id: 'enrichment-MS-00907', idempotency_key: 'listing:MS-00907:verify_imported_facts', state: 'operator-completed' }]);
    assert.equal((await client.query('SELECT task_id FROM task_refs')).rows[0].task_id, 'enrichment-MS-00907');
    await client.query(listingIdentityRekeySql(seedFor('MS-CRAWL-0002')));
    assert.equal((await client.query('SELECT task_id FROM task_refs')).rows[0].task_id, 'enrichment-MS-CRAWL-0002');
    assert.equal((await client.query('SELECT parent_id FROM versions')).rows[0].parent_id, 'MS-CRAWL-0002');
    await client.query("INSERT INTO listings VALUES ('MS-00907', 'https://other.test/listing', 123, NULL)");
    await assert.rejects(client.query(listingIdentityRekeySql(seed)), /already occupied/);
    await client.query('ROLLBACK');
    assert.equal((await client.query('SELECT parent_id FROM versions')).rows[0].parent_id, 'MS-CRAWL-0002');
  } finally {
    await client.query('ROLLBACK');
    await client.query(`DROP SCHEMA ${schema} CASCADE`);
    await client.end();
  }
});
