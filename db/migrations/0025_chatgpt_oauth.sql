CREATE TABLE "chatgpt_oauth_hosts" (
	"key" text PRIMARY KEY NOT NULL,
	"host_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chatgpt_oauth_hosts_key" CHECK ("chatgpt_oauth_hosts"."key" ~ '^[A-Za-z0-9_-]{1,80}$')
);
--> statement-breakpoint
CREATE TABLE "chatgpt_oauth_registrations" (
	"host_key" text NOT NULL,
	"id" text NOT NULL,
	"issuer" text NOT NULL,
	"client_id" text NOT NULL,
	"subject" text NOT NULL,
	"label" text NOT NULL,
	"encrypted_credential" text NOT NULL,
	"connected" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chatgpt_oauth_registrations_host_key_id_pk" PRIMARY KEY("host_key","id"),
	CONSTRAINT "chatgpt_oauth_registrations_identity" CHECK ("chatgpt_oauth_registrations"."issuer" = 'https://auth.openai.com' and "chatgpt_oauth_registrations"."id" ~ '^[a-f0-9]{64}$' and length("chatgpt_oauth_registrations"."client_id") between 1 and 512 and "chatgpt_oauth_registrations"."client_id" <> 'dynamic_agent_client' and length("chatgpt_oauth_registrations"."subject") between 1 and 512),
	CONSTRAINT "chatgpt_oauth_registrations_encrypted" CHECK ("chatgpt_oauth_registrations"."encrypted_credential" like 'v1.%' and length("chatgpt_oauth_registrations"."encrypted_credential") < 262144 and "chatgpt_oauth_registrations"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "assistance_runs" DROP CONSTRAINT "assistance_runs_usage";--> statement-breakpoint
ALTER TABLE "generative_checkpoints" DROP CONSTRAINT "generative_checkpoints_step";--> statement-breakpoint
ALTER TABLE "generative_runs" DROP CONSTRAINT "generative_runs_usage";--> statement-breakpoint
ALTER TABLE "assistance_runs" ALTER COLUMN "reserved_cost_micros" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "generative_checkpoints" ALTER COLUMN "cost_micros" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "generative_runs" ALTER COLUMN "reserved_cost_micros" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "generative_runs" ALTER COLUMN "observed_cost_micros" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "assistance_runs" ADD COLUMN "billing_mode" text DEFAULT 'metered_usd' NOT NULL;--> statement-breakpoint
ALTER TABLE "assistance_runs" ADD COLUMN "inference_outcome" text DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "generative_checkpoints" ADD COLUMN "billing_mode" text DEFAULT 'metered_usd' NOT NULL;--> statement-breakpoint
ALTER TABLE "generative_runs" ADD COLUMN "billing_mode" text DEFAULT 'metered_usd' NOT NULL;--> statement-breakpoint
ALTER TABLE "generative_runs" ADD COLUMN "inference_outcome" text DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "chatgpt_oauth_registrations" ADD CONSTRAINT "chatgpt_oauth_registrations_host_key_chatgpt_oauth_hosts_key_fk" FOREIGN KEY ("host_key") REFERENCES "public"."chatgpt_oauth_hosts"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chatgpt_oauth_hosts_id_idx" ON "chatgpt_oauth_hosts" USING btree ("host_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chatgpt_oauth_registrations_identity_idx" ON "chatgpt_oauth_registrations" USING btree ("host_key","issuer","client_id","subject");--> statement-breakpoint
-- Preserve historical metered charges; classify only confirmed outcomes as settled.
UPDATE "assistance_runs" SET "inference_outcome" = CASE
  WHEN "actual_cost_micros" IS NOT NULL THEN 'settled'
  WHEN "state" = 'running' THEN 'pending'
  WHEN "state" = 'queued' AND "generated_at" IS NULL AND "input_tokens" = 0 AND "output_tokens" = 0 THEN 'not_started'
  ELSE 'unknown' END;
--> statement-breakpoint
UPDATE "generative_runs" SET "inference_outcome" = CASE
  WHEN "actual_cost_micros" IS NOT NULL THEN 'settled'
  WHEN "state" IN ('queued','running') AND "claim_id" IS NOT NULL THEN 'pending'
  WHEN "state" = 'queued' AND "claim_id" IS NULL AND "steps" = 0 AND "input_tokens" = 0 AND "output_tokens" = 0 AND "observed_cost_micros" = 0 THEN 'not_started'
  ELSE 'unknown' END;
--> statement-breakpoint
ALTER TABLE "assistance_runs" ADD CONSTRAINT "assistance_runs_billing" CHECK (("assistance_runs"."billing_mode" = 'metered_usd' and "assistance_runs"."reserved_cost_micros" is not null and "assistance_runs"."reserved_cost_micros" >= 0 and ("assistance_runs"."actual_cost_micros" is null or "assistance_runs"."actual_cost_micros" >= 0)) or ("assistance_runs"."billing_mode" = 'chatgpt_subscription' and "assistance_runs"."reserved_cost_micros" is null and "assistance_runs"."actual_cost_micros" is null));--> statement-breakpoint
ALTER TABLE "assistance_runs" ADD CONSTRAINT "assistance_runs_inference" CHECK ("assistance_runs"."inference_outcome" in ('not_started','pending','settled','unknown') and ("assistance_runs"."inference_outcome" <> 'pending' or "assistance_runs"."state" = 'running') and ("assistance_runs"."inference_outcome" <> 'settled' or "assistance_runs"."billing_mode" = 'chatgpt_subscription' or "assistance_runs"."actual_cost_micros" is not null));--> statement-breakpoint
ALTER TABLE "assistance_runs" ADD CONSTRAINT "assistance_runs_usage" CHECK ("assistance_runs"."input_tokens" >= 0 and "assistance_runs"."output_tokens" >= 0);--> statement-breakpoint
ALTER TABLE "generative_checkpoints" ADD CONSTRAINT "generative_checkpoints_billing" CHECK (("generative_checkpoints"."billing_mode" = 'metered_usd' and "generative_checkpoints"."cost_micros" is not null and "generative_checkpoints"."cost_micros" >= 0) or ("generative_checkpoints"."billing_mode" = 'chatgpt_subscription' and "generative_checkpoints"."cost_micros" is null));--> statement-breakpoint
ALTER TABLE "generative_checkpoints" ADD CONSTRAINT "generative_checkpoints_step" CHECK ("generative_checkpoints"."step" > 0);--> statement-breakpoint
ALTER TABLE "generative_runs" ADD CONSTRAINT "generative_runs_billing" CHECK (("generative_runs"."billing_mode" = 'metered_usd' and "generative_runs"."reserved_cost_micros" is not null and "generative_runs"."reserved_cost_micros" >= 0 and "generative_runs"."observed_cost_micros" is not null and "generative_runs"."observed_cost_micros" >= 0 and ("generative_runs"."actual_cost_micros" is null or "generative_runs"."actual_cost_micros" >= 0)) or ("generative_runs"."billing_mode" = 'chatgpt_subscription' and "generative_runs"."reserved_cost_micros" is null and "generative_runs"."observed_cost_micros" is null and "generative_runs"."actual_cost_micros" is null));--> statement-breakpoint
ALTER TABLE "generative_runs" ADD CONSTRAINT "generative_runs_inference" CHECK ("generative_runs"."inference_outcome" in ('not_started','pending','settled','unknown') and ("generative_runs"."inference_outcome" <> 'pending' or ("generative_runs"."state" in ('queued','running') and "generative_runs"."claim_id" is not null)) and ("generative_runs"."inference_outcome" <> 'settled' or "generative_runs"."billing_mode" = 'chatgpt_subscription' or "generative_runs"."actual_cost_micros" is not null));--> statement-breakpoint
ALTER TABLE "generative_runs" ADD CONSTRAINT "generative_runs_usage" CHECK ("generative_runs"."steps" >= 0 and "generative_runs"."input_tokens" >= 0 and "generative_runs"."output_tokens" >= 0);
--> statement-breakpoint
REVOKE ALL ON TABLE "chatgpt_oauth_hosts", "chatgpt_oauth_registrations" FROM PUBLIC;
