CREATE TABLE "staff_import_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"batch_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"operation_key" text NOT NULL,
	"source_text" text NOT NULL,
	"source_sha256" text NOT NULL,
	"delimiter" text NOT NULL,
	"context" jsonb NOT NULL,
	"plan_digest" text NOT NULL,
	"selection" jsonb,
	"selection_digest" text,
	"reviewed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "staff_import_reviews_batch_id_unique" UNIQUE("batch_id"),
	CONSTRAINT "staff_import_reviews_operation_key_unique" UNIQUE("operation_key"),
	CONSTRAINT "staff_import_reviews_digest" CHECK ("staff_import_reviews"."source_sha256" ~ '^[a-f0-9]{64}$' and "staff_import_reviews"."plan_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "staff_import_reviews_delimiter" CHECK (length("staff_import_reviews"."delimiter") = 1 and ascii("staff_import_reviews"."delimiter") in (44,59)),
	CONSTRAINT "staff_import_reviews_sealed" CHECK (("staff_import_reviews"."selection" is null and "staff_import_reviews"."selection_digest" is null and "staff_import_reviews"."reviewed_at" is null) or ("staff_import_reviews"."selection" is not null and "staff_import_reviews"."selection_digest" ~ '^[a-f0-9]{64}$' and "staff_import_reviews"."reviewed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "staff_import_reviews" ADD CONSTRAINT "staff_import_reviews_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_import_reviews" ADD CONSTRAINT "staff_import_reviews_created_by_id_principals_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_import_reviews_creator_idx" ON "staff_import_reviews" USING btree ("created_by_id","created_at");
--> statement-breakpoint
-- Sealed input and accepted choices are evidence, not editable working drafts.
CREATE FUNCTION protect_staff_import_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'staff import evidence is retained'; END IF;
  IF ROW(OLD.batch_id, OLD.created_by_id, OLD.operation_key, OLD.source_text, OLD.source_sha256, OLD.delimiter, OLD.context, OLD.plan_digest)
     IS DISTINCT FROM ROW(NEW.batch_id, NEW.created_by_id, NEW.operation_key, NEW.source_text, NEW.source_sha256, NEW.delimiter, NEW.context, NEW.plan_digest)
     OR (OLD.reviewed_at IS NOT NULL AND ROW(OLD.selection, OLD.selection_digest, OLD.reviewed_at) IS DISTINCT FROM ROW(NEW.selection, NEW.selection_digest, NEW.reviewed_at))
     OR (OLD.cancelled_at IS NOT NULL AND OLD.cancelled_at IS DISTINCT FROM NEW.cancelled_at)
  THEN RAISE EXCEPTION 'staff import evidence is sealed'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER staff_import_review_sealed BEFORE UPDATE OR DELETE ON staff_import_reviews FOR EACH ROW EXECUTE FUNCTION protect_staff_import_review();
--> statement-breakpoint
CREATE FUNCTION protect_staff_import_plan() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM staff_import_reviews WHERE batch_id=OLD.batch_id) THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'staff import row evidence is retained'; END IF;
    IF ROW(OLD.batch_id, OLD.row_number, OLD.source_key, OLD.classification, OLD.target_type, OLD.diff->'plan', OLD.issues)
       IS DISTINCT FROM ROW(NEW.batch_id, NEW.row_number, NEW.source_key, NEW.classification, NEW.target_type, NEW.diff->'plan', NEW.issues)
    THEN RAISE EXCEPTION 'staff import row plan is sealed'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER staff_import_row_plan_sealed BEFORE UPDATE OR DELETE ON import_rows FOR EACH ROW EXECUTE FUNCTION protect_staff_import_plan();
