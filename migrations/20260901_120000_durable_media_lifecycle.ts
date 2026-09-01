import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

// Listing media bytes already live in the owned object store. This migration
// adds the durable Payload identity, storage provenance, replacement lineage,
// and append-only review history needed to attach and review those bytes from a
// listing draft without falling back to the JSONL mirror.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      ALTER TYPE "public"."enum_media_assets_kind" ADD VALUE IF NOT EXISTS 'video';
      ALTER TYPE "public"."enum__media_assets_v_version_kind" ADD VALUE IF NOT EXISTS 'video';
    EXCEPTION WHEN undefined_object THEN NULL;
    END $$;

    DO $$
    BEGIN
      CREATE TYPE "public"."enum_media_assets_review_decision" AS ENUM('publish', 'keep_private');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$
    BEGIN
      CREATE TYPE "public"."enum__media_assets_v_version_review_decision" AS ENUM('publish', 'keep_private');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "asset_id" varchar;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "upload_id" varchar;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "subject_type" varchar;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "subject_id" varchar;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "source_url" varchar;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "storage_driver" varchar;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "storage_key" varchar;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "rendition" jsonb;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "content_hash" varchar;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "format" varchar;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "content_type" varchar;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "bytes" numeric;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "submitted_bytes" numeric;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "bytes_before" numeric;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "bytes_after" numeric;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "optimized" boolean;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "orientation_applied" boolean;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "resized" boolean;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "metadata_stripped" boolean;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "metadata_removed_bytes" numeric;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "uploaded_at" timestamp(3) with time zone;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "uploaded_by" varchar;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "source" varchar;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "replaces_asset_id" varchar;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "replacement_asset_id" varchar;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "reviewer" varchar;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp(3) with time zone;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "review_decision" "enum_media_assets_review_decision";
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "human_confirmed" boolean;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "review_history" jsonb;

    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_asset_id" varchar;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_upload_id" varchar;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_subject_type" varchar;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_subject_id" varchar;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_source_url" varchar;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_storage_driver" varchar;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_storage_key" varchar;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_rendition" jsonb;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_content_hash" varchar;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_format" varchar;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_content_type" varchar;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_bytes" numeric;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_submitted_bytes" numeric;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_bytes_before" numeric;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_bytes_after" numeric;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_optimized" boolean;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_orientation_applied" boolean;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_resized" boolean;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_metadata_stripped" boolean;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_metadata_removed_bytes" numeric;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_uploaded_at" timestamp(3) with time zone;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_uploaded_by" varchar;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_source" varchar;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_replaces_asset_id" varchar;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_replacement_asset_id" varchar;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_reviewer" varchar;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_reviewed_at" timestamp(3) with time zone;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_review_decision" "enum__media_assets_v_version_review_decision";
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_human_confirmed" boolean;
    ALTER TABLE "_media_assets_v" ADD COLUMN IF NOT EXISTS "version_review_history" jsonb;

    CREATE UNIQUE INDEX IF NOT EXISTS "media_assets_asset_id_idx"
      ON "media_assets" USING btree ("asset_id") WHERE "asset_id" IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS "media_assets_upload_id_idx"
      ON "media_assets" USING btree ("upload_id") WHERE "upload_id" IS NOT NULL;
    CREATE INDEX IF NOT EXISTS "media_assets_subject_id_idx"
      ON "media_assets" USING btree ("subject_id");
  `)
}

// Media history and storage provenance are durable authority. Rollback must
// not erase the audit trail or detach an already-reviewed asset.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db
}

