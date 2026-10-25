-- O21 / AT22 / AT23: additive locale editions. Existing BG pointers and reviews are unchanged.
CREATE TABLE content_locale_editions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  content_page_id uuid NOT NULL REFERENCES content_pages(id),
  locale public_locale NOT NULL,
  review_state text NOT NULL DEFAULT 'draft',
  publication_state publication_state NOT NULL DEFAULT 'never_published',
  current_version_number integer NOT NULL DEFAULT 0,
  published_version_number integer,
  CONSTRAINT content_locale_editions_target_locale CHECK (locale <> 'bg'),
  CONSTRAINT content_locale_editions_review_state CHECK (review_state IN ('draft', 'in_review', 'rejected', 'approved', 'stale'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX content_locale_editions_page_locale_idx ON content_locale_editions(content_page_id, locale);
--> statement-breakpoint
CREATE TABLE content_locale_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id uuid NOT NULL REFERENCES content_locale_editions(id),
  version_number integer NOT NULL,
  source_version_id uuid NOT NULL REFERENCES content_page_versions(id),
  source_version_hash text NOT NULL,
  content_hash text NOT NULL,
  body jsonb NOT NULL,
  jurisdiction text NOT NULL,
  review_scope text NOT NULL,
  created_by_id uuid NOT NULL REFERENCES principals(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX content_locale_versions_number_idx ON content_locale_versions(edition_id, version_number);
--> statement-breakpoint
CREATE TRIGGER content_locale_versions_immutable BEFORE UPDATE OR DELETE ON content_locale_versions
  FOR EACH ROW EXECUTE FUNCTION reject_modification();
--> statement-breakpoint
CREATE FUNCTION validate_content_locale_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM content_page_versions source
    JOIN content_locale_editions edition ON edition.content_page_id = source.content_page_id
    WHERE edition.id = NEW.edition_id AND source.id = NEW.source_version_id
      AND source.source_locale = 'bg' AND source.content_hash = NEW.source_version_hash
  ) THEN
    RAISE EXCEPTION 'Locale edition must reference its exact BG source' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER content_locale_versions_source BEFORE INSERT ON content_locale_versions
  FOR EACH ROW EXECUTE FUNCTION validate_content_locale_source();
