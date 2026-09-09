import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

// Deploy schema before importing the reviewed lot identities. Old drafts may
// lack these fields; keep them nullable until the authoritative import fills them.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "lot_number" numeric;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "lot_suffix" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "migration_id" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "legacy_lot_id" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "legacy_post_id" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "merged_into" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_lot_number" numeric;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_lot_suffix" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_migration_id" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_legacy_lot_id" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_legacy_post_id" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_merged_into" varchar;

    CREATE TABLE IF NOT EXISTS "listings_legacy_urls" (
      "_order" integer NOT NULL,
      "_parent_id" varchar NOT NULL REFERENCES "listings"("id") ON DELETE CASCADE,
      "id" varchar PRIMARY KEY NOT NULL,
      "domain" varchar,
      "url" varchar
    );
    CREATE TABLE IF NOT EXISTS "_listings_v_version_legacy_urls" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL REFERENCES "_listings_v"("id") ON DELETE CASCADE,
      "id" serial PRIMARY KEY NOT NULL,
      "domain" varchar,
      "url" varchar,
      "_uuid" varchar
    );
    CREATE INDEX IF NOT EXISTS "listings_legacy_urls_order_idx" ON "listings_legacy_urls" ("_order");
    CREATE INDEX IF NOT EXISTS "listings_legacy_urls_parent_id_idx" ON "listings_legacy_urls" ("_parent_id");
    CREATE INDEX IF NOT EXISTS "_listings_v_version_legacy_urls_order_idx" ON "_listings_v_version_legacy_urls" ("_order");
    CREATE INDEX IF NOT EXISTS "_listings_v_version_legacy_urls_parent_id_idx" ON "_listings_v_version_legacy_urls" ("_parent_id");
    CREATE INDEX IF NOT EXISTS "listings_lot_number_idx" ON "listings" ("lot_number");
    CREATE UNIQUE INDEX IF NOT EXISTS "listings_migration_id_idx" ON "listings" ("migration_id");
    CREATE INDEX IF NOT EXISTS "listings_legacy_lot_id_idx" ON "listings" ("legacy_lot_id");
    CREATE INDEX IF NOT EXISTS "listings_merged_into_idx" ON "listings" ("merged_into");
    CREATE INDEX IF NOT EXISTS "_listings_v_version_lot_number_idx" ON "_listings_v" ("version_lot_number");
    CREATE INDEX IF NOT EXISTS "_listings_v_version_migration_id_idx" ON "_listings_v" ("version_migration_id");
    CREATE INDEX IF NOT EXISTS "_listings_v_version_legacy_lot_id_idx" ON "_listings_v" ("version_legacy_lot_id");
    CREATE INDEX IF NOT EXISTS "_listings_v_version_merged_into_idx" ON "_listings_v" ("version_merged_into");
  `)
}

// Identity provenance and prior URLs must survive a code rollback.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db
}
