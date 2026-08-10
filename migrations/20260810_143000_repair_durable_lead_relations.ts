import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

// Payload's document-lock relation is polymorphic across every collection.
// The durable-lead migration created the collections but omitted these two
// relation columns, so unrelated Payload updates fail when lock state is read.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "public_leads_id" integer;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "lead_contacts_id" integer;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_public_leads_fk" FOREIGN KEY ("public_leads_id") REFERENCES "public"."public_leads"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_lead_contacts_fk" FOREIGN KEY ("lead_contacts_id") REFERENCES "public"."lead_contacts"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX "payload_locked_documents_rels_public_leads_id_idx" ON "payload_locked_documents_rels" USING btree ("public_leads_id");
    CREATE INDEX "payload_locked_documents_rels_lead_contacts_id_idx" ON "payload_locked_documents_rels" USING btree ("lead_contacts_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_public_leads_fk";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_lead_contacts_fk";
    DROP INDEX "payload_locked_documents_rels_public_leads_id_idx";
    DROP INDEX "payload_locked_documents_rels_lead_contacts_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "public_leads_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "lead_contacts_id";
  `)
}
