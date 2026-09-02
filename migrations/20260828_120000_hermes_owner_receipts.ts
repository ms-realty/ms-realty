import { sql, type MigrateDownArgs, type MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "hermes_owner_receipts" (
      "id" serial PRIMARY KEY NOT NULL,
      "idempotency_key" varchar NOT NULL,
      "operator_id" varchar NOT NULL,
      "workspace_id" varchar,
      "status" varchar NOT NULL,
      "command_digest" varchar NOT NULL,
      "model" varchar NOT NULL,
      "evidence_refs" jsonb NOT NULL,
      "started_at" timestamp(3) with time zone NOT NULL,
      "completed_at" timestamp(3) with time zone,
      "failure_code" varchar,
      "receipt_envelope" jsonb NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    ALTER TABLE "hermes_owner_receipts" ADD COLUMN IF NOT EXISTS "workspace_id" varchar;

    CREATE UNIQUE INDEX IF NOT EXISTS "hermes_owner_receipts_idempotency_key_idx"
      ON "hermes_owner_receipts" USING btree ("idempotency_key");
    CREATE INDEX IF NOT EXISTS "hermes_owner_receipts_operator_id_idx"
      ON "hermes_owner_receipts" USING btree ("operator_id");
    CREATE INDEX IF NOT EXISTS "hermes_owner_receipts_workspace_id_idx"
      ON "hermes_owner_receipts" USING btree ("workspace_id");
    CREATE INDEX IF NOT EXISTS "hermes_owner_receipts_status_idx"
      ON "hermes_owner_receipts" USING btree ("status");
    CREATE INDEX IF NOT EXISTS "hermes_owner_receipts_started_at_idx"
      ON "hermes_owner_receipts" USING btree ("started_at");
    CREATE INDEX IF NOT EXISTS "hermes_owner_receipts_updated_at_idx"
      ON "hermes_owner_receipts" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "hermes_owner_receipts_created_at_idx"
      ON "hermes_owner_receipts" USING btree ("created_at");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "hermes_owner_receipts_id" integer;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_hermes_owner_receipts_id_idx"
      ON "payload_locked_documents_rels" USING btree ("hermes_owner_receipts_id");
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_hermes_owner_receipts_fk"
        FOREIGN KEY ("hermes_owner_receipts_id") REFERENCES "public"."hermes_owner_receipts"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

// Owner-command receipts are accountability evidence; rollback never erases them.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db;
}
