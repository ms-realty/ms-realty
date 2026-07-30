import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_realty_case_conditions_status" AS ENUM('open', 'satisfied', 'blocked', 'expired', 'waived');
    CREATE TYPE "public"."enum_realty_case_conditions_last_event_action" AS ENUM('condition_opened', 'condition_satisfied', 'condition_blocked', 'condition_expired', 'condition_waived', 'condition_reopened');
    CREATE TYPE "public"."enum_realty_case_condition_events_action" AS ENUM('condition_opened', 'condition_satisfied', 'condition_blocked', 'condition_expired', 'condition_waived', 'condition_reopened');
    CREATE TYPE "public"."enum_realty_case_condition_events_executor_kind" AS ENUM('human', 'agent');

    CREATE TABLE "realty_case_conditions" (
      "id" serial PRIMARY KEY NOT NULL,
      "workspace_id" varchar NOT NULL,
      "case_id" integer NOT NULL,
      "condition_id" varchar NOT NULL,
      "condition_type" varchar NOT NULL,
      "due_at" timestamp(3) with time zone NOT NULL,
      "required_evidence_producer_refs" jsonb NOT NULL,
      "status" "enum_realty_case_conditions_status" DEFAULT 'open' NOT NULL,
      "evidence_refs" jsonb NOT NULL,
      "authority_ref" varchar,
      "reason_code" varchar,
      "last_event_sequence" integer DEFAULT 1 NOT NULL,
      "last_event_id" varchar NOT NULL,
      "last_event_action" "enum_realty_case_conditions_last_event_action" NOT NULL,
      "last_event_at" timestamp(3) with time zone NOT NULL,
      "last_actor_ref" varchar NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE "realty_case_condition_events" (
      "id" serial PRIMARY KEY NOT NULL,
      "workspace_id" varchar NOT NULL,
      "case_id" integer NOT NULL,
      "condition_id" integer NOT NULL,
      "event_id" varchar NOT NULL,
      "sequence" integer NOT NULL,
      "action" "enum_realty_case_condition_events_action" NOT NULL,
      "actor_ref" varchar NOT NULL,
      "executor_kind" "enum_realty_case_condition_events_executor_kind" NOT NULL,
      "assurance_ref" varchar,
      "authority_ref" varchar,
      "reason_code" varchar,
      "reference_payload" jsonb NOT NULL,
      "payload_digest" varchar NOT NULL,
      "idempotency_key" varchar NOT NULL,
      "recorded_at" timestamp(3) with time zone NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    ALTER TABLE "realty_case_conditions" ADD CONSTRAINT "realty_case_conditions_workspace_case_condition_unique" UNIQUE ("workspace_id", "case_id", "condition_id");
    ALTER TABLE "realty_case_conditions" ADD CONSTRAINT "realty_case_conditions_id_workspace_case_unique" UNIQUE ("id", "workspace_id", "case_id");
    ALTER TABLE "realty_case_condition_events" ADD CONSTRAINT "realty_case_condition_events_workspace_event_id_unique" UNIQUE ("workspace_id", "event_id");
    ALTER TABLE "realty_case_condition_events" ADD CONSTRAINT "realty_case_condition_events_workspace_idempotency_unique" UNIQUE ("workspace_id", "idempotency_key");
    ALTER TABLE "realty_case_condition_events" ADD CONSTRAINT "realty_case_cond_events_condition_sequence_unique" UNIQUE ("condition_id", "sequence");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realty_case_conditions_id" integer;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realty_case_condition_events_id" integer;

    ALTER TABLE "realty_case_conditions" ADD CONSTRAINT "realty_case_conditions_case_id_realty_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."realty_cases"("id") ON DELETE restrict ON UPDATE no action;
    ALTER TABLE "realty_case_condition_events" ADD CONSTRAINT "realty_case_condition_events_case_id_realty_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."realty_cases"("id") ON DELETE restrict ON UPDATE no action;
    ALTER TABLE "realty_case_condition_events" ADD CONSTRAINT "realty_case_condition_events_condition_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."realty_case_conditions"("id") ON DELETE restrict ON UPDATE no action;
    ALTER TABLE "realty_case_conditions" ADD CONSTRAINT "realty_case_conditions_case_workspace_fk" FOREIGN KEY ("case_id", "workspace_id") REFERENCES "public"."realty_cases"("id", "workspace_id") ON DELETE restrict ON UPDATE no action;
    ALTER TABLE "realty_case_condition_events" ADD CONSTRAINT "realty_case_condition_events_case_workspace_fk" FOREIGN KEY ("case_id", "workspace_id") REFERENCES "public"."realty_cases"("id", "workspace_id") ON DELETE restrict ON UPDATE no action;
    ALTER TABLE "realty_case_condition_events" ADD CONSTRAINT "realty_case_condition_events_condition_workspace_case_fk" FOREIGN KEY ("condition_id", "workspace_id", "case_id") REFERENCES "public"."realty_case_conditions"("id", "workspace_id", "case_id") ON DELETE restrict ON UPDATE no action;

    CREATE TRIGGER "realty_case_condition_events_append_only" BEFORE UPDATE OR DELETE ON "realty_case_condition_events" FOR EACH ROW EXECUTE FUNCTION "public"."realty_case_prevent_mutation"();

    CREATE INDEX "realty_case_conditions_workspace_id_idx" ON "realty_case_conditions" USING btree ("workspace_id");
    CREATE INDEX "realty_case_conditions_case_idx" ON "realty_case_conditions" USING btree ("case_id");
    CREATE INDEX "realty_case_conditions_condition_id_idx" ON "realty_case_conditions" USING btree ("condition_id");
    CREATE INDEX "realty_case_conditions_status_idx" ON "realty_case_conditions" USING btree ("status");
    CREATE INDEX "realty_case_conditions_due_at_idx" ON "realty_case_conditions" USING btree ("due_at");
    CREATE INDEX "realty_case_conditions_updated_at_idx" ON "realty_case_conditions" USING btree ("updated_at");
    CREATE INDEX "realty_case_conditions_created_at_idx" ON "realty_case_conditions" USING btree ("created_at");
    CREATE INDEX "realty_case_condition_events_workspace_id_idx" ON "realty_case_condition_events" USING btree ("workspace_id");
    CREATE INDEX "realty_case_condition_events_case_idx" ON "realty_case_condition_events" USING btree ("case_id");
    CREATE INDEX "realty_case_condition_events_condition_idx" ON "realty_case_condition_events" USING btree ("condition_id");
    CREATE INDEX "realty_case_condition_events_event_id_idx" ON "realty_case_condition_events" USING btree ("event_id");
    CREATE INDEX "realty_case_condition_events_sequence_idx" ON "realty_case_condition_events" USING btree ("sequence");
    CREATE INDEX "realty_case_condition_events_idempotency_key_idx" ON "realty_case_condition_events" USING btree ("idempotency_key");
    CREATE INDEX "realty_case_condition_events_recorded_at_idx" ON "realty_case_condition_events" USING btree ("recorded_at");
    CREATE INDEX "realty_case_condition_events_updated_at_idx" ON "realty_case_condition_events" USING btree ("updated_at");
    CREATE INDEX "realty_case_condition_events_created_at_idx" ON "realty_case_condition_events" USING btree ("created_at");

    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_rels_realty_case_conditions_fk" FOREIGN KEY ("realty_case_conditions_id") REFERENCES "public"."realty_case_conditions"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_rels_realty_case_condition_events_fk" FOREIGN KEY ("realty_case_condition_events_id") REFERENCES "public"."realty_case_condition_events"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX "payload_locked_rels_realty_case_conditions_idx" ON "payload_locked_documents_rels" USING btree ("realty_case_conditions_id");
    CREATE INDEX "payload_locked_rels_realty_case_condition_events_idx" ON "payload_locked_documents_rels" USING btree ("realty_case_condition_events_id");
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_rels_realty_case_conditions_fk";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_rels_realty_case_condition_events_fk";
    DROP INDEX "payload_locked_rels_realty_case_conditions_idx";
    DROP INDEX "payload_locked_rels_realty_case_condition_events_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realty_case_conditions_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realty_case_condition_events_id";

    DROP TRIGGER "realty_case_condition_events_append_only" ON "realty_case_condition_events";
    DROP INDEX "realty_case_condition_events_workspace_id_idx";
    DROP INDEX "realty_case_condition_events_case_idx";
    DROP INDEX "realty_case_condition_events_condition_idx";
    DROP INDEX "realty_case_condition_events_event_id_idx";
    DROP INDEX "realty_case_condition_events_sequence_idx";
    DROP INDEX "realty_case_condition_events_idempotency_key_idx";
    DROP INDEX "realty_case_condition_events_recorded_at_idx";
    DROP INDEX "realty_case_condition_events_updated_at_idx";
    DROP INDEX "realty_case_condition_events_created_at_idx";
    DROP TABLE "realty_case_condition_events";

    DROP INDEX "realty_case_conditions_workspace_id_idx";
    DROP INDEX "realty_case_conditions_case_idx";
    DROP INDEX "realty_case_conditions_condition_id_idx";
    DROP INDEX "realty_case_conditions_status_idx";
    DROP INDEX "realty_case_conditions_due_at_idx";
    DROP INDEX "realty_case_conditions_updated_at_idx";
    DROP INDEX "realty_case_conditions_created_at_idx";
    DROP TABLE "realty_case_conditions";

    DROP TYPE "public"."enum_realty_case_condition_events_executor_kind";
    DROP TYPE "public"."enum_realty_case_condition_events_action";
    DROP TYPE "public"."enum_realty_case_conditions_last_event_action";
    DROP TYPE "public"."enum_realty_case_conditions_status";
  `)
}
