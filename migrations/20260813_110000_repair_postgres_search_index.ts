import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

// Rebuild environments where the original migration was already recorded.
// concat_ws is STABLE in PostgreSQL and therefore cannot appear inside an
// expression index; text concatenation is immutable and preserves the input.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "listings_public_search_fold_trgm_idx";
    CREATE INDEX "listings_public_search_fold_trgm_idx"
      ON "listings"
      USING gin (
        "public"."ms_realty_search_fold"(
          COALESCE("facts_title", '') || ' ' ||
          COALESCE("facts_h1", '') || ' ' ||
          COALESCE("facts_description", '') || ' ' ||
          COALESCE("facts_location", '') || ' ' ||
          COALESCE("facts_municipality", '') || ' ' ||
          COALESCE("facts_district", '') || ' ' ||
          COALESCE("facts_country_code", '') || ' ' ||
          COALESCE("facts_offer_type", '') || ' ' ||
          COALESCE("id", '')
        ) gin_trgm_ops
      )
      WHERE "cms_status" = 'published' AND COALESCE("workflow_publish_approved", false) = true;
  `)
}

// Search availability is safer than deleting a working index during rollback.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db
}
