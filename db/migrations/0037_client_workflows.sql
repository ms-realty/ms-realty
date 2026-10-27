CREATE TABLE "appointment_participant_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"appointment_version" integer NOT NULL,
	"participant_id" uuid NOT NULL,
	"principal_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"note" text,
	"operation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_response_decision" CHECK ("appointment_participant_responses"."decision" in ('accept','decline','alternative')),
	CONSTRAINT "appointment_response_slot" CHECK ("appointment_participant_responses"."ends_at" > "appointment_participant_responses"."starts_at"),
	CONSTRAINT "appointment_response_note" CHECK ("appointment_participant_responses"."decision" = 'accept' or ("appointment_participant_responses"."note" is not null and length(trim("appointment_participant_responses"."note")) >= 3))
);
--> statement-breakpoint
CREATE TABLE "personal_saved_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"principal_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_selection_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nonce_hash" text NOT NULL,
	"creator_session_hash" text NOT NULL,
	"source_origin" text NOT NULL,
	"target_origin" text NOT NULL,
	"target_path" text NOT NULL,
	"listing_references" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"consumed_by_id" uuid,
	"operation_id" uuid,
	CONSTRAINT "saved_selection_transfers_nonce_hash_unique" UNIQUE("nonce_hash"),
	CONSTRAINT "saved_transfer_bounds" CHECK (cardinality("saved_selection_transfers"."listing_references") between 1 and 100 and "saved_selection_transfers"."expires_at" > "saved_selection_transfers"."created_at"),
	CONSTRAINT "saved_transfer_consumed" CHECK (("saved_selection_transfers"."consumed_at" is null and "saved_selection_transfers"."consumed_by_id" is null and "saved_selection_transfers"."operation_id" is null) or ("saved_selection_transfers"."consumed_at" is not null and "saved_selection_transfers"."consumed_by_id" is not null and "saved_selection_transfers"."operation_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "inquiry_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"staging_key" text NOT NULL,
	"sealed_key" text NOT NULL,
	"sha256" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"state" text DEFAULT 'reserved' NOT NULL,
	"scan" "scan_state" DEFAULT 'pending' NOT NULL,
	"scanned_at" timestamp with time zone,
	"scanner_version" text,
	"scanned_sha256" text,
	"erased_at" timestamp with time zone,
	CONSTRAINT "inquiry_attachments_staging_key_unique" UNIQUE("staging_key"),
	CONSTRAINT "inquiry_attachments_sealed_key_unique" UNIQUE("sealed_key"),
	CONSTRAINT "inquiry_attachments_state" CHECK ("inquiry_attachments"."state" in ('reserved','sealed','erased')),
	CONSTRAINT "inquiry_attachments_digest" CHECK ("inquiry_attachments"."sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "inquiry_attachments_image" CHECK ("inquiry_attachments"."content_type" in ('image/jpeg','image/png','image/webp','image/avif','image/gif')),
	CONSTRAINT "inquiry_attachments_bounds" CHECK ("inquiry_attachments"."byte_size" > 0 and "inquiry_attachments"."byte_size" <= 8388608 and "inquiry_attachments"."width" > 0 and "inquiry_attachments"."height" > 0),
	CONSTRAINT "inquiry_attachments_clean_binding" CHECK ("inquiry_attachments"."scan" <> 'clean' or ("inquiry_attachments"."state" = 'sealed' and "inquiry_attachments"."scanned_at" is not null and "inquiry_attachments"."scanner_version" is not null and "inquiry_attachments"."scanned_sha256" = "inquiry_attachments"."sha256")),
	CONSTRAINT "inquiry_attachments_erasure" CHECK (("inquiry_attachments"."state" = 'erased') = ("inquiry_attachments"."erased_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "proposed_version" integer;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "proposed_buffer_minutes" integer;--> statement-breakpoint
ALTER TABLE "appointment_participant_responses" ADD CONSTRAINT "appointment_participant_responses_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_participant_responses" ADD CONSTRAINT "appointment_participant_responses_participant_id_appointment_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."appointment_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_participant_responses" ADD CONSTRAINT "appointment_participant_responses_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_participant_responses" ADD CONSTRAINT "appointment_participant_responses_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_participant_responses" ADD CONSTRAINT "appointment_response_version_fk" FOREIGN KEY ("appointment_id","appointment_version") REFERENCES "public"."appointment_versions"("appointment_id","version_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_saved_listings" ADD CONSTRAINT "personal_saved_listings_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_saved_listings" ADD CONSTRAINT "personal_saved_listings_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_selection_transfers" ADD CONSTRAINT "saved_selection_transfers_consumed_by_id_principals_id_fk" FOREIGN KEY ("consumed_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_selection_transfers" ADD CONSTRAINT "saved_selection_transfers_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_attachments" ADD CONSTRAINT "inquiry_attachments_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_response_participant_version_idx" ON "appointment_participant_responses" USING btree ("appointment_id","appointment_version","participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_response_operation_idx" ON "appointment_participant_responses" USING btree ("operation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "personal_saved_principal_listing_idx" ON "personal_saved_listings" USING btree ("principal_id","listing_id");--> statement-breakpoint
CREATE INDEX "saved_transfer_creator_idx" ON "saved_selection_transfers" USING btree ("creator_session_hash","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inquiry_attachments_operation_idx" ON "inquiry_attachments" USING btree ("inquiry_id","operation_id");--> statement-breakpoint
CREATE INDEX "inquiry_attachments_inquiry_idx" ON "inquiry_attachments" USING btree ("inquiry_id");