import { freezeActiveListingIds } from "../lib/listing-publication-approval.mjs";

const ids = freezeActiveListingIds().map((id) => `'${id.replaceAll("'", "''")}'`);
const list = ids.join(",\n  ");

process.stdout.write(`BEGIN;

UPDATE listings SET
  cms_status = 'published',
  _status = 'published',
  facts_listing_status = COALESCE(NULLIF(BTRIM(facts_listing_status), ''), 'available'),
  workflow_publish_approved = true,
  workflow_publish_approved_at = now(),
  workflow_publish_approved_by = 'ivan',
  workflow_last_edited_at = now(),
  workflow_last_editor = 'ivan',
  updated_at = now()
WHERE id IN (
  ${list}
);

UPDATE _listings_v SET
  version_cms_status = 'published',
  version__status = 'published',
  version_facts_listing_status = COALESCE(NULLIF(BTRIM(version_facts_listing_status), ''), 'available'),
  version_workflow_publish_approved = true,
  version_workflow_publish_approved_at = now(),
  version_workflow_publish_approved_by = 'ivan',
  updated_at = now()
WHERE latest = true
  AND parent_id IN (
  ${list}
);

UPDATE listing_translations SET
  status = 'published',
  translation_state = 'published',
  public_indexable = true,
  reviewer = 'ivan',
  approved_at = now(),
  _status = 'published',
  updated_at = now()
WHERE listing_id IN (
  ${list}
)
  AND locale_id = source_locale_id;

UPDATE _listing_translations_v AS versions SET
  version_status = 'published',
  version_translation_state = 'published',
  version_public_indexable = true,
  version_reviewer = 'ivan',
  version_approved_at = now(),
  version__status = 'published',
  updated_at = now()
FROM listing_translations AS translations
WHERE versions.parent_id = translations.id
  AND versions.latest = true
  AND translations.listing_id IN (
  ${list}
  )
  AND translations.locale_id = translations.source_locale_id;

COMMIT;
`);
