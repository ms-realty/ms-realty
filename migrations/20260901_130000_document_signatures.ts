import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres';

// Document rows contain metadata and private-storage references only. Bytes
// stay in the separately governed object store; revisions and signature state
// remain durable in the same Postgres transaction as their parent pointer.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_documents_document_type" AS ENUM('mandate', 'identity', 'title', 'technical', 'tax', 'contract', 'lease', 'annex', 'power_of_attorney', 'regulatory_snapshot', 'other');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_documents_source" AS ENUM('client', 'counterparty', 'agency', 'professional', 'registry', 'system', 'provider');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_documents_retention_class" AS ENUM('case_file', 'legal_hold', 'short_lived');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_documents_status" AS ENUM('active', 'void', 'expired', 'archived');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_document_revisions_document_type" AS ENUM('mandate', 'identity', 'title', 'technical', 'tax', 'contract', 'lease', 'annex', 'power_of_attorney', 'regulatory_snapshot', 'other');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_signature_requests_provider" AS ENUM('internal');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_signature_requests_status" AS ENUM('provider_pending', 'signed', 'declined', 'expired', 'cancelled', 'failed');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    CREATE TABLE IF NOT EXISTS "documents" (
      "id" serial PRIMARY KEY NOT NULL,
      "workspace_id" varchar NOT NULL,
      "document_id" varchar NOT NULL,
      "idempotency_key" varchar NOT NULL,
      "document_type" "enum_documents_document_type" NOT NULL,
      "title" varchar NOT NULL,
      "subject_type" varchar NOT NULL,
      "subject_ref" varchar NOT NULL,
      "case_id" integer,
      "source" "enum_documents_source" NOT NULL,
      "storage_ref" varchar NOT NULL,
      "mime_type" varchar NOT NULL,
      "byte_size" numeric NOT NULL,
      "content_digest" varchar NOT NULL,
      "retention_class" "enum_documents_retention_class" NOT NULL,
      "status" "enum_documents_status" DEFAULT 'active' NOT NULL,
      "valid_from" timestamp(3) with time zone,
      "valid_until" timestamp(3) with time zone,
      "current_revision_number" numeric DEFAULT 1 NOT NULL,
      "current_revision_id" varchar NOT NULL,
      "current_storage_ref" varchar NOT NULL,
      "current_mime_type" varchar NOT NULL,
      "current_byte_size" numeric NOT NULL,
      "current_content_digest" varchar NOT NULL,
      "created_by" varchar NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "document_revisions" (
      "id" serial PRIMARY KEY NOT NULL,
      "workspace_id" varchar NOT NULL,
      "document_id" integer NOT NULL,
      "document_ref" varchar NOT NULL,
      "revision_id" varchar NOT NULL,
      "idempotency_key" varchar NOT NULL,
      "revision_number" numeric NOT NULL,
      "document_type" "enum_document_revisions_document_type" NOT NULL,
      "title" varchar NOT NULL,
      "storage_ref" varchar NOT NULL,
      "mime_type" varchar NOT NULL,
      "byte_size" numeric NOT NULL,
      "content_digest" varchar NOT NULL,
      "change_reason" varchar NOT NULL,
      "metadata_refs" jsonb,
      "created_by" varchar NOT NULL,
      "revision_recorded_at" timestamp(3) with time zone NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "signature_requests" (
      "id" serial PRIMARY KEY NOT NULL,
      "workspace_id" varchar NOT NULL,
      "request_id" varchar NOT NULL,
      "idempotency_key" varchar NOT NULL,
      "document_id" integer NOT NULL,
      "document_revision_id" integer NOT NULL,
      "document_ref" varchar NOT NULL,
      "revision_number" numeric NOT NULL,
      "signer_ref" varchar NOT NULL,
      "signer_role" varchar NOT NULL,
      "provider" "enum_signature_requests_provider" DEFAULT 'internal' NOT NULL,
      "provider_request_ref" varchar,
      "status" "enum_signature_requests_status" DEFAULT 'provider_pending' NOT NULL,
      "requested_by" varchar NOT NULL,
      "requested_at" timestamp(3) with time zone NOT NULL,
      "expires_at" timestamp(3) with time zone,
      "provider_receipt_ref" varchar,
      "failure_code" varchar,
      "status_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "status_updated_at" timestamp(3) with time zone NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    ALTER TABLE "documents" ADD CONSTRAINT "documents_id_workspace_id_unique" UNIQUE ("id", "workspace_id");
    ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_id_workspace_id_unique" UNIQUE ("id", "workspace_id");
    ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_id_workspace_id_unique" UNIQUE ("id", "workspace_id");
    ALTER TABLE "documents" ADD CONSTRAINT "documents_case_workspace_fk" FOREIGN KEY ("case_id", "workspace_id") REFERENCES "public"."realty_cases"("id", "workspace_id") ON DELETE restrict ON UPDATE no action;
    ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;
    ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_document_workspace_fk" FOREIGN KEY ("document_id", "workspace_id") REFERENCES "public"."documents"("id", "workspace_id") ON DELETE restrict ON UPDATE no action;
    ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;
    ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_document_workspace_fk" FOREIGN KEY ("document_id", "workspace_id") REFERENCES "public"."documents"("id", "workspace_id") ON DELETE restrict ON UPDATE no action;
    ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_revision_fk" FOREIGN KEY ("document_revision_id") REFERENCES "public"."document_revisions"("id") ON DELETE restrict ON UPDATE no action;
    ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_revision_workspace_fk" FOREIGN KEY ("document_revision_id", "workspace_id") REFERENCES "public"."document_revisions"("id", "workspace_id") ON DELETE restrict ON UPDATE no action;

    CREATE UNIQUE INDEX IF NOT EXISTS "documents_document_id_idx" ON "documents" USING btree ("document_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "documents_workspace_id_idempotency_key_idx" ON "documents" USING btree ("workspace_id", "idempotency_key");
    CREATE INDEX IF NOT EXISTS "documents_workspace_id_idx" ON "documents" USING btree ("workspace_id");
    CREATE INDEX IF NOT EXISTS "documents_case_id_idx" ON "documents" USING btree ("case_id");
    CREATE INDEX IF NOT EXISTS "documents_status_idx" ON "documents" USING btree ("status");
    CREATE INDEX IF NOT EXISTS "documents_created_at_idx" ON "documents" USING btree ("created_at");
    CREATE UNIQUE INDEX IF NOT EXISTS "document_revisions_revision_id_idx" ON "document_revisions" USING btree ("revision_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "document_revisions_workspace_id_idempotency_key_idx" ON "document_revisions" USING btree ("workspace_id", "idempotency_key");
    CREATE UNIQUE INDEX IF NOT EXISTS "document_revisions_workspace_document_revision_idx" ON "document_revisions" USING btree ("workspace_id", "document_ref", "revision_number");
    CREATE INDEX IF NOT EXISTS "document_revisions_workspace_id_idx" ON "document_revisions" USING btree ("workspace_id");
    CREATE INDEX IF NOT EXISTS "document_revisions_document_id_idx" ON "document_revisions" USING btree ("document_id");
    CREATE INDEX IF NOT EXISTS "document_revisions_document_ref_idx" ON "document_revisions" USING btree ("document_ref");
    CREATE INDEX IF NOT EXISTS "document_revisions_created_at_idx" ON "document_revisions" USING btree ("created_at");
    CREATE UNIQUE INDEX IF NOT EXISTS "signature_requests_request_id_idx" ON "signature_requests" USING btree ("request_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "signature_requests_workspace_id_idempotency_key_idx" ON "signature_requests" USING btree ("workspace_id", "idempotency_key");
    CREATE INDEX IF NOT EXISTS "signature_requests_workspace_id_idx" ON "signature_requests" USING btree ("workspace_id");
    CREATE INDEX IF NOT EXISTS "signature_requests_document_id_idx" ON "signature_requests" USING btree ("document_id");
    CREATE INDEX IF NOT EXISTS "signature_requests_document_revision_id_idx" ON "signature_requests" USING btree ("document_revision_id");
    CREATE INDEX IF NOT EXISTS "signature_requests_status_idx" ON "signature_requests" USING btree ("status");
    CREATE INDEX IF NOT EXISTS "signature_requests_requested_at_idx" ON "signature_requests" USING btree ("requested_at");
    CREATE INDEX IF NOT EXISTS "signature_requests_created_at_idx" ON "signature_requests" USING btree ("created_at");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "documents_id" integer;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "document_revisions_id" integer;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "signature_requests_id" integer;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_documents_id_idx" ON "payload_locked_documents_rels" USING btree ("documents_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_document_revisions_id_idx" ON "payload_locked_documents_rels" USING btree ("document_revisions_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_signature_requests_id_idx" ON "payload_locked_documents_rels" USING btree ("signature_requests_id");
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_documents_fk" FOREIGN KEY ("documents_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_document_revisions_fk" FOREIGN KEY ("document_revisions_id") REFERENCES "public"."document_revisions"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_signature_requests_fk" FOREIGN KEY ("signature_requests_id") REFERENCES "public"."signature_requests"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    CREATE OR REPLACE FUNCTION "public"."ms_realty_documents_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW."workspace_id" IS DISTINCT FROM OLD."workspace_id"
        OR NEW."document_id" IS DISTINCT FROM OLD."document_id"
        OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
        OR NEW."document_type" IS DISTINCT FROM OLD."document_type"
        OR NEW."title" IS DISTINCT FROM OLD."title"
        OR NEW."subject_type" IS DISTINCT FROM OLD."subject_type"
        OR NEW."subject_ref" IS DISTINCT FROM OLD."subject_ref"
        OR NEW."case_id" IS DISTINCT FROM OLD."case_id"
        OR NEW."source" IS DISTINCT FROM OLD."source"
        OR NEW."retention_class" IS DISTINCT FROM OLD."retention_class"
        OR NEW."status" IS DISTINCT FROM OLD."status"
        OR NEW."valid_from" IS DISTINCT FROM OLD."valid_from"
        OR NEW."valid_until" IS DISTINCT FROM OLD."valid_until"
        OR NEW."created_by" IS DISTINCT FROM OLD."created_by" THEN
        RAISE EXCEPTION 'Document identity and metadata are immutable';
      END IF;
      IF NEW."current_revision_number" < OLD."current_revision_number" THEN
        RAISE EXCEPTION 'Document revisions cannot move backwards';
      END IF;
      RETURN NEW;
    END;
    $$;
    DROP TRIGGER IF EXISTS "ms_realty_documents_guard" ON "documents";
    CREATE TRIGGER "ms_realty_documents_guard" BEFORE UPDATE ON "documents" FOR EACH ROW EXECUTE FUNCTION "public"."ms_realty_documents_guard"();

    CREATE OR REPLACE FUNCTION "public"."ms_realty_document_revisions_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'Document revisions are append-only';
    END;
    $$;
    DROP TRIGGER IF EXISTS "ms_realty_document_revisions_append_only" ON "document_revisions";
    CREATE TRIGGER "ms_realty_document_revisions_append_only" BEFORE UPDATE OR DELETE ON "document_revisions" FOR EACH ROW EXECUTE FUNCTION "public"."ms_realty_document_revisions_append_only"();

    CREATE OR REPLACE FUNCTION "public"."ms_realty_signature_requests_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Signature requests are append-only';
      END IF;
      IF NEW."workspace_id" IS DISTINCT FROM OLD."workspace_id"
        OR NEW."request_id" IS DISTINCT FROM OLD."request_id"
        OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
        OR NEW."document_id" IS DISTINCT FROM OLD."document_id"
        OR NEW."document_revision_id" IS DISTINCT FROM OLD."document_revision_id"
        OR NEW."document_ref" IS DISTINCT FROM OLD."document_ref"
        OR NEW."revision_number" IS DISTINCT FROM OLD."revision_number"
        OR NEW."signer_ref" IS DISTINCT FROM OLD."signer_ref"
        OR NEW."signer_role" IS DISTINCT FROM OLD."signer_role"
        OR NEW."provider" IS DISTINCT FROM OLD."provider"
        OR NEW."provider_request_ref" IS DISTINCT FROM OLD."provider_request_ref"
        OR NEW."requested_by" IS DISTINCT FROM OLD."requested_by"
        OR NEW."requested_at" IS DISTINCT FROM OLD."requested_at"
        OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at" THEN
        RAISE EXCEPTION 'Signature request identity is immutable';
      END IF;
      IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
        (OLD."status" = 'provider_pending' AND NEW."status" IN ('signed', 'declined', 'expired', 'cancelled', 'failed'))
      ) THEN
        RAISE EXCEPTION 'Invalid signature request status transition';
      END IF;
      IF NEW."status" = 'signed' AND NULLIF(NEW."provider_receipt_ref", '') IS NULL THEN
        RAISE EXCEPTION 'Signed signature requests require a provider receipt';
      END IF;
      RETURN NEW;
    END;
    $$;
    DROP TRIGGER IF EXISTS "ms_realty_signature_requests_guard" ON "signature_requests";
    CREATE TRIGGER "ms_realty_signature_requests_guard" BEFORE UPDATE OR DELETE ON "signature_requests" FOR EACH ROW EXECUTE FUNCTION "public"."ms_realty_signature_requests_guard"();
  `);
}

// Document and signature records are durable authority and must survive a
// rollback attempt. A future migration can add an explicit archival plan.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db;
}

