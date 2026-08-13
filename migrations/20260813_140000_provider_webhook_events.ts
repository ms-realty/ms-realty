import { sql, type MigrateDownArgs, type MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "provider_webhook_events" (
      "id" serial PRIMARY KEY NOT NULL,
      "event_id" varchar NOT NULL,
      "provider" varchar NOT NULL,
      "event_type" varchar NOT NULL,
      "external_event_id" varchar,
      "account_id" varchar,
      "received_at" timestamp(3) with time zone NOT NULL,
      "payload_envelope" jsonb NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "provider_webhook_events_event_id_idx"
      ON "provider_webhook_events" USING btree ("event_id");
    CREATE INDEX IF NOT EXISTS "provider_webhook_events_provider_idx"
      ON "provider_webhook_events" USING btree ("provider");
    CREATE INDEX IF NOT EXISTS "provider_webhook_events_event_type_idx"
      ON "provider_webhook_events" USING btree ("event_type");
    CREATE INDEX IF NOT EXISTS "provider_webhook_events_external_event_id_idx"
      ON "provider_webhook_events" USING btree ("external_event_id");
    CREATE INDEX IF NOT EXISTS "provider_webhook_events_received_at_idx"
      ON "provider_webhook_events" USING btree ("received_at");
    CREATE INDEX IF NOT EXISTS "provider_webhook_events_updated_at_idx"
      ON "provider_webhook_events" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "provider_webhook_events_created_at_idx"
      ON "provider_webhook_events" USING btree ("created_at");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "provider_webhook_events_id" integer;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_provider_webhook_events_id_idx"
      ON "payload_locked_documents_rels" USING btree ("provider_webhook_events_id");
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_provider_webhook_events_fk"
        FOREIGN KEY ("provider_webhook_events_id") REFERENCES "public"."provider_webhook_events"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db;
}
