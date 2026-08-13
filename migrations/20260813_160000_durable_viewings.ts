import { sql, type MigrateDownArgs, type MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "viewings" (
      "id" serial PRIMARY KEY NOT NULL,
      "viewing_id" varchar NOT NULL,
      "semantic_hash" varchar NOT NULL,
      "lead_id" varchar NOT NULL,
      "listing_reference" varchar,
      "original_language" varchar NOT NULL,
      "admin_locale" varchar NOT NULL,
      "broker" varchar NOT NULL,
      "starts_at" timestamp(3) with time zone NOT NULL,
      "booked_at" timestamp(3) with time zone NOT NULL,
      "channel" varchar NOT NULL,
      "status" varchar NOT NULL,
      "follow_up_task_id" varchar NOT NULL,
      "follow_up_owner" varchar NOT NULL,
      "follow_up_status" varchar NOT NULL,
      "follow_up_due_at" timestamp(3) with time zone NOT NULL,
      "feedback_request_id" varchar NOT NULL,
      "feedback_owner" varchar NOT NULL,
      "feedback_status" varchar NOT NULL,
      "feedback_due_at" timestamp(3) with time zone NOT NULL,
      "feedback_channel" varchar NOT NULL,
      "calendar_status" varchar DEFAULT 'pending' NOT NULL,
      "calendar_event_id" varchar,
      "calendar_synced_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "viewings_viewing_id_idx" ON "viewings" USING btree ("viewing_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "viewings_semantic_hash_idx" ON "viewings" USING btree ("semantic_hash");
    CREATE INDEX IF NOT EXISTS "viewings_lead_id_idx" ON "viewings" USING btree ("lead_id");
    CREATE INDEX IF NOT EXISTS "viewings_starts_at_idx" ON "viewings" USING btree ("starts_at");
    CREATE INDEX IF NOT EXISTS "viewings_calendar_status_idx" ON "viewings" USING btree ("calendar_status");
    CREATE INDEX IF NOT EXISTS "viewings_calendar_event_id_idx" ON "viewings" USING btree ("calendar_event_id");
    CREATE INDEX IF NOT EXISTS "viewings_updated_at_idx" ON "viewings" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "viewings_created_at_idx" ON "viewings" USING btree ("created_at");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "viewings_id" integer;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_viewings_id_idx"
      ON "payload_locked_documents_rels" USING btree ("viewings_id");
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_viewings_fk"
        FOREIGN KEY ("viewings_id") REFERENCES "public"."viewings"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

// Viewings are append-only operational records. An older build can ignore the
// table, so rollback must not destroy bookings already accepted by production.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db;
}
