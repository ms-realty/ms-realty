import { sql, type MigrateDownArgs, type MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "provider_delivery_receipts" (
      "id" serial PRIMARY KEY NOT NULL,
      "idempotency_key" varchar NOT NULL,
      "lead_id" varchar,
      "provider" varchar NOT NULL,
      "status" varchar NOT NULL,
      "approved_by" varchar NOT NULL,
      "approved_at" timestamp(3) with time zone NOT NULL,
      "started_at" timestamp(3) with time zone NOT NULL,
      "completed_at" timestamp(3) with time zone,
      "external_message_id" varchar,
      "failure_code" varchar,
      "delivery_envelope" jsonb NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "provider_delivery_receipts_idempotency_key_idx"
      ON "provider_delivery_receipts" USING btree ("idempotency_key");
    CREATE INDEX IF NOT EXISTS "provider_delivery_receipts_lead_id_idx"
      ON "provider_delivery_receipts" USING btree ("lead_id");
    CREATE INDEX IF NOT EXISTS "provider_delivery_receipts_provider_idx"
      ON "provider_delivery_receipts" USING btree ("provider");
    CREATE INDEX IF NOT EXISTS "provider_delivery_receipts_status_idx"
      ON "provider_delivery_receipts" USING btree ("status");
    CREATE INDEX IF NOT EXISTS "provider_delivery_receipts_approved_at_idx"
      ON "provider_delivery_receipts" USING btree ("approved_at");
    CREATE INDEX IF NOT EXISTS "provider_delivery_receipts_started_at_idx"
      ON "provider_delivery_receipts" USING btree ("started_at");
    CREATE INDEX IF NOT EXISTS "provider_delivery_receipts_external_message_id_idx"
      ON "provider_delivery_receipts" USING btree ("external_message_id");
    CREATE INDEX IF NOT EXISTS "provider_delivery_receipts_updated_at_idx"
      ON "provider_delivery_receipts" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "provider_delivery_receipts_created_at_idx"
      ON "provider_delivery_receipts" USING btree ("created_at");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "provider_delivery_receipts_id" integer;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_provider_delivery_receipts_id_idx"
      ON "payload_locked_documents_rels" USING btree ("provider_delivery_receipts_id");
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_provider_delivery_receipts_fk"
        FOREIGN KEY ("provider_delivery_receipts_id") REFERENCES "public"."provider_delivery_receipts"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

// Delivery receipts are an audit fence. Rollback must not erase evidence that
// a provider may already have accepted an outbound message.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db;
}
