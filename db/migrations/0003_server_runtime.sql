CREATE TABLE "outbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idempotency_key" text NOT NULL,
	"message_id" uuid,
	"channel" "message_channel" NOT NULL,
	"recipient" text NOT NULL,
	"template" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_params" jsonb,
	"state" "message_state" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"provider" text,
	"provider_message_id" text,
	"last_error_code" text,
	"dispatch_started_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	CONSTRAINT "outbox_messages_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "outbox_messages_state" CHECK ("outbox_messages"."state" in ('queued', 'provider_accepted', 'delivered', 'failed', 'outcome_unknown'))
);
--> statement-breakpoint
CREATE TABLE "webauthn_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge" text NOT NULL,
	"purpose" text NOT NULL,
	"staff_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "webauthn_challenges_challenge_unique" UNIQUE("challenge"),
	CONSTRAINT "webauthn_challenges_purpose" CHECK ("webauthn_challenges"."purpose" in ('registration', 'authentication'))
);
--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_staff_account_id_staff_accounts_id_fk" FOREIGN KEY ("staff_account_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbox_messages_state_idx" ON "outbox_messages" USING btree ("state","updated_at");--> statement-breakpoint
CREATE INDEX "outbox_messages_provider_idx" ON "outbox_messages" USING btree ("provider","provider_message_id");