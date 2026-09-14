import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "site_pages" (
      "id" serial PRIMARY KEY NOT NULL,
      "page_key" varchar NOT NULL,
      "version" numeric NOT NULL,
      "drafts" jsonb NOT NULL,
      "published" jsonb NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "site_pages_page_key_idx" ON "site_pages" USING btree ("page_key");
    CREATE INDEX IF NOT EXISTS "site_pages_updated_at_idx" ON "site_pages" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "site_pages_created_at_idx" ON "site_pages" USING btree ("created_at");

    CREATE TABLE IF NOT EXISTS "site_page_revisions" (
      "id" serial PRIMARY KEY NOT NULL,
      "revision_id" varchar NOT NULL,
      "page_key" varchar NOT NULL,
      "locale" varchar NOT NULL,
      "source_revision_id" varchar,
      "status" varchar NOT NULL,
      "content_hash" varchar NOT NULL,
      "content" jsonb NOT NULL,
      "created_by" varchar NOT NULL,
      "submitted_by" varchar,
      "submitted_at" timestamp(3) with time zone,
      "approval" jsonb,
      "publication" jsonb,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "site_page_revisions_revision_id_idx" ON "site_page_revisions" USING btree ("revision_id");
    CREATE INDEX IF NOT EXISTS "site_page_revisions_page_key_idx" ON "site_page_revisions" USING btree ("page_key");
    CREATE INDEX IF NOT EXISTS "site_page_revisions_updated_at_idx" ON "site_page_revisions" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "site_page_revisions_created_at_idx" ON "site_page_revisions" USING btree ("created_at");
  `);
}

// Previous copy and its review/publication receipts survive application rollback.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db;
}
