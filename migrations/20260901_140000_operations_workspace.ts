import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres';

// Durable workspace operations. Every table carries scalar workspace and
// idempotency columns so the Local API can scope and retry without inspecting
// JSON. The central admin adapter is the only writer; these tables are not a
// second public/CMS workflow.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "tasks" (
      "id" serial PRIMARY KEY NOT NULL,
      "task_id" varchar NOT NULL,
      "workspace_id" varchar NOT NULL,
      "title" varchar NOT NULL,
      "description" text,
      "source_type" varchar NOT NULL,
      "source_id" varchar,
      "source_label" varchar,
      "assignee_id" varchar,
      "due_at" timestamp(3) with time zone,
      "status" varchar NOT NULL,
      "priority" varchar NOT NULL,
      "created_by" varchar NOT NULL,
      "completed_by" varchar,
      "completed_at" timestamp(3) with time zone,
      "completion_note" varchar,
      "idempotency_key" varchar NOT NULL,
      "revision" integer DEFAULT 1 NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "tasks_workspace_task_id_idx" ON "tasks" USING btree ("workspace_id", "task_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "tasks_workspace_idempotency_key_idx" ON "tasks" USING btree ("workspace_id", "idempotency_key");
    CREATE INDEX IF NOT EXISTS "tasks_workspace_id_idx" ON "tasks" USING btree ("workspace_id");
    CREATE INDEX IF NOT EXISTS "tasks_workspace_status_idx" ON "tasks" USING btree ("workspace_id", "status");
    CREATE INDEX IF NOT EXISTS "tasks_workspace_due_at_idx" ON "tasks" USING btree ("workspace_id", "due_at");
    CREATE INDEX IF NOT EXISTS "tasks_assignee_id_idx" ON "tasks" USING btree ("assignee_id");
    CREATE INDEX IF NOT EXISTS "tasks_source_id_idx" ON "tasks" USING btree ("source_id");
    CREATE INDEX IF NOT EXISTS "tasks_created_at_idx" ON "tasks" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "tasks_updated_at_idx" ON "tasks" USING btree ("updated_at");

    CREATE TABLE IF NOT EXISTS "automation_rules" (
      "id" serial PRIMARY KEY NOT NULL,
      "rule_id" varchar NOT NULL,
      "workspace_id" varchar NOT NULL,
      "name" varchar NOT NULL,
      "rule_type" varchar NOT NULL,
      "schedule" varchar NOT NULL,
      "description" text,
      "enabled" boolean DEFAULT false NOT NULL,
      "created_by" varchar NOT NULL,
      "updated_by" varchar NOT NULL,
      "last_run_at" timestamp(3) with time zone,
      "last_failure_at" timestamp(3) with time zone,
      "idempotency_key" varchar NOT NULL,
      "revision" integer DEFAULT 1 NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "automation_rules_workspace_rule_id_idx" ON "automation_rules" USING btree ("workspace_id", "rule_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "automation_rules_workspace_idempotency_key_idx" ON "automation_rules" USING btree ("workspace_id", "idempotency_key");
    CREATE INDEX IF NOT EXISTS "automation_rules_workspace_id_idx" ON "automation_rules" USING btree ("workspace_id");
    CREATE INDEX IF NOT EXISTS "automation_rules_workspace_enabled_idx" ON "automation_rules" USING btree ("workspace_id", "enabled");
    CREATE INDEX IF NOT EXISTS "automation_rules_rule_type_idx" ON "automation_rules" USING btree ("rule_type");
    CREATE INDEX IF NOT EXISTS "automation_rules_last_run_at_idx" ON "automation_rules" USING btree ("last_run_at");
    CREATE INDEX IF NOT EXISTS "automation_rules_created_at_idx" ON "automation_rules" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "automation_rules_updated_at_idx" ON "automation_rules" USING btree ("updated_at");

    CREATE TABLE IF NOT EXISTS "automation_runs" (
      "id" serial PRIMARY KEY NOT NULL,
      "run_id" varchar NOT NULL,
      "workspace_id" varchar NOT NULL,
      "rule_id" varchar NOT NULL,
      "rule_type" varchar NOT NULL,
      "trigger" varchar NOT NULL,
      "status" varchar NOT NULL,
      "requested_by" varchar NOT NULL,
      "idempotency_key" varchar NOT NULL,
      "started_at" timestamp(3) with time zone NOT NULL,
      "completed_at" timestamp(3) with time zone,
      "failure_code" varchar,
      "result_summary" jsonb,
      "revision" integer DEFAULT 1 NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "automation_runs_workspace_run_id_idx" ON "automation_runs" USING btree ("workspace_id", "run_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "automation_runs_workspace_idempotency_key_idx" ON "automation_runs" USING btree ("workspace_id", "idempotency_key");
    CREATE INDEX IF NOT EXISTS "automation_runs_workspace_id_idx" ON "automation_runs" USING btree ("workspace_id");
    CREATE INDEX IF NOT EXISTS "automation_runs_workspace_started_at_idx" ON "automation_runs" USING btree ("workspace_id", "started_at");
    CREATE INDEX IF NOT EXISTS "automation_runs_rule_id_idx" ON "automation_runs" USING btree ("rule_id");
    CREATE INDEX IF NOT EXISTS "automation_runs_status_idx" ON "automation_runs" USING btree ("status");
    CREATE INDEX IF NOT EXISTS "automation_runs_created_at_idx" ON "automation_runs" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "automation_runs_updated_at_idx" ON "automation_runs" USING btree ("updated_at");

    CREATE TABLE IF NOT EXISTS "automation_run_failures" (
      "id" serial PRIMARY KEY NOT NULL,
      "failure_id" varchar NOT NULL,
      "workspace_id" varchar NOT NULL,
      "rule_id" varchar NOT NULL,
      "run_id" varchar NOT NULL,
      "failure_code" varchar NOT NULL,
      "message" varchar NOT NULL,
      "recorded_at" timestamp(3) with time zone NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "automation_run_failures_workspace_failure_id_idx" ON "automation_run_failures" USING btree ("workspace_id", "failure_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "automation_run_failures_workspace_run_id_idx" ON "automation_run_failures" USING btree ("workspace_id", "run_id");
    CREATE INDEX IF NOT EXISTS "automation_run_failures_workspace_id_idx" ON "automation_run_failures" USING btree ("workspace_id");
    CREATE INDEX IF NOT EXISTS "automation_run_failures_rule_id_idx" ON "automation_run_failures" USING btree ("rule_id");
    CREATE INDEX IF NOT EXISTS "automation_run_failures_recorded_at_idx" ON "automation_run_failures" USING btree ("recorded_at");
    CREATE INDEX IF NOT EXISTS "automation_run_failures_created_at_idx" ON "automation_run_failures" USING btree ("created_at");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "tasks_id" integer;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_tasks_id_idx" ON "payload_locked_documents_rels" USING btree ("tasks_id");
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_tasks_fk"
        FOREIGN KEY ("tasks_id") REFERENCES "public"."tasks"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "automation_rules_id" integer;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_automation_rules_id_idx" ON "payload_locked_documents_rels" USING btree ("automation_rules_id");
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_automation_rules_fk"
        FOREIGN KEY ("automation_rules_id") REFERENCES "public"."automation_rules"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "automation_runs_id" integer;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_automation_runs_id_idx" ON "payload_locked_documents_rels" USING btree ("automation_runs_id");
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_automation_runs_fk"
        FOREIGN KEY ("automation_runs_id") REFERENCES "public"."automation_runs"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "automation_run_failures_id" integer;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_automation_run_failures_id_idx" ON "payload_locked_documents_rels" USING btree ("automation_run_failures_id");
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_automation_run_failures_fk"
        FOREIGN KEY ("automation_run_failures_id") REFERENCES "public"."automation_run_failures"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

// Operations are accountability and workflow state. A rollback must not erase
// tasks, enable/disable decisions, or run failures that operators relied on.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db;
}
