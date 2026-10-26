-- O26/AT45/UX23: durable application safety decisions; independent archive proof stays held.
CREATE TABLE privacy_safety_decisions (
  sequence bigint PRIMARY KEY CONSTRAINT privacy_safety_sequence CHECK (sequence BETWEEN 1 AND 9007199254740991),
  id uuid NOT NULL UNIQUE,
  operation_id uuid NOT NULL UNIQUE,
  party_id uuid NOT NULL REFERENCES parties(id),
  request_id uuid,
  request_hash text NOT NULL,
  review jsonb NOT NULL,
  effect jsonb NOT NULL,
  previous_digest text NOT NULL,
  digest text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT privacy_safety_digests CHECK (request_hash ~ '^[a-f0-9]{64}$' AND previous_digest ~ '^[a-f0-9]{64}$' AND digest ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE INDEX privacy_safety_party_idx ON privacy_safety_decisions(party_id, sequence);
--> statement-breakpoint
CREATE TABLE privacy_processing_restrictions (
  party_id uuid NOT NULL REFERENCES parties(id),
  purpose text NOT NULL CONSTRAINT privacy_processing_purpose CHECK (purpose IN ('search_alerts','marketing','client_access')),
  decision_sequence bigint NOT NULL REFERENCES privacy_safety_decisions(sequence),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(party_id,purpose)
);
--> statement-breakpoint
CREATE TABLE privacy_propagation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_sequence bigint NOT NULL REFERENCES privacy_safety_decisions(sequence),
  boundary text NOT NULL CONSTRAINT privacy_propagation_boundary CHECK (boundary IN ('application','business_and_history','private_files','provider_data','independent_archive','restore_reapplication')),
  state text NOT NULL CONSTRAINT privacy_propagation_state CHECK (state IN ('applied','held','unsupported')),
  evidence jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX privacy_propagation_decision_idx ON privacy_propagation_events(decision_sequence);
--> statement-breakpoint
CREATE TRIGGER privacy_safety_immutable BEFORE UPDATE OR DELETE ON privacy_safety_decisions FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE TRIGGER privacy_processing_immutable BEFORE UPDATE OR DELETE ON privacy_processing_restrictions FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE TRIGGER privacy_propagation_immutable BEFORE UPDATE OR DELETE ON privacy_propagation_events FOR EACH ROW EXECUTE FUNCTION reject_modification();
