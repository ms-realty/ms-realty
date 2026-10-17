CREATE TABLE "file_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_kind" "actor_kind" NOT NULL,
	"actor_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"staging_key" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"byte_size" bigint,
	"content_type" text,
	CONSTRAINT "file_uploads_staging_key_unique" UNIQUE("staging_key"),
	CONSTRAINT "file_uploads_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "file_uploads_target_type" CHECK ("file_uploads"."target_type" in ('media', 'document')),
	CONSTRAINT "file_uploads_expiry" CHECK ("file_uploads"."expires_at" > "file_uploads"."created_at"),
	CONSTRAINT "file_uploads_size" CHECK ("file_uploads"."byte_size" is null or "file_uploads"."byte_size" >= 0)
);
--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "scanner_version" text;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "scanned_sha256" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "scanned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "scanner_version" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "scanned_sha256" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "derivative_key" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "derivative_sha256" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "derivative_content_type" text;--> statement-breakpoint
CREATE INDEX "file_uploads_actor_idx" ON "file_uploads" USING btree ("actor_kind","actor_id");--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_derivative_key_unique" UNIQUE("derivative_key");