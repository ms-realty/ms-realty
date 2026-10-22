ALTER TYPE "public"."capability" ADD VALUE 'complaint.manage' BEFORE 'audit.read';--> statement-breakpoint
CREATE TABLE "complaint_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"complaint_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"state" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"note" text NOT NULL,
	"outcome" text NOT NULL,
	"reviewed_by_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reference" text NOT NULL,
	"channel" text NOT NULL,
	"source_reference" text NOT NULL,
	"description" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"owner_id" uuid NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"outcome" text DEFAULT '' NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "complaints_reference_unique" UNIQUE("reference"),
	CONSTRAINT "complaints_state" CHECK ("complaints"."state" in ('open','reviewing','waiting','resolved')),
	CONSTRAINT "complaints_channel" CHECK ("complaints"."channel" in ('email','phone','in_person','website','other')),
	CONSTRAINT "complaints_due" CHECK ("complaints"."due_at" >= "complaints"."received_at"),
	CONSTRAINT "complaints_resolution" CHECK (("complaints"."state" = 'resolved' and "complaints"."resolved_at" is not null and length("complaints"."outcome") >= 10) or ("complaints"."state" <> 'resolved' and "complaints"."resolved_at" is null))
);
--> statement-breakpoint
ALTER TABLE "complaint_reviews" ADD CONSTRAINT "complaint_reviews_complaint_id_complaints_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_reviews" ADD CONSTRAINT "complaint_reviews_owner_id_principals_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_reviews" ADD CONSTRAINT "complaint_reviews_reviewed_by_id_principals_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_reviews" ADD CONSTRAINT "complaint_reviews_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_owner_id_principals_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "complaint_reviews_record_idx" ON "complaint_reviews" USING btree ("complaint_id","version");--> statement-breakpoint
CREATE INDEX "complaints_queue_idx" ON "complaints" USING btree ("state","due_at","id");--> statement-breakpoint
CREATE TRIGGER complaint_reviews_immutable BEFORE UPDATE OR DELETE ON complaint_reviews
FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE FUNCTION preserve_complaint_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.reference, NEW.channel, NEW.source_reference, NEW.description, NEW.received_at)
    IS DISTINCT FROM ROW(OLD.reference, OLD.channel, OLD.source_reference, OLD.description, OLD.received_at) THEN
    RAISE EXCEPTION 'Original complaint source is immutable' USING ERRCODE = '23000';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER complaints_preserve_source BEFORE UPDATE ON complaints
FOR EACH ROW EXECUTE FUNCTION preserve_complaint_source();
