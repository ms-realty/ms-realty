CREATE TABLE "recovery_journal" (
	"sequence" bigint PRIMARY KEY NOT NULL,
	"context_digest" text NOT NULL,
	"transaction_ref" uuid NOT NULL,
	"previous_digest" text NOT NULL,
	"digest" text NOT NULL,
	"effects" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recovery_journal_transaction_ref_unique" UNIQUE("transaction_ref"),
	CONSTRAINT "recovery_journal_digest_unique" UNIQUE("digest"),
	CONSTRAINT "recovery_journal_sequence" CHECK ("recovery_journal"."sequence" between 1 and 9007199254740991),
	CONSTRAINT "recovery_journal_digests" CHECK ("recovery_journal"."context_digest" ~ '^[a-f0-9]{64}$' and "recovery_journal"."previous_digest" ~ '^[a-f0-9]{64}$' and "recovery_journal"."digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "recovery_journal_effects" CHECK (jsonb_typeof("recovery_journal"."effects") = 'array' and jsonb_array_length("recovery_journal"."effects") > 0)
);
--> statement-breakpoint
CREATE TABLE "recovery_journal_head" (
	"key" text PRIMARY KEY NOT NULL,
	"sequence" bigint DEFAULT 0 NOT NULL,
	"digest" text DEFAULT '0000000000000000000000000000000000000000000000000000000000000000' NOT NULL,
	CONSTRAINT "recovery_journal_head_key" CHECK ("recovery_journal_head"."key" = 'source'),
	CONSTRAINT "recovery_journal_head_sequence" CHECK ("recovery_journal_head"."sequence" between 0 and 9007199254740991),
	CONSTRAINT "recovery_journal_head_digest" CHECK ("recovery_journal_head"."digest" ~ '^[a-f0-9]{64}$' and (("recovery_journal_head"."sequence" = 0) = ("recovery_journal_head"."digest" = repeat('0', 64))))
);
--> statement-breakpoint
CREATE TABLE "recovery_operation_references" (
	"operation_id" uuid PRIMARY KEY NOT NULL,
	"sequence" bigint NOT NULL,
	"receipt_digest" text NOT NULL,
	CONSTRAINT "recovery_operation_receipt_digest" CHECK ("recovery_operation_references"."receipt_digest" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "recovery_payloads" (
	"digest" text PRIMARY KEY NOT NULL,
	"context_digest" text NOT NULL,
	"kind" text NOT NULL,
	"subject_digest" text NOT NULL,
	"canonical_body" text NOT NULL,
	"byte_length" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recovery_payload_kind" CHECK ("recovery_payloads"."kind" in ('access_revocation','privacy_restriction','deletion_decision','consent_withdrawal','publication_withdrawal')),
	CONSTRAINT "recovery_payload_digests" CHECK ("recovery_payloads"."digest" ~ '^[a-f0-9]{64}$' and "recovery_payloads"."context_digest" ~ '^[a-f0-9]{64}$' and "recovery_payloads"."subject_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "recovery_payload_length" CHECK ("recovery_payloads"."byte_length" > 0 and "recovery_payloads"."byte_length" = octet_length("recovery_payloads"."canonical_body"))
);
--> statement-breakpoint
CREATE TABLE "recovery_source" (
	"key" text PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'inactive' NOT NULL,
	"context" jsonb,
	"context_digest" text,
	"admitted_writers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"coverage_state" text DEFAULT 'incomplete' NOT NULL,
	"unresolved_writers" jsonb DEFAULT '["domain_writers_uninstrumented","external_and_unclassified_writers"]'::jsonb NOT NULL,
	"closed_head" jsonb,
	"close_receipt_digest" text,
	CONSTRAINT "recovery_source_context_digest_unique" UNIQUE("context_digest"),
	CONSTRAINT "recovery_source_singleton" CHECK ("recovery_source"."key" = 'source'),
	CONSTRAINT "recovery_source_state" CHECK ("recovery_source"."state" in ('inactive', 'admitted', 'closed')),
	CONSTRAINT "recovery_source_incomplete" CHECK ("recovery_source"."coverage_state" = 'incomplete'),
	CONSTRAINT "recovery_source_writers" CHECK (jsonb_typeof("recovery_source"."admitted_writers") = 'array' and jsonb_typeof("recovery_source"."unresolved_writers") = 'array' and jsonb_array_length("recovery_source"."unresolved_writers") > 0),
	CONSTRAINT "recovery_source_context" CHECK (("recovery_source"."state" = 'inactive' and "recovery_source"."context" is null and "recovery_source"."context_digest" is null and jsonb_array_length("recovery_source"."admitted_writers") = 0) or ("recovery_source"."state" <> 'inactive' and "recovery_source"."context" is not null and "recovery_source"."context_digest" is not null and "recovery_source"."context_digest" ~ '^[a-f0-9]{64}$' and jsonb_array_length("recovery_source"."admitted_writers") > 0)),
	CONSTRAINT "recovery_source_close" CHECK (("recovery_source"."state" <> 'closed' and "recovery_source"."closed_head" is null and "recovery_source"."close_receipt_digest" is null) or ("recovery_source"."state" = 'closed' and "recovery_source"."closed_head" is not null and "recovery_source"."close_receipt_digest" is not null and "recovery_source"."close_receipt_digest" ~ '^[a-f0-9]{64}$'))
);
--> statement-breakpoint
ALTER TABLE "recovery_journal" ADD CONSTRAINT "recovery_journal_context_digest_recovery_source_context_digest_fk" FOREIGN KEY ("context_digest") REFERENCES "public"."recovery_source"("context_digest") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_journal_head" ADD CONSTRAINT "recovery_journal_head_key_recovery_source_key_fk" FOREIGN KEY ("key") REFERENCES "public"."recovery_source"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_operation_references" ADD CONSTRAINT "recovery_operation_references_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_operation_references" ADD CONSTRAINT "recovery_operation_references_sequence_recovery_journal_sequence_fk" FOREIGN KEY ("sequence") REFERENCES "public"."recovery_journal"("sequence") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_payloads" ADD CONSTRAINT "recovery_payloads_context_digest_recovery_source_context_digest_fk" FOREIGN KEY ("context_digest") REFERENCES "public"."recovery_source"("context_digest") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- R08 / AT64: installing source history does not activate it or change restore quarantine.
INSERT INTO recovery_source (key) VALUES ('source');
--> statement-breakpoint
INSERT INTO recovery_journal_head (key) VALUES ('source');
--> statement-breakpoint
CREATE TRIGGER recovery_journal_immutable BEFORE UPDATE OR DELETE ON recovery_journal FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE TRIGGER recovery_payloads_immutable BEFORE UPDATE OR DELETE ON recovery_payloads FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE TRIGGER recovery_operation_references_immutable BEFORE UPDATE OR DELETE ON recovery_operation_references FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE TRIGGER recovery_journal_no_truncate BEFORE TRUNCATE ON recovery_journal FOR EACH STATEMENT EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE TRIGGER recovery_payloads_no_truncate BEFORE TRUNCATE ON recovery_payloads FOR EACH STATEMENT EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE TRIGGER recovery_operation_references_no_truncate BEFORE TRUNCATE ON recovery_operation_references FOR EACH STATEMENT EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
-- No admission API exists. A future operator-controlled admission needs its own policy.
-- Once admitted, this epoch's identity/partial coverage cannot be changed or reopened.
CREATE FUNCTION protect_recovery_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Recovery source cannot be deleted'; END IF;
  IF OLD.state = 'closed' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Recovery source cannot be reopened or rewritten';
  END IF;
  IF OLD.state = 'admitted' AND (
    NEW.state NOT IN ('admitted', 'closed') OR
    NEW.context IS DISTINCT FROM OLD.context OR
    NEW.context_digest IS DISTINCT FROM OLD.context_digest OR
    NEW.admitted_writers IS DISTINCT FROM OLD.admitted_writers OR
    NEW.unresolved_writers IS DISTINCT FROM OLD.unresolved_writers OR
    NEW.coverage_state IS DISTINCT FROM OLD.coverage_state
  ) THEN RAISE EXCEPTION 'Recovery admitted source binding is immutable'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER recovery_source_binding BEFORE UPDATE OR DELETE ON recovery_source FOR EACH ROW EXECUTE FUNCTION protect_recovery_source();
--> statement-breakpoint
CREATE TRIGGER recovery_source_no_truncate BEFORE TRUNCATE ON recovery_source FOR EACH STATEMENT EXECUTE FUNCTION reject_modification();
