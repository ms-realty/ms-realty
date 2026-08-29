import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'
import { up as ensurePostgresSearchView } from './20260811_153000_postgres_public_search'

export async function up(args: MigrateUpArgs): Promise<void> {
  await args.db.execute(sql`
    ALTER TABLE "listing_translations" ADD COLUMN IF NOT EXISTS "title" varchar;
    ALTER TABLE "listing_translations" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "listing_translations" ADD COLUMN IF NOT EXISTS "seo_title" varchar;
    ALTER TABLE "listing_translations" ADD COLUMN IF NOT EXISTS "meta_description" varchar;
    ALTER TABLE "listing_translations" ADD COLUMN IF NOT EXISTS "translator" varchar;
    ALTER TABLE "listing_translations" ADD COLUMN IF NOT EXISTS "content_origin" varchar;
    ALTER TABLE "listing_translations" ADD COLUMN IF NOT EXISTS "human_approved" boolean DEFAULT false NOT NULL;
    ALTER TABLE "listing_translations" ADD COLUMN IF NOT EXISTS "publication_authorized_by" varchar;
    ALTER TABLE "listing_translations" ADD COLUMN IF NOT EXISTS "publication_authorized_at" timestamp(3) with time zone;
    ALTER TABLE "listing_translations" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    ALTER TABLE "listing_translations" ADD COLUMN IF NOT EXISTS "citations" jsonb DEFAULT '[]'::jsonb NOT NULL;

    ALTER TABLE "_listing_translations_v" ADD COLUMN IF NOT EXISTS "version_title" varchar;
    ALTER TABLE "_listing_translations_v" ADD COLUMN IF NOT EXISTS "version_description" varchar;
    ALTER TABLE "_listing_translations_v" ADD COLUMN IF NOT EXISTS "version_seo_title" varchar;
    ALTER TABLE "_listing_translations_v" ADD COLUMN IF NOT EXISTS "version_meta_description" varchar;
    ALTER TABLE "_listing_translations_v" ADD COLUMN IF NOT EXISTS "version_translator" varchar;
    ALTER TABLE "_listing_translations_v" ADD COLUMN IF NOT EXISTS "version_content_origin" varchar;
    ALTER TABLE "_listing_translations_v" ADD COLUMN IF NOT EXISTS "version_human_approved" boolean DEFAULT false NOT NULL;
    ALTER TABLE "_listing_translations_v" ADD COLUMN IF NOT EXISTS "version_publication_authorized_by" varchar;
    ALTER TABLE "_listing_translations_v" ADD COLUMN IF NOT EXISTS "version_publication_authorized_at" timestamp(3) with time zone;
    ALTER TABLE "_listing_translations_v" ADD COLUMN IF NOT EXISTS "version_published_at" timestamp(3) with time zone;
    ALTER TABLE "_listing_translations_v" ADD COLUMN IF NOT EXISTS "version_citations" jsonb DEFAULT '[]'::jsonb NOT NULL;
  `)

  await ensurePostgresSearchView(args, { localizedTranslations: true })
}

// Published copy and its audit provenance are durable authority. A rollback
// must not erase them or replace multilingual search with source-language text.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db
}
