import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_realty_cases_jurisdiction" AS ENUM('BG', 'GR');
  CREATE TYPE "public"."enum_realty_cases_case_type" AS ENUM('buyer_purchase', 'seller_sale', 'tenant_rental', 'landlord_rental', 'short_term_rental', 'property_management');
  CREATE TYPE "public"."enum_realty_cases_asset_kind" AS ENUM('residential', 'commercial', 'land', 'new_build', 'mixed_use');
  CREATE TYPE "public"."enum_realty_cases_execution_mode" AS ENUM('manual', 'autonomous');
  CREATE TYPE "public"."enum_realty_cases_status" AS ENUM('active', 'frozen', 'closed', 'cancelled');
  CREATE TYPE "public"."enum_realty_cases_last_event_action" AS ENUM('case_opened', 'step_completed', 'step_not_applicable', 'step_blocked', 'step_reopened', 'mode_changed', 'case_frozen', 'case_resumed', 'case_closed', 'case_cancelled');
  CREATE TYPE "public"."enum_realty_case_events_action" AS ENUM('case_opened', 'step_completed', 'step_not_applicable', 'step_blocked', 'step_reopened', 'mode_changed', 'case_frozen', 'case_resumed', 'case_closed', 'case_cancelled');
  CREATE TYPE "public"."enum_realty_case_events_executor_kind" AS ENUM('human', 'agent');
  CREATE TYPE "public"."enum_realty_case_mandate_versions_status" AS ENUM('active', 'superseded', 'revoked', 'expired');
  CREATE TYPE "public"."enum_realty_case_evidence_evidence_type" AS ENUM('identity_assertion', 'registry_extract', 'financial_confirmation', 'inspection', 'contract', 'communication_receipt', 'provider_receipt', 'document_metadata', 'other');
  CREATE TYPE "public"."enum_realty_case_evidence_producer_kind" AS ENUM('agency', 'agent', 'bank', 'client', 'counterparty', 'engineer', 'insurer', 'lawyer', 'notary', 'property_manager', 'registry', 'system', 'tax_authority', 'vendor');
  CREATE TYPE "public"."enum_realty_case_evidence_retention_class" AS ENUM('case_file', 'legal_hold', 'short_lived');
  CREATE TYPE "public"."enum_realty_case_evidence_verification_status" AS ENUM('pending', 'verified', 'rejected', 'expired', 'revoked');
  CREATE TYPE "public"."enum_realty_case_outbox_kind" AS ENUM('provider_request', 'communication', 'calendar_task', 'webhook', 'reconciliation');
  CREATE TYPE "public"."enum_realty_case_outbox_status" AS ENUM('pending', 'leased', 'delivered', 'failed', 'dead_letter', 'cancelled');
  CREATE TABLE "realty_cases" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"workspace_id" varchar NOT NULL,
  	"case_id" varchar NOT NULL,
  	"jurisdiction" "enum_realty_cases_jurisdiction" NOT NULL,
  	"case_type" "enum_realty_cases_case_type" NOT NULL,
  	"asset_kind" "enum_realty_cases_asset_kind" NOT NULL,
  	"client_ref" varchar NOT NULL,
  	"property_ref" varchar,
  	"execution_mode" "enum_realty_cases_execution_mode" NOT NULL,
  	"status" "enum_realty_cases_status" DEFAULT 'active' NOT NULL,
  	"assurance_ref" varchar,
  	"mandate_ref" varchar NOT NULL,
  	"mandate_version_number" numeric NOT NULL,
  	"mandate_digest" varchar NOT NULL,
  	"workflow_version" varchar NOT NULL,
  	"workflow_snapshot" jsonb NOT NULL,
  	"workflow_snapshot_digest" varchar NOT NULL,
  	"current_phase" varchar NOT NULL,
  	"progress_percent" numeric DEFAULT 0 NOT NULL,
  	"last_event_sequence" numeric DEFAULT 1 NOT NULL,
  	"last_event_id" varchar NOT NULL,
  	"last_event_action" "enum_realty_cases_last_event_action" NOT NULL,
  	"last_event_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "realty_case_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"workspace_id" varchar NOT NULL,
  	"case_id" integer NOT NULL,
  	"event_id" varchar NOT NULL,
  	"sequence" numeric NOT NULL,
  	"action" "enum_realty_case_events_action" NOT NULL,
  	"step_key" varchar,
  	"actor_ref" varchar NOT NULL,
  	"executor_kind" "enum_realty_case_events_executor_kind" NOT NULL,
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
  
  CREATE TABLE "realty_case_mandate_versions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"workspace_id" varchar NOT NULL,
  	"case_id" integer NOT NULL,
  	"mandate_ref" varchar NOT NULL,
  	"version_number" numeric NOT NULL,
  	"status" "enum_realty_case_mandate_versions_status" DEFAULT 'active' NOT NULL,
  	"granted_by_ref" varchar NOT NULL,
  	"signed_at" timestamp(3) with time zone NOT NULL,
  	"expires_at" timestamp(3) with time zone,
  	"signed_evidence_ref" varchar NOT NULL,
  	"capabilities" jsonb NOT NULL,
  	"limits" jsonb,
  	"mandate_digest" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "realty_case_evidence" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"workspace_id" varchar NOT NULL,
  	"case_id" integer NOT NULL,
  	"source_event_id" integer,
  	"evidence_ref" varchar NOT NULL,
  	"evidence_type" "enum_realty_case_evidence_evidence_type" NOT NULL,
  	"producer_kind" "enum_realty_case_evidence_producer_kind" NOT NULL,
  	"producer_ref" varchar,
  	"issued_at" timestamp(3) with time zone,
  	"digest" varchar NOT NULL,
  	"storage_ref" varchar,
  	"mime_type" varchar,
  	"retention_class" "enum_realty_case_evidence_retention_class" NOT NULL,
  	"verification_status" "enum_realty_case_evidence_verification_status" DEFAULT 'pending' NOT NULL,
  	"verification_ref" varchar,
  	"metadata_refs" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "realty_case_outbox" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"workspace_id" varchar NOT NULL,
  	"case_id" integer NOT NULL,
  	"source_event_id" integer,
  	"outbox_id" varchar NOT NULL,
  	"idempotency_key" varchar NOT NULL,
  	"kind" "enum_realty_case_outbox_kind" NOT NULL,
  	"destination_ref" varchar NOT NULL,
  	"payload_refs" jsonb NOT NULL,
  	"payload_digest" varchar NOT NULL,
  	"status" "enum_realty_case_outbox_status" DEFAULT 'pending' NOT NULL,
  	"not_before" timestamp(3) with time zone NOT NULL,
  	"lease_until" timestamp(3) with time zone,
  	"attempt_count" numeric DEFAULT 0 NOT NULL,
  	"last_attempt_at" timestamp(3) with time zone,
  	"last_error_code" varchar,
  	"delivered_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "realty_cases" ADD CONSTRAINT "realty_cases_workspace_case_id_unique" UNIQUE ("workspace_id", "case_id");
  ALTER TABLE "realty_cases" ADD CONSTRAINT "realty_cases_id_workspace_id_unique" UNIQUE ("id", "workspace_id");
  ALTER TABLE "realty_case_events" ADD CONSTRAINT "realty_case_events_workspace_event_id_unique" UNIQUE ("workspace_id", "event_id");
  ALTER TABLE "realty_case_events" ADD CONSTRAINT "realty_case_events_workspace_idempotency_unique" UNIQUE ("workspace_id", "idempotency_key");
  ALTER TABLE "realty_case_events" ADD CONSTRAINT "realty_case_events_case_sequence_unique" UNIQUE ("case_id", "sequence");
  ALTER TABLE "realty_case_events" ADD CONSTRAINT "realty_case_events_id_workspace_id_unique" UNIQUE ("id", "workspace_id");
  ALTER TABLE "realty_case_mandate_versions" ADD CONSTRAINT "realty_case_mandates_workspace_version_unique" UNIQUE ("workspace_id", "mandate_ref", "version_number");
  ALTER TABLE "realty_case_evidence" ADD CONSTRAINT "realty_case_evidence_workspace_ref_unique" UNIQUE ("workspace_id", "evidence_ref");
  ALTER TABLE "realty_case_outbox" ADD CONSTRAINT "realty_case_outbox_workspace_outbox_id_unique" UNIQUE ("workspace_id", "outbox_id");
  ALTER TABLE "realty_case_outbox" ADD CONSTRAINT "realty_case_outbox_workspace_idempotency_unique" UNIQUE ("workspace_id", "idempotency_key");
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realty_cases_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realty_case_events_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realty_case_mandate_versions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realty_case_evidence_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realty_case_outbox_id" integer;
  ALTER TABLE "realty_case_events" ADD CONSTRAINT "realty_case_events_case_id_realty_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."realty_cases"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "realty_case_mandate_versions" ADD CONSTRAINT "realty_case_mandate_versions_case_id_realty_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."realty_cases"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "realty_case_evidence" ADD CONSTRAINT "realty_case_evidence_case_id_realty_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."realty_cases"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "realty_case_evidence" ADD CONSTRAINT "realty_case_evidence_source_event_id_realty_case_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."realty_case_events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realty_case_outbox" ADD CONSTRAINT "realty_case_outbox_case_id_realty_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."realty_cases"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "realty_case_outbox" ADD CONSTRAINT "realty_case_outbox_source_event_id_realty_case_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."realty_case_events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realty_case_events" ADD CONSTRAINT "realty_case_events_case_workspace_fk" FOREIGN KEY ("case_id", "workspace_id") REFERENCES "public"."realty_cases"("id", "workspace_id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "realty_case_mandate_versions" ADD CONSTRAINT "realty_case_mandates_case_workspace_fk" FOREIGN KEY ("case_id", "workspace_id") REFERENCES "public"."realty_cases"("id", "workspace_id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "realty_case_evidence" ADD CONSTRAINT "realty_case_evidence_case_workspace_fk" FOREIGN KEY ("case_id", "workspace_id") REFERENCES "public"."realty_cases"("id", "workspace_id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "realty_case_evidence" ADD CONSTRAINT "realty_case_evidence_event_workspace_fk" FOREIGN KEY ("source_event_id", "workspace_id") REFERENCES "public"."realty_case_events"("id", "workspace_id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "realty_case_outbox" ADD CONSTRAINT "realty_case_outbox_case_workspace_fk" FOREIGN KEY ("case_id", "workspace_id") REFERENCES "public"."realty_cases"("id", "workspace_id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "realty_case_outbox" ADD CONSTRAINT "realty_case_outbox_event_workspace_fk" FOREIGN KEY ("source_event_id", "workspace_id") REFERENCES "public"."realty_case_events"("id", "workspace_id") ON DELETE restrict ON UPDATE no action;
  CREATE FUNCTION "public"."realty_case_prevent_workflow_snapshot_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF NEW."workflow_version" IS DISTINCT FROM OLD."workflow_version"
      OR NEW."workflow_snapshot" IS DISTINCT FROM OLD."workflow_snapshot"
      OR NEW."workflow_snapshot_digest" IS DISTINCT FROM OLD."workflow_snapshot_digest" THEN
      RAISE EXCEPTION 'RealtyCase workflow snapshot is immutable';
    END IF;
    RETURN NEW;
  END;
  $$;
  CREATE TRIGGER "realty_cases_workflow_snapshot_immutable" BEFORE UPDATE ON "realty_cases" FOR EACH ROW EXECUTE FUNCTION "public"."realty_case_prevent_workflow_snapshot_mutation"();
  CREATE FUNCTION "public"."realty_case_prevent_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    RAISE EXCEPTION 'RealtyCase ledger records are append-only';
  END;
  $$;
  CREATE TRIGGER "realty_case_events_append_only" BEFORE UPDATE OR DELETE ON "realty_case_events" FOR EACH ROW EXECUTE FUNCTION "public"."realty_case_prevent_mutation"();
  CREATE TRIGGER "realty_case_mandates_append_only" BEFORE UPDATE OR DELETE ON "realty_case_mandate_versions" FOR EACH ROW EXECUTE FUNCTION "public"."realty_case_prevent_mutation"();
  CREATE TRIGGER "realty_case_evidence_append_only" BEFORE UPDATE OR DELETE ON "realty_case_evidence" FOR EACH ROW EXECUTE FUNCTION "public"."realty_case_prevent_mutation"();
  CREATE INDEX "realty_cases_workspace_id_idx" ON "realty_cases" USING btree ("workspace_id");
  CREATE INDEX "realty_cases_case_id_idx" ON "realty_cases" USING btree ("case_id");
  CREATE INDEX "realty_cases_updated_at_idx" ON "realty_cases" USING btree ("updated_at");
  CREATE INDEX "realty_cases_created_at_idx" ON "realty_cases" USING btree ("created_at");
  CREATE INDEX "realty_case_events_workspace_id_idx" ON "realty_case_events" USING btree ("workspace_id");
  CREATE INDEX "realty_case_events_case_idx" ON "realty_case_events" USING btree ("case_id");
  CREATE INDEX "realty_case_events_event_id_idx" ON "realty_case_events" USING btree ("event_id");
  CREATE INDEX "realty_case_events_idempotency_key_idx" ON "realty_case_events" USING btree ("idempotency_key");
  CREATE INDEX "realty_case_events_updated_at_idx" ON "realty_case_events" USING btree ("updated_at");
  CREATE INDEX "realty_case_events_created_at_idx" ON "realty_case_events" USING btree ("created_at");
  CREATE INDEX "realty_case_mandate_versions_workspace_id_idx" ON "realty_case_mandate_versions" USING btree ("workspace_id");
  CREATE INDEX "realty_case_mandate_versions_case_idx" ON "realty_case_mandate_versions" USING btree ("case_id");
  CREATE INDEX "realty_case_mandate_versions_mandate_ref_idx" ON "realty_case_mandate_versions" USING btree ("mandate_ref");
  CREATE INDEX "realty_case_mandate_versions_updated_at_idx" ON "realty_case_mandate_versions" USING btree ("updated_at");
  CREATE INDEX "realty_case_mandate_versions_created_at_idx" ON "realty_case_mandate_versions" USING btree ("created_at");
  CREATE INDEX "realty_case_evidence_workspace_id_idx" ON "realty_case_evidence" USING btree ("workspace_id");
  CREATE INDEX "realty_case_evidence_case_idx" ON "realty_case_evidence" USING btree ("case_id");
  CREATE INDEX "realty_case_evidence_source_event_idx" ON "realty_case_evidence" USING btree ("source_event_id");
  CREATE INDEX "realty_case_evidence_evidence_ref_idx" ON "realty_case_evidence" USING btree ("evidence_ref");
  CREATE INDEX "realty_case_evidence_updated_at_idx" ON "realty_case_evidence" USING btree ("updated_at");
  CREATE INDEX "realty_case_evidence_created_at_idx" ON "realty_case_evidence" USING btree ("created_at");
  CREATE INDEX "realty_case_outbox_workspace_id_idx" ON "realty_case_outbox" USING btree ("workspace_id");
  CREATE INDEX "realty_case_outbox_case_idx" ON "realty_case_outbox" USING btree ("case_id");
  CREATE INDEX "realty_case_outbox_source_event_idx" ON "realty_case_outbox" USING btree ("source_event_id");
  CREATE INDEX "realty_case_outbox_outbox_id_idx" ON "realty_case_outbox" USING btree ("outbox_id");
  CREATE INDEX "realty_case_outbox_idempotency_key_idx" ON "realty_case_outbox" USING btree ("idempotency_key");
  CREATE INDEX "realty_case_outbox_updated_at_idx" ON "realty_case_outbox" USING btree ("updated_at");
  CREATE INDEX "realty_case_outbox_created_at_idx" ON "realty_case_outbox" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_realty_cases_fk" FOREIGN KEY ("realty_cases_id") REFERENCES "public"."realty_cases"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_realty_case_events_fk" FOREIGN KEY ("realty_case_events_id") REFERENCES "public"."realty_case_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_realty_case_mandate_version_fk" FOREIGN KEY ("realty_case_mandate_versions_id") REFERENCES "public"."realty_case_mandate_versions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_realty_case_evidence_fk" FOREIGN KEY ("realty_case_evidence_id") REFERENCES "public"."realty_case_evidence"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_realty_case_outbox_fk" FOREIGN KEY ("realty_case_outbox_id") REFERENCES "public"."realty_case_outbox"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_realty_cases_id_idx" ON "payload_locked_documents_rels" USING btree ("realty_cases_id");
  CREATE INDEX "payload_locked_documents_rels_realty_case_events_id_idx" ON "payload_locked_documents_rels" USING btree ("realty_case_events_id");
  CREATE INDEX "payload_locked_documents_rels_realty_case_mandate_versio_idx" ON "payload_locked_documents_rels" USING btree ("realty_case_mandate_versions_id");
  CREATE INDEX "payload_locked_documents_rels_realty_case_evidence_id_idx" ON "payload_locked_documents_rels" USING btree ("realty_case_evidence_id");
  CREATE INDEX "payload_locked_documents_rels_realty_case_outbox_id_idx" ON "payload_locked_documents_rels" USING btree ("realty_case_outbox_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_realty_cases_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_realty_case_events_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_realty_case_mandate_version_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_realty_case_evidence_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_realty_case_outbox_fk";
  DROP INDEX "payload_locked_documents_rels_realty_cases_id_idx";
  DROP INDEX "payload_locked_documents_rels_realty_case_events_id_idx";
  DROP INDEX "payload_locked_documents_rels_realty_case_mandate_versio_idx";
  DROP INDEX "payload_locked_documents_rels_realty_case_evidence_id_idx";
  DROP INDEX "payload_locked_documents_rels_realty_case_outbox_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realty_cases_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realty_case_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realty_case_mandate_versions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realty_case_evidence_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realty_case_outbox_id";
  DROP TRIGGER "realty_cases_workflow_snapshot_immutable" ON "realty_cases";
  DROP FUNCTION "public"."realty_case_prevent_workflow_snapshot_mutation"();
  DROP TRIGGER "realty_case_events_append_only" ON "realty_case_events";
  DROP TRIGGER "realty_case_mandates_append_only" ON "realty_case_mandate_versions";
  DROP TRIGGER "realty_case_evidence_append_only" ON "realty_case_evidence";
  DROP FUNCTION "public"."realty_case_prevent_mutation"();
  DROP TABLE "realty_case_outbox" CASCADE;
  DROP TABLE "realty_case_evidence" CASCADE;
  DROP TABLE "realty_case_mandate_versions" CASCADE;
  DROP TABLE "realty_case_events" CASCADE;
  DROP TABLE "realty_cases" CASCADE;
  DROP TYPE "public"."enum_realty_cases_jurisdiction";
  DROP TYPE "public"."enum_realty_cases_case_type";
  DROP TYPE "public"."enum_realty_cases_asset_kind";
  DROP TYPE "public"."enum_realty_cases_execution_mode";
  DROP TYPE "public"."enum_realty_cases_status";
  DROP TYPE "public"."enum_realty_cases_last_event_action";
  DROP TYPE "public"."enum_realty_case_events_action";
  DROP TYPE "public"."enum_realty_case_events_executor_kind";
  DROP TYPE "public"."enum_realty_case_mandate_versions_status";
  DROP TYPE "public"."enum_realty_case_evidence_evidence_type";
  DROP TYPE "public"."enum_realty_case_evidence_producer_kind";
  DROP TYPE "public"."enum_realty_case_evidence_retention_class";
  DROP TYPE "public"."enum_realty_case_evidence_verification_status";
  DROP TYPE "public"."enum_realty_case_outbox_kind";
  DROP TYPE "public"."enum_realty_case_outbox_status";`)
}
