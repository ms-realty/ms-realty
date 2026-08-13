import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

// Privacy-safe aggregate events only: no contact fields, message bodies,
// cookies, visitor ids, or cross-visit identifiers enter this table.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "funnel_events" (
      "id" serial PRIMARY KEY NOT NULL,
      "event_id" varchar NOT NULL,
      "recorded_at" timestamp(3) with time zone NOT NULL,
      "type" varchar NOT NULL,
      "path" varchar NOT NULL,
      "locale" varchar NOT NULL,
      "listing_reference" varchar,
      "action" varchar,
      "query" varchar,
      "filters" jsonb DEFAULT '{}'::jsonb,
      "sort" varchar,
      "page" numeric,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "funnel_events_event_id_idx" ON "funnel_events" USING btree ("event_id");
    CREATE INDEX IF NOT EXISTS "funnel_events_recorded_at_idx" ON "funnel_events" USING btree ("recorded_at");
    CREATE INDEX IF NOT EXISTS "funnel_events_type_idx" ON "funnel_events" USING btree ("type");
    CREATE INDEX IF NOT EXISTS "funnel_events_updated_at_idx" ON "funnel_events" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "funnel_events_created_at_idx" ON "funnel_events" USING btree ("created_at");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "funnel_events_id" integer;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_funnel_events_id_idx"
      ON "payload_locked_documents_rels" USING btree ("funnel_events_id");
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_funnel_events_fk"
        FOREIGN KEY ("funnel_events_id") REFERENCES "public"."funnel_events"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `)
}

// Funnel evidence is append-only operational history. Older builds ignore the
// additive table, so rollback must not destroy measurements already collected.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db
}
