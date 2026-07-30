import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_properties_property_family" AS ENUM('apartment', 'house', 'plot', 'agricultural_land', 'commercial', 'hotel');
    CREATE TYPE "public"."enum_properties_taxonomy_review_status" AS ENUM('mapped', 'mapping_review_required');
    CREATE TYPE "public"."enum_properties_fact_verification_state" AS ENUM('unknown', 'not_applicable', 'entered_pending_review', 'broker_verified');
    CREATE TYPE "public"."enum_locations_public_location_precision" AS ENUM('exact', 'approximate', 'locality');
    CREATE TYPE "public"."enum_listing_translations_translation_state" AS ENUM('missing', 'draft', 'hermes_drafted', 'human_edited', 'approved', 'published', 'stale');
    CREATE TYPE "public"."enum__listing_translations_v_version_translation_state" AS ENUM('missing', 'draft', 'hermes_drafted', 'human_edited', 'approved', 'published', 'stale');
    CREATE TYPE "public"."enum_listing_enrichment_tasks_task_type" AS ENUM('verify_imported_facts');
    CREATE TYPE "public"."enum_listing_enrichment_tasks_task_state" AS ENUM('pending', 'in_progress', 'completed', 'skipped');
    CREATE TYPE "public"."enum_listing_enrichment_tasks_source" AS ENUM('legacy_backfill', 'listing_change');
    CREATE TYPE "public"."enum_search_outbox_event_type" AS ENUM('upsert', 'delete');
    CREATE TYPE "public"."enum_search_outbox_outbox_state" AS ENUM('pending', 'processing', 'completed', 'failed');

    CREATE TABLE "locations" (
      "id" varchar PRIMARY KEY NOT NULL,
      "label" varchar NOT NULL,
      "public_location_precision" "enum_locations_public_location_precision" NOT NULL,
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
      "taxonomy_mapping_version" varchar NOT NULL,
      "taxonomy_review_status" "enum_properties_taxonomy_review_status" NOT NULL,
      "facts_legacy_property_type" varchar,
      "facts_condition" varchar,
      "facts_construction_status" varchar,
      "facts_parking_kind" varchar,
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
      "facts_zoning_status" varchar,
      "facts_utilities_status" varchar,
      "facts_road_access_status" varchar,
      "facts_land_category" varchar,
      "facts_permanent_use" varchar,
      "facts_permitted_use" varchar,
      "facts_public_location_precision" varchar,
      "facts_primary_area_sqm" numeric,
      "zero_value_audit" jsonb,
      "legacy_listing_id" varchar NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE "properties_fact_verification" (
      "_order" integer NOT NULL,
      "_parent_id" varchar NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "field" varchar NOT NULL,
      "state" "enum_properties_fact_verification_state" NOT NULL,
      "source_type" varchar,
      "source_reference" varchar
    );

    CREATE TABLE "listing_enrichment_tasks" (
      "id" varchar PRIMARY KEY NOT NULL,
      "listing_id" varchar,
      "property_id" varchar,
      "task_type" "enum_listing_enrichment_tasks_task_type" NOT NULL,
      "task_state" "enum_listing_enrichment_tasks_task_state" NOT NULL,
      "idempotency_key" varchar NOT NULL,
      "fact_fields" jsonb,
      "source" "enum_listing_enrichment_tasks_source" NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE "search_outbox" (
      "id" varchar PRIMARY KEY NOT NULL,
      "listing_id" varchar,
      "event_type" "enum_search_outbox_event_type" NOT NULL,
      "outbox_state" "enum_search_outbox_outbox_state" NOT NULL,
      "idempotency_key" varchar NOT NULL,
      "payload" jsonb NOT NULL,
      "attempts" numeric DEFAULT 0 NOT NULL,
      "last_error" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    ALTER TABLE "listings" ADD COLUMN "property_id" varchar;
    ALTER TABLE "listings" ADD COLUMN "location_id" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN "version_property_id" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN "version_location_id" varchar;
    -- Preserve flat legacy physical facts while the canonical Property becomes the reviewed source of truth.
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "facts_bedrooms_not_applicable" boolean;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "facts_area_sqm" numeric;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "facts_floor" numeric;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "facts_total_floors" numeric;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "facts_land_area_sqm" numeric;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "facts_condition" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "facts_location_precision" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_facts_bedrooms_not_applicable" boolean;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_facts_area_sqm" numeric;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_facts_floor" numeric;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_facts_total_floors" numeric;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_facts_land_area_sqm" numeric;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_facts_condition" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_facts_location_precision" varchar;
    ALTER TABLE "listing_translations" ADD COLUMN "listing_id" varchar;
    ALTER TABLE "listing_translations" ADD COLUMN "translation_state" "enum_listing_translations_translation_state";
    ALTER TABLE "_listing_translations_v" ADD COLUMN "version_listing_id" varchar;
    ALTER TABLE "_listing_translations_v" ADD COLUMN "version_translation_state" "enum__listing_translations_v_version_translation_state";

    INSERT INTO "locations" ("id", "label", "public_location_precision")
      SELECT
        'location:' || lower(trim(l."facts_location")),
        trim(l."facts_location"),
        CASE
          WHEN bool_or(lower(trim(coalesce(l."facts_location_precision", ''))) = 'exact') THEN 'exact'::"enum_locations_public_location_precision"
          WHEN bool_or(lower(trim(coalesce(l."facts_location_precision", ''))) = 'locality') THEN 'locality'::"enum_locations_public_location_precision"
          ELSE 'approximate'::"enum_locations_public_location_precision"
        END
      FROM "listings" l
      WHERE trim(coalesce(l."facts_location", '')) <> ''
      GROUP BY lower(trim(l."facts_location")), trim(l."facts_location")
      ON CONFLICT ("id") DO NOTHING;

    WITH "legacy" AS (
      SELECT
        l.*,
        lower(trim(coalesce(l."facts_property_type", ''))) AS "legacy_property_type",
        CASE lower(trim(coalesce(l."facts_property_type", '')))
          WHEN 'apartment' THEN 'apartment'
          WHEN 'multi_unit' THEN 'apartment'
          WHEN 'house' THEN 'house'
          WHEN 'villa' THEN 'house'
          WHEN 'land' THEN 'plot'
          WHEN 'plot' THEN 'plot'
          WHEN 'agricultural_land' THEN 'agricultural_land'
          WHEN 'commercial' THEN 'commercial'
          WHEN 'hotel' THEN 'hotel'
          ELSE NULL
        END AS "property_family",
        CASE lower(trim(coalesce(l."facts_property_type", '')))
          WHEN 'apartment' THEN 'apartment'
          WHEN 'multi_unit' THEN 'development'
          WHEN 'house' THEN 'house'
          WHEN 'villa' THEN 'villa'
          WHEN 'plot' THEN 'building_plot'
          WHEN 'commercial' THEN 'other_commercial'
          WHEN 'hotel' THEN 'hotel'
          ELSE NULL
        END AS "property_subtype",
        CASE lower(trim(coalesce(l."facts_location_precision", '')))
          WHEN 'exact' THEN 'exact'
          WHEN 'locality' THEN 'locality'
          ELSE 'approximate'
        END AS "public_location_precision"
      FROM "listings" l
    )
    INSERT INTO "properties" (
      "id", "location_id", "property_family", "property_subtype", "taxonomy_mapping_version", "taxonomy_review_status",
      "facts_legacy_property_type", "facts_condition", "facts_built_area_sqm", "facts_usable_area_sqm", "facts_gross_floor_area_sqm",
      "facts_land_area_sqm", "facts_bedrooms_count", "facts_floor_number", "facts_total_floors", "facts_public_location_precision",
      "facts_primary_area_sqm", "zero_value_audit", "legacy_listing_id"
    )
      SELECT
        'property-' || l."id",
        CASE WHEN trim(coalesce(l."facts_location", '')) <> '' THEN 'location:' || lower(trim(l."facts_location")) ELSE NULL END,
        l."property_family"::"enum_properties_property_family",
        l."property_subtype",
        '2026-07-30',
        CASE WHEN l."property_family" IS NULL OR l."legacy_property_type" IN ('land', 'property')
          THEN 'mapping_review_required'::"enum_properties_taxonomy_review_status"
          ELSE 'mapped'::"enum_properties_taxonomy_review_status"
        END,
        nullif(l."facts_property_type", ''),
        CASE WHEN l."property_family" IS NOT NULL THEN nullif(trim(l."facts_condition"), '') ELSE NULL END,
        CASE WHEN l."facts_area_sqm" > 0 AND l."property_family" IN ('apartment', 'house') THEN l."facts_area_sqm" ELSE NULL END,
        CASE WHEN l."facts_area_sqm" > 0 AND l."property_family" = 'commercial' THEN l."facts_area_sqm" ELSE NULL END,
        CASE WHEN l."facts_area_sqm" > 0 AND l."property_family" = 'hotel' THEN l."facts_area_sqm" ELSE NULL END,
        CASE
          WHEN l."property_family" IN ('apartment', 'house', 'plot', 'agricultural_land', 'hotel') AND l."facts_land_area_sqm" > 0 THEN l."facts_land_area_sqm"
          WHEN l."property_family" IN ('plot', 'agricultural_land') AND l."facts_area_sqm" > 0 THEN l."facts_area_sqm"
          ELSE NULL
        END,
        CASE
          WHEN l."facts_bedrooms" > 0
            AND (l."property_family" = 'house' OR (l."property_family" = 'apartment' AND l."property_subtype" <> 'development'))
          THEN l."facts_bedrooms"
          ELSE NULL
        END,
        CASE WHEN l."facts_floor" > 0 AND l."property_family" IN ('apartment', 'commercial') THEN l."facts_floor" ELSE NULL END,
        CASE WHEN l."facts_total_floors" > 0 AND l."property_family" IN ('apartment', 'commercial') THEN l."facts_total_floors" ELSE NULL END,
        l."public_location_precision",
        NULL,
        '[]'::jsonb,
        l."id"
      FROM "legacy" l
      ON CONFLICT ("id") DO NOTHING;

    UPDATE "properties" p
      SET "facts_primary_area_sqm" = CASE p."property_family"::text
        WHEN 'apartment' THEN coalesce(p."facts_living_area_sqm", p."facts_built_area_sqm", p."facts_usable_area_sqm")
        WHEN 'house' THEN coalesce(p."facts_built_area_sqm", p."facts_living_area_sqm")
        WHEN 'plot' THEN p."facts_land_area_sqm"
        WHEN 'agricultural_land' THEN p."facts_land_area_sqm"
        WHEN 'commercial' THEN coalesce(p."facts_usable_area_sqm", p."facts_gross_floor_area_sqm")
        WHEN 'hotel' THEN coalesce(p."facts_gross_floor_area_sqm", p."facts_built_area_sqm")
        ELSE NULL
      END;

    UPDATE "properties" p
      SET "zero_value_audit" = coalesce((
        SELECT jsonb_agg(audit."field" ORDER BY audit."field")
        FROM (
          SELECT DISTINCT candidate."field"
          FROM unnest(ARRAY[
            CASE WHEN l."facts_bedrooms" = 0
              AND (p."property_family"::text = 'house' OR (p."property_family"::text = 'apartment' AND p."property_subtype" <> 'development'))
              THEN 'bedrooms_count' END,
            CASE WHEN l."facts_area_sqm" = 0 AND p."facts_built_area_sqm" IS NULL AND p."property_family"::text IN ('apartment', 'house')
              THEN 'built_area_sqm' END,
            CASE WHEN l."facts_area_sqm" = 0 AND p."facts_usable_area_sqm" IS NULL AND p."property_family"::text = 'commercial'
              THEN 'usable_area_sqm' END,
            CASE WHEN l."facts_area_sqm" = 0 AND p."facts_gross_floor_area_sqm" IS NULL AND p."property_family"::text = 'hotel'
              THEN 'gross_floor_area_sqm' END,
            CASE WHEN l."facts_area_sqm" = 0 AND p."facts_land_area_sqm" IS NULL AND p."property_family"::text IN ('plot', 'agricultural_land')
              THEN 'land_area_sqm' END,
            CASE WHEN l."facts_land_area_sqm" = 0 AND p."property_family"::text IN ('apartment', 'house', 'plot', 'agricultural_land', 'hotel')
              THEN 'land_area_sqm' END,
            CASE WHEN l."facts_floor" = 0 AND p."property_family"::text IN ('apartment', 'commercial')
              THEN 'floor_number' END,
            CASE WHEN l."facts_total_floors" = 0 AND p."property_family"::text IN ('apartment', 'commercial')
              THEN 'total_floors' END
          ]::text[]) AS candidate("field")
          WHERE candidate."field" IS NOT NULL
        ) audit
      ), '[]'::jsonb)
      FROM "listings" l
      WHERE p."legacy_listing_id" = l."id";

    UPDATE "listings" l
      SET "property_id" = 'property-' || l."id",
          "location_id" = CASE WHEN trim(coalesce(l."facts_location", '')) <> '' THEN 'location:' || lower(trim(l."facts_location")) ELSE NULL END;

    UPDATE "_listings_v" v
      SET "version_property_id" = CASE WHEN v."parent_id" IS NOT NULL THEN 'property-' || v."parent_id" ELSE NULL END,
          "version_location_id" = CASE WHEN trim(coalesce(v."version_facts_location", '')) <> '' THEN 'location:' || lower(trim(v."version_facts_location")) ELSE NULL END;

    UPDATE "listing_translations" t
      SET "listing_id" = rel."parent_id",
          "translation_state" = (
            CASE t."status"::text
              WHEN 'draft' THEN 'draft'
              WHEN 'hermes_drafted' THEN 'hermes_drafted'
              WHEN 'human_edited' THEN 'human_edited'
              WHEN 'approved' THEN 'approved'
              WHEN 'published' THEN 'published'
              WHEN 'stale' THEN 'stale'
              WHEN 'missing' THEN 'missing'
              ELSE 'missing'
            END
          )::"enum_listing_translations_translation_state"
      FROM "listings_rels" rel
      WHERE rel."listing_translations_id" = t."id";

    UPDATE "_listing_translations_v" t
      SET "version_listing_id" = listing_version."parent_id",
          "version_translation_state" = (
            CASE t."version_status"::text
              WHEN 'draft' THEN 'draft'
              WHEN 'hermes_drafted' THEN 'hermes_drafted'
              WHEN 'human_edited' THEN 'human_edited'
              WHEN 'approved' THEN 'approved'
              WHEN 'published' THEN 'published'
              WHEN 'stale' THEN 'stale'
              WHEN 'missing' THEN 'missing'
              ELSE 'missing'
            END
          )::"enum__listing_translations_v_version_translation_state"
      FROM "_listings_v_rels" rel
      JOIN "_listings_v" listing_version ON listing_version."id" = rel."parent_id"
      WHERE rel."listing_translations_id" = t."parent_id";

    UPDATE "listing_translations"
      SET "translation_state" = (
        CASE "status"::text
          WHEN 'draft' THEN 'draft'
          WHEN 'hermes_drafted' THEN 'hermes_drafted'
          WHEN 'human_edited' THEN 'human_edited'
          WHEN 'approved' THEN 'approved'
          WHEN 'published' THEN 'published'
          WHEN 'stale' THEN 'stale'
          WHEN 'missing' THEN 'missing'
          ELSE 'missing'
        END
      )::"enum_listing_translations_translation_state"
      WHERE "translation_state" IS NULL;

    UPDATE "_listing_translations_v"
      SET "version_translation_state" = (
        CASE "version_status"::text
          WHEN 'draft' THEN 'draft'
          WHEN 'hermes_drafted' THEN 'hermes_drafted'
          WHEN 'human_edited' THEN 'human_edited'
          WHEN 'approved' THEN 'approved'
          WHEN 'published' THEN 'published'
          WHEN 'stale' THEN 'stale'
          WHEN 'missing' THEN 'missing'
          ELSE 'missing'
        END
      )::"enum__listing_translations_v_version_translation_state"
      WHERE "version_translation_state" IS NULL;

    INSERT INTO "properties_fact_verification" ("_order", "_parent_id", "id", "field", "state", "source_type", "source_reference")
      SELECT 1, p."id", 'fact-' || p."id" || '-legacy-property-type', 'legacy_property_type',
        CASE WHEN nullif(trim(p."facts_legacy_property_type"), '') IS NULL THEN 'unknown'::"enum_properties_fact_verification_state"
          ELSE 'entered_pending_review'::"enum_properties_fact_verification_state" END,
        'legacy_import', p."legacy_listing_id"
      FROM "properties" p
      ON CONFLICT ("id") DO NOTHING;

    INSERT INTO "properties_fact_verification" ("_order", "_parent_id", "id", "field", "state", "source_type", "source_reference")
      SELECT 2, p."id", 'fact-' || p."id" || '-primary-area-sqm', 'primary_area_sqm',
        CASE WHEN p."facts_primary_area_sqm" IS NULL THEN 'unknown'::"enum_properties_fact_verification_state"
          ELSE 'entered_pending_review'::"enum_properties_fact_verification_state" END,
        'legacy_import', p."legacy_listing_id"
      FROM "properties" p
      ON CONFLICT ("id") DO NOTHING;

    -- Keep this applicability matrix aligned with production/lib/listing-facts.mjs#applicableFactFields.
    WITH "canonical_facts" AS (
      SELECT p."id", p."legacy_listing_id", fact."order", fact."field", fact."present"
      FROM "properties" p
      LEFT JOIN "locations" location ON location."id" = p."location_id"
      CROSS JOIN LATERAL (
        VALUES
          (10, 'property_family', p."property_family" IS NOT NULL, p."property_family" IS NOT NULL),
          (11, 'property_subtype', p."property_family" IS NOT NULL, p."property_subtype" IS NOT NULL),
          (12, 'location_id', p."property_family" IS NOT NULL, p."location_id" IS NOT NULL),
          (13, 'location_label', p."property_family" IS NOT NULL, location."label" IS NOT NULL),
          (14, 'internal_latitude', p."property_family" IS NOT NULL, location."internal_latitude" IS NOT NULL),
          (15, 'internal_longitude', p."property_family" IS NOT NULL, location."internal_longitude" IS NOT NULL),
          (16, 'public_latitude', p."property_family" IS NOT NULL, location."public_latitude" IS NOT NULL),
          (17, 'public_longitude', p."property_family" IS NOT NULL, location."public_longitude" IS NOT NULL),
          (18, 'public_location_precision', p."property_family" IS NOT NULL, p."facts_public_location_precision" IS NOT NULL),
          (19, 'condition', p."property_family" IS NOT NULL, p."facts_condition" IS NOT NULL),
          (20, 'construction_status', p."property_family" IS NOT NULL, p."facts_construction_status" IS NOT NULL),
          (21, 'parking_kind', p."property_family" IS NOT NULL, p."facts_parking_kind" IS NOT NULL),
          (30, 'living_area_sqm', p."property_family"::text IN ('apartment', 'house'), p."facts_living_area_sqm" IS NOT NULL),
          (31, 'built_area_sqm', p."property_family"::text IN ('apartment', 'house'), p."facts_built_area_sqm" IS NOT NULL),
          (32, 'usable_area_sqm', p."property_family"::text IN ('apartment', 'commercial'), p."facts_usable_area_sqm" IS NOT NULL),
          (33, 'gross_floor_area_sqm', p."property_family"::text IN ('commercial', 'hotel'), p."facts_gross_floor_area_sqm" IS NOT NULL),
          (34, 'land_area_sqm', p."property_family"::text IN ('apartment', 'house', 'plot', 'agricultural_land', 'hotel'), p."facts_land_area_sqm" IS NOT NULL),
          (35, 'bedrooms_count', p."property_family"::text = 'house' OR (p."property_family"::text = 'apartment' AND coalesce(p."property_subtype", '') <> 'development'), p."facts_bedrooms_count" IS NOT NULL),
          (36, 'premises_count', p."property_family"::text = 'commercial', p."facts_premises_count" IS NOT NULL),
          (37, 'hotel_room_count', p."property_family"::text = 'hotel', p."facts_hotel_room_count" IS NOT NULL),
          (38, 'floor_number', p."property_family"::text IN ('apartment', 'commercial'), p."facts_floor_number" IS NOT NULL),
          (39, 'total_floors', p."property_family"::text IN ('apartment', 'commercial'), p."facts_total_floors" IS NOT NULL),
          (40, 'storeys_count', p."property_family"::text IN ('house', 'hotel'), p."facts_storeys_count" IS NOT NULL),
          (41, 'zoning_status', p."property_family"::text = 'plot', p."facts_zoning_status" IS NOT NULL),
          (42, 'utilities_status', p."property_family"::text = 'plot', p."facts_utilities_status" IS NOT NULL),
          (43, 'road_access_status', p."property_family"::text IN ('plot', 'agricultural_land'), p."facts_road_access_status" IS NOT NULL),
          (44, 'land_category', p."property_family"::text = 'agricultural_land', p."facts_land_category" IS NOT NULL),
          (45, 'permanent_use', p."property_family"::text = 'agricultural_land', p."facts_permanent_use" IS NOT NULL),
          (46, 'permitted_use', p."property_family"::text = 'commercial', p."facts_permitted_use" IS NOT NULL)
      ) AS fact("order", "field", "applicable", "present")
      WHERE fact."applicable"
    )
    INSERT INTO "properties_fact_verification" ("_order", "_parent_id", "id", "field", "state", "source_type", "source_reference")
      SELECT
        fact."order",
        fact."id",
        'fact-' || fact."id" || '-' || replace(fact."field", '_', '-'),
        fact."field",
        CASE WHEN fact."present" THEN 'entered_pending_review'::"enum_properties_fact_verification_state"
          ELSE 'unknown'::"enum_properties_fact_verification_state" END,
        'legacy_import',
        fact."legacy_listing_id"
      FROM "canonical_facts" fact
      ON CONFLICT ("id") DO NOTHING;

    INSERT INTO "listing_enrichment_tasks" ("id", "listing_id", "property_id", "task_type", "task_state", "idempotency_key", "fact_fields", "source")
      SELECT
        'enrichment-' || l."id",
        l."id",
        p."id",
        'verify_imported_facts'::"enum_listing_enrichment_tasks_task_type",
        'pending'::"enum_listing_enrichment_tasks_task_state",
        'listing:' || l."id" || ':verify_imported_facts',
        coalesce((
          SELECT jsonb_agg(v."field" ORDER BY v."_order")
          FROM "properties_fact_verification" v
          WHERE v."_parent_id" = p."id"
            AND v."state"::text IN ('unknown', 'entered_pending_review')
            AND v."field" IN (
              'property_family', 'property_subtype', 'location_id', 'location_label', 'internal_latitude', 'internal_longitude',
              'public_latitude', 'public_longitude', 'public_location_precision', 'condition', 'construction_status', 'parking_kind',
              'living_area_sqm', 'built_area_sqm', 'usable_area_sqm', 'gross_floor_area_sqm', 'land_area_sqm', 'bedrooms_count',
              'premises_count', 'hotel_room_count', 'floor_number', 'total_floors', 'storeys_count', 'zoning_status', 'utilities_status',
              'road_access_status', 'land_category', 'permanent_use', 'permitted_use'
            )
        ), '[]'::jsonb),
        'legacy_backfill'::"enum_listing_enrichment_tasks_source"
      FROM "listings" l
      JOIN "properties" p ON p."legacy_listing_id" = l."id"
      ON CONFLICT ("id") DO NOTHING;

    ALTER TABLE "properties" ADD CONSTRAINT "properties_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "properties_fact_verification" ADD CONSTRAINT "properties_fact_verification_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "listings" ADD CONSTRAINT "listings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "listings" ADD CONSTRAINT "listings_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "_listings_v" ADD CONSTRAINT "_listings_v_version_property_id_properties_id_fk" FOREIGN KEY ("version_property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "_listings_v" ADD CONSTRAINT "_listings_v_version_location_id_locations_id_fk" FOREIGN KEY ("version_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "listing_translations" ADD CONSTRAINT "listing_translations_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "_listing_translations_v" ADD CONSTRAINT "_listing_translations_v_version_listing_id_listings_id_fk" FOREIGN KEY ("version_listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "listing_enrichment_tasks" ADD CONSTRAINT "listing_enrichment_tasks_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "listing_enrichment_tasks" ADD CONSTRAINT "listing_enrichment_tasks_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;
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
    ALTER TABLE "_listings_v" DROP COLUMN "version_facts_location_precision";
    ALTER TABLE "_listings_v" DROP COLUMN "version_facts_condition";
    ALTER TABLE "_listings_v" DROP COLUMN "version_facts_land_area_sqm";
    ALTER TABLE "_listings_v" DROP COLUMN "version_facts_total_floors";
    ALTER TABLE "_listings_v" DROP COLUMN "version_facts_floor";
    ALTER TABLE "_listings_v" DROP COLUMN "version_facts_area_sqm";
    ALTER TABLE "_listings_v" DROP COLUMN "version_facts_bedrooms_not_applicable";
    ALTER TABLE "_listings_v" DROP COLUMN "version_location_id";
    ALTER TABLE "_listings_v" DROP COLUMN "version_property_id";
    ALTER TABLE "listings" DROP COLUMN "facts_location_precision";
    ALTER TABLE "listings" DROP COLUMN "facts_condition";
    ALTER TABLE "listings" DROP COLUMN "facts_land_area_sqm";
    ALTER TABLE "listings" DROP COLUMN "facts_total_floors";
    ALTER TABLE "listings" DROP COLUMN "facts_floor";
    ALTER TABLE "listings" DROP COLUMN "facts_area_sqm";
    ALTER TABLE "listings" DROP COLUMN "facts_bedrooms_not_applicable";
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
