-- Rules Drizzle cannot express: immutable and append-only records, and no double booking.
CREATE OR REPLACE FUNCTION reject_modification() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable (%)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END
$$;
--> statement-breakpoint
CREATE TRIGGER listing_versions_immutable BEFORE UPDATE OR DELETE ON listing_versions
  FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE TRIGGER content_page_versions_immutable BEFORE UPDATE OR DELETE ON content_page_versions
  FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE TRIGGER appointment_versions_immutable BEFORE UPDATE OR DELETE ON appointment_versions
  FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE TRIGGER case_stage_history_append_only BEFORE UPDATE OR DELETE ON case_stage_history
  FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE TRIGGER activity_events_append_only BEFORE UPDATE OR DELETE ON activity_events
  FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
-- A62: reservations holding capacity for one listing never overlap ([check_in, check_out)).
ALTER TABLE reservations ADD CONSTRAINT reservations_no_overlap
  EXCLUDE USING gist (listing_id WITH =, daterange(check_in, check_out, '[)') WITH &&)
  WHERE (state IN ('payment_pending', 'confirmed'));
