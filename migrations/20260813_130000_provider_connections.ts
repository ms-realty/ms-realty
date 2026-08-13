import { sql, type MigrateDownArgs, type MigrateUpArgs } from "@payloadcms/db-postgres";

// Provider credentials are always an AES-256-GCM envelope. The searchable
// columns contain only operational status and the provider's own account ids.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "provider_connections" (
      "id" serial PRIMARY KEY NOT NULL,
      "provider" varchar NOT NULL,
      "status" varchar NOT NULL,
      "connected_by" varchar NOT NULL,
      "account_label" varchar,
      "external_account_id" varchar,
      "scopes" jsonb DEFAULT '[]'::jsonb,
      "metadata" jsonb DEFAULT '{}'::jsonb,
      "credential_envelope" jsonb NOT NULL,
      "last_verified_at" timestamp(3) with time zone NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "provider_connections_provider_idx"
      ON "provider_connections" USING btree ("provider");
    CREATE INDEX IF NOT EXISTS "provider_connections_status_idx"
      ON "provider_connections" USING btree ("status");
    CREATE INDEX IF NOT EXISTS "provider_connections_last_verified_at_idx"
      ON "provider_connections" USING btree ("last_verified_at");
    CREATE INDEX IF NOT EXISTS "provider_connections_updated_at_idx"
      ON "provider_connections" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "provider_connections_created_at_idx"
      ON "provider_connections" USING btree ("created_at");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "provider_connections_id" integer;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_provider_connections_id_idx"
      ON "payload_locked_documents_rels" USING btree ("provider_connections_id");
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_provider_connections_fk"
        FOREIGN KEY ("provider_connections_id") REFERENCES "public"."provider_connections"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

// Connections must be explicitly revoked at the provider before removal.
// An application rollback therefore preserves encrypted credentials and status.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db;
}
