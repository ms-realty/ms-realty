CREATE TYPE "public"."invitation_kind" AS ENUM('staff_enrolment', 'staff_recovery', 'client_access');--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "invitation_kind" NOT NULL,
	"principal_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token_hash" text,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"invited_by_id" uuid,
	"locale" "public_locale" DEFAULT 'bg' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invitations_one_outcome" CHECK (num_nonnulls("invitations"."accepted_at", "invitations"."declined_at", "invitations"."revoked_at") <= 1),
	CONSTRAINT "invitations_staff_token" CHECK ("invitations"."kind" = 'client_access' or "invitations"."token_hash" is not null)
);
--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_id_principals_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitations_principal_idx" ON "invitations" USING btree ("principal_id");