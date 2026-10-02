-- The search projection is keyed per listing and locale and bound to the manifest it was
-- projected from. It is derived data, rebuilt from active manifests, so existing rows go.
DELETE FROM "listing_search_documents";--> statement-breakpoint
DROP INDEX "listing_search_filter_idx";--> statement-breakpoint
ALTER TABLE "listing_search_documents" DROP CONSTRAINT "listing_search_documents_pkey";--> statement-breakpoint
ALTER TABLE "listing_search_documents" DROP COLUMN "commercial_state";--> statement-breakpoint
ALTER TABLE "listing_search_documents" ADD COLUMN "locale" "public_locale" NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_search_documents" ALTER COLUMN "manifest_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_search_documents" ADD CONSTRAINT "listing_search_documents_listing_id_locale_pk" PRIMARY KEY("listing_id","locale");--> statement-breakpoint
ALTER TABLE "listing_search_documents" ADD CONSTRAINT "listing_search_documents_manifest_id_publication_manifests_id_fk" FOREIGN KEY ("manifest_id") REFERENCES "public"."publication_manifests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_search_text_trgm_idx" ON "listing_search_documents" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "listing_search_filter_idx" ON "listing_search_documents" USING btree ("locale","purpose","property_type");
