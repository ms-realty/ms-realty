import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_properties_property_family" AS ENUM('apartment', 'house', 'plot', 'agricultural_land', 'commercial', 'hotel');
    CREATE TYPE "public"."enum_properties_taxonomy_review_status" AS ENUM('mapped', 'mapping_review_required');
    CREATE TYPE "public"."enum_properties_fact_verification_state" AS ENUM('unknown', 'not_applicable', 'entered_pending_review', 'broker_verified');
    CREATE TYPE "public"."enum_locations_public_location_precision" AS ENUM('exact', 'approximate', 'locality');
    CREATE TYPE "public"."enum_listing_translations_translation_state" AS ENUM('missing', 'hermes_drafted', 'human_edited', 'approved', 'published', 'stale');
    CREATE TYPE "public"."enum__listing_translations_v_version_translation_state" AS ENUM('missing', 'hermes_drafted', 'human_edited', 'approved', 'published', 'stale');
    CREATE TYPE "public"."enum_listing_enrichment_tasks_task_type" AS ENUM('verify_imported_facts');
    CREATE TYPE "public"."enum_listing_enrichment_tasks_task_state" AS ENUM('pending', 'in_progress', 'completed', 'skipped');
    CREATE TYPE "public"."enum_listing_enrichment_tasks_source" AS ENUM('legacy_backfill', 'listing_change');
    CREATE TYPE "public"."enum_search_outbox_event_type" AS ENUM('upsert', 'delete');
    CREATE TYPE "public"."enum_search_outbox_outbox_state" AS ENUM('pending', 'processing', 'completed', 'failed');

    CREATE TABLE "locations" (
      "id" varchar PRIMARY KEY NOT NULL,
      "label" varchar,
      "public_location_precision" "enum_locations_public_location_precision",
      "internal_latitude" numeric,
      "internal_longitude" numeric,
      "public_latitude" numeric,
      "public_longitude" numeric,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE "properties" (
      "id" varchar PRIMARY KEY NOT NULL,
      "location_id" varchar,
      "property_family" "enum_properties_property_family",
      "property_subtype" varchar,
      "taxonomy_mapping_version" varchar,
      "taxonomy_review_status" "enum_properties_taxonomy_review_status",
      "facts_legacy_property_type" varchar,
      "facts_condition" varchar,
      "facts_living_area_sqm" numeric,
      "facts_built_area_sqm" numeric,
      "facts_usable_area_sqm" numeric,
      "facts_gross_floor_area_sqm" numeric,
      "facts_land_area_sqm" numeric,
      "facts_bedrooms_count" numeric,
      "facts_premises_count" numeric,
      "facts_hotel_room_count" numeric,
      "facts_floor_number" numeric,
      "facts_total_floors" numeric,
      "facts_storeys_count" numeric,
      "facts_public_location_precision" varchar,
      "facts_primary_area_sqm" numeric,
      "zero_value_audit" jsonb,
      "legacy_listing_id" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE "properties_fact_verification" (
      "_order" integer NOT NULL,
      "_parent_id" varchar NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "field" varchar,
      "state" "enum_properties_fact_verification_state",
      "source_type" varchar,
      "source_reference" varchar
    );

    CREATE TABLE "listing_enrichment_tasks" (
      "id" varchar PRIMARY KEY NOT NULL,
      "listing_id" varchar,
      "property_id" varchar,
      "task_type" "enum_listing_enrichment_tasks_task_type",
      "task_state" "enum_listing_enrichment_tasks_task_state",
      "idempotency_key" varchar,
      "fact_fields" jsonb,
      "source" "enum_listing_enrichment_tasks_source",
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE "search_outbox" (
      "id" varchar PRIMARY KEY NOT NULL,
      "listing_id" varchar,
      "event_type" "enum_search_outbox_event_type",
      "outbox_state" "enum_search_outbox_outbox_state",
      "idempotency_key" varchar,
      "payload" jsonb,
      "attempts" numeric DEFAULT 0,
      "last_error" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    ALTER TABLE "listings" ADD COLUMN "property_id" varchar;
    ALTER TABLE "listings" ADD COLUMN "location_id" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN "version_property_id" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN "version_location_id" varchar;
    ALTER TABLE "listing_translations" ADD COLUMN "listing_id" varchar;
    ALTER TABLE "listing_translations" ADD COLUMN "translation_state" "enum_listing_translations_translation_state";
    ALTER TABLE "_listing_translations_v" ADD COLUMN "version_listing_id" varchar;
    ALTER TABLE "_listing_translations_v" ADD COLUMN "version_translation_state" "enum__listing_translations_v_version_translation_state";

    INSERT INTO "locations" ("id", "label", "public_location_precision")
      SELECT DISTINCT
        'location:' || lower(trim(l."facts_location")),
        trim(l."facts_location"),
        'approximate'::"enum_locations_public_location_precision"
      FROM "listings" l
      WHERE trim(coalesce(l."facts_location", '')) <> ''
      ON CONFLICT ("id") DO NOTHING;

    INSERT INTO "properties" (
      "id", "location_id", "property_family", "property_subtype", "taxonomy_mapping_version", "taxonomy_review_status",
      "facts_legacy_property_type", "facts_bedrooms_count", "facts_public_location_precision", "zero_value_audit", "legacy_listing_id"
    )
      SELECT
        'property-' || l."id",
        CASE WHEN trim(coalesce(l."facts_location", '')) <> '' THEN 'location:' || lower(trim(l."facts_location")) ELSE NULL END,
        CASE lower(coalesce(l."facts_property_type", ''))
          WHEN 'apartment' THEN 'apartment'::"enum_properties_property_family"
          WHEN 'multi_unit' THEN 'apartment'::"enum_properties_property_family"
          WHEN 'house' THEN 'house'::"enum_properties_property_family"
          WHEN 'villa' THEN 'house'::"enum_properties_property_family"
          WHEN 'land' THEN 'plot'::"enum_properties_property_family"
          WHEN 'plot' THEN 'plot'::"enum_properties_property_family"
          WHEN 'agricultural_land' THEN 'agricultural_land'::"enum_properties_property_family"
          WHEN 'commercial' THEN 'commercial'::"enum_properties_property_family"
          WHEN 'hotel' THEN 'hotel'::"enum_properties_property_family"
          ELSE NULL
        END,
        CASE lower(coalesce(l."facts_property_type", ''))
          WHEN 'apartment' THEN 'apartment'
          WHEN 'multi_unit' THEN 'development'
          WHEN 'house' THEN 'house'
          WHEN 'villa' THEN 'villa'
          WHEN 'plot' THEN 'building_plot'
          WHEN 'commercial' THEN 'other_commercial'
          WHEN 'hotel' THEN 'hotel'
          ELSE NULL
        END,
        '2026-07-30',
        CASE WHEN lower(coalesce(l."facts_property_type", '')) IN ('land', 'property')
          THEN 'mapping_review_required'::"enum_properties_taxonomy_review_status"
          ELSE 'mapped'::"enum_properties_taxonomy_review_status"
        END,
        l."facts_property_type",
        CASE WHEN l."facts_bedrooms" > 0 THEN l."facts_bedrooms" ELSE NULL END,
        'approximate',
        CASE WHEN l."facts_bedrooms" = 0 THEN '["bedrooms_count"]'::jsonb ELSE '[]'::jsonb END,
        l."id"
      FROM "listings" l
      ON CONFLICT ("id") DO NOTHING;

    UPDATE "listings" l
      SET "property_id" = 'property-' || l."id",
          "location_id" = CASE WHEN trim(coalesce(l."facts_location", '')) <> '' THEN 'location:' || lower(trim(l."facts_location")) ELSE NULL END;

    UPDATE "_listings_v" v
      SET "version_property_id" = CASE WHEN v."parent_id" IS NOT NULL THEN 'property-' || v."parent_id" ELSE NULL END,
          "version_location_id" = CASE WHEN trim(coalesce(v."version_facts_location", '')) <> '' THEN 'location:' || lower(trim(v."version_facts_location")) ELSE NULL END;

    UPDATE "listing_translations" t
      SET "listing_id" = rel."parent_id",
          "translation_state" = CASE WHEN t."status"::text = 'published'
            THEN 'published'::"enum_listing_translations_translation_state"
            ELSE 'missing'::"enum_listing_translations_translation_state"
          END
      FROM "listings_rels" rel
      WHERE rel."listing_translations_id" = t."id";

    UPDATE "_listing_translations_v" t
      SET "version_listing_id" = listing_version."parent_id",
          "version_translation_state" = CASE WHEN t."version_status"::text = 'published'
            THEN 'published'::"enum__listing_translations_v_version_translation_state"
            ELSE 'missing'::"enum__listing_translations_v_version_translation_state"
          END
      FROM "_listings_v_rels" rel
      JOIN "_listings_v" listing_version ON listing_version."id" = rel."parent_id"
      WHERE rel."listing_translations_id" = t."parent_id";

    UPDATE "listing_translations"
      SET "translation_state" = CASE WHEN "status"::text = 'published'
        THEN 'published'::"enum_listing_translations_translation_state"
        ELSE 'missing'::"enum_listing_translations_translation_state"
      END
      WHERE "translation_state" IS NULL;

    UPDATE "_listing_translations_v"
      SET "version_translation_state" = CASE WHEN "version_status"::text = 'published'
        THEN 'published'::"enum__listing_translations_v_version_translation_state"
        ELSE 'missing'::"enum__listing_translations_v_version_translation_state"
      END
      WHERE "version_translation_state" IS NULL;

    INSERT INTO "properties_fact_verification" ("_order", "_parent_id", "id", "field", "state", "source_type", "source_reference")
      SELECT 1, p."id", 'fact-' || p."id" || '-legacy-property-type', 'legacy_property_type',
        'entered_pending_review'::"enum_properties_fact_verification_state", 'legacy_import', p."legacy_listing_id"
      FROM "properties" p
      ON CONFLICT ("id") DO NOTHING;

    INSERT INTO "properties_fact_verification" ("_order", "_parent_id", "id", "field", "state", "source_type", "source_reference")
      SELECT 2, p."id", 'fact-' || p."id" || '-bedrooms-count', 'bedrooms_count',
        CASE WHEN p."facts_bedrooms_count" IS NULL THEN 'unknown'::"enum_properties_fact_verification_state"
          ELSE 'entered_pending_review'::"enum_properties_fact_verification_state" END,
        'legacy_import', p."legacy_listing_id"
      FROM "properties" p
      ON CONFLICT ("id") DO NOTHING;

    INSERT INTO "listing_enrichment_tasks" ("id", "listing_id", "property_id", "task_type", "task_state", "idempotency_key", "fact_fields", "source")
      SELECT
        'enrichment-' || l."id",
        l."id",
        'property-' || l."id",
        'verify_imported_facts'::"enum_listing_enrichment_tasks_task_type",
        'pending'::"enum_listing_enrichment_tasks_task_state",
        'listing:' || l."id" || ':verify_imported_facts',
        '["bedrooms_count"]'::jsonb,
        'legacy_backfill'::"enum_listing_enrichment_tasks_source"
      FROM "listings" l
      ON CONFLICT ("id") DO NOTHING;

    ALTER TABLE "properties" ADD CONSTRAINT "properties_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "properties_fact_verification" ADD CONSTRAINT "properties_fact_verification_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "listings" ADD CONSTRAINT "listings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "listings" ADD CONSTRAINT "listings_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "_listings_v" ADD CONSTRAINT "_listings_v_version_property_id_properties_id_fk" FOREIGN KEY ("version_property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "_listings_v" ADD CONSTRAINT "_listings_v_version_location_id_locations_id_fk" FOREIGN KEY ("version_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "listing_translations" ADD CONSTRAINT "listing_translations_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "_listing_translations_v" ADD CONSTRAINT "_listing_translations_v_version_listing_id_listings_id_fk" FOREIGN KEY ("version_listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "listing_enrichment_tasks" ADD CONSTRAINT "listing_enrichment_tasks_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "listing_enrichment_tasks" ADD CONSTRAINT "listing_enrichment_tasks_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "search_outbox" ADD CONSTRAINT "search_outbox_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;

    CREATE UNIQUE INDEX "locations_label_idx" ON "locations" USING btree ("label");
    CREATE INDEX "locations_updated_at_idx" ON "locations" USING btree ("updated_at");
    CREATE INDEX "locations_created_at_idx" ON "locations" USING btree ("created_at");
    CREATE INDEX "properties_location_idx" ON "properties" USING btree ("location_id");
    CREATE INDEX "properties_property_family_idx" ON "properties" USING btree ("property_family");
    CREATE UNIQUE INDEX "properties_legacy_listing_id_idx" ON "properties" USING btree ("legacy_listing_id");
    CREATE INDEX "properties_updated_at_idx" ON "properties" USING btree ("updated_at");
    CREATE INDEX "properties_created_at_idx" ON "properties" USING btree ("created_at");
    CREATE INDEX "properties_fact_verification_order_idx" ON "properties_fact_verification" USING btree ("_order");
    CREATE INDEX "properties_fact_verification_parent_id_idx" ON "properties_fact_verification" USING btree ("_parent_id");
    CREATE INDEX "listings_property_idx" ON "listings" USING btree ("property_id");
    CREATE INDEX "listings_location_idx" ON "listings" USING btree ("location_id");
    CREATE INDEX "_listings_v_version_property_idx" ON "_listings_v" USING btree ("version_property_id");
    CREATE INDEX "_listings_v_version_location_idx" ON "_listings_v" USING btree ("version_location_id");
    CREATE INDEX "listing_translations_listing_idx" ON "listing_translations" USING btree ("listing_id");
    CREATE INDEX "listing_translations_translation_state_idx" ON "listing_translations" USING btree ("translation_state");
    CREATE INDEX "_listing_translations_v_version_listing_idx" ON "_listing_translations_v" USING btree ("version_listing_id");
    CREATE INDEX "_listing_translations_v_version_translation_state_idx" ON "_listing_translations_v" USING btree ("version_translation_state");
    CREATE INDEX "listing_enrichment_tasks_listing_idx" ON "listing_enrichment_tasks" USING btree ("listing_id");
    CREATE INDEX "listing_enrichment_tasks_property_idx" ON "listing_enrichment_tasks" USING btree ("property_id");
    CREATE INDEX "listing_enrichment_tasks_task_state_idx" ON "listing_enrichment_tasks" USING btree ("task_state");
    CREATE UNIQUE INDEX "listing_enrichment_tasks_idempotency_key_idx" ON "listing_enrichment_tasks" USING btree ("idempotency_key");
    CREATE UNIQUE INDEX "listing_enrichment_tasks_listing_task_type_idx" ON "listing_enrichment_tasks" USING btree ("listing_id", "task_type");
    CREATE INDEX "search_outbox_listing_idx" ON "search_outbox" USING btree ("listing_id");
    CREATE INDEX "search_outbox_outbox_state_created_at_idx" ON "search_outbox" USING btree ("outbox_state", "created_at");
    CREATE UNIQUE INDEX "search_outbox_idempotency_key_idx" ON "search_outbox" USING btree ("idempotency_key");
    CREATE INDEX "search_outbox_updated_at_idx" ON "search_outbox" USING btree ("updated_at");
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "search_outbox" DROP CONSTRAINT "search_outbox_listing_id_listings_id_fk";
    ALTER TABLE "listing_enrichment_tasks" DROP CONSTRAINT "listing_enrichment_tasks_property_id_properties_id_fk";
    ALTER TABLE "listing_enrichment_tasks" DROP CONSTRAINT "listing_enrichment_tasks_listing_id_listings_id_fk";
    ALTER TABLE "_listing_translations_v" DROP CONSTRAINT "_listing_translations_v_version_listing_id_listings_id_fk";
    ALTER TABLE "listing_translations" DROP CONSTRAINT "listing_translations_listing_id_listings_id_fk";
    ALTER TABLE "_listings_v" DROP CONSTRAINT "_listings_v_version_location_id_locations_id_fk";
    ALTER TABLE "_listings_v" DROP CONSTRAINT "_listings_v_version_property_id_properties_id_fk";
    ALTER TABLE "listings" DROP CONSTRAINT "listings_location_id_locations_id_fk";
    ALTER TABLE "listings" DROP CONSTRAINT "listings_property_id_properties_id_fk";
    ALTER TABLE "properties_fact_verification" DROP CONSTRAINT "properties_fact_verification_parent_id_fk";
    ALTER TABLE "properties" DROP CONSTRAINT "properties_location_id_locations_id_fk";

    ALTER TABLE "_listing_translations_v" DROP COLUMN "version_translation_state";
    ALTER TABLE "_listing_translations_v" DROP COLUMN "version_listing_id";
    ALTER TABLE "listing_translations" DROP COLUMN "translation_state";
    ALTER TABLE "listing_translations" DROP COLUMN "listing_id";
    ALTER TABLE "_listings_v" DROP COLUMN "version_location_id";
    ALTER TABLE "_listings_v" DROP COLUMN "version_property_id";
    ALTER TABLE "listings" DROP COLUMN "location_id";
    ALTER TABLE "listings" DROP COLUMN "property_id";

    DROP TABLE "search_outbox";
    DROP TABLE "listing_enrichment_tasks";
    DROP TABLE "properties_fact_verification";
    DROP TABLE "properties";
    DROP TABLE "locations";

    DROP TYPE "public"."enum_search_outbox_outbox_state";
    DROP TYPE "public"."enum_search_outbox_event_type";
    DROP TYPE "public"."enum_listing_enrichment_tasks_source";
    DROP TYPE "public"."enum_listing_enrichment_tasks_task_state";
    DROP TYPE "public"."enum_listing_enrichment_tasks_task_type";
    DROP TYPE "public"."enum__listing_translations_v_version_translation_state";
    DROP TYPE "public"."enum_listing_translations_translation_state";
    DROP TYPE "public"."enum_locations_public_location_precision";
    DROP TYPE "public"."enum_properties_fact_verification_state";
    DROP TYPE "public"."enum_properties_taxonomy_review_status";
    DROP TYPE "public"."enum_properties_property_family";
  `)
}
