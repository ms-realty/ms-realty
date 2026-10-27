CREATE TABLE "privacy_governance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"document" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"updated_by_id" uuid NOT NULL,
	CONSTRAINT "privacy_governance_kind" CHECK ("privacy_governance_records"."kind" in ('processing', 'processor', 'incident')),
	CONSTRAINT "privacy_governance_hash" CHECK ("privacy_governance_records"."content_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "privacy_governance_version" CHECK ("privacy_governance_records"."version" > 0),
	CONSTRAINT "privacy_governance_document_kind" CHECK ("privacy_governance_records"."document" ? 'kind' and "privacy_governance_records"."document"->>'kind' = "privacy_governance_records"."kind")
);
--> statement-breakpoint
CREATE TABLE "privacy_governance_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"record_version" integer NOT NULL,
	"action" text NOT NULL,
	"document" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"operation_id" text NOT NULL,
	CONSTRAINT "privacy_governance_revisions_operation_id_unique" UNIQUE("operation_id"),
	CONSTRAINT "privacy_governance_record_revision" UNIQUE("record_id","record_version"),
	CONSTRAINT "privacy_governance_revision_positive" CHECK ("privacy_governance_revisions"."record_version" > 0),
	CONSTRAINT "privacy_governance_revision_hash" CHECK ("privacy_governance_revisions"."content_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "privacy_governance_revision_action" CHECK ("privacy_governance_revisions"."action" in ('saved', 'reviewed')),
	CONSTRAINT "privacy_governance_review_note" CHECK ("privacy_governance_revisions"."action" <> 'reviewed' or ("privacy_governance_revisions"."note" is not null and length("privacy_governance_revisions"."note") >= 10))
);
--> statement-breakpoint
ALTER TABLE "privacy_governance_records" ADD CONSTRAINT "privacy_governance_records_updated_by_id_principals_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_governance_revisions" ADD CONSTRAINT "privacy_governance_revisions_record_id_privacy_governance_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."privacy_governance_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_governance_revisions" ADD CONSTRAINT "privacy_governance_revisions_actor_id_principals_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TRIGGER privacy_governance_revisions_immutable BEFORE UPDATE OR DELETE ON privacy_governance_revisions
FOR EACH ROW EXECUTE FUNCTION reject_modification();
