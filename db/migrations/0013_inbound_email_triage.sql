CREATE TABLE "inbound_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider" text NOT NULL,
	"provider_email_id" uuid NOT NULL,
	"inbox_event_id" uuid NOT NULL,
	"source_digest" text NOT NULL,
	"sender" text NOT NULL,
	"sender_address" text,
	"recipients" jsonb NOT NULL,
	"subject" text NOT NULL,
	"body" text,
	"html_omitted" boolean NOT NULL,
	"attachments" jsonb NOT NULL,
	"authentication" jsonb NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'triage' NOT NULL,
	"originating_message_id" uuid,
	"suggested_case_id" uuid,
	"case_id" uuid,
	"sender_party_id" uuid,
	"message_id" uuid,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	CONSTRAINT "inbound_email_known_state" CHECK ("inbound_emails"."state" in ('triage','assigned','rejected')),
	CONSTRAINT "inbound_email_decided" CHECK ("inbound_emails"."state" = 'triage' or ("inbound_emails"."decided_by_id" is not null and "inbound_emails"."decided_at" is not null and "inbound_emails"."decision_note" is not null)),
	CONSTRAINT "inbound_email_assigned" CHECK ("inbound_emails"."state" <> 'assigned' or ("inbound_emails"."case_id" is not null and "inbound_emails"."sender_party_id" is not null and "inbound_emails"."message_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_inbox_event_id_inbox_events_id_fk" FOREIGN KEY ("inbox_event_id") REFERENCES "public"."inbox_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_originating_message_id_messages_id_fk" FOREIGN KEY ("originating_message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_suggested_case_id_cases_id_fk" FOREIGN KEY ("suggested_case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_sender_party_id_parties_id_fk" FOREIGN KEY ("sender_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_decided_by_id_principals_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_email_provider_idx" ON "inbound_emails" USING btree ("provider","provider_email_id");--> statement-breakpoint
CREATE INDEX "inbound_email_state_idx" ON "inbound_emails" USING btree ("state","received_at");--> statement-breakpoint
CREATE INDEX "inbound_email_case_idx" ON "inbound_emails" USING btree ("case_id","received_at");