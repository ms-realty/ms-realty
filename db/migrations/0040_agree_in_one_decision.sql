ALTER TABLE "proposal_responses" DROP CONSTRAINT "proposal_responses_staff_evidence";--> statement-breakpoint
ALTER TABLE "proposal_responses" ADD COLUMN "channel" text;--> statement-breakpoint
ALTER TABLE "proposal_responses" ADD COLUMN "given_on" date;--> statement-breakpoint
ALTER TABLE "case_path_steps" ADD COLUMN "details" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "proposal_responses" ADD CONSTRAINT "proposal_responses_staff_basis" CHECK ("proposal_responses"."actor_kind" <> 'staff' or "proposal_responses"."evidence_document_version_id" is not null or ("proposal_responses"."channel" is not null and "proposal_responses"."given_on" is not null));--> statement-breakpoint
ALTER TABLE "proposal_responses" ADD CONSTRAINT "proposal_responses_channel" CHECK ("proposal_responses"."channel" is null or ("proposal_responses"."actor_kind" = 'staff' and "proposal_responses"."channel" in ('in_person', 'phone', 'email', 'message')));