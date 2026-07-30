import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_listing_tours_provider" ADD VALUE IF NOT EXISTS 'supersplat-viewer';
    ALTER TYPE "public"."enum__listing_tours_v_version_provider" ADD VALUE IF NOT EXISTS 'supersplat-viewer';
    ALTER TYPE "public"."enum_listing_tours_review_status" ADD VALUE IF NOT EXISTS 'needs_viewer_upload';
    ALTER TYPE "public"."enum__listing_tours_v_version_review_status" ADD VALUE IF NOT EXISTS 'needs_viewer_upload';
    ALTER TABLE "listing_tours" ADD COLUMN IF NOT EXISTS "viewer_url" varchar;
    ALTER TABLE "_listing_tours_v" ADD COLUMN IF NOT EXISTS "version_viewer_url" varchar;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "listing_tours" DROP COLUMN IF EXISTS "viewer_url";
    ALTER TABLE "_listing_tours_v" DROP COLUMN IF EXISTS "version_viewer_url";
  `)
}
