import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import test from "node:test";
import { fromRoot } from "../lib/paths.mjs";

const propertySearchMigration = fromRoot("migrations", "20260730_120000_property_search_schema.ts");
const payloadSchemaDriftMigration = fromRoot("migrations", "20260810_164700_payload_schema_drift.ts");
const durableListingEditMigration = fromRoot("migrations", "20260811_120000_durable_listing_edit_audit.ts");
const publicSearchMigration = fromRoot("migrations", "20260811_153000_postgres_public_search.ts");
const publicSearchRepairMigration = fromRoot("migrations", "20260813_110000_repair_postgres_search_index.ts");
const publicSearchViewRepairMigration = fromRoot("migrations", "20260820_190500_repair_postgres_search_view.ts");
const sourceStatedSearchViewMigration = fromRoot("migrations", "20260826_220000_source_stated_search_view.ts");
const adminPasswordChangeMigration = fromRoot("migrations", "20260827_120000_admin_password_change_required.ts");
const durableLeadSideEffectsMigration = fromRoot("migrations", "20260813_120000_durable_lead_side_effects.ts");
const workspaceSettingsMigration = fromRoot("migrations", "20260828_130000_workspace_settings.ts");

function tableSql(source, name) {
  const start = [`CREATE TABLE "${name}" (`, `CREATE TABLE IF NOT EXISTS "${name}" (`]
    .map((marker) => source.indexOf(marker))
    .find((index) => index !== -1) ?? -1;
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
  for (const migration of [
    "20260710_132716_initial_schema.ts",
    "20260730_120000_property_search_schema.ts",
    "20260810_164700_payload_schema_drift.ts",
    "20260811_120000_durable_listing_edit_audit.ts",
    "20260811_153000_postgres_public_search.ts",
    "20260813_110000_repair_postgres_search_index.ts",
    "20260813_120000_durable_funnel_events.ts",
    "20260813_120000_durable_lead_side_effects.ts",
    "20260827_120000_admin_password_change_required.ts",
    "20260828_130000_workspace_settings.ts",
  ]) {
    assert.match(
      fs.readFileSync(fromRoot("migrations", migration), "utf8"),
      /import \{ sql, type MigrateDownArgs, type MigrateUpArgs \} from '@payloadcms\/db-postgres'/,
    );
  }

  const adminPasswordChange = fs.readFileSync(adminPasswordChangeMigration, "utf8");
  assert.match(adminPasswordChange, /ALTER TABLE "admins"/);
  assert.match(adminPasswordChange, /ADD COLUMN IF NOT EXISTS "password_change_required" boolean DEFAULT false NOT NULL/);
  assert.match(adminPasswordChange, /export async function down[\s\S]*void db/);

  const workspaceSettings = fs.readFileSync(workspaceSettingsMigration, "utf8");
  const workspaceSettingsTable = tableSql(workspaceSettings, "workspace_settings");
  for (const column of [
    '"workspace_id" varchar NOT NULL',
    '"version" numeric DEFAULT 1 NOT NULL',
    '"revision" numeric DEFAULT 0 NOT NULL',
    '"sections" jsonb NOT NULL',
    '"section_updates" jsonb NOT NULL',
    '"revisions" jsonb NOT NULL',
  ]) {
    assert.ok(workspaceSettingsTable.includes(column), `workspace_settings.${column} must be required`);
  }
  assert.match(workspaceSettings, /CREATE UNIQUE INDEX IF NOT EXISTS "workspace_settings_workspace_id_idx"/);
  assert.match(workspaceSettings, /payload_locked_documents_rels_workspace_settings_id_idx/);
  assert.match(workspaceSettings, /payload_locked_documents_rels_workspace_settings_fk/);
  assert.match(workspaceSettings, /export async function down[\s\S]*void db/);

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

  const driftPatch = fs.readFileSync(payloadSchemaDriftMigration, "utf8");
  for (const column of [
    '"facts_location_native" varchar',
    '"facts_location_legacy" varchar',
    '"facts_municipality" varchar',
    '"facts_municipality_code" varchar',
    '"facts_district" varchar',
    '"facts_district_code" varchar',
    '"facts_region" varchar',
    '"facts_region_id" varchar',
    '"facts_country_code" varchar',
    '"facts_geography_id" varchar',
    '"facts_geography_path" jsonb',
    '"facts_settlement_ekatte" varchar',
    '"facts_location_review_status" varchar',
    '"seo_og_title" varchar',
    '"seo_og_description" varchar',
    '"workflow_publish_approved" boolean',
    '"workflow_last_editor" varchar',
    '"facts_location_id" varchar',
    '"facts_location_label" varchar',
    '"properties_id" varchar',
    '"locations_id" varchar',
    '"listing_enrichment_tasks_id" varchar',
    '"search_outbox_id" varchar',
  ]) {
    assert.match(driftPatch, new RegExp(`ADD COLUMN IF NOT EXISTS ${column.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}`));
  }
  for (const fragment of [
    'CREATE INDEX IF NOT EXISTS "listing_enrichment_tasks_updated_at_idx"',
    'CREATE INDEX IF NOT EXISTS "listing_enrichment_tasks_created_at_idx"',
    'CREATE INDEX IF NOT EXISTS "search_outbox_created_at_idx"',
    'CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_properties_id_idx"',
    'CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_locations_id_idx"',
    'CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_listing_enrichment_tasks_i_idx"',
    'CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_search_outbox_id_idx"',
    'ADD CONSTRAINT "payload_locked_documents_rels_properties_fk"',
    'ADD CONSTRAINT "payload_locked_documents_rels_locations_fk"',
    'ADD CONSTRAINT "payload_locked_documents_rels_listing_enrichment_tasks_fk"',
    'ADD CONSTRAINT "payload_locked_documents_rels_search_outbox_fk"',
  ]) {
    assert.match(driftPatch, new RegExp(fragment.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")));
  }
  const driftDown = driftPatch.match(/export async function down[\s\S]*$/)?.[0] || "";
  assert.match(driftDown, /export async function down\(\{ db \}: MigrateDownArgs\): Promise<void> \{\s+void db\s+\}/);
  assert.doesNotMatch(driftDown, /\bDROP\b|\bDELETE\b|\bTRUNCATE\b|\bALTER TABLE\b/);

  const listingEditPatch = fs.readFileSync(durableListingEditMigration, "utf8");
  for (const column of [
    '"facts_listing_status" varchar',
    '"seo_canonical_override" varchar',
    '"seo_robots" varchar',
    '"workflow_last_edit_event" jsonb',
    '"version_facts_listing_status" varchar',
    '"version_seo_canonical_override" varchar',
    '"version_seo_robots" varchar',
    '"version_workflow_last_edit_event" jsonb',
  ]) {
    assert.match(listingEditPatch, new RegExp(`ADD COLUMN IF NOT EXISTS ${column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  }
  const listingEditDown = listingEditPatch.match(/export async function down[\s\S]*$/)?.[0] || "";
  assert.doesNotMatch(listingEditDown, /\bDROP\b|\bDELETE\b|\bTRUNCATE\b|\bALTER TABLE\b/);

  const publicSearch = fs.readFileSync(publicSearchMigration, "utf8");
  assert.doesNotMatch(publicSearch, /ms_realty_search_fold"\(concat_ws\(/);
  assert.match(publicSearch, /INDEX_SEARCH_TEXT_SQL\(""\)/);
  assert.match(publicSearch, /COALESCE\(NULLIF\(\$\{listing\}"facts_title", ''\)/);

  const publicSearchRepair = fs.readFileSync(publicSearchRepairMigration, "utf8");
  assert.doesNotMatch(publicSearchRepair, /ms_realty_search_fold"\(concat_ws\(/);
  assert.match(publicSearchRepair, /COALESCE\("facts_title", ''\) \|\| ' ' \|\|/);
  assert.match(publicSearchRepair, /COALESCE\("id", ''\)/);

  const publicSearchViewRepair = fs.readFileSync(publicSearchViewRepairMigration, "utf8");
  assert.match(publicSearchViewRepair, /up as ensurePostgresSearchView/);
  assert.match(publicSearchViewRepair, /await ensurePostgresSearchView\(args\)/);
  const publicSearchViewRepairDown = publicSearchViewRepair.match(/export async function down[\s\S]*$/)?.[0] || "";
  assert.doesNotMatch(publicSearchViewRepairDown, /\bDROP\b|\bDELETE\b|\bTRUNCATE\b|\bALTER TABLE\b/);

  const sourceStatedSearchView = fs.readFileSync(sourceStatedSearchViewMigration, "utf8");
  assert.match(sourceStatedSearchView, /up as ensurePostgresSearchView/);
  assert.match(sourceStatedSearchView, /await ensurePostgresSearchView\(args\)/);
  const sourceStatedSearchViewDown = sourceStatedSearchView.match(/export async function down[\s\S]*$/)?.[0] || "";
  assert.doesNotMatch(sourceStatedSearchViewDown, /\bDROP\b|\bDELETE\b|\bTRUNCATE\b|\bALTER TABLE\b/);

  const leadSideEffects = fs.readFileSync(durableLeadSideEffectsMigration, "utf8");
  for (const table of ["consent_events", "seller_pipeline_events"]) {
    const tableDefinition = tableSql(leadSideEffects, table);
    for (const column of [
      '"event_id" varchar NOT NULL',
      '"workspace_id" varchar NOT NULL',
      '"lead_id" varchar NOT NULL',
      '"recorded_at" timestamp(3) with time zone NOT NULL',
      '"payload" jsonb NOT NULL',
    ]) {
      assert.ok(tableDefinition.includes(column), `${table}.${column} must be required`);
    }
    assert.match(leadSideEffects, new RegExp(`CREATE UNIQUE INDEX "${table}_event_id_idx"`));
    assert.match(leadSideEffects, new RegExp(`payload_locked_documents_rels_${table}_fk`));
  }
  assert.match(leadSideEffects, /ALTER TABLE "public_leads" ADD COLUMN "workspace_id" varchar/);
  assert.match(leadSideEffects, /ALTER TABLE "lead_contacts" ADD COLUMN "workspace_id" varchar/);
  assert.match(leadSideEffects, /ALTER TABLE "public_leads" ALTER COLUMN "workspace_id" SET NOT NULL/);
  assert.match(leadSideEffects, /ALTER TABLE "lead_contacts" ALTER COLUMN "workspace_id" SET NOT NULL/);
  assert.match(leadSideEffects, /CREATE UNIQUE INDEX "public_leads_workspace_id_idempotency_key_idx"/);
  assert.match(leadSideEffects, /CREATE INDEX "public_leads_workspace_id_idx"/);
  assert.match(leadSideEffects, /CREATE INDEX "lead_contacts_workspace_id_idx"/);
  const leadSideEffectsDown = leadSideEffects.match(/export async function down[\s\S]*$/)?.[0] || "";
  assert.match(leadSideEffectsDown, /DROP TABLE "seller_pipeline_events"/);
  assert.match(leadSideEffectsDown, /DROP TABLE "consent_events"/);
  assert.match(leadSideEffectsDown, /DROP COLUMN "workspace_id"/);
  assert.match(leadSideEffectsDown, /CREATE INDEX "public_leads_idempotency_key_idx"/);

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
      timeout: 60_000,
    });
    assert.equal(loaded.status, 0, loaded.stderr);

    const help = spawnSync(fromRoot("node_modules", ".bin", "payload"), ["migrate", "--help"], {
      cwd: fromRoot(),
      encoding: "utf8",
      env,
      timeout: 60_000,
    });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Available commands: migrate/);
  } finally {
    fs.rmSync(typesDir, { force: true, recursive: true });
  }
});
