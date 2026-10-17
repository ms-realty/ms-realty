CREATE TABLE "inbound_attachment_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"inbound_email_id" uuid NOT NULL,
	"attachment_id" uuid NOT NULL,
	"source_digest" text NOT NULL,
	"case_id" uuid NOT NULL,
	"sender_party_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"sha256" text NOT NULL,
	"imported_by_id" uuid NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "inbound_attachment_digest" CHECK ("inbound_attachment_imports"."sha256" ~ '^[a-f0-9]{64}$' and "inbound_attachment_imports"."source_digest" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "inbound_attachment_imports" ADD CONSTRAINT "inbound_attachment_imports_inbound_email_id_inbound_emails_id_fk" FOREIGN KEY ("inbound_email_id") REFERENCES "public"."inbound_emails"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_attachment_imports" ADD CONSTRAINT "inbound_attachment_imports_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_attachment_imports" ADD CONSTRAINT "inbound_attachment_imports_sender_party_id_parties_id_fk" FOREIGN KEY ("sender_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_attachment_imports" ADD CONSTRAINT "inbound_attachment_imports_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_attachment_imports" ADD CONSTRAINT "inbound_attachment_imports_imported_by_id_principals_id_fk" FOREIGN KEY ("imported_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_attachment_source_idx" ON "inbound_attachment_imports" USING btree ("inbound_email_id","attachment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_attachment_version_idx" ON "inbound_attachment_imports" USING btree ("document_version_id");
--> statement-breakpoint
CREATE TRIGGER inbound_attachment_imports_immutable BEFORE UPDATE OR DELETE ON inbound_attachment_imports
  FOR EACH ROW EXECUTE FUNCTION reject_modification();
