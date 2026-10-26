CREATE TABLE "service_scope_drafts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "document" jsonb NOT NULL,
  "content_hash" text NOT NULL,
  "updated_by_id" uuid NOT NULL REFERENCES "principals"("id"),
  CONSTRAINT "service_scope_draft_singleton" CHECK ("id" = '00000000-0000-4000-8000-000000000029')
);
--> statement-breakpoint
CREATE TABLE "service_scope_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope_version" integer NOT NULL UNIQUE,
  "draft_revision" integer NOT NULL,
  "document" jsonb NOT NULL,
  "content_hash" text NOT NULL,
  "approved_by_id" uuid NOT NULL REFERENCES "principals"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "approval_note" text NOT NULL,
  "operation_id" text NOT NULL UNIQUE,
  CONSTRAINT "service_scope_version_positive" CHECK ("scope_version" > 0 and "draft_revision" > 0),
  CONSTRAINT "service_scope_content_hash" CHECK ("content_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "service_context" jsonb;
