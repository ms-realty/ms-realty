import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

// The listing editor already accepts these fields. Persist them in both the
// current draft and its immutable Payload version so admin and MCP edits share
// one durable source of truth.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "facts_listing_status" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "seo_canonical_override" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "seo_robots" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "workflow_last_edit_event" jsonb;

    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_facts_listing_status" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_seo_canonical_override" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_seo_robots" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_workflow_last_edit_event" jsonb;
  `)
}

// Rollback keeps audit history. Older application builds ignore the additive columns.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db
}
