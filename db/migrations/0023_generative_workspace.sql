CREATE TABLE "generative_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_id" uuid NOT NULL,
	"run_id" uuid,
	"replaces_id" uuid,
	"proposal" jsonb NOT NULL,
	"context_digest" text NOT NULL,
	"context_pins" jsonb NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"materialized_by_id" uuid,
	"receipt_id" uuid,
	"result" jsonb,
	CONSTRAINT "generative_artifacts_state" CHECK ("generative_artifacts"."state" in ('draft','superseded','materialized')),
	CONSTRAINT "generative_artifacts_receipt" CHECK ("generative_artifacts"."state" <> 'materialized' or ("generative_artifacts"."materialized_by_id" is not null and "generative_artifacts"."receipt_id" is not null and "generative_artifacts"."result" is not null))
);
--> statement-breakpoint
CREATE TABLE "generative_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"run_id" uuid NOT NULL,
	"step" integer NOT NULL,
	"turn" jsonb NOT NULL,
	"tool_result" jsonb,
	"cost_micros" integer NOT NULL,
	CONSTRAINT "generative_checkpoints_step" CHECK ("generative_checkpoints"."step" > 0 and "generative_checkpoints"."cost_micros" >= 0)
);
--> statement-breakpoint
CREATE TABLE "generative_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_id" uuid NOT NULL,
	"requested_by_id" uuid NOT NULL,
	"generation" integer NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"policy_digest" text NOT NULL,
	"budget" jsonb NOT NULL,
	"context_digest" text NOT NULL,
	"steps" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"reserved_cost_micros" integer NOT NULL,
	"actual_cost_micros" integer,
	"observed_cost_micros" integer DEFAULT 0 NOT NULL,
	"claim_id" uuid,
	"claimed_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"error_code" text,
	CONSTRAINT "generative_runs_state" CHECK ("generative_runs"."state" in ('idle', 'queued', 'running', 'waiting_input', 'review', 'completed', 'cancelled', 'failed', 'stale', 'budget_exhausted', 'unknown_provider')),
	CONSTRAINT "generative_runs_usage" CHECK ("generative_runs"."steps" >= 0 and "generative_runs"."input_tokens" >= 0 and "generative_runs"."output_tokens" >= 0 and "generative_runs"."reserved_cost_micros" >= 0 and "generative_runs"."observed_cost_micros" >= 0 and ("generative_runs"."actual_cost_micros" is null or "generative_runs"."actual_cost_micros" >= 0))
);
--> statement-breakpoint
CREATE TABLE "generative_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner_id" uuid NOT NULL,
	"goal" text NOT NULL,
	"locale" text NOT NULL,
	"selection" jsonb NOT NULL,
	"constraints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decisions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"plan" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conversation" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"context_pins" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"context_digest" text NOT NULL,
	"state" text DEFAULT 'idle' NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"active_run_id" uuid,
	"error_code" text,
	CONSTRAINT "generative_sessions_state" CHECK ("generative_sessions"."state" in ('idle', 'queued', 'running', 'waiting_input', 'review', 'completed', 'cancelled', 'failed', 'stale', 'budget_exhausted', 'unknown_provider')),
	CONSTRAINT "generative_sessions_generation" CHECK ("generative_sessions"."generation" >= 0),
	CONSTRAINT "generative_sessions_locale" CHECK ("generative_sessions"."locale" in ('bg','en','ru'))
);
--> statement-breakpoint
ALTER TABLE "generative_artifacts" ADD CONSTRAINT "generative_artifacts_session_id_generative_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."generative_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generative_artifacts" ADD CONSTRAINT "generative_artifacts_run_id_generative_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generative_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generative_artifacts" ADD CONSTRAINT "generative_artifacts_materialized_by_id_principals_id_fk" FOREIGN KEY ("materialized_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generative_checkpoints" ADD CONSTRAINT "generative_checkpoints_run_id_generative_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generative_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generative_runs" ADD CONSTRAINT "generative_runs_session_id_generative_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."generative_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generative_runs" ADD CONSTRAINT "generative_runs_requested_by_id_principals_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generative_sessions" ADD CONSTRAINT "generative_sessions_owner_id_principals_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generative_artifacts_session_idx" ON "generative_artifacts" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "generative_artifacts_replaces_idx" ON "generative_artifacts" USING btree ("replaces_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generative_checkpoints_step_idx" ON "generative_checkpoints" USING btree ("run_id","step");--> statement-breakpoint
CREATE INDEX "generative_runs_budget_idx" ON "generative_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "generative_runs_actor_idx" ON "generative_runs" USING btree ("requested_by_id","state");--> statement-breakpoint
CREATE INDEX "generative_sessions_owner_idx" ON "generative_sessions" USING btree ("owner_id","updated_at");