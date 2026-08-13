import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

// Consent and seller-pipeline creation are part of accepting a public lead,
// so they must live in Postgres beside the lead instead of on ephemeral disk.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "public_leads" ADD COLUMN "workspace_id" varchar;
    ALTER TABLE "lead_contacts" ADD COLUMN "workspace_id" varchar;

    DROP INDEX "public_leads_idempotency_key_idx";

    CREATE TABLE "consent_events" (
      "id" serial PRIMARY KEY NOT NULL,
      "event_id" varchar NOT NULL,
      "workspace_id" varchar NOT NULL,
      "lead_id" varchar NOT NULL,
      "recorded_at" timestamp(3) with time zone NOT NULL,
      "payload" jsonb NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE "seller_pipeline_events" (
      "id" serial PRIMARY KEY NOT NULL,
      "event_id" varchar NOT NULL,
      "workspace_id" varchar NOT NULL,
      "lead_id" varchar NOT NULL,
      "recorded_at" timestamp(3) with time zone NOT NULL,
      "payload" jsonb NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "consent_events_id" integer;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "seller_pipeline_events_id" integer;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_consent_events_fk" FOREIGN KEY ("consent_events_id") REFERENCES "public"."consent_events"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_seller_pipeline_events_fk" FOREIGN KEY ("seller_pipeline_events_id") REFERENCES "public"."seller_pipeline_events"("id") ON DELETE cascade ON UPDATE no action;

    CREATE INDEX "public_leads_workspace_id_idx" ON "public_leads" USING btree ("workspace_id");
    CREATE UNIQUE INDEX "public_leads_workspace_id_idempotency_key_idx" ON "public_leads" USING btree ("workspace_id", "idempotency_key");
    CREATE INDEX "lead_contacts_workspace_id_idx" ON "lead_contacts" USING btree ("workspace_id");
    CREATE UNIQUE INDEX "consent_events_event_id_idx" ON "consent_events" USING btree ("event_id");
    CREATE INDEX "consent_events_workspace_id_idx" ON "consent_events" USING btree ("workspace_id");
    CREATE INDEX "consent_events_lead_id_idx" ON "consent_events" USING btree ("lead_id");
    CREATE INDEX "consent_events_updated_at_idx" ON "consent_events" USING btree ("updated_at");
    CREATE INDEX "consent_events_created_at_idx" ON "consent_events" USING btree ("created_at");
    CREATE UNIQUE INDEX "seller_pipeline_events_event_id_idx" ON "seller_pipeline_events" USING btree ("event_id");
    CREATE INDEX "seller_pipeline_events_workspace_id_idx" ON "seller_pipeline_events" USING btree ("workspace_id");
    CREATE INDEX "seller_pipeline_events_lead_id_idx" ON "seller_pipeline_events" USING btree ("lead_id");
    CREATE INDEX "seller_pipeline_events_updated_at_idx" ON "seller_pipeline_events" USING btree ("updated_at");
    CREATE INDEX "seller_pipeline_events_created_at_idx" ON "seller_pipeline_events" USING btree ("created_at");
    CREATE INDEX "payload_locked_documents_rels_consent_events_id_idx" ON "payload_locked_documents_rels" USING btree ("consent_events_id");
    CREATE INDEX "payload_locked_documents_rels_seller_pipeline_events_id_idx" ON "payload_locked_documents_rels" USING btree ("seller_pipeline_events_id");
  `)

  const workspaceId = String(process.env.MS_REALTY_WORKSPACE_ID || '').trim()
  if (workspaceId) {
    await db.execute(sql`UPDATE "public_leads" SET "workspace_id" = ${workspaceId} WHERE "workspace_id" IS NULL`)
    await db.execute(sql`UPDATE "lead_contacts" SET "workspace_id" = ${workspaceId} WHERE "workspace_id" IS NULL`)
  }

  // Empty installations need no backfill. Installations with durable rows must
  // provide the configured workspace explicitly; silently inventing one would
  // destroy the tenant boundary this migration establishes.
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM "public_leads" WHERE "workspace_id" IS NULL) OR
         EXISTS (SELECT 1 FROM "lead_contacts" WHERE "workspace_id" IS NULL) THEN
        RAISE EXCEPTION 'MS_REALTY_WORKSPACE_ID is required to backfill durable lead rows';
      END IF;
    END $$;
    ALTER TABLE "public_leads" ALTER COLUMN "workspace_id" SET NOT NULL;
    ALTER TABLE "lead_contacts" ALTER COLUMN "workspace_id" SET NOT NULL;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_consent_events_fk";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_seller_pipeline_events_fk";
    DROP INDEX "payload_locked_documents_rels_consent_events_id_idx";
    DROP INDEX "payload_locked_documents_rels_seller_pipeline_events_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "consent_events_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "seller_pipeline_events_id";
    DROP TABLE "seller_pipeline_events";
    DROP TABLE "consent_events";

    DROP INDEX "public_leads_workspace_id_idempotency_key_idx";
    DROP INDEX "public_leads_workspace_id_idx";
    DROP INDEX "lead_contacts_workspace_id_idx";
    ALTER TABLE "public_leads" DROP COLUMN "workspace_id";
    ALTER TABLE "lead_contacts" DROP COLUMN "workspace_id";
    CREATE INDEX "public_leads_idempotency_key_idx" ON "public_leads" USING btree ("idempotency_key");
  `)
}
