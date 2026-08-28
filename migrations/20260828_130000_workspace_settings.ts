import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "workspace_settings" (
      "id" serial PRIMARY KEY NOT NULL,
      "workspace_id" varchar NOT NULL,
      "version" numeric DEFAULT 1 NOT NULL,
      "revision" numeric DEFAULT 0 NOT NULL,
      "updated_by" varchar,
      "sections" jsonb NOT NULL,
      "section_updates" jsonb NOT NULL,
      "revisions" jsonb NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "workspace_settings_workspace_id_idx"
      ON "workspace_settings" USING btree ("workspace_id");
    CREATE INDEX IF NOT EXISTS "workspace_settings_revision_idx"
      ON "workspace_settings" USING btree ("revision");
    CREATE INDEX IF NOT EXISTS "workspace_settings_updated_by_idx"
      ON "workspace_settings" USING btree ("updated_by");
    CREATE INDEX IF NOT EXISTS "workspace_settings_updated_at_idx"
      ON "workspace_settings" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "workspace_settings_created_at_idx"
      ON "workspace_settings" USING btree ("created_at");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "workspace_settings_id" integer;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_workspace_settings_id_idx"
      ON "payload_locked_documents_rels" USING btree ("workspace_settings_id");
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_workspace_settings_fk"
        FOREIGN KEY ("workspace_settings_id") REFERENCES "public"."workspace_settings"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

// Workspace settings are durable authority state. Rollback does not erase them.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db;
}
