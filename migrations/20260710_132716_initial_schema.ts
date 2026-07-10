import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_admins_role" AS ENUM('admin', 'broker', 'editor', 'translator');
  CREATE TYPE "public"."enum_locales_direction" AS ENUM('ltr', 'rtl');
  CREATE TYPE "public"."enum_listings_cms_status" AS ENUM('source_imported_review_required', 'draft', 'review', 'published', 'archived');
  CREATE TYPE "public"."enum_listings_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__listings_v_version_cms_status" AS ENUM('source_imported_review_required', 'draft', 'review', 'published', 'archived');
  CREATE TYPE "public"."enum__listings_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_listing_translations_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_listing_translations_direction" AS ENUM('ltr', 'rtl');
  CREATE TYPE "public"."enum__listing_translations_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__listing_translations_v_version_direction" AS ENUM('ltr', 'rtl');
  CREATE TYPE "public"."enum_media_assets_kind" AS ENUM('photo', 'floor_plan', 'site_chrome', 'document', 'unknown');
  CREATE TYPE "public"."enum_media_assets_review_status" AS ENUM('approved_imported_photo', 'reviewed_private', 'review_required');
  CREATE TYPE "public"."enum_media_assets_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__media_assets_v_version_kind" AS ENUM('photo', 'floor_plan', 'site_chrome', 'document', 'unknown');
  CREATE TYPE "public"."enum__media_assets_v_version_review_status" AS ENUM('approved_imported_photo', 'reviewed_private', 'review_required');
  CREATE TYPE "public"."enum__media_assets_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_listing_tours_provider" AS ENUM('photo-sphere-viewer');
  CREATE TYPE "public"."enum_listing_tours_review_status" AS ENUM('needs_panorama_upload', 'review_required', 'approved', 'published');
  CREATE TYPE "public"."enum_listing_tours_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__listing_tours_v_version_provider" AS ENUM('photo-sphere-viewer');
  CREATE TYPE "public"."enum__listing_tours_v_version_review_status" AS ENUM('needs_panorama_upload', 'review_required', 'approved', 'published');
  CREATE TYPE "public"."enum__listing_tours_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "admins_sessions" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"created_at" timestamp(3) with time zone,
	"expires_at" timestamp(3) with time zone NOT NULL
  );

  CREATE TABLE "admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar,
	"role" "enum_admins_role" DEFAULT 'admin' NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"email" varchar NOT NULL,
	"reset_password_token" varchar,
	"reset_password_expiration" timestamp(3) with time zone,
	"salt" varchar,
	"hash" varchar,
	"login_attempts" numeric DEFAULT 0,
	"lock_until" timestamp(3) with time zone
  );

  CREATE TABLE "locales" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar NOT NULL,
	"native_name" varchar NOT NULL,
	"admin_name" varchar NOT NULL,
	"direction" "enum_locales_direction" NOT NULL,
	"public_enabled" boolean DEFAULT false,
	"indexable" boolean DEFAULT false,
	"fallback_locale_id" integer,
	"reviewer_owner" varchar,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "listings" (
	"id" varchar PRIMARY KEY NOT NULL,
	"cms_status" "enum_listings_cms_status",
	"source_locale_id" integer,
	"source_domain" varchar,
	"source_url" varchar,
	"facts_title" varchar,
	"facts_h1" varchar,
	"facts_description" varchar,
	"facts_location" varchar,
	"facts_property_type" varchar,
	"facts_offer_type" varchar,
	"facts_bedrooms" numeric,
	"facts_price_eur" numeric,
	"facts_price_on_request" boolean,
	"facts_image_count" numeric,
	"seo_title" varchar,
	"seo_description" varchar,
	"seo_canonical" varchar,
	"seo_schema_present" boolean,
	"tour_id" integer,
	"routing_target_path" varchar,
	"routing_target_locale" varchar,
	"routing_planned_status" numeric,
	"routing_deployable" boolean,
	"routing_review_required" boolean,
	"migration_record_id" varchar,
	"migration_review_state" varchar,
	"migration_metadata_gaps" jsonb,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"_status" "enum_listings_status" DEFAULT 'draft'
  );

  CREATE TABLE "listings_rels" (
	"id" serial PRIMARY KEY NOT NULL,
	"order" integer,
	"parent_id" varchar NOT NULL,
	"path" varchar NOT NULL,
	"listing_translations_id" integer,
	"media_assets_id" integer
  );

  CREATE TABLE "_listings_v" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" varchar,
	"version_cms_status" "enum__listings_v_version_cms_status",
	"version_source_locale_id" integer,
	"version_source_domain" varchar,
	"version_source_url" varchar,
	"version_facts_title" varchar,
	"version_facts_h1" varchar,
	"version_facts_description" varchar,
	"version_facts_location" varchar,
	"version_facts_property_type" varchar,
	"version_facts_offer_type" varchar,
	"version_facts_bedrooms" numeric,
	"version_facts_price_eur" numeric,
	"version_facts_price_on_request" boolean,
	"version_facts_image_count" numeric,
	"version_seo_title" varchar,
	"version_seo_description" varchar,
	"version_seo_canonical" varchar,
	"version_seo_schema_present" boolean,
	"version_tour_id" integer,
	"version_routing_target_path" varchar,
	"version_routing_target_locale" varchar,
	"version_routing_planned_status" numeric,
	"version_routing_deployable" boolean,
	"version_routing_review_required" boolean,
	"version_migration_record_id" varchar,
	"version_migration_review_state" varchar,
	"version_migration_metadata_gaps" jsonb,
	"version_updated_at" timestamp(3) with time zone,
	"version_created_at" timestamp(3) with time zone,
	"version__status" "enum__listings_v_version_status" DEFAULT 'draft',
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"latest" boolean
  );

  CREATE TABLE "_listings_v_rels" (
	"id" serial PRIMARY KEY NOT NULL,
	"order" integer,
	"parent_id" integer NOT NULL,
	"path" varchar NOT NULL,
	"listing_translations_id" integer,
	"media_assets_id" integer
  );

  CREATE TABLE "listing_translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"locale_id" integer,
	"source_locale_id" integer,
	"status" "enum_listing_translations_status",
	"source_hash" varchar,
	"translated_hash" varchar,
	"reviewer" varchar,
	"approved_at" timestamp(3) with time zone,
	"direction" "enum_listing_translations_direction",
	"public_indexable" boolean,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"_status" "enum_listing_translations_status" DEFAULT 'draft'
  );

  CREATE TABLE "_listing_translations_v" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" integer,
	"version_locale_id" integer,
	"version_source_locale_id" integer,
	"version_status" "enum__listing_translations_v_version_status",
	"version_source_hash" varchar,
	"version_translated_hash" varchar,
	"version_reviewer" varchar,
	"version_approved_at" timestamp(3) with time zone,
	"version_direction" "enum__listing_translations_v_version_direction",
	"version_public_indexable" boolean,
	"version_updated_at" timestamp(3) with time zone,
	"version_created_at" timestamp(3) with time zone,
	"version__status" "enum__listing_translations_v_version_status" DEFAULT 'draft',
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"latest" boolean
  );

  CREATE TABLE "media_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" varchar,
	"asset_url" varchar,
	"alt" varchar,
	"width" numeric,
	"height" numeric,
	"kind" "enum_media_assets_kind",
	"is_public" boolean DEFAULT false,
	"review_status" "enum_media_assets_review_status",
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"_status" "enum_media_assets_status" DEFAULT 'draft'
  );

  CREATE TABLE "_media_assets_v" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" integer,
	"version_url" varchar,
	"version_asset_url" varchar,
	"version_alt" varchar,
	"version_width" numeric,
	"version_height" numeric,
	"version_kind" "enum__media_assets_v_version_kind",
	"version_is_public" boolean DEFAULT false,
	"version_review_status" "enum__media_assets_v_version_review_status",
	"version_updated_at" timestamp(3) with time zone,
	"version_created_at" timestamp(3) with time zone,
	"version__status" "enum__media_assets_v_version_status" DEFAULT 'draft',
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"latest" boolean
  );

  CREATE TABLE "listing_tours_hotspots" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"value" jsonb
  );

  CREATE TABLE "listing_tours_fallback_gallery" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"url" varchar,
	"alt" varchar
  );

  CREATE TABLE "listing_tours" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" "enum_listing_tours_provider",
	"listing_id_id" varchar,
	"panorama_url" varchar,
	"thumbnail_url" varchar,
	"is_public" boolean DEFAULT false,
	"accessibility_caption" varchar,
	"review_status" "enum_listing_tours_review_status",
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"_status" "enum_listing_tours_status" DEFAULT 'draft'
  );

  CREATE TABLE "_listing_tours_v_version_hotspots" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"value" jsonb,
	"_uuid" varchar
  );

  CREATE TABLE "_listing_tours_v_version_fallback_gallery" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"url" varchar,
	"alt" varchar,
	"_uuid" varchar
  );

  CREATE TABLE "_listing_tours_v" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" integer,
	"version_provider" "enum__listing_tours_v_version_provider",
	"version_listing_id_id" varchar,
	"version_panorama_url" varchar,
	"version_thumbnail_url" varchar,
	"version_is_public" boolean DEFAULT false,
	"version_accessibility_caption" varchar,
	"version_review_status" "enum__listing_tours_v_version_review_status",
	"version_updated_at" timestamp(3) with time zone,
	"version_created_at" timestamp(3) with time zone,
	"version__status" "enum__listing_tours_v_version_status" DEFAULT 'draft',
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"latest" boolean
  );

  CREATE TABLE "payload_kv" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar NOT NULL,
	"data" jsonb NOT NULL
  );

  CREATE TABLE "payload_locked_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"global_slug" varchar,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload_locked_documents_rels" (
	"id" serial PRIMARY KEY NOT NULL,
	"order" integer,
	"parent_id" integer NOT NULL,
	"path" varchar NOT NULL,
	"admins_id" integer,
	"locales_id" integer,
	"listings_id" varchar,
	"listing_translations_id" integer,
	"media_assets_id" integer,
	"listing_tours_id" integer
  );

  CREATE TABLE "payload_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar,
	"value" jsonb,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload_preferences_rels" (
	"id" serial PRIMARY KEY NOT NULL,
	"order" integer,
	"parent_id" integer NOT NULL,
	"path" varchar NOT NULL,
	"admins_id" integer
  );

  CREATE TABLE "payload_migrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar,
	"batch" numeric,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "admins_sessions" ADD CONSTRAINT "admins_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "locales" ADD CONSTRAINT "locales_fallback_locale_id_locales_id_fk" FOREIGN KEY ("fallback_locale_id") REFERENCES "public"."locales"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "listings" ADD CONSTRAINT "listings_source_locale_id_locales_id_fk" FOREIGN KEY ("source_locale_id") REFERENCES "public"."locales"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "listings" ADD CONSTRAINT "listings_tour_id_listing_tours_id_fk" FOREIGN KEY ("tour_id") REFERENCES "public"."listing_tours"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "listings_rels" ADD CONSTRAINT "listings_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "listings_rels" ADD CONSTRAINT "listings_rels_listing_translations_fk" FOREIGN KEY ("listing_translations_id") REFERENCES "public"."listing_translations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "listings_rels" ADD CONSTRAINT "listings_rels_media_assets_fk" FOREIGN KEY ("media_assets_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_listings_v" ADD CONSTRAINT "_listings_v_parent_id_listings_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_listings_v" ADD CONSTRAINT "_listings_v_version_source_locale_id_locales_id_fk" FOREIGN KEY ("version_source_locale_id") REFERENCES "public"."locales"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_listings_v" ADD CONSTRAINT "_listings_v_version_tour_id_listing_tours_id_fk" FOREIGN KEY ("version_tour_id") REFERENCES "public"."listing_tours"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_listings_v_rels" ADD CONSTRAINT "_listings_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_listings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_listings_v_rels" ADD CONSTRAINT "_listings_v_rels_listing_translations_fk" FOREIGN KEY ("listing_translations_id") REFERENCES "public"."listing_translations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_listings_v_rels" ADD CONSTRAINT "_listings_v_rels_media_assets_fk" FOREIGN KEY ("media_assets_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "listing_translations" ADD CONSTRAINT "listing_translations_locale_id_locales_id_fk" FOREIGN KEY ("locale_id") REFERENCES "public"."locales"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "listing_translations" ADD CONSTRAINT "listing_translations_source_locale_id_locales_id_fk" FOREIGN KEY ("source_locale_id") REFERENCES "public"."locales"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_listing_translations_v" ADD CONSTRAINT "_listing_translations_v_parent_id_listing_translations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."listing_translations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_listing_translations_v" ADD CONSTRAINT "_listing_translations_v_version_locale_id_locales_id_fk" FOREIGN KEY ("version_locale_id") REFERENCES "public"."locales"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_listing_translations_v" ADD CONSTRAINT "_listing_translations_v_version_source_locale_id_locales_id_fk" FOREIGN KEY ("version_source_locale_id") REFERENCES "public"."locales"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_media_assets_v" ADD CONSTRAINT "_media_assets_v_parent_id_media_assets_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "listing_tours_hotspots" ADD CONSTRAINT "listing_tours_hotspots_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."listing_tours"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "listing_tours_fallback_gallery" ADD CONSTRAINT "listing_tours_fallback_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."listing_tours"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "listing_tours" ADD CONSTRAINT "listing_tours_listing_id_id_listings_id_fk" FOREIGN KEY ("listing_id_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_listing_tours_v_version_hotspots" ADD CONSTRAINT "_listing_tours_v_version_hotspots_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_listing_tours_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_listing_tours_v_version_fallback_gallery" ADD CONSTRAINT "_listing_tours_v_version_fallback_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_listing_tours_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_listing_tours_v" ADD CONSTRAINT "_listing_tours_v_parent_id_listing_tours_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."listing_tours"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_listing_tours_v" ADD CONSTRAINT "_listing_tours_v_version_listing_id_id_listings_id_fk" FOREIGN KEY ("version_listing_id_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_locales_fk" FOREIGN KEY ("locales_id") REFERENCES "public"."locales"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_listings_fk" FOREIGN KEY ("listings_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_listing_translations_fk" FOREIGN KEY ("listing_translations_id") REFERENCES "public"."listing_translations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_assets_fk" FOREIGN KEY ("media_assets_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_listing_tours_fk" FOREIGN KEY ("listing_tours_id") REFERENCES "public"."listing_tours"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "admins_sessions_order_idx" ON "admins_sessions" USING btree ("_order");
  CREATE INDEX "admins_sessions_parent_id_idx" ON "admins_sessions" USING btree ("_parent_id");
  CREATE INDEX "admins_updated_at_idx" ON "admins" USING btree ("updated_at");
  CREATE INDEX "admins_created_at_idx" ON "admins" USING btree ("created_at");
  CREATE UNIQUE INDEX "admins_email_idx" ON "admins" USING btree ("email");
  CREATE UNIQUE INDEX "locales_code_idx" ON "locales" USING btree ("code");
  CREATE INDEX "locales_fallback_locale_idx" ON "locales" USING btree ("fallback_locale_id");
  CREATE INDEX "locales_updated_at_idx" ON "locales" USING btree ("updated_at");
  CREATE INDEX "locales_created_at_idx" ON "locales" USING btree ("created_at");
  CREATE INDEX "listings_source_locale_idx" ON "listings" USING btree ("source_locale_id");
  CREATE UNIQUE INDEX "listings_source_url_idx" ON "listings" USING btree ("source_url");
  CREATE INDEX "listings_tour_idx" ON "listings" USING btree ("tour_id");
  CREATE INDEX "listings_updated_at_idx" ON "listings" USING btree ("updated_at");
  CREATE INDEX "listings_created_at_idx" ON "listings" USING btree ("created_at");
  CREATE INDEX "listings__status_idx" ON "listings" USING btree ("_status");
  CREATE INDEX "listings_rels_order_idx" ON "listings_rels" USING btree ("order");
  CREATE INDEX "listings_rels_parent_idx" ON "listings_rels" USING btree ("parent_id");
  CREATE INDEX "listings_rels_path_idx" ON "listings_rels" USING btree ("path");
  CREATE INDEX "listings_rels_listing_translations_id_idx" ON "listings_rels" USING btree ("listing_translations_id");
  CREATE INDEX "listings_rels_media_assets_id_idx" ON "listings_rels" USING btree ("media_assets_id");
  CREATE INDEX "_listings_v_parent_idx" ON "_listings_v" USING btree ("parent_id");
  CREATE INDEX "_listings_v_version_version_source_locale_idx" ON "_listings_v" USING btree ("version_source_locale_id");
  CREATE INDEX "_listings_v_version_version_source_url_idx" ON "_listings_v" USING btree ("version_source_url");
  CREATE INDEX "_listings_v_version_version_tour_idx" ON "_listings_v" USING btree ("version_tour_id");
  CREATE INDEX "_listings_v_version_version_updated_at_idx" ON "_listings_v" USING btree ("version_updated_at");
  CREATE INDEX "_listings_v_version_version_created_at_idx" ON "_listings_v" USING btree ("version_created_at");
  CREATE INDEX "_listings_v_version_version__status_idx" ON "_listings_v" USING btree ("version__status");
  CREATE INDEX "_listings_v_created_at_idx" ON "_listings_v" USING btree ("created_at");
  CREATE INDEX "_listings_v_updated_at_idx" ON "_listings_v" USING btree ("updated_at");
  CREATE INDEX "_listings_v_latest_idx" ON "_listings_v" USING btree ("latest");
  CREATE INDEX "_listings_v_rels_order_idx" ON "_listings_v_rels" USING btree ("order");
  CREATE INDEX "_listings_v_rels_parent_idx" ON "_listings_v_rels" USING btree ("parent_id");
  CREATE INDEX "_listings_v_rels_path_idx" ON "_listings_v_rels" USING btree ("path");
  CREATE INDEX "_listings_v_rels_listing_translations_id_idx" ON "_listings_v_rels" USING btree ("listing_translations_id");
  CREATE INDEX "_listings_v_rels_media_assets_id_idx" ON "_listings_v_rels" USING btree ("media_assets_id");
  CREATE INDEX "listing_translations_locale_idx" ON "listing_translations" USING btree ("locale_id");
  CREATE INDEX "listing_translations_source_locale_idx" ON "listing_translations" USING btree ("source_locale_id");
  CREATE INDEX "listing_translations_updated_at_idx" ON "listing_translations" USING btree ("updated_at");
  CREATE INDEX "listing_translations_created_at_idx" ON "listing_translations" USING btree ("created_at");
  CREATE INDEX "listing_translations__status_idx" ON "listing_translations" USING btree ("_status");
  CREATE INDEX "_listing_translations_v_parent_idx" ON "_listing_translations_v" USING btree ("parent_id");
  CREATE INDEX "_listing_translations_v_version_version_locale_idx" ON "_listing_translations_v" USING btree ("version_locale_id");
  CREATE INDEX "_listing_translations_v_version_version_source_locale_idx" ON "_listing_translations_v" USING btree ("version_source_locale_id");
  CREATE INDEX "_listing_translations_v_version_version_updated_at_idx" ON "_listing_translations_v" USING btree ("version_updated_at");
  CREATE INDEX "_listing_translations_v_version_version_created_at_idx" ON "_listing_translations_v" USING btree ("version_created_at");
  CREATE INDEX "_listing_translations_v_version_version__status_idx" ON "_listing_translations_v" USING btree ("version__status");
  CREATE INDEX "_listing_translations_v_created_at_idx" ON "_listing_translations_v" USING btree ("created_at");
  CREATE INDEX "_listing_translations_v_updated_at_idx" ON "_listing_translations_v" USING btree ("updated_at");
  CREATE INDEX "_listing_translations_v_latest_idx" ON "_listing_translations_v" USING btree ("latest");
  CREATE UNIQUE INDEX "media_assets_url_idx" ON "media_assets" USING btree ("url");
  CREATE INDEX "media_assets_updated_at_idx" ON "media_assets" USING btree ("updated_at");
  CREATE INDEX "media_assets_created_at_idx" ON "media_assets" USING btree ("created_at");
  CREATE INDEX "media_assets__status_idx" ON "media_assets" USING btree ("_status");
  CREATE INDEX "_media_assets_v_parent_idx" ON "_media_assets_v" USING btree ("parent_id");
  CREATE INDEX "_media_assets_v_version_version_url_idx" ON "_media_assets_v" USING btree ("version_url");
  CREATE INDEX "_media_assets_v_version_version_updated_at_idx" ON "_media_assets_v" USING btree ("version_updated_at");
  CREATE INDEX "_media_assets_v_version_version_created_at_idx" ON "_media_assets_v" USING btree ("version_created_at");
  CREATE INDEX "_media_assets_v_version_version__status_idx" ON "_media_assets_v" USING btree ("version__status");
  CREATE INDEX "_media_assets_v_created_at_idx" ON "_media_assets_v" USING btree ("created_at");
  CREATE INDEX "_media_assets_v_updated_at_idx" ON "_media_assets_v" USING btree ("updated_at");
  CREATE INDEX "_media_assets_v_latest_idx" ON "_media_assets_v" USING btree ("latest");
  CREATE INDEX "listing_tours_hotspots_order_idx" ON "listing_tours_hotspots" USING btree ("_order");
  CREATE INDEX "listing_tours_hotspots_parent_id_idx" ON "listing_tours_hotspots" USING btree ("_parent_id");
  CREATE INDEX "listing_tours_fallback_gallery_order_idx" ON "listing_tours_fallback_gallery" USING btree ("_order");
  CREATE INDEX "listing_tours_fallback_gallery_parent_id_idx" ON "listing_tours_fallback_gallery" USING btree ("_parent_id");
  CREATE INDEX "listing_tours_listing_id_idx" ON "listing_tours" USING btree ("listing_id_id");
  CREATE INDEX "listing_tours_updated_at_idx" ON "listing_tours" USING btree ("updated_at");
  CREATE INDEX "listing_tours_created_at_idx" ON "listing_tours" USING btree ("created_at");
  CREATE INDEX "listing_tours__status_idx" ON "listing_tours" USING btree ("_status");
  CREATE INDEX "_listing_tours_v_version_hotspots_order_idx" ON "_listing_tours_v_version_hotspots" USING btree ("_order");
  CREATE INDEX "_listing_tours_v_version_hotspots_parent_id_idx" ON "_listing_tours_v_version_hotspots" USING btree ("_parent_id");
  CREATE INDEX "_listing_tours_v_version_fallback_gallery_order_idx" ON "_listing_tours_v_version_fallback_gallery" USING btree ("_order");
  CREATE INDEX "_listing_tours_v_version_fallback_gallery_parent_id_idx" ON "_listing_tours_v_version_fallback_gallery" USING btree ("_parent_id");
  CREATE INDEX "_listing_tours_v_parent_idx" ON "_listing_tours_v" USING btree ("parent_id");
  CREATE INDEX "_listing_tours_v_version_version_listing_id_idx" ON "_listing_tours_v" USING btree ("version_listing_id_id");
  CREATE INDEX "_listing_tours_v_version_version_updated_at_idx" ON "_listing_tours_v" USING btree ("version_updated_at");
  CREATE INDEX "_listing_tours_v_version_version_created_at_idx" ON "_listing_tours_v" USING btree ("version_created_at");
  CREATE INDEX "_listing_tours_v_version_version__status_idx" ON "_listing_tours_v" USING btree ("version__status");
  CREATE INDEX "_listing_tours_v_created_at_idx" ON "_listing_tours_v" USING btree ("created_at");
  CREATE INDEX "_listing_tours_v_updated_at_idx" ON "_listing_tours_v" USING btree ("updated_at");
  CREATE INDEX "_listing_tours_v_latest_idx" ON "_listing_tours_v" USING btree ("latest");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_admins_id_idx" ON "payload_locked_documents_rels" USING btree ("admins_id");
  CREATE INDEX "payload_locked_documents_rels_locales_id_idx" ON "payload_locked_documents_rels" USING btree ("locales_id");
  CREATE INDEX "payload_locked_documents_rels_listings_id_idx" ON "payload_locked_documents_rels" USING btree ("listings_id");
  CREATE INDEX "payload_locked_documents_rels_listing_translations_id_idx" ON "payload_locked_documents_rels" USING btree ("listing_translations_id");
  CREATE INDEX "payload_locked_documents_rels_media_assets_id_idx" ON "payload_locked_documents_rels" USING btree ("media_assets_id");
  CREATE INDEX "payload_locked_documents_rels_listing_tours_id_idx" ON "payload_locked_documents_rels" USING btree ("listing_tours_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_admins_id_idx" ON "payload_preferences_rels" USING btree ("admins_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "admins_sessions" CASCADE;
  DROP TABLE "admins" CASCADE;
  DROP TABLE "locales" CASCADE;
  DROP TABLE "listings" CASCADE;
  DROP TABLE "listings_rels" CASCADE;
  DROP TABLE "_listings_v" CASCADE;
  DROP TABLE "_listings_v_rels" CASCADE;
  DROP TABLE "listing_translations" CASCADE;
  DROP TABLE "_listing_translations_v" CASCADE;
  DROP TABLE "media_assets" CASCADE;
  DROP TABLE "_media_assets_v" CASCADE;
  DROP TABLE "listing_tours_hotspots" CASCADE;
  DROP TABLE "listing_tours_fallback_gallery" CASCADE;
  DROP TABLE "listing_tours" CASCADE;
  DROP TABLE "_listing_tours_v_version_hotspots" CASCADE;
  DROP TABLE "_listing_tours_v_version_fallback_gallery" CASCADE;
  DROP TABLE "_listing_tours_v" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_admins_role";
  DROP TYPE "public"."enum_locales_direction";
  DROP TYPE "public"."enum_listings_cms_status";
  DROP TYPE "public"."enum_listings_status";
  DROP TYPE "public"."enum__listings_v_version_cms_status";
  DROP TYPE "public"."enum__listings_v_version_status";
  DROP TYPE "public"."enum_listing_translations_status";
  DROP TYPE "public"."enum_listing_translations_direction";
  DROP TYPE "public"."enum__listing_translations_v_version_status";
  DROP TYPE "public"."enum__listing_translations_v_version_direction";
  DROP TYPE "public"."enum_media_assets_kind";
  DROP TYPE "public"."enum_media_assets_review_status";
  DROP TYPE "public"."enum_media_assets_status";
  DROP TYPE "public"."enum__media_assets_v_version_kind";
  DROP TYPE "public"."enum__media_assets_v_version_review_status";
  DROP TYPE "public"."enum__media_assets_v_version_status";
  DROP TYPE "public"."enum_listing_tours_provider";
  DROP TYPE "public"."enum_listing_tours_review_status";
  DROP TYPE "public"."enum_listing_tours_status";
  DROP TYPE "public"."enum__listing_tours_v_version_provider";
  DROP TYPE "public"."enum__listing_tours_v_version_review_status";
  DROP TYPE "public"."enum__listing_tours_v_version_status";`)
}
