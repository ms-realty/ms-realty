import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'
import { POSTGRES_SEARCH_FOLD_SQL } from '../production/lib/search-fold.mjs'

// Every public location projection, including the lexical search segment, must
// pass through this exact workflow gate. Keeping one CASE builder prevents an
// unverified location from remaining searchable while its card fields are
// correctly hidden.
const VERIFIED_LOCATION_SQL = (
  verifiedValue: string,
  listing = 'l.',
  unverifiedValue = 'NULL',
) => `
  CASE
    WHEN ${listing}"workflow_location_verified_at" IS NOT NULL
      AND COALESCE(${listing}"workflow_location_verified_by", '') <> ''
      THEN ${verifiedValue}
    ELSE ${unverifiedValue}
  END
`

// Keep the indexed expression identical to the view's public lexical field.
// PostgreSQL can then use the trigram index for the runtime's
// ms_realty_search_fold(d.search_text) LIKE query after expanding the view.
const SEARCH_TEXT_SQL = (listing = "l.") => `
  trim(
    COALESCE(NULLIF(${listing}"facts_title", ''), NULLIF(${listing}"facts_h1", ''), NULLIF(${listing}"seo_title", ''), ${listing}"id") || ' ' ||
    COALESCE(NULLIF(${listing}"facts_description", ''), '') || ' ' ||
    COALESCE(${VERIFIED_LOCATION_SQL(`NULLIF(${listing}"facts_location", '')`, listing)}, '') || ' ' ||
    COALESCE(${VERIFIED_LOCATION_SQL(`NULLIF(${listing}"facts_municipality", '')`, listing)}, '') || ' ' ||
    COALESCE(${VERIFIED_LOCATION_SQL(`NULLIF(${listing}"facts_district", '')`, listing)}, '') || ' ' ||
    COALESCE(${VERIFIED_LOCATION_SQL(`NULLIF(${listing}"facts_country_code", '')`, listing)}, '') || ' ' ||
    COALESCE(NULLIF(${listing}"facts_offer_type", ''), '')
  )
`

const VERIFIED_GEOGRAPHY_PATH_SQL = (listing = "l.") =>
  VERIFIED_LOCATION_SQL(`COALESCE(${listing}"facts_geography_path", '[]'::jsonb)`, listing, `'[]'::jsonb`)

