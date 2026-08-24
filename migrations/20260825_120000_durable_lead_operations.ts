import { sql, type MigrateDownArgs, type MigrateUpArgs } from "@payloadcms/db-postgres";

// One append-only table for every admin lead operation, discriminated by
// `operation`. The ledger row itself lives in `row`; the scalar columns exist
// so the store can scope a read to one workspace and one operation without
// parsing JSON, and so a retry collapses on `operation_key` instead of
// appending a second record.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lead_operations" (
      "id" serial PRIMARY KEY NOT NULL,
      "operation_key" varchar NOT NULL,
      "workspace_id" varchar NOT NULL,
      "operation" varchar NOT NULL,
      "operation_id" varchar NOT NULL,
      "lead_id" varchar,
      "actor" varchar,
      "recorded_at" timestamp(3) with time zone NOT NULL,
      "row" jsonb NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "lead_operations_operation_key_idx"
      ON "lead_operations" USING btree ("operation_key");
    CREATE INDEX IF NOT EXISTS "lead_operations_workspace_id_idx" ON "lead_operations" USING btree ("workspace_id");
    CREATE INDEX IF NOT EXISTS "lead_operations_operation_idx" ON "lead_operations" USING btree ("operation");
    CREATE INDEX IF NOT EXISTS "lead_operations_operation_id_idx" ON "lead_operations" USING btree ("operation_id");
    CREATE INDEX IF NOT EXISTS "lead_operations_lead_id_idx" ON "lead_operations" USING btree ("lead_id");
    CREATE INDEX IF NOT EXISTS "lead_operations_recorded_at_idx" ON "lead_operations" USING btree ("recorded_at");
    -- The inbox always reads one workspace and one operation, in append order.
    CREATE INDEX IF NOT EXISTS "lead_operations_workspace_operation_idx"
      ON "lead_operations" USING btree ("workspace_id", "operation", "id");
    CREATE INDEX IF NOT EXISTS "lead_operations_updated_at_idx" ON "lead_operations" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "lead_operations_created_at_idx" ON "lead_operations" USING btree ("created_at");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "lead_operations_id" integer;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_lead_operations_id_idx"
      ON "payload_locked_documents_rels" USING btree ("lead_operations_id");
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_lead_operations_fk"
        FOREIGN KEY ("lead_operations_id") REFERENCES "public"."lead_operations"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

// Lead operations are append-only operational records. An older build simply
// ignores the table, so a rollback must not destroy snoozes, assignments,
// outcomes or closed deals that production has already accepted.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db;
}
