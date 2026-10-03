-- Rules Drizzle cannot express: immutable and append-only records, and exclusive appointment
-- resources.
CREATE OR REPLACE FUNCTION reject_modification() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable (%)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END
$$;
--> statement-breakpoint
CREATE TRIGGER property_fact_revisions_immutable BEFORE UPDATE OR DELETE ON property_fact_revisions
  FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE TRIGGER property_facts_immutable BEFORE UPDATE OR DELETE ON property_facts
  FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE TRIGGER listing_revisions_immutable BEFORE UPDATE OR DELETE ON listing_revisions
  FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE TRIGGER listing_revision_media_immutable BEFORE UPDATE OR DELETE ON listing_revision_media
  FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE TRIGGER publication_manifests_immutable BEFORE UPDATE OR DELETE ON publication_manifests
  FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE TRIGGER content_page_versions_immutable BEFORE UPDATE OR DELETE ON content_page_versions
  FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE TRIGGER appointment_versions_immutable BEFORE UPDATE OR DELETE ON appointment_versions
  FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE TRIGGER interest_feedback_append_only BEFORE UPDATE OR DELETE ON interest_feedback
  FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE TRIGGER case_stage_history_append_only BEFORE UPDATE OR DELETE ON case_stage_history
  FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE TRIGGER consent_events_append_only BEFORE UPDATE OR DELETE ON consent_events
  FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE TRIGGER activity_events_append_only BEFORE UPDATE OR DELETE ON activity_events
  FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE TRIGGER release_evidence_append_only BEFORE UPDATE OR DELETE ON release_evidence
  FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
-- AT30: an exclusive resource (a broker, a property's access) is never occupied by two active
-- appointment intervals at once, however many confirmations run concurrently.
ALTER TABLE appointment_resources ADD CONSTRAINT appointment_resources_no_overlap
  EXCLUDE USING gist (kind WITH =, resource_id WITH =, during WITH &&)
  WHERE (active);
--> statement-breakpoint
ALTER TABLE appointment_resources ADD CONSTRAINT appointment_resources_bounded
  CHECK (NOT isempty(during) AND NOT lower_inf(during) AND NOT upper_inf(during));
