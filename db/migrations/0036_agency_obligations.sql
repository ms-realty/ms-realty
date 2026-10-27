ALTER TYPE "public"."content_page_kind" ADD VALUE 'review';--> statement-breakpoint
CREATE TABLE "agency_case_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"case_id" uuid NOT NULL,
	"author_party_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"content_page_version_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"display_choice" text NOT NULL,
	"public_name" text NOT NULL,
	"review_text" text NOT NULL,
	"verification_statement" text NOT NULL,
	"binding_hash" text NOT NULL,
	"consent_state" text DEFAULT 'unknown' NOT NULL,
	"consent_hash" text,
	"consent_source" text,
	"consent_document_version_id" uuid,
	"consent_document_digest" text,
	"consent_policy_version_id" uuid,
	"consent_policy_hash" text,
	"consent_by_id" uuid,
	"consent_at" timestamp with time zone,
	"consent_reference" text,
	"verified_hash" text,
	"verified_by_id" uuid,
	"verified_at" timestamp with time zone,
	"verification_note" text,
	CONSTRAINT "agency_review_choice" CHECK ("agency_case_reviews"."display_choice" in ('anonymous','name')),
	CONSTRAINT "agency_review_consent" CHECK ("agency_case_reviews"."consent_state" in ('unknown','granted','refused','withdrawn')),
	CONSTRAINT "agency_review_consent_source" CHECK ("agency_case_reviews"."consent_source" is null or "agency_case_reviews"."consent_source" in ('client','document')),
	CONSTRAINT "agency_review_hash" CHECK ("agency_case_reviews"."binding_hash" ~ '^[a-f0-9]{64}$' and "agency_case_reviews"."content_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "agency_review_granted" CHECK ("agency_case_reviews"."consent_state" <> 'granted' or ("agency_case_reviews"."consent_hash" = "agency_case_reviews"."binding_hash" and "agency_case_reviews"."consent_by_id" is not null and "agency_case_reviews"."consent_at" is not null and (("agency_case_reviews"."consent_source" = 'client' and "agency_case_reviews"."consent_policy_version_id" is not null and "agency_case_reviews"."consent_policy_hash" is not null) or ("agency_case_reviews"."consent_source" = 'document' and "agency_case_reviews"."consent_document_version_id" is not null and "agency_case_reviews"."consent_document_digest" is not null and "agency_case_reviews"."consent_reference" is not null)))),
	CONSTRAINT "agency_review_verified" CHECK ("agency_case_reviews"."verified_hash" is null or ("agency_case_reviews"."verified_hash" = "agency_case_reviews"."binding_hash" and "agency_case_reviews"."verified_by_id" is not null and "agency_case_reviews"."verified_at" is not null and "agency_case_reviews"."verification_note" is not null))
);
--> statement-breakpoint
CREATE TABLE "agency_evidence_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_type" text NOT NULL,
	"record_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_history_type" CHECK ("agency_evidence_history"."record_type" in ('partner_terms','case_review'))
);
--> statement-breakpoint
CREATE TABLE "agency_partner_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"case_id" uuid,
	"counterparty_party_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"relationship" text NOT NULL,
	"purpose" text NOT NULL,
	"source_reference" text NOT NULL,
	"source_version" text NOT NULL,
	"terms_text" text NOT NULL,
	"document_version_id" uuid,
	"document_digest" text,
	"accepted_reference" text,
	"accepted_at" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"unknowns" text DEFAULT '' NOT NULL,
	"terms_hash" text NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"approved_hash" text,
	"professional_name" text,
	"approved_by_id" uuid,
	"approved_at" timestamp with time zone,
	"revoked_reason" text,
	CONSTRAINT "agency_partner_relationship" CHECK ("agency_partner_terms"."relationship" in ('partner','referral')),
	CONSTRAINT "agency_partner_state" CHECK ("agency_partner_terms"."state" in ('draft','accepted','revoked')),
	CONSTRAINT "agency_partner_hash" CHECK ("agency_partner_terms"."terms_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "agency_partner_document" CHECK (("agency_partner_terms"."document_version_id" is null) = ("agency_partner_terms"."document_digest" is null)),
	CONSTRAINT "agency_partner_approval" CHECK ("agency_partner_terms"."state" <> 'accepted' or ("agency_partner_terms"."approved_hash" = "agency_partner_terms"."terms_hash" and "agency_partner_terms"."approved_by_id" is not null and "agency_partner_terms"."approved_at" is not null and "agency_partner_terms"."professional_name" is not null and "agency_partner_terms"."accepted_reference" is not null and "agency_partner_terms"."accepted_at" is not null and "agency_partner_terms"."valid_until" is not null and "agency_partner_terms"."unknowns" = ''))
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "purpose" text DEFAULT 'viewing' NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "photography_scope" text;--> statement-breakpoint
ALTER TABLE "agency_case_reviews" ADD CONSTRAINT "agency_case_reviews_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_case_reviews" ADD CONSTRAINT "agency_case_reviews_author_party_id_parties_id_fk" FOREIGN KEY ("author_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_case_reviews" ADD CONSTRAINT "agency_case_reviews_owner_id_principals_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_case_reviews" ADD CONSTRAINT "agency_case_reviews_content_page_version_id_content_page_versions_id_fk" FOREIGN KEY ("content_page_version_id") REFERENCES "public"."content_page_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_case_reviews" ADD CONSTRAINT "agency_case_reviews_consent_document_version_id_document_versions_id_fk" FOREIGN KEY ("consent_document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_case_reviews" ADD CONSTRAINT "agency_case_reviews_consent_policy_version_id_content_page_versions_id_fk" FOREIGN KEY ("consent_policy_version_id") REFERENCES "public"."content_page_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_case_reviews" ADD CONSTRAINT "agency_case_reviews_consent_by_id_principals_id_fk" FOREIGN KEY ("consent_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_case_reviews" ADD CONSTRAINT "agency_case_reviews_verified_by_id_principals_id_fk" FOREIGN KEY ("verified_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_evidence_history" ADD CONSTRAINT "agency_evidence_history_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_partner_terms" ADD CONSTRAINT "agency_partner_terms_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_partner_terms" ADD CONSTRAINT "agency_partner_terms_counterparty_party_id_parties_id_fk" FOREIGN KEY ("counterparty_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_partner_terms" ADD CONSTRAINT "agency_partner_terms_owner_id_principals_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_partner_terms" ADD CONSTRAINT "agency_partner_terms_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_partner_terms" ADD CONSTRAINT "agency_partner_terms_approved_by_id_principals_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agency_review_case_idx" ON "agency_case_reviews" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "agency_review_author_idx" ON "agency_case_reviews" USING btree ("author_party_id");--> statement-breakpoint
CREATE INDEX "agency_review_content_idx" ON "agency_case_reviews" USING btree ("content_page_version_id");--> statement-breakpoint
CREATE INDEX "agency_history_record_idx" ON "agency_evidence_history" USING btree ("record_type","record_id","created_at");--> statement-breakpoint
CREATE INDEX "agency_partner_party_idx" ON "agency_partner_terms" USING btree ("counterparty_party_id");--> statement-breakpoint
CREATE INDEX "agency_partner_case_idx" ON "agency_partner_terms" USING btree ("case_id");--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_purpose" CHECK ("appointments"."purpose" in ('viewing', 'photography'));--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_photography_context" CHECK ("appointments"."purpose" <> 'photography' or ("appointments"."case_id" is null and "appointments"."interest_id" is null and "appointments"."property_id" is not null and "appointments"."listing_id" is not null and "appointments"."photography_scope" is not null and char_length("appointments"."photography_scope") between 10 and 2000));
--> statement-breakpoint
CREATE TRIGGER agency_evidence_history_immutable BEFORE UPDATE OR DELETE ON agency_evidence_history
FOR EACH ROW EXECUTE FUNCTION reject_modification();
