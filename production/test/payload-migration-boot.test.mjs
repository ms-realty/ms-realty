import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import test from "node:test";
import { fromRoot } from "../lib/paths.mjs";

const propertySearchMigration = fromRoot("migrations", "20260730_120000_property_search_schema.ts");

function tableSql(source, name) {
  const start = source.indexOf(`CREATE TABLE "${name}" (`);
  const end = source.indexOf("\n    );", start);
  assert.notEqual(start, -1, `missing ${name} table`);
  assert.notEqual(end, -1, `missing end of ${name} table`);
  return source.slice(start, end);
}

test("Payload migration boot configuration and generated constraints stay runnable", () => {
  const tsconfig = JSON.parse(fs.readFileSync(fromRoot("tsconfig.json"), "utf8"));
  assert.equal(tsconfig.compilerOptions.allowJs, true);
  assert.deepEqual(tsconfig.include, [
    "payload.config.js",
    "migrations/**/*.ts",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
  ]);
  for (const migration of ["20260710_132716_initial_schema.ts", "20260730_120000_property_search_schema.ts"]) {
    assert.match(
      fs.readFileSync(fromRoot("migrations", migration), "utf8"),
      /import \{ sql, type MigrateDownArgs, type MigrateUpArgs \} from '@payloadcms\/db-postgres'/,
    );
  }

  const migration = fs.readFileSync(propertySearchMigration, "utf8");
  const requiredColumns = {
    locations: ['"label" varchar NOT NULL', '"public_location_precision" "enum_locations_public_location_precision" NOT NULL'],
    properties: [
      '"taxonomy_mapping_version" varchar NOT NULL',
      '"taxonomy_review_status" "enum_properties_taxonomy_review_status" NOT NULL',
      '"legacy_listing_id" varchar NOT NULL',
    ],
    properties_fact_verification: ['"field" varchar NOT NULL', '"state" "enum_properties_fact_verification_state" NOT NULL'],
    listing_enrichment_tasks: [
      '"task_type" "enum_listing_enrichment_tasks_task_type" NOT NULL',
      '"task_state" "enum_listing_enrichment_tasks_task_state" NOT NULL',
      '"idempotency_key" varchar NOT NULL',
      '"source" "enum_listing_enrichment_tasks_source" NOT NULL',
    ],
    search_outbox: [
      '"event_type" "enum_search_outbox_event_type" NOT NULL',
      '"outbox_state" "enum_search_outbox_outbox_state" NOT NULL',
      '"idempotency_key" varchar NOT NULL',
      '"payload" jsonb NOT NULL',
      '"attempts" numeric DEFAULT 0 NOT NULL',
    ],
  };
  for (const [table, columns] of Object.entries(requiredColumns)) {
    const sql = tableSql(migration, table);
    for (const column of columns) assert.ok(sql.includes(column), `${table}.${column} must be required`);
  }

  const properties = tableSql(migration, "properties");
  const tasks = tableSql(migration, "listing_enrichment_tasks");
  for (const [sql, column] of [
    [properties, '"location_id" varchar'],
    [tasks, '"listing_id" varchar'],
    [tasks, '"property_id" varchar'],
  ]) {
    assert.ok(sql.includes(column));
    assert.equal(sql.includes(`${column} NOT NULL`), false, `${column} must remain nullable`);
  }
  assert.match(migration, /properties_location_id_locations_id_fk" FOREIGN KEY \("location_id"\).*ON DELETE set null/);
  assert.match(migration, /listing_enrichment_tasks_listing_id_listings_id_fk" FOREIGN KEY \("listing_id"\).*ON DELETE set null/);
  assert.match(migration, /listing_enrichment_tasks_property_id_properties_id_fk" FOREIGN KEY \("property_id"\).*ON DELETE set null/);

  const typesDir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-payload-migration-`);
  const env = {
    ...process.env,
    PAYLOAD_CONFIG_PATH: fromRoot("payload.config.js"),
    PAYLOAD_TS_OUTPUT_PATH: `${typesDir}/payload-types.ts`,
  };
  try {
    const loaded = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", "await import('./migrations/index.ts')"], {
      cwd: fromRoot(),
      encoding: "utf8",
      env,
      timeout: 30_000,
    });
    assert.equal(loaded.status, 0, loaded.stderr);

    const help = spawnSync(fromRoot("node_modules", ".bin", "payload"), ["migrate", "--help"], {
      cwd: fromRoot(),
      encoding: "utf8",
      env,
      timeout: 30_000,
    });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Available commands: migrate/);
  } finally {
    fs.rmSync(typesDir, { force: true, recursive: true });
  }
});
