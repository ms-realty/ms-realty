import { operatorPublishedListingIds } from "./listing-publication-approval.mjs";

function sqlStringList(ids) {
  return ids.map((id) => `'${String(id).replaceAll("'", "''")}'`).join(",\n  ");
}

// Defaults to the listing ids the operator publication approval names, so the
// Payload database publishes exactly the same set as the static seed gate.
export function freezeActivePublicationSql(ids = operatorPublishedListingIds()) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error("Freeze-active publication SQL requires listing ids");
  const list = sqlStringList(ids);
  return `BEGIN;

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

DELETE FROM listings_rels
WHERE parent_id IN (
  ${list}
);

INSERT INTO listings_rels ("order", parent_id, path, listing_translations_id, media_assets_id)
SELECT
  version_rels."order",
  versions.parent_id,
  CASE version_rels.path
    WHEN 'version.translations' THEN 'translations'
    WHEN 'version.media' THEN 'media'
    ELSE regexp_replace(version_rels.path, '^version\\.', '')
  END,
  version_rels.listing_translations_id,
  version_rels.media_assets_id
FROM _listings_v_rels AS version_rels
JOIN _listings_v AS versions
  ON versions.id = version_rels.parent_id
 AND versions.latest = true
WHERE versions.parent_id IN (
  ${list}
);

UPDATE media_assets AS media SET
  is_public = true,
  review_status = 'approved_imported_photo',
  _status = 'published',
  updated_at = now()
FROM listings_rels AS rels
WHERE rels.media_assets_id = media.id
  AND rels.parent_id IN (
  ${list}
  )
  AND media.kind = 'photo'
  AND media.review_status = 'review_required';

UPDATE _media_assets_v AS versions SET
  version_is_public = true,
  version_review_status = 'approved_imported_photo',
  version__status = 'published',
  updated_at = now()
FROM media_assets AS media
JOIN listings_rels AS rels
  ON rels.media_assets_id = media.id
WHERE versions.parent_id = media.id
  AND versions.latest = true
  AND rels.parent_id IN (
  ${list}
  )
  AND media.kind = 'photo'
  AND media.review_status = 'approved_imported_photo'
  AND media.is_public = true;

COMMIT;
`;
}
