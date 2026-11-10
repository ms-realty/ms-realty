-- ADR 0013: recorded Deal path steps and verified Deal completions. Additive; no existing row changes.
CREATE TABLE "case_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"template" text NOT NULL,
	"completed_on" date NOT NULL,
	"registry_reference" text,
	"evidence_version_id" uuid,
	"recorded_by_id" uuid NOT NULL,
	"operation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_path_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"case_id" uuid NOT NULL,
	"template" text NOT NULL,
	"step_key" text NOT NULL,
	"position" integer NOT NULL,
	"actor" text NOT NULL,
	"evidence_expected" boolean NOT NULL,
	"client_visible" boolean NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"expected_on" date,
	"done_on" date,
	"recorded_at" timestamp with time zone,
	"recorded_by_id" uuid,
	"client_note" text,
	"internal_note" text,
	"skip_reason" text,
	"evidence_version_id" uuid,
	CONSTRAINT "case_path_steps_state" CHECK ("case_path_steps"."state" in ('pending', 'done', 'skipped')),
	CONSTRAINT "case_path_steps_actor" CHECK ("case_path_steps"."actor" in ('client', 'agency', 'owner', 'notary', 'lawyer')),
	CONSTRAINT "case_path_steps_position" CHECK ("case_path_steps"."position" >= 0),
	CONSTRAINT "case_path_steps_done" CHECK ("case_path_steps"."state" <> 'done' or ("case_path_steps"."done_on" is not null and "case_path_steps"."recorded_at" is not null and "case_path_steps"."recorded_by_id" is not null)),
	CONSTRAINT "case_path_steps_skipped" CHECK ("case_path_steps"."state" <> 'skipped' or ("case_path_steps"."skip_reason" is not null and "case_path_steps"."recorded_at" is not null and "case_path_steps"."recorded_by_id" is not null)),
	CONSTRAINT "case_path_steps_pending" CHECK ("case_path_steps"."state" <> 'pending' or ("case_path_steps"."done_on" is null and "case_path_steps"."skip_reason" is null and "case_path_steps"."evidence_version_id" is null)),
	CONSTRAINT "case_path_steps_evidence_done" CHECK ("case_path_steps"."evidence_version_id" is null or "case_path_steps"."state" = 'done')
);
--> statement-breakpoint
ALTER TABLE "case_completions" ADD CONSTRAINT "case_completions_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_completions" ADD CONSTRAINT "case_completions_evidence_version_id_document_versions_id_fk" FOREIGN KEY ("evidence_version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_completions" ADD CONSTRAINT "case_completions_recorded_by_id_principals_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_path_steps" ADD CONSTRAINT "case_path_steps_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_path_steps" ADD CONSTRAINT "case_path_steps_recorded_by_id_principals_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_path_steps" ADD CONSTRAINT "case_path_steps_evidence_version_id_document_versions_id_fk" FOREIGN KEY ("evidence_version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_completions_case_idx" ON "case_completions" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "case_path_steps_key_idx" ON "case_path_steps" USING btree ("case_id","step_key");--> statement-breakpoint
CREATE UNIQUE INDEX "case_path_steps_position_idx" ON "case_path_steps" USING btree ("case_id","position");