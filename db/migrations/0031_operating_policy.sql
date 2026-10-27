-- O24/AT14: explicit approved policy editions; no historical row receives a guessed approval.
CREATE TABLE operating_policy_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  document jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text,
  updated_by_id uuid CONSTRAINT operating_policy_drafts_updated_by_id_principals_id_fk REFERENCES principals(id),
  CONSTRAINT operating_policy_drafts_singleton CHECK (id = '00000000-0000-4000-8000-000000000024')
);
--> statement-breakpoint
CREATE TABLE operating_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_version integer NOT NULL CONSTRAINT operating_policy_versions_policy_version_unique UNIQUE CONSTRAINT operating_policy_version_positive CHECK (policy_version > 0),
  draft_revision integer NOT NULL CONSTRAINT operating_policy_draft_revision_positive CHECK (draft_revision > 0),
  document jsonb NOT NULL,
  content_hash text NOT NULL CONSTRAINT operating_policy_content_hash CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  approved_by_id uuid NOT NULL CONSTRAINT operating_policy_versions_approved_by_id_principals_id_fk REFERENCES principals(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  approval_note text NOT NULL,
  operation_id text NOT NULL CONSTRAINT operating_policy_versions_operation_id_unique UNIQUE,
  service_policy_id uuid NOT NULL CONSTRAINT operating_policy_versions_service_policy_id_service_policies_id_fk REFERENCES service_policies(id)
);
--> statement-breakpoint
CREATE TRIGGER operating_policy_versions_immutable BEFORE UPDATE OR DELETE ON operating_policy_versions
FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE FUNCTION retain_reviewed_service_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM operating_policy_versions WHERE service_policy_id = OLD.id) THEN
    RAISE EXCEPTION 'reviewed service policy projection is immutable' USING ERRCODE = '23000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER reviewed_service_policy_immutable BEFORE UPDATE OR DELETE ON service_policies
FOR EACH ROW EXECUTE FUNCTION retain_reviewed_service_policy();
--> statement-breakpoint
ALTER TABLE inquiries ADD COLUMN operating_policy_snapshot jsonb;
--> statement-breakpoint
ALTER TABLE appointments ADD COLUMN operating_policy_snapshot jsonb;
--> statement-breakpoint
ALTER TABLE appointments ADD COLUMN confirmed_policy_snapshot jsonb;
--> statement-breakpoint
CREATE FUNCTION retain_operating_policy_context() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.operating_policy_snapshot IS DISTINCT FROM OLD.operating_policy_snapshot THEN
    RAISE EXCEPTION 'accepted operating policy context is immutable' USING ERRCODE = '23000';
  END IF;
  IF TG_TABLE_NAME = 'appointments' AND to_jsonb(OLD)->'confirmed_policy_snapshot' IS NOT NULL
     AND to_jsonb(OLD)->'confirmed_policy_snapshot' <> 'null'::jsonb
     AND to_jsonb(NEW)->'confirmed_policy_snapshot' IS DISTINCT FROM to_jsonb(OLD)->'confirmed_policy_snapshot' THEN
    RAISE EXCEPTION 'first confirmed operating policy context is immutable' USING ERRCODE = '23000';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER inquiry_operating_policy_context BEFORE UPDATE ON inquiries
FOR EACH ROW EXECUTE FUNCTION retain_operating_policy_context();
--> statement-breakpoint
CREATE TRIGGER appointment_operating_policy_context BEFORE UPDATE ON appointments
FOR EACH ROW EXECUTE FUNCTION retain_operating_policy_context();
--> statement-breakpoint
ALTER TABLE listings ADD COLUMN availability_policy_snapshot jsonb;
--> statement-breakpoint
CREATE FUNCTION retain_availability_policy_context() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.availability_policy_snapshot IS NOT NULL AND NEW.availability_confirmed_at IS NOT DISTINCT FROM OLD.availability_confirmed_at
     AND (NEW.availability_policy_snapshot IS DISTINCT FROM OLD.availability_policy_snapshot OR NEW.review_due_at IS DISTINCT FROM OLD.review_due_at) THEN
    RAISE EXCEPTION 'availability policy changes require a new human confirmation' USING ERRCODE = '23000';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER listing_availability_policy_context BEFORE UPDATE ON listings
FOR EACH ROW EXECUTE FUNCTION retain_availability_policy_context();
