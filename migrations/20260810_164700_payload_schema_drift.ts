import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

// The generated Payload collection config now flattens more grouped listing and
// property facts than the original handwritten search-schema migration created.
// Production drift showed up as missing columns before the importer could even
// start. Patch only the missing physical schema pieces instead of replaying the
// full migration history.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "facts_location_native" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "facts_location_legacy" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "facts_municipality" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "facts_municipality_code" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "facts_district" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "facts_district_code" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "facts_region" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "facts_region_id" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "facts_country_code" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "facts_geography_id" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "facts_geography_path" jsonb;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "facts_settlement_ekatte" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "facts_location_review_status" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "seo_og_title" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "seo_og_description" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "workflow_availability_verified_at" timestamp(3) with time zone;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "workflow_availability_verified_by" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "workflow_location_verified_at" timestamp(3) with time zone;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "workflow_location_verified_by" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "workflow_price_verified_at" timestamp(3) with time zone;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "workflow_price_verified_by" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "workflow_price_on_request_verified_at" timestamp(3) with time zone;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "workflow_price_on_request_verified_by" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "workflow_publish_approved" boolean;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "workflow_publish_approved_at" timestamp(3) with time zone;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "workflow_publish_approved_by" varchar;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "workflow_last_edited_at" timestamp(3) with time zone;
    ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "workflow_last_editor" varchar;

    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_facts_location_native" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_facts_location_legacy" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_facts_municipality" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_facts_municipality_code" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_facts_district" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_facts_district_code" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_facts_region" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_facts_region_id" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_facts_country_code" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_facts_geography_id" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_facts_geography_path" jsonb;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_facts_settlement_ekatte" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_facts_location_review_status" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_seo_og_title" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_seo_og_description" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_workflow_availability_verified_at" timestamp(3) with time zone;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_workflow_availability_verified_by" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_workflow_location_verified_at" timestamp(3) with time zone;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_workflow_location_verified_by" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_workflow_price_verified_at" timestamp(3) with time zone;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_workflow_price_verified_by" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_workflow_price_on_request_verified_at" timestamp(3) with time zone;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_workflow_price_on_request_verified_by" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_workflow_publish_approved" boolean;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_workflow_publish_approved_at" timestamp(3) with time zone;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_workflow_publish_approved_by" varchar;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_workflow_last_edited_at" timestamp(3) with time zone;
    ALTER TABLE "_listings_v" ADD COLUMN IF NOT EXISTS "version_workflow_last_editor" varchar;

    ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "facts_location_id" varchar;
    ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "facts_location_label" varchar;
    ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "facts_municipality" varchar;
    ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "facts_district" varchar;
    ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "facts_region_id" varchar;
    ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "facts_country_code" varchar;
    ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "facts_geography_id" varchar;
    ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "facts_geography_path" jsonb;

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "properties_id" varchar;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "locations_id" varchar;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "listing_enrichment_tasks_id" varchar;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "search_outbox_id" varchar;

    CREATE INDEX IF NOT EXISTS "listing_enrichment_tasks_updated_at_idx" ON "listing_enrichment_tasks" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "listing_enrichment_tasks_created_at_idx" ON "listing_enrichment_tasks" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "search_outbox_created_at_idx" ON "search_outbox" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_properties_id_idx" ON "payload_locked_documents_rels" USING btree ("properties_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_locations_id_idx" ON "payload_locked_documents_rels" USING btree ("locations_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_listing_enrichment_tasks_i_idx" ON "payload_locked_documents_rels" USING btree ("listing_enrichment_tasks_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_search_outbox_id_idx" ON "payload_locked_documents_rels" USING btree ("search_outbox_id");

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payload_locked_documents_rels_properties_fk'
      ) THEN
        ALTER TABLE "payload_locked_documents_rels"
          ADD CONSTRAINT "payload_locked_documents_rels_properties_fk"
          FOREIGN KEY ("properties_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payload_locked_documents_rels_locations_fk'
      ) THEN
        ALTER TABLE "payload_locked_documents_rels"
          ADD CONSTRAINT "payload_locked_documents_rels_locations_fk"
          FOREIGN KEY ("locations_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payload_locked_documents_rels_listing_enrichment_tasks_fk'
      ) THEN
        ALTER TABLE "payload_locked_documents_rels"
          ADD CONSTRAINT "payload_locked_documents_rels_listing_enrichment_tasks_fk"
          FOREIGN KEY ("listing_enrichment_tasks_id") REFERENCES "public"."listing_enrichment_tasks"("id") ON DELETE cascade ON UPDATE no action;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payload_locked_documents_rels_search_outbox_fk'
      ) THEN
        ALTER TABLE "payload_locked_documents_rels"
          ADD CONSTRAINT "payload_locked_documents_rels_search_outbox_fk"
          FOREIGN KEY ("search_outbox_id") REFERENCES "public"."search_outbox"("id") ON DELETE cascade ON UPDATE no action;
      END IF;
    END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db
}
