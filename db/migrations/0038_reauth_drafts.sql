CREATE TABLE "reauth_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"principal_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"host" text NOT NULL,
	"command" text NOT NULL,
	"proposal_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"source_revision_id" uuid NOT NULL,
	"expected_version" integer NOT NULL,
	"state" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"restored_at" timestamp with time zone,
	CONSTRAINT "reauth_drafts_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "reauth_drafts_scope" CHECK ("reauth_drafts"."command" = 'proposal.decide' and "reauth_drafts"."expected_version" > 0),
	CONSTRAINT "reauth_drafts_fields" CHECK ("reauth_drafts"."state" in ('agreed_for_next_step', 'declined') and octet_length("reauth_drafts"."reason") <= 24000 and char_length("reauth_drafts"."reason") <= 6000),
	CONSTRAINT "reauth_drafts_ttl" CHECK ("reauth_drafts"."expires_at" > "reauth_drafts"."created_at" and "reauth_drafts"."expires_at" <= "reauth_drafts"."created_at" + interval '15 minutes')
);
--> statement-breakpoint
CREATE TABLE "reauth_email_lineage" (
	"token_id" uuid PRIMARY KEY NOT NULL,
	"source_session_id" uuid NOT NULL,
	"host" text NOT NULL,
	"draft_ids" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "reauth_email_lineage_drafts" CHECK (jsonb_typeof("reauth_email_lineage"."draft_ids") = 'array' and jsonb_array_length("reauth_email_lineage"."draft_ids") between 1 and 4)
);
--> statement-breakpoint
ALTER TABLE "reauth_drafts" ADD CONSTRAINT "reauth_drafts_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reauth_drafts" ADD CONSTRAINT "reauth_drafts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reauth_drafts" ADD CONSTRAINT "reauth_drafts_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reauth_drafts" ADD CONSTRAINT "reauth_drafts_revision_id_proposal_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."proposal_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reauth_email_lineage" ADD CONSTRAINT "reauth_email_lineage_token_id_email_sign_in_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."email_sign_in_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reauth_email_lineage" ADD CONSTRAINT "reauth_email_lineage_source_session_id_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reauth_drafts_session_proposal" ON "reauth_drafts" USING btree ("session_id","proposal_id");--> statement-breakpoint
CREATE INDEX "reauth_drafts_expiry" ON "reauth_drafts" USING btree ("expires_at");