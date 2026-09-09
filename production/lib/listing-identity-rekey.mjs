// A lot rekey changes identity, never listing content or publication state.
// Matching by the unique source URL also supports returning to an older release.
export function listingIdentityRekeySql(seed) {
  const ids = new Set();
  const urls = new Set();
  const quote = (value) => `'${value.replaceAll("'", "''")}'`;
  const rows = (seed?.records || []).map(({ id, source_url: url, property }) => {
    if (!/^[A-Za-z0-9][\w-]{0,79}$/.test(id || "") || typeof url !== "string" || !/^https?:\/\//.test(url)) {
      throw new Error("Identity reconciliation requires listing IDs and source URLs");
    }
    if (ids.has(id) || urls.has(url)) throw new Error("Identity reconciliation requires unique IDs and source URLs");
    ids.add(id);
    urls.add(url);
    if (property != null && !/^[A-Za-z0-9][\w-]{0,159}$/.test(property)) throw new Error("Invalid property identity");
    return `(${quote(id)}, ${quote(url)}, ${property ? quote(property) : "NULL"})`;
  });
  if (!rows.length) throw new Error("Identity reconciliation refuses an empty seed");
  return `BEGIN;
SET LOCAL lock_timeout = '30s';
LOCK TABLE listings IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE listing_identity_targets (id varchar PRIMARY KEY, source_url varchar UNIQUE, property_id varchar) ON COMMIT DROP;
INSERT INTO listing_identity_targets VALUES ${rows.join(",\n")};
CREATE TEMP TABLE listing_identity_changes ON COMMIT DROP AS
  SELECT 'listings'::text AS entity, l.id AS old_id, t.id AS new_id FROM listings l
  JOIN listing_identity_targets t USING (source_url) WHERE l.id <> t.id;
DO $rekey$
DECLARE fk record; ref record; occupied boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM listing_identity_changes) THEN RETURN; END IF;
  IF to_regclass('properties') IS NOT NULL THEN
    INSERT INTO listing_identity_changes
      SELECT DISTINCT 'properties', l.property_id, t.property_id FROM listings l
      JOIN listing_identity_targets t USING (source_url)
      WHERE l.property_id IS NOT NULL AND t.property_id IS NOT NULL AND l.property_id <> t.property_id;
  END IF;
  CREATE TEMP TABLE listing_identity_task_targets ON COMMIT DROP AS
    SELECT * FROM jsonb_to_recordset(${quote(JSON.stringify(seed.enrichment_tasks || []))}::jsonb)
      AS t(id varchar, listing varchar, idempotency_key varchar);
  IF to_regclass('listing_enrichment_tasks') IS NOT NULL THEN
    INSERT INTO listing_identity_changes
      SELECT 'listing_enrichment_tasks', task.id, target.id
      FROM listing_identity_changes m JOIN listing_enrichment_tasks task
        ON m.entity = 'listings' AND task.id = 'enrichment-' || m.old_id
      JOIN listing_identity_task_targets target ON target.listing = m.new_id AND target.id = 'enrichment-' || m.new_id;
  END IF;
  IF EXISTS (SELECT entity, old_id FROM listing_identity_changes GROUP BY 1,2 HAVING count(*) > 1)
    OR EXISTS (SELECT entity, new_id FROM listing_identity_changes GROUP BY 1,2 HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Ambiguous related identity mapping; no identities changed';
  END IF;
  FOR ref IN SELECT DISTINCT entity FROM listing_identity_changes LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM listing_identity_changes m JOIN %I r ON r.id = m.new_id WHERE m.entity = %L)', ref.entity, ref.entity) INTO occupied;
    IF occupied THEN RAISE EXCEPTION 'Identity target is already occupied; no identities changed'; END IF;
  END LOOP;
  CREATE TEMP TABLE listing_identity_constraints ON COMMIT DROP AS
    SELECT target.entity, c.conrelid::regclass AS table_name, c.conname, c.condeferrable, c.condeferred,
      c.confupdtype, array_length(c.conkey, 1) AS key_count, a.attname AS column_name
    FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    JOIN (SELECT DISTINCT entity FROM listing_identity_changes) target ON c.confrelid = to_regclass(target.entity)
    WHERE c.contype = 'f';
  IF EXISTS (SELECT 1 FROM listing_identity_constraints WHERE key_count <> 1 OR confupdtype <> 'a') THEN
    RAISE EXCEPTION 'Unsupported listing foreign key; no identities changed';
  END IF;
  FOR fk IN SELECT * FROM listing_identity_constraints LOOP
    EXECUTE format('ALTER TABLE %s ALTER CONSTRAINT %I DEFERRABLE INITIALLY DEFERRED', fk.table_name, fk.conname);
  END LOOP;
  SET CONSTRAINTS ALL DEFERRED;
  FOR fk IN SELECT * FROM listing_identity_constraints LOOP
    EXECUTE format('UPDATE %s r SET %I = m.new_id FROM listing_identity_changes m WHERE r.%I = m.old_id AND m.entity = %L',
      fk.table_name, fk.column_name, fk.column_name, fk.entity);
  END LOOP;
  -- Current operational references follow the listing. Immutable funnel/audit
  -- events retain their historical reference.
  FOR ref IN SELECT * FROM (VALUES ('public_leads'), ('viewings')) AS refs(table_name) LOOP
    IF to_regclass(ref.table_name) IS NOT NULL THEN
      EXECUTE format('UPDATE %I r SET listing_reference = m.new_id FROM listing_identity_changes m WHERE r.listing_reference = m.old_id AND m.entity = %L', ref.table_name, 'listings');
    END IF;
  END LOOP;
  FOR ref IN SELECT DISTINCT entity FROM listing_identity_changes LOOP
    EXECUTE format('UPDATE %I r SET id = m.new_id FROM listing_identity_changes m WHERE r.id = m.old_id AND m.entity = %L', ref.entity, ref.entity);
  END LOOP;
  IF to_regclass('properties') IS NOT NULL THEN
    UPDATE properties p SET legacy_listing_id = m.new_id FROM listing_identity_changes m
      WHERE m.entity = 'listings' AND p.legacy_listing_id = m.old_id;
  END IF;
  IF to_regclass('listing_enrichment_tasks') IS NOT NULL THEN
    UPDATE listing_enrichment_tasks task SET idempotency_key = target.idempotency_key
      FROM listing_identity_task_targets target JOIN listing_identity_changes m ON m.entity = 'listing_enrichment_tasks' AND m.new_id = target.id
      WHERE task.id = target.id;
  END IF;
  SET CONSTRAINTS ALL IMMEDIATE;
  FOR fk IN SELECT * FROM listing_identity_constraints LOOP
    EXECUTE format('ALTER TABLE %s ALTER CONSTRAINT %I %s', fk.table_name, fk.conname,
      CASE WHEN NOT fk.condeferrable THEN 'NOT DEFERRABLE'
           WHEN fk.condeferred THEN 'DEFERRABLE INITIALLY DEFERRED'
           ELSE 'DEFERRABLE INITIALLY IMMEDIATE' END);
  END LOOP;
END $rekey$;
SELECT entity, count(*) AS reconciled_identities FROM listing_identity_changes GROUP BY entity;
COMMIT;
`;
}
