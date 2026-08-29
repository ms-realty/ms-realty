import { sql, type MigrateDownArgs, type MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "social_marketing_publications" (
      "id" serial PRIMARY KEY NOT NULL,
      "idempotency_key" varchar NOT NULL,
      "workspace_id" varchar NOT NULL,
      "provider" varchar NOT NULL,
      "status" varchar NOT NULL,
      "approved_by" varchar NOT NULL,
      "approved_at" timestamp(3) with time zone NOT NULL,
      "started_at" timestamp(3) with time zone NOT NULL,
      "completed_at" timestamp(3) with time zone,
      "external_post_id" varchar,
      "external_account_id" varchar,
      "failure_code" varchar,
      "publication_envelope" jsonb NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "social_marketing_publications_idempotency_key_idx"
      ON "social_marketing_publications" USING btree ("idempotency_key");
    CREATE INDEX IF NOT EXISTS "social_marketing_publications_workspace_id_idx"
      ON "social_marketing_publications" USING btree ("workspace_id");
    CREATE INDEX IF NOT EXISTS "social_marketing_publications_provider_idx"
      ON "social_marketing_publications" USING btree ("provider");
    CREATE INDEX IF NOT EXISTS "social_marketing_publications_status_idx"
      ON "social_marketing_publications" USING btree ("status");
    CREATE INDEX IF NOT EXISTS "social_marketing_publications_approved_at_idx"
      ON "social_marketing_publications" USING btree ("approved_at");
    CREATE INDEX IF NOT EXISTS "social_marketing_publications_started_at_idx"
      ON "social_marketing_publications" USING btree ("started_at");
    CREATE INDEX IF NOT EXISTS "social_marketing_publications_external_post_id_idx"
      ON "social_marketing_publications" USING btree ("external_post_id");
    CREATE INDEX IF NOT EXISTS "social_marketing_publications_external_account_id_idx"
      ON "social_marketing_publications" USING btree ("external_account_id");
    CREATE INDEX IF NOT EXISTS "social_marketing_publications_updated_at_idx"
      ON "social_marketing_publications" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "social_marketing_publications_created_at_idx"
      ON "social_marketing_publications" USING btree ("created_at");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "social_marketing_publications_id" integer;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_social_marketing_publications_id_idx"
      ON "payload_locked_documents_rels" USING btree ("social_marketing_publications_id");
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_social_marketing_publications_fk"
        FOREIGN KEY ("social_marketing_publications_id") REFERENCES "public"."social_marketing_publications"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

// Publication receipts are an audit fence. Rollback must not erase evidence
// that Meta may already have accepted a post.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db;
}
