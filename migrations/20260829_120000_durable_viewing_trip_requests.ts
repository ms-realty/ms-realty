import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "viewing_trip_requests" (
      "id" serial PRIMARY KEY NOT NULL,
      "workspace_id" varchar NOT NULL,
      "request_id" varchar NOT NULL,
      "idempotency_key" varchar,
      "semantic_hash" varchar NOT NULL,
      "requested_at" timestamp(3) with time zone NOT NULL,
      "arrival_date" timestamp(3) with time zone NOT NULL,
      "departure_date" timestamp(3) with time zone NOT NULL,
      "requested_locale" varchar NOT NULL,
      "locale" varchar NOT NULL,
      "status" varchar NOT NULL,
      "confirmation" varchar NOT NULL,
      "contact_ref" varchar NOT NULL,
      "contact_preference" varchar NOT NULL,
      "request_row" jsonb NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "viewing_trip_requests_request_id_idx"
      ON "viewing_trip_requests" USING btree ("request_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "viewing_trip_requests_workspace_id_idempotency_key_idx"
      ON "viewing_trip_requests" USING btree ("workspace_id", "idempotency_key")
      WHERE "idempotency_key" IS NOT NULL;
    CREATE INDEX IF NOT EXISTS "viewing_trip_requests_semantic_hash_idx"
      ON "viewing_trip_requests" USING btree ("semantic_hash");
    CREATE INDEX IF NOT EXISTS "viewing_trip_requests_workspace_id_idx"
      ON "viewing_trip_requests" USING btree ("workspace_id");
    CREATE INDEX IF NOT EXISTS "viewing_trip_requests_requested_at_idx"
      ON "viewing_trip_requests" USING btree ("requested_at");
    CREATE INDEX IF NOT EXISTS "viewing_trip_requests_arrival_date_idx"
      ON "viewing_trip_requests" USING btree ("arrival_date");
    CREATE INDEX IF NOT EXISTS "viewing_trip_requests_status_idx"
      ON "viewing_trip_requests" USING btree ("status");
    CREATE INDEX IF NOT EXISTS "viewing_trip_requests_created_at_idx"
      ON "viewing_trip_requests" USING btree ("created_at");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "viewing_trip_requests_id" integer;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_viewing_trip_requests_id_idx"
      ON "payload_locked_documents_rels" USING btree ("viewing_trip_requests_id");
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_viewing_trip_requests_fk"
        FOREIGN KEY ("viewing_trip_requests_id") REFERENCES "public"."viewing_trip_requests"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

// Viewing trip requests are append-only request authority. Rollback keeps the
// accepted records instead of trying to delete live customer intent.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db;
}
