CREATE INDEX "documents_property_purpose_idx" ON "documents" USING btree ("property_id","purpose");--> statement-breakpoint
CREATE INDEX "current_publications_manifest_idx" ON "current_publications" USING btree ("manifest_id");--> statement-breakpoint
CREATE INDEX "seller_instructions_text_id_idx" ON "seller_instructions" USING btree (("id"::text));