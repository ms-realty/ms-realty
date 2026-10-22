ALTER TYPE "public"."capability" ADD VALUE 'key.manage' BEFORE 'audit.read';--> statement-breakpoint
CREATE TABLE "key_custody_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_set_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"state" text NOT NULL,
	"storage_label" text,
	"holder_id" uuid,
	"due_at" timestamp with time zone,
	"note" text NOT NULL,
	"recorded_by_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "key_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reference" text NOT NULL,
	"property_id" uuid NOT NULL,
	"key_tag" text NOT NULL,
	"quantity" integer NOT NULL,
	"source_reference" text NOT NULL,
	"state" text DEFAULT 'stored' NOT NULL,
	"storage_label" text,
	"holder_id" uuid,
	"due_at" timestamp with time zone,
	CONSTRAINT "key_sets_reference_unique" UNIQUE("reference"),
	CONSTRAINT "key_sets_quantity" CHECK ("key_sets"."quantity" between 1 and 50),
	CONSTRAINT "key_sets_custody" CHECK ((
    ("key_sets"."state" = 'stored' and length("key_sets"."storage_label") > 0 and "key_sets"."storage_label" is not null and "key_sets"."holder_id" is null and "key_sets"."due_at" is null) or
    ("key_sets"."state" = 'checked_out' and "key_sets"."storage_label" is null and "key_sets"."holder_id" is not null and "key_sets"."due_at" is not null) or
    ("key_sets"."state" in ('lost','returned_to_owner') and "key_sets"."storage_label" is null and "key_sets"."holder_id" is null and "key_sets"."due_at" is null)
  ))
);
--> statement-breakpoint
ALTER TABLE "key_custody_events" ADD CONSTRAINT "key_custody_events_key_set_id_key_sets_id_fk" FOREIGN KEY ("key_set_id") REFERENCES "public"."key_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_custody_events" ADD CONSTRAINT "key_custody_events_holder_id_principals_id_fk" FOREIGN KEY ("holder_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_custody_events" ADD CONSTRAINT "key_custody_events_recorded_by_id_principals_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_custody_events" ADD CONSTRAINT "key_custody_events_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_sets" ADD CONSTRAINT "key_sets_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_sets" ADD CONSTRAINT "key_sets_holder_id_principals_id_fk" FOREIGN KEY ("holder_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "key_custody_events_version_unique" ON "key_custody_events" USING btree ("key_set_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "key_sets_tag_unique" ON "key_sets" USING btree ("key_tag");--> statement-breakpoint
CREATE INDEX "key_sets_due_idx" ON "key_sets" USING btree ("state","due_at","id");--> statement-breakpoint
CREATE TRIGGER key_custody_events_immutable BEFORE UPDATE OR DELETE ON key_custody_events
FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE FUNCTION preserve_key_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.reference, NEW.property_id, NEW.key_tag, NEW.quantity, NEW.source_reference)
    IS DISTINCT FROM ROW(OLD.reference, OLD.property_id, OLD.key_tag, OLD.quantity, OLD.source_reference) THEN
    RAISE EXCEPTION 'Original key custody identity is immutable' USING ERRCODE = '23000';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER key_sets_preserve_identity BEFORE UPDATE ON key_sets
FOR EACH ROW EXECUTE FUNCTION preserve_key_identity();
