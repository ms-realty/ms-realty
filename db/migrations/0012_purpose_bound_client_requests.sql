ALTER TYPE "public"."capability" ADD VALUE 'portal.access.request' BEFORE 'portal.brief.acknowledge';--> statement-breakpoint
CREATE TABLE "case_access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"case_id" uuid NOT NULL,
	"requested_by_id" uuid NOT NULL,
	"requester_participant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"target_participant_id" uuid,
	"target_email" text,
	"target_name" text,
	"requested_role" "participant_role",
	"reason" text NOT NULL,
	"task_id" uuid NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	"client_outcome" text,
	"invitation_id" uuid,
	CONSTRAINT "case_access_requests_kind" CHECK ("case_access_requests"."kind" in ('invite','remove')),
	CONSTRAINT "case_access_requests_state" CHECK ("case_access_requests"."state" in ('pending','approved','declined','withdrawn')),
	CONSTRAINT "case_access_requests_target" CHECK (("case_access_requests"."kind" = 'invite' and "case_access_requests"."target_email" is not null and "case_access_requests"."target_name" is not null and "case_access_requests"."requested_role" is not null and "case_access_requests"."target_participant_id" is null) or ("case_access_requests"."kind" = 'remove' and "case_access_requests"."target_participant_id" is not null and "case_access_requests"."target_email" is null and "case_access_requests"."target_name" is null and "case_access_requests"."requested_role" is null)),
	CONSTRAINT "case_access_requests_decision" CHECK ("case_access_requests"."state" = 'pending' or ("case_access_requests"."decided_by_id" is not null and "case_access_requests"."decided_at" is not null and "case_access_requests"."client_outcome" is not null))
);
--> statement-breakpoint
CREATE TABLE "document_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"case_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"recipient_participant_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"grant_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"policy_hash" text NOT NULL,
	"title" text NOT NULL,
	"purpose" text NOT NULL,
	"instructions" text NOT NULL,
	"alternatives" text NOT NULL,
	"allowed_content_types" jsonb NOT NULL,
	"max_bytes" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"requested_by_id" uuid NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_id" uuid,
	"client_outcome" text,
	"reviewed_version_id" uuid,
	CONSTRAINT "document_requests_document_id_unique" UNIQUE("document_id"),
	CONSTRAINT "document_requests_size" CHECK ("document_requests"."max_bytes" between 1 and 20971520),
	CONSTRAINT "document_requests_types" CHECK (jsonb_typeof("document_requests"."allowed_content_types") = 'array' and jsonb_array_length("document_requests"."allowed_content_types") > 0),
	CONSTRAINT "document_requests_cancellation" CHECK ("document_requests"."cancelled_at" is null or ("document_requests"."cancelled_by_id" is not null and "document_requests"."client_outcome" is not null))
);
--> statement-breakpoint
ALTER TABLE "case_access_requests" ADD CONSTRAINT "case_access_requests_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_access_requests" ADD CONSTRAINT "case_access_requests_requested_by_id_principals_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_access_requests" ADD CONSTRAINT "case_access_requests_requester_participant_id_case_participants_id_fk" FOREIGN KEY ("requester_participant_id") REFERENCES "public"."case_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_access_requests" ADD CONSTRAINT "case_access_requests_target_participant_id_case_participants_id_fk" FOREIGN KEY ("target_participant_id") REFERENCES "public"."case_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_access_requests" ADD CONSTRAINT "case_access_requests_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_access_requests" ADD CONSTRAINT "case_access_requests_decided_by_id_principals_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_access_requests" ADD CONSTRAINT "case_access_requests_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_recipient_id_principals_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_recipient_participant_id_case_participants_id_fk" FOREIGN KEY ("recipient_participant_id") REFERENCES "public"."case_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_policy_id_process_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."process_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_requested_by_id_principals_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_cancelled_by_id_principals_id_fk" FOREIGN KEY ("cancelled_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_reviewed_version_id_document_versions_id_fk" FOREIGN KEY ("reviewed_version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_access_requests_case_idx" ON "case_access_requests" USING btree ("case_id","state");--> statement-breakpoint
CREATE INDEX "case_access_requests_requester_idx" ON "case_access_requests" USING btree ("requested_by_id");--> statement-breakpoint
CREATE INDEX "document_requests_recipient_idx" ON "document_requests" USING btree ("recipient_id","case_id");--> statement-breakpoint
CREATE INDEX "document_requests_case_idx" ON "document_requests" USING btree ("case_id");