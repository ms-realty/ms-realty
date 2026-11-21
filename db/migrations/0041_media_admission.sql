CREATE TYPE "public"."media_admission" AS ENUM('virus_scan', 'reencode');--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "admission" "media_admission" DEFAULT 'virus_scan' NOT NULL;