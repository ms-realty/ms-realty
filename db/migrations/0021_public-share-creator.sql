ALTER TABLE "public_shares" ADD COLUMN "view_token" text;--> statement-breakpoint
ALTER TABLE "public_shares" ADD COLUMN "creator_session_hash" text;--> statement-breakpoint
ALTER TABLE "public_shares" ADD COLUMN "creator_principal_id" uuid;--> statement-breakpoint
ALTER TABLE "public_shares" ADD CONSTRAINT "public_shares_creator_principal_id_principals_id_fk" FOREIGN KEY ("creator_principal_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "public_shares_creator_session_idx" ON "public_shares" USING btree ("creator_session_hash","created_at");--> statement-breakpoint
CREATE INDEX "public_shares_creator_principal_idx" ON "public_shares" USING btree ("creator_principal_id","created_at");--> statement-breakpoint
-- Historical rows have no provable creator. Disable those links before the binding check.
UPDATE "public_shares" SET "revoked_at" = now() WHERE "revoked_at" IS NULL;--> statement-breakpoint
ALTER TABLE "public_shares" ADD CONSTRAINT "public_shares_creator_scope" CHECK (("public_shares"."view_token" is not null and "public_shares"."creator_session_hash" is not null and "public_shares"."creator_principal_id" is null)
        or ("public_shares"."view_token" is not null and "public_shares"."creator_session_hash" is null and "public_shares"."creator_principal_id" is not null)
        or ("public_shares"."view_token" is null and "public_shares"."creator_session_hash" is null and "public_shares"."creator_principal_id" is null and "public_shares"."revoked_at" is not null));
