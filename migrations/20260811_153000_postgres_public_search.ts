import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

const SEARCH_FOLD_SQL = `
  trim(
    regexp_replace(
      replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
        lower(coalesce(input, '')),
        'щ', 'sht'
      ), 'ш', 'sh'
      ), 'ч', 'ch'
      ), 'ц', 'ts'
      ), 'ж', 'zh'
      ), 'ю', 'yu'
      ), 'я', 'ya'
      ), 'й', 'y'
      ), 'х', 'h'
      ), 'ъ', 'a'
      ), 'ь', 'y'
      ), 'ѝ', 'i'
      ), 'ы', 'y'
      ), 'э', 'e'
      ), 'ё', 'yo'
      ), '№', ' no '),
      '[^[:alnum:][:space:]-]+',
      ' ',
      'g'
    )
  )
`

const VERIFIED = (field: string) =>
  sql.raw(`EXISTS (
    SELECT 1
    FROM "properties_fact_verification" pfv
    WHERE pfv."_parent_id" = p."id"
      AND pfv."field" = '${field}'
      AND pfv."state" = 'broker_verified'
  )`)

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE EXTENSION IF NOT EXISTS pg_trgm;

    CREATE OR REPLACE FUNCTION "public"."ms_realty_search_fold"(input text)
    RETURNS text
    LANGUAGE sql
    IMMUTABLE
    PARALLEL SAFE
    AS $function$
      SELECT ${sql.raw(SEARCH_FOLD_SQL)};
    $function$;

    CREATE OR REPLACE VIEW "public"."ms_realty_public_search_documents" AS
      SELECT DISTINCT ON (l."id", source_locale."code")
        (l."id" || ':' || source_locale."code") AS "id",
        l."id" AS "source_listing_id",
        l."id" AS "listing_reference",
        source_locale."code" AS "locale",
        COALESCE(NULLIF(l."routing_target_path", ''), '/' || source_locale."code" || '/imoti/' || l."id") AS "locale_path",
        COALESCE(NULLIF(l."facts_title", ''), NULLIF(l."facts_h1", ''), NULLIF(l."seo_title", ''), l."id") AS "title",
        'published'::varchar AS "publication_state",
        true AS "translation_human_approved",
        true AS "locale_indexable",
        true AS "translation_indexable",
        NULLIF(l."facts_description", '') AS "description",
        trim(concat_ws(
          ' ',
          COALESCE(NULLIF(l."facts_title", ''), NULLIF(l."facts_h1", ''), NULLIF(l."seo_title", ''), l."id"),
          NULLIF(l."facts_description", ''),
          NULLIF(loc."label", ''),
          NULLIF(l."facts_location", ''),
          NULLIF(l."facts_municipality", ''),
          NULLIF(l."facts_district", ''),
          NULLIF(l."facts_country_code", ''),
          NULLIF(p."property_family"::varchar, ''),
          NULLIF(p."property_subtype", ''),
          NULLIF(l."facts_offer_type", '')
        )) AS "search_text",
        (tour."is_public" = true AND tour."review_status" = 'published') AS "has_approved_tour",
        p."property_family"::varchar AS "property_family",
        NULLIF(p."property_subtype", '') AS "property_subtype",
        CASE
          WHEN l."workflow_location_verified_at" IS NOT NULL AND COALESCE(l."workflow_location_verified_by", '') <> '' THEN loc."id"
          ELSE NULL
        END AS "location_id",
        CASE
          WHEN l."workflow_location_verified_at" IS NOT NULL AND COALESCE(l."workflow_location_verified_by", '') <> '' THEN NULLIF(loc."label", '')
          ELSE NULL
        END AS "location_label",
        CASE
          WHEN l."workflow_location_verified_at" IS NOT NULL AND COALESCE(l."workflow_location_verified_by", '') <> '' THEN NULLIF(l."facts_municipality", '')
          ELSE NULL
        END AS "municipality",
        CASE
          WHEN l."workflow_location_verified_at" IS NOT NULL AND COALESCE(l."workflow_location_verified_by", '') <> '' THEN NULLIF(l."facts_district", '')
          ELSE NULL
        END AS "district",
        CASE
          WHEN l."workflow_location_verified_at" IS NOT NULL AND COALESCE(l."workflow_location_verified_by", '') <> '' THEN NULLIF(l."facts_region_id", '')
          ELSE NULL
        END AS "region_id",
        CASE
          WHEN l."workflow_location_verified_at" IS NOT NULL AND COALESCE(l."workflow_location_verified_by", '') <> '' THEN NULLIF(l."facts_country_code", '')
          ELSE NULL
        END AS "country_code",
        CASE
          WHEN l."workflow_location_verified_at" IS NOT NULL AND COALESCE(l."workflow_location_verified_by", '') <> '' THEN NULLIF(l."facts_geography_id", '')
          ELSE NULL
        END AS "geography_id",
        CASE
          WHEN l."workflow_location_verified_at" IS NOT NULL AND COALESCE(l."workflow_location_verified_by", '') <> '' THEN COALESCE(l."facts_geography_path", '[]'::jsonb)
          ELSE '[]'::jsonb
        END AS "geography_path",
        CASE
          WHEN l."workflow_price_verified_at" IS NOT NULL AND COALESCE(l."workflow_price_verified_by", '') <> '' AND l."facts_price_on_request" IS DISTINCT FROM true
            THEN l."facts_price_eur"
          ELSE NULL
        END AS "price_amount",
        CASE
          WHEN l."workflow_price_verified_at" IS NOT NULL AND COALESCE(l."workflow_price_verified_by", '') <> '' AND l."facts_price_on_request" IS DISTINCT FROM true AND l."facts_price_eur" IS NOT NULL
            THEN 'EUR'
          ELSE NULL
        END AS "price_currency",
        NULL::varchar AS "price_period",
        CASE
          WHEN l."workflow_price_on_request_verified_at" IS NOT NULL AND COALESCE(l."workflow_price_on_request_verified_by", '') <> '' AND l."facts_price_on_request" = true
            THEN true
          ELSE NULL
        END AS "price_on_request",
        NULLIF(l."facts_offer_type", '') AS "offer_type",
        COALESCE(NULLIF(l."facts_listing_status", ''), 'available') AS "listing_status",
        CASE WHEN ${VERIFIED("bedrooms_count")} THEN p."facts_bedrooms_count" ELSE NULL END AS "bedrooms_count",
        CASE WHEN ${VERIFIED("premises_count")} THEN p."facts_premises_count" ELSE NULL END AS "premises_count",
        CASE WHEN ${VERIFIED("hotel_room_count")} THEN p."facts_hotel_room_count" ELSE NULL END AS "hotel_room_count",
        CASE WHEN ${VERIFIED("floor_number")} THEN p."facts_floor_number" ELSE NULL END AS "floor_number",
        CASE WHEN ${VERIFIED("total_floors")} THEN p."facts_total_floors" ELSE NULL END AS "total_floors",
        CASE WHEN ${VERIFIED("storeys_count")} THEN p."facts_storeys_count" ELSE NULL END AS "storeys_count",
        CASE WHEN ${VERIFIED("living_area_sqm")} THEN p."facts_living_area_sqm" ELSE NULL END AS "living_area_sqm",
        CASE WHEN ${VERIFIED("built_area_sqm")} THEN p."facts_built_area_sqm" ELSE NULL END AS "built_area_sqm",
        CASE WHEN ${VERIFIED("usable_area_sqm")} THEN p."facts_usable_area_sqm" ELSE NULL END AS "usable_area_sqm",
        CASE WHEN ${VERIFIED("gross_floor_area_sqm")} THEN p."facts_gross_floor_area_sqm" ELSE NULL END AS "gross_floor_area_sqm",
        CASE WHEN ${VERIFIED("land_area_sqm")} THEN p."facts_land_area_sqm" ELSE NULL END AS "land_area_sqm",
        COALESCE(
          CASE WHEN ${VERIFIED("primary_area_sqm")} THEN p."facts_primary_area_sqm" ELSE NULL END,
          CASE
            WHEN p."property_family"::varchar = 'apartment' THEN COALESCE(
              CASE WHEN ${VERIFIED("living_area_sqm")} THEN p."facts_living_area_sqm" ELSE NULL END,
              CASE WHEN ${VERIFIED("built_area_sqm")} THEN p."facts_built_area_sqm" ELSE NULL END,
              CASE WHEN ${VERIFIED("usable_area_sqm")} THEN p."facts_usable_area_sqm" ELSE NULL END
            )
            WHEN p."property_family"::varchar = 'house' THEN COALESCE(
              CASE WHEN ${VERIFIED("built_area_sqm")} THEN p."facts_built_area_sqm" ELSE NULL END,
              CASE WHEN ${VERIFIED("living_area_sqm")} THEN p."facts_living_area_sqm" ELSE NULL END
            )
            WHEN p."property_family"::varchar IN ('plot', 'agricultural_land') THEN CASE WHEN ${VERIFIED("land_area_sqm")} THEN p."facts_land_area_sqm" ELSE NULL END
            WHEN p."property_family"::varchar = 'commercial' THEN COALESCE(
              CASE WHEN ${VERIFIED("usable_area_sqm")} THEN p."facts_usable_area_sqm" ELSE NULL END,
              CASE WHEN ${VERIFIED("gross_floor_area_sqm")} THEN p."facts_gross_floor_area_sqm" ELSE NULL END
            )
            WHEN p."property_family"::varchar = 'hotel' THEN COALESCE(
              CASE WHEN ${VERIFIED("gross_floor_area_sqm")} THEN p."facts_gross_floor_area_sqm" ELSE NULL END,
              CASE WHEN ${VERIFIED("built_area_sqm")} THEN p."facts_built_area_sqm" ELSE NULL END
            )
            ELSE NULL
          END
        ) AS "primary_area_sqm",
        CASE WHEN ${VERIFIED("parking_kind")} THEN NULLIF(p."facts_parking_kind", '') ELSE NULL END AS "parking_kind",
        CASE WHEN ${VERIFIED("condition")} THEN NULLIF(p."facts_condition", '') ELSE NULL END AS "condition",
        CASE WHEN ${VERIFIED("construction_status")} THEN NULLIF(p."facts_construction_status", '') ELSE NULL END AS "construction_status",
        CASE WHEN ${VERIFIED("zoning_status")} THEN NULLIF(p."facts_zoning_status", '') ELSE NULL END AS "zoning_status",
        CASE WHEN ${VERIFIED("utilities_status")} THEN NULLIF(p."facts_utilities_status", '') ELSE NULL END AS "utilities_status",
        CASE WHEN ${VERIFIED("road_access_status")} THEN NULLIF(p."facts_road_access_status", '') ELSE NULL END AS "road_access_status",
        CASE WHEN ${VERIFIED("land_category")} THEN NULLIF(p."facts_land_category", '') ELSE NULL END AS "land_category",
        CASE WHEN ${VERIFIED("permanent_use")} THEN NULLIF(p."facts_permanent_use", '') ELSE NULL END AS "permanent_use",
        CASE WHEN ${VERIFIED("permitted_use")} THEN NULLIF(p."facts_permitted_use", '') ELSE NULL END AS "permitted_use",
        CASE
          WHEN l."workflow_location_verified_at" IS NOT NULL
            AND COALESCE(l."workflow_location_verified_by", '') <> ''
            AND loc."public_latitude" BETWEEN -90 AND 90
            AND loc."public_longitude" BETWEEN -180 AND 180
              THEN loc."public_latitude"
          ELSE NULL
        END AS "public_latitude",
        CASE
          WHEN l."workflow_location_verified_at" IS NOT NULL
            AND COALESCE(l."workflow_location_verified_by", '') <> ''
            AND loc."public_latitude" BETWEEN -90 AND 90
            AND loc."public_longitude" BETWEEN -180 AND 180
              THEN loc."public_longitude"
          ELSE NULL
        END AS "public_longitude",
        CASE
          WHEN l."workflow_location_verified_at" IS NOT NULL AND COALESCE(l."workflow_location_verified_by", '') <> '' THEN loc."public_location_precision"::varchar
          ELSE NULL
        END AS "public_location_precision"
      FROM "listings" l
      JOIN "locales" source_locale
        ON source_locale."id" = l."source_locale_id"
      JOIN "listing_translations" lt
        ON lt."listing_id" = l."id"
      JOIN "locales" public_locale
        ON public_locale."id" = lt."locale_id"
      LEFT JOIN "properties" p
        ON p."id" = l."property_id"
      LEFT JOIN "locations" loc
        ON loc."id" = l."location_id"
      LEFT JOIN "listing_tours" tour
        ON tour."id" = l."tour_id"
      WHERE l."cms_status" = 'published'
        AND COALESCE(l."workflow_publish_approved", false) = true
        AND public_locale."code" = source_locale."code"
        AND public_locale."public_enabled" = true
        AND public_locale."indexable" = true
        AND lt."status" = 'published'
        AND lt."translation_state" = 'published'
        AND lt."public_indexable" = true
        AND COALESCE(lt."reviewer", '') <> ''
        AND lt."approved_at" IS NOT NULL
      ORDER BY l."id", source_locale."code", lt."approved_at" DESC, lt."updated_at" DESC;

    CREATE INDEX IF NOT EXISTS "listings_public_search_status_idx"
      ON "listings" USING btree ("cms_status", "workflow_publish_approved", "source_locale_id", "workflow_publish_approved_at", "id");

    CREATE INDEX IF NOT EXISTS "listing_translations_public_search_idx"
      ON "listing_translations" USING btree ("listing_id", "locale_id", "approved_at", "updated_at")
      WHERE "status" = 'published' AND "translation_state" = 'published' AND "public_indexable" = true;

    CREATE INDEX IF NOT EXISTS "listings_public_search_geography_idx"
      ON "listings" USING gin ("facts_geography_path" jsonb_path_ops);

    CREATE INDEX IF NOT EXISTS "listings_public_search_fold_trgm_idx"
      ON "listings"
      USING gin (
        "public"."ms_realty_search_fold"(concat_ws(
          ' ',
          COALESCE("facts_title", ''),
          COALESCE("facts_h1", ''),
          COALESCE("facts_description", ''),
          COALESCE("facts_location", ''),
          COALESCE("facts_municipality", ''),
          COALESCE("facts_district", ''),
          COALESCE("facts_country_code", ''),
          COALESCE("facts_offer_type", ''),
          "id"
        )) gin_trgm_ops
      )
      WHERE "cms_status" = 'published' AND COALESCE("workflow_publish_approved", false) = true;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "listings_public_search_fold_trgm_idx";
    DROP INDEX IF EXISTS "listings_public_search_geography_idx";
    DROP INDEX IF EXISTS "listing_translations_public_search_idx";
    DROP INDEX IF EXISTS "listings_public_search_status_idx";
    DROP VIEW IF EXISTS "public"."ms_realty_public_search_documents";
    DROP FUNCTION IF EXISTS "public"."ms_realty_search_fold"(text);
  `);
}
