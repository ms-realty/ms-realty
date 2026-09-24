ALTER TYPE "public"."approval_kind" ADD VALUE 'legacy_owner_publication_approval';--> statement-breakpoint
ALTER TYPE "public"."approval_kind" ADD VALUE 'legacy_content_approval';--> statement-breakpoint
ALTER TABLE "media_assets" ALTER COLUMN "byte_size" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ALTER COLUMN "sha256" DROP NOT NULL;