const VERIFIED = (field: string) =>
  sql.raw(`EXISTS (
    SELECT 1
    FROM "public"."properties_fact_verification" pfv
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
    SET search_path = pg_catalog, pg_temp
    AS $function$
      SELECT ${sql.raw(POSTGRES_SEARCH_FOLD_SQL)};
    $function$;

    -- Translation rows currently carry approval/indexability state; listing copy
    -- remains the approved source-locale Payload content until localized copy is
    -- stored in the canonical tables.
    CREATE OR REPLACE VIEW "public"."ms_realty_public_search_documents" AS
      SELECT
        (l."id" || ':' || source_locale."code") AS "id",
        l."id" AS "source_listing_id",
        l."id" AS "listing_reference",
        source_locale."code" AS "locale",
        CASE
          WHEN NULLIF(l."routing_target_locale", '') = source_locale."code" AND NULLIF(l."routing_target_path", '') IS NOT NULL
            THEN l."routing_target_path"
          ELSE '/' || source_locale."code" || '/imoti/' || l."id"
        END AS "locale_path",
        COALESCE(NULLIF(l."facts_title", ''), NULLIF(l."facts_h1", ''), NULLIF(l."seo_title", ''), l."id") AS "title",
        'published'::varchar AS "publication_state",
        true AS "translation_human_approved",
        true AS "locale_indexable",
        true AS "translation_indexable",
        NULLIF(l."facts_description", '') AS "description",
        ${sql.raw(SEARCH_TEXT_SQL())} AS "search_text",
        (tour."is_public" = true AND tour."review_status" = 'published') AS "has_approved_tour",
        p."property_family"::varchar AS "property_family",
        NULLIF(p."property_subtype", '') AS "property_subtype",
        ${sql.raw(VERIFIED_LOCATION_SQL(`loc."id"`))} AS "location_id",
        ${sql.raw(VERIFIED_LOCATION_SQL(`NULLIF(loc."label", '')`))} AS "location_label",
        ${sql.raw(VERIFIED_LOCATION_SQL(`NULLIF(l."facts_municipality", '')`))} AS "municipality",
        ${sql.raw(VERIFIED_LOCATION_SQL(`NULLIF(l."facts_district", '')`))} AS "district",
        ${sql.raw(VERIFIED_LOCATION_SQL(`NULLIF(l."facts_region_id", '')`))} AS "region_id",
        ${sql.raw(VERIFIED_LOCATION_SQL(`NULLIF(l."facts_country_code", '')`))} AS "country_code",
        ${sql.raw(VERIFIED_LOCATION_SQL(`NULLIF(l."facts_geography_id", '')`))} AS "geography_id",
        ${sql.raw(VERIFIED_GEOGRAPHY_PATH_SQL())} AS "geography_path",
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
        ${sql.raw(VERIFIED_LOCATION_SQL(`
          CASE
            WHEN loc."public_latitude" BETWEEN -90 AND 90 AND loc."public_longitude" BETWEEN -180 AND 180
              THEN loc."public_latitude"
            ELSE NULL
          END
        `))} AS "public_latitude",
        ${sql.raw(VERIFIED_LOCATION_SQL(`
          CASE
            WHEN loc."public_latitude" BETWEEN -90 AND 90 AND loc."public_longitude" BETWEEN -180 AND 180
              THEN loc."public_longitude"
            ELSE NULL
          END
        `))} AS "public_longitude",
        ${sql.raw(VERIFIED_LOCATION_SQL(`loc."public_location_precision"::varchar`))} AS "public_location_precision"
      FROM "public"."listings" l
      JOIN "public"."locales" source_locale
        ON source_locale."id" = l."source_locale_id"
      LEFT JOIN "public"."properties" p
        ON p."id" = l."property_id"
      LEFT JOIN "public"."locations" loc
        ON loc."id" = l."location_id"
      LEFT JOIN "public"."listing_tours" tour
        ON tour."id" = l."tour_id"
      WHERE l."cms_status" = 'published'
        AND COALESCE(l."workflow_publish_approved", false) = true
        AND source_locale."public_enabled" = true
        AND source_locale."indexable" = true
        AND EXISTS (
          SELECT 1
          FROM "public"."listing_translations" lt
          WHERE lt."listing_id" = l."id"
            AND lt."locale_id" = source_locale."id"
            AND lt."status" = 'published'
            AND lt."translation_state" = 'published'
            AND lt."public_indexable" = true
            AND COALESCE(lt."reviewer", '') <> ''
            AND lt."approved_at" IS NOT NULL
        );

    CREATE INDEX IF NOT EXISTS "listings_public_search_status_idx"
      ON "public"."listings" USING btree ("cms_status", "workflow_publish_approved", "source_locale_id", "workflow_publish_approved_at", "id");

    CREATE INDEX IF NOT EXISTS "listing_translations_public_search_idx"
      ON "public"."listing_translations" USING btree ("listing_id", "locale_id", "approved_at", "updated_at")
      WHERE "status" = 'published' AND "translation_state" = 'published' AND "public_indexable" = true;

    CREATE INDEX IF NOT EXISTS "listings_public_search_geography_idx"
      ON "public"."listings" USING gin ((${sql.raw(VERIFIED_GEOGRAPHY_PATH_SQL(""))}) jsonb_path_ops)
      WHERE "cms_status" = 'published' AND COALESCE("workflow_publish_approved", false) = true;

    CREATE INDEX IF NOT EXISTS "listings_public_search_fold_trgm_idx"
      ON "public"."listings"
      USING gin (
        "public"."ms_realty_search_fold"(${sql.raw(SEARCH_TEXT_SQL(""))}) gin_trgm_ops
      )
      WHERE "cms_status" = 'published' AND COALESCE("workflow_publish_approved", false) = true;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "public"."listings_public_search_fold_trgm_idx";
    DROP INDEX IF EXISTS "public"."listings_public_search_geography_idx";
    DROP INDEX IF EXISTS "public"."listing_translations_public_search_idx";
    DROP INDEX IF EXISTS "public"."listings_public_search_status_idx";
    DROP VIEW IF EXISTS "public"."ms_realty_public_search_documents";
    DROP FUNCTION IF EXISTS "public"."ms_realty_search_fold"(text);
  `);
}
