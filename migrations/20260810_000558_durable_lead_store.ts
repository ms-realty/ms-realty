import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Only three objects are genuinely new: admins_texts (the workspace_ids
// hasMany field added with Payload RBAC) plus the two durable lead-intake
// collections. `payload migrate:create` regenerated far more than that because
// the newest schema snapshot predates four hand-written migrations, so it
// re-emitted tables that already exist in production. Verified against the
// live database before trimming: the other seven tables are present.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE "admins_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  CREATE TABLE "public_leads" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"lead_id" varchar NOT NULL,
  	"idempotency_key" varchar,
  	"received_at" timestamp(3) with time zone NOT NULL,
  	"source" varchar NOT NULL,
  	"intent" varchar,
  	"lead_type" varchar NOT NULL,
  	"listing_reference" varchar,
  	"original_language" varchar NOT NULL,
  	"admin_locale" varchar NOT NULL,
  	"contact_preference" varchar,
  	"assigned_broker" varchar,
  	"assignment_method" varchar,
  	"contact_fingerprint" varchar,
  	"duplicate_status" varchar,
  	"possible_duplicate_of" varchar,
  	"sla_due_at" timestamp(3) with time zone,
  	"manager_escalation_due_at" timestamp(3) with time zone,
  	"ledger_row" jsonb NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE "lead_contacts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"subject_type" varchar NOT NULL,
  	"subject_id" varchar NOT NULL,
  	"stored_at" timestamp(3) with time zone NOT NULL,
  	"algorithm" varchar NOT NULL,
  	"iv" varchar NOT NULL,
  	"auth_tag" varchar NOT NULL,
  	"ciphertext" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  ALTER TABLE "admins_texts" ADD CONSTRAINT "admins_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "admins_texts_order_parent" ON "admins_texts" USING btree ("order","parent_id");
  CREATE UNIQUE INDEX "public_leads_lead_id_idx" ON "public_leads" USING btree ("lead_id");
  CREATE INDEX "public_leads_idempotency_key_idx" ON "public_leads" USING btree ("idempotency_key");
  CREATE INDEX "public_leads_contact_fingerprint_idx" ON "public_leads" USING btree ("contact_fingerprint");
  CREATE INDEX "public_leads_updated_at_idx" ON "public_leads" USING btree ("updated_at");
  CREATE INDEX "public_leads_created_at_idx" ON "public_leads" USING btree ("created_at");
  CREATE INDEX "lead_contacts_subject_id_idx" ON "lead_contacts" USING btree ("subject_id");
  CREATE INDEX "lead_contacts_updated_at_idx" ON "lead_contacts" USING btree ("updated_at");
  CREATE INDEX "lead_contacts_created_at_idx" ON "lead_contacts" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP TABLE "admins_texts" CASCADE;
  DROP TABLE "lead_contacts" CASCADE;
  DROP TABLE "public_leads" CASCADE;`)
}
