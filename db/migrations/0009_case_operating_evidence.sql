ALTER TYPE "public"."capability" ADD VALUE 'compliance.review' BEFORE 'message.draft';--> statement-breakpoint
ALTER TYPE "public"."capability" ADD VALUE 'compliance.suspicion' BEFORE 'message.draft';--> statement-breakpoint
CREATE TABLE "case_process_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"review_id" uuid NOT NULL,
	"code" text NOT NULL,
	"party_scope" text DEFAULT '' NOT NULL,
	"result" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"evidence_version_id" uuid,
	"evidence_digest" text,
	"professional_name" text,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"retain_until" timestamp with time zone NOT NULL,
	CONSTRAINT "case_process_item_result" CHECK ("case_process_items"."result" in ('pending','accepted','not_applicable','blocked')),
	CONSTRAINT "case_process_item_human" CHECK ("case_process_items"."result" = 'pending' or ("case_process_items"."reviewed_by_id" is not null and "case_process_items"."reviewed_at" is not null and "case_process_items"."reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "case_process_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"case_id" uuid NOT NULL,
	"proposal_revision_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"policy_hash" text NOT NULL,
	"terms_hash" text NOT NULL,
	"party_ids" jsonb NOT NULL,
	"responsible_id" uuid NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"approved_by_id" uuid,
	"approved_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	"invalidation_reason" text
);
--> statement-breakpoint
CREATE TABLE "commission_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"agreement_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"invoice_reference" text NOT NULL,
	"recorded_by_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_amount" CHECK ("commission_records"."amount_minor" >= 0 and "commission_records"."currency" = 'EUR')
);
--> statement-breakpoint
CREATE TABLE "process_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"country" text NOT NULL,
	"transaction" text NOT NULL,
	"participant_category" text NOT NULL,
	"document_version_id" uuid NOT NULL,
	"document_digest" text NOT NULL,
	"items" jsonb NOT NULL,
	"withdrawal_days" integer NOT NULL,
	"timezone" text NOT NULL,
	"express_start_required" boolean NOT NULL,
	"retention_days" integer NOT NULL,
	"professional_name" text NOT NULL,
	"approved_by_id" uuid NOT NULL,
	"policy_hash" text NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revocation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "process_policy_scope" CHECK ("process_policies"."country" in ('BG','GR') and "process_policies"."transaction" in ('sale','rent') and "process_policies"."participant_category" in ('eu','non_eu','mixed','unknown')),
	CONSTRAINT "process_policy_periods" CHECK ("process_policies"."withdrawal_days" between 0 and 365 and "process_policies"."retention_days" between 1 and 36500),
	CONSTRAINT "process_policy_revocation" CHECK ("process_policies"."revoked_at" is null or "process_policies"."revocation_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "service_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"document_digest" text NOT NULL,
	"channel" text NOT NULL,
	"signed_at" timestamp with time zone NOT NULL,
	"withdrawal_informed_at" timestamp with time zone,
	"withdrawal_deadline_at" timestamp with time zone,
	"express_start_requested_at" timestamp with time zone,
	"express_start_evidence_version_id" uuid,
	"express_start_evidence_digest" text,
	"commission_basis" text NOT NULL,
	"commission_payer_party_id" uuid NOT NULL,
	"reviewed_by_id" uuid NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revocation_reason" text,
	"operation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_agreement_channel" CHECK ("service_agreements"."channel" in ('on_premises','distance','off_premises')),
	CONSTRAINT "service_agreement_start_evidence" CHECK ("service_agreements"."express_start_requested_at" is null or ("service_agreements"."express_start_evidence_version_id" is not null and "service_agreements"."express_start_evidence_digest" is not null))
);
--> statement-breakpoint
CREATE TABLE "suspicion_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"note" text NOT NULL,
	"external_reference" text,
	"reported_at" timestamp with time zone,
	"recorded_by_id" uuid NOT NULL,
	"retain_until" timestamp with time zone NOT NULL,
	"operation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"actor_kind" "actor_kind" NOT NULL,
	"actor_id" text NOT NULL,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"terms_hash" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"evidence_document_version_id" uuid,
	CONSTRAINT "proposal_responses_human" CHECK ("proposal_responses"."actor_kind" in ('staff', 'client')),
	CONSTRAINT "proposal_responses_decision" CHECK ("proposal_responses"."decision" in ('agree', 'decline', 'counter')),
	CONSTRAINT "proposal_responses_exact_terms" CHECK ("proposal_responses"."terms_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "proposal_responses_staff_evidence" CHECK ("proposal_responses"."actor_kind" <> 'staff' or "proposal_responses"."evidence_document_version_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "assistance_runs" DROP CONSTRAINT "assistance_runs_task";--> statement-breakpoint
ALTER TABLE "assistance_runs" ADD COLUMN "target_locale" "public_locale";--> statement-breakpoint
ALTER TABLE "case_process_items" ADD CONSTRAINT "case_process_items_review_id_case_process_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."case_process_reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_process_items" ADD CONSTRAINT "case_process_items_evidence_version_id_document_versions_id_fk" FOREIGN KEY ("evidence_version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_process_items" ADD CONSTRAINT "case_process_items_reviewed_by_id_principals_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_process_reviews" ADD CONSTRAINT "case_process_reviews_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_process_reviews" ADD CONSTRAINT "case_process_reviews_proposal_revision_id_proposal_revisions_id_fk" FOREIGN KEY ("proposal_revision_id") REFERENCES "public"."proposal_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_process_reviews" ADD CONSTRAINT "case_process_reviews_policy_id_process_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."process_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_process_reviews" ADD CONSTRAINT "case_process_reviews_responsible_id_principals_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_process_reviews" ADD CONSTRAINT "case_process_reviews_approved_by_id_principals_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_records" ADD CONSTRAINT "commission_records_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_records" ADD CONSTRAINT "commission_records_agreement_id_service_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."service_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_records" ADD CONSTRAINT "commission_records_recorded_by_id_principals_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_records" ADD CONSTRAINT "commission_records_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_policies" ADD CONSTRAINT "process_policies_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_policies" ADD CONSTRAINT "process_policies_approved_by_id_principals_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_policy_id_process_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."process_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_express_start_evidence_version_id_document_versions_id_fk" FOREIGN KEY ("express_start_evidence_version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_commission_payer_party_id_parties_id_fk" FOREIGN KEY ("commission_payer_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_reviewed_by_id_principals_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspicion_reports" ADD CONSTRAINT "suspicion_reports_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspicion_reports" ADD CONSTRAINT "suspicion_reports_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspicion_reports" ADD CONSTRAINT "suspicion_reports_policy_id_process_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."process_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspicion_reports" ADD CONSTRAINT "suspicion_reports_recorded_by_id_principals_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspicion_reports" ADD CONSTRAINT "suspicion_reports_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_responses" ADD CONSTRAINT "proposal_responses_revision_id_proposal_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."proposal_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_responses" ADD CONSTRAINT "proposal_responses_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_responses" ADD CONSTRAINT "proposal_responses_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_responses" ADD CONSTRAINT "proposal_responses_evidence_document_version_id_document_versions_id_fk" FOREIGN KEY ("evidence_document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "case_process_item_scope_idx" ON "case_process_items" USING btree ("review_id","code","party_scope");--> statement-breakpoint
CREATE UNIQUE INDEX "case_process_revision_idx" ON "case_process_reviews" USING btree ("proposal_revision_id");--> statement-breakpoint
CREATE INDEX "case_process_case_idx" ON "case_process_reviews" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "service_agreement_case_party_idx" ON "service_agreements" USING btree ("case_id","party_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proposal_responses_party_revision_idx" ON "proposal_responses" USING btree ("revision_id","party_id");--> statement-breakpoint
ALTER TABLE "assistance_runs" ADD CONSTRAINT "assistance_runs_task_source" CHECK (("assistance_runs"."task" = 'locale.draft' and "assistance_runs"."source_type" = 'listing_revision' and "assistance_runs"."target_locale" is not null and "assistance_runs"."target_locale" <> 'bg') or ("assistance_runs"."task" in ('inquiry_summary','reply_draft','task_draft') and "assistance_runs"."source_type" = 'inquiry' and "assistance_runs"."target_locale" is null));--> statement-breakpoint
ALTER TABLE "assistance_runs" ADD CONSTRAINT "assistance_runs_task" CHECK ("assistance_runs"."task" in ('inquiry_summary', 'reply_draft', 'task_draft', 'locale.draft'));