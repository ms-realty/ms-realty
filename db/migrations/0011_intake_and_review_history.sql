ALTER TYPE "public"."capability" ADD VALUE 'portal.brief.acknowledge' BEFORE 'portal.interest.respond';--> statement-breakpoint
CREATE TABLE "process_item_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"decided_by_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assistance_runs" DROP CONSTRAINT "assistance_runs_task";--> statement-breakpoint
ALTER TABLE "assistance_runs" DROP CONSTRAINT "assistance_runs_task_source";--> statement-breakpoint
ALTER TABLE "process_item_decisions" ADD CONSTRAINT "process_item_decisions_item_id_case_process_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."case_process_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_item_decisions" ADD CONSTRAINT "process_item_decisions_decided_by_id_principals_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_item_decisions" ADD CONSTRAINT "process_item_decisions_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "process_item_decision_version_idx" ON "process_item_decisions" USING btree ("item_id","version");--> statement-breakpoint
ALTER TABLE "assistance_runs" ADD CONSTRAINT "assistance_runs_task" CHECK ("assistance_runs"."task" in ('inquiry_summary', 'reply_draft', 'task_draft', 'locale.draft', 'intake.extract'));--> statement-breakpoint
ALTER TABLE "assistance_runs" ADD CONSTRAINT "assistance_runs_task_source" CHECK (("assistance_runs"."task" = 'locale.draft' and "assistance_runs"."source_type" = 'listing_revision' and "assistance_runs"."target_locale" is not null and "assistance_runs"."target_locale" <> 'bg') or ("assistance_runs"."task" = 'intake.extract' and "assistance_runs"."source_type" = 'property_fact_revision' and "assistance_runs"."target_locale" is null) or ("assistance_runs"."task" in ('inquiry_summary','reply_draft','task_draft') and "assistance_runs"."source_type" = 'inquiry' and "assistance_runs"."target_locale" is null));