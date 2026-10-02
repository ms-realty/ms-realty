CREATE TABLE "assistance_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requested_by_id" uuid NOT NULL,
	"task" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"source_version" integer NOT NULL,
	"source_digest" text NOT NULL,
	"source_snapshot" jsonb NOT NULL,
	"prompt_version" text NOT NULL,
	"schema_version" text NOT NULL,
	"model" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"output" jsonb,
	"validation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_code" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"reserved_cost_micros" integer DEFAULT 0 NOT NULL,
	"actual_cost_micros" integer,
	"generated_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_id" uuid,
	"job_id" text,
	CONSTRAINT "assistance_runs_task" CHECK ("assistance_runs"."task" in ('inquiry_summary', 'reply_draft', 'task_draft')),
	CONSTRAINT "assistance_runs_state" CHECK ("assistance_runs"."state" in ('queued', 'running', 'draft', 'failed', 'stale', 'rejected', 'accepted')),
	CONSTRAINT "assistance_runs_source_version" CHECK ("assistance_runs"."source_version" > 0),
	CONSTRAINT "assistance_runs_usage" CHECK ("assistance_runs"."input_tokens" >= 0 and "assistance_runs"."output_tokens" >= 0 and "assistance_runs"."reserved_cost_micros" >= 0 and ("assistance_runs"."actual_cost_micros" is null or "assistance_runs"."actual_cost_micros" >= 0)),
	CONSTRAINT "assistance_runs_review" CHECK ("assistance_runs"."state" not in ('accepted', 'rejected') or ("assistance_runs"."reviewed_by_id" is not null and "assistance_runs"."reviewed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "assistance_runs" ADD CONSTRAINT "assistance_runs_requested_by_id_principals_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistance_runs" ADD CONSTRAINT "assistance_runs_reviewed_by_id_principals_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assistance_runs_actor_idx" ON "assistance_runs" USING btree ("requested_by_id","created_at");--> statement-breakpoint
CREATE INDEX "assistance_runs_source_idx" ON "assistance_runs" USING btree ("source_type","source_id","source_version");