import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_listing_translations_status" ADD VALUE IF NOT EXISTS 'missing';
    ALTER TYPE "public"."enum_listing_translations_status" ADD VALUE IF NOT EXISTS 'hermes_drafted';
    ALTER TYPE "public"."enum_listing_translations_status" ADD VALUE IF NOT EXISTS 'human_edited';
    ALTER TYPE "public"."enum_listing_translations_status" ADD VALUE IF NOT EXISTS 'approved';
    ALTER TYPE "public"."enum_listing_translations_status" ADD VALUE IF NOT EXISTS 'stale';

    ALTER TYPE "public"."enum__listing_translations_v_version_status" ADD VALUE IF NOT EXISTS 'missing';
    ALTER TYPE "public"."enum__listing_translations_v_version_status" ADD VALUE IF NOT EXISTS 'hermes_drafted';
    ALTER TYPE "public"."enum__listing_translations_v_version_status" ADD VALUE IF NOT EXISTS 'human_edited';
    ALTER TYPE "public"."enum__listing_translations_v_version_status" ADD VALUE IF NOT EXISTS 'approved';
    ALTER TYPE "public"."enum__listing_translations_v_version_status" ADD VALUE IF NOT EXISTS 'stale';
  `)
}

// PostgreSQL cannot remove enum values without rebuilding dependent columns.
// Keep this repair forward-only so rollback never destroys translation rows.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db
}
