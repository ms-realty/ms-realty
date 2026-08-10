import assert from "node:assert/strict";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";

const VERSIONED_COLLECTIONS = new Set(["listings", "listing_translations", "media_assets", "listing_tours"]);
const COLLECTIONS = [
  "locales",
  "locations",
  "properties",
  "listings",
  "listing_translations",
  "media_assets",
  "listing_tours",
  "listing_enrichment_tasks",
  "search_outbox",
];

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function seedRows(seed = loadCmsSeed()) {
  const registry = loadLocaleRegistry();
  const localeRows = registry.locales.map((locale, index) => ({
    id: index + 1,
    code: locale.code,
    native_name: locale.native_name,
    admin_name: locale.admin_name,
    direction: locale.direction,
    public_enabled: locale.public_enabled === true,
    indexable: locale.indexable === true,
  }));
  const localeIds = new Map(localeRows.map((row) => [row.code, row.id]));
  let translationId = 1000;
  let mediaId = 2000;
  let tourId = 3000;
  const translations = [];
  const mediaAssets = [];
  const tours = [];
  const listings = seed.records
    .filter((record) => record.collection === "listings")
    .map((record) => {
      const translationRefs = (record.translations || []).map((translation) => {
        const id = translationId++;
        translations.push({
          id,
          listing: record.id,
          locale: localeIds.get(translation.locale) || translation.locale,
          source_locale: localeIds.get(translation.source_locale) || translation.source_locale,
          status: translation.status || "draft",
          source_hash: translation.source_hash,
          translated_hash: translation.translated_hash,
          reviewer: translation.reviewer || null,
          approved_at: translation.approved_at || null,
          direction: translation.direction || null,
          public_indexable: translation.public_indexable === true,
          translation_state: translation.translation_state || translation.status || "draft",
        });
        return id;
      });
      const mediaRefs = (record.media || []).map((asset) => {
        const id = mediaId++;
        mediaAssets.push({
          id,
          url: asset.url,
          asset_url: asset.asset_url ?? null,
          alt: asset.alt || "",
          width: asset.width ?? null,
          height: asset.height ?? null,
          kind: asset.kind,
          is_public: asset.is_public === true,
          review_status: asset.review_status,
        });
        return id;
      });
      let tourRef = null;
      if (record.tour) {
        tourRef = tourId++;
        tours.push({
          id: tourRef,
          listing_id: record.id,
          provider: record.tour.provider,
          panorama_url: record.tour.panorama_url ?? null,
          viewer_url: record.tour.viewer_url ?? null,
          thumbnail_url: record.tour.thumbnail_url ?? null,
          hotspots: clone(record.tour.hotspots || []),
          is_public: record.tour.is_public === true,
          accessibility_caption: record.tour.accessibility_caption || "",
          review_status: record.tour.review_status,
          fallback_gallery: clone(record.tour.fallback_gallery || []),
        });
      }
      return {
        id: record.id,
        cms_status: record.cms_status,
        source_locale: localeIds.get(record.source_locale) || record.source_locale,
        source_domain: record.source_domain,
        source_url: record.source_url,
        facts: clone(record.facts || {}),
        seo: clone(record.seo || {}),
        workflow: clone(record.workflow || {}),
        property: record.property,
        location: record.location,
        routing: clone(record.routing || null),
        migration: clone(record.migration || null),
        translations: translationRefs,
        media: mediaRefs,
        tour: tourRef,
      };
    });
  return {
    locales: localeRows,
    locations: clone(seed.locations || []),
    properties: clone(seed.properties || []),
    listings,
    listing_translations: translations,
    media_assets: mediaAssets,
    listing_tours: tours,
    listing_enrichment_tasks: clone(seed.enrichment_tasks || []),
    search_outbox: [],
  };
}

export function createPayloadDraftRuntime(seed = loadCmsSeed(), hooks = {}) {
  let rows = seedRows(seed);
  let publishedRows = Object.fromEntries(COLLECTIONS.map((collection) => [collection, []]));
  const calls = { begin: 0, commit: 0, rollback: 0, find: [], findByID: [], update: [] };
  let snapshot = null;

  const mergedDocs = (collection, draft) => {
    if (!VERSIONED_COLLECTIONS.has(collection)) return clone(rows[collection] || []);
    if (!draft) return clone(publishedRows[collection] || []);
    const docs = new Map((publishedRows[collection] || []).map((row) => [String(row.id), clone(row)]));
    for (const row of rows[collection] || []) docs.set(String(row.id), clone(row));
    return [...docs.values()];
  };

  const payload = {
    calls,
    db: {
      async beginTransaction() {
        calls.begin += 1;
        snapshot = { rows: clone(rows), publishedRows: clone(publishedRows) };
        return `tx-${calls.begin}`;
      },
      async commitTransaction() {
        calls.commit += 1;
        snapshot = null;
      },
      async rollbackTransaction() {
        calls.rollback += 1;
        if (snapshot) {
          rows = clone(snapshot.rows);
          publishedRows = clone(snapshot.publishedRows);
        }
        snapshot = null;
      },
    },
    async find({ collection, draft, req }) {
      calls.find.push({ collection, draft: draft === true, transactionID: req?.transactionID || null });
      if (hooks.failRead && hooks.failRead(collection, calls)) throw hooks.failRead(collection, calls);
      return { docs: mergedDocs(collection, draft === true) };
    },
    async findByID({ collection, id, draft, req }) {
      calls.findByID.push({ collection, id, draft: draft === true, transactionID: req?.transactionID || null });
      const doc = mergedDocs(collection, draft === true).find((row) => String(row.id) === String(id));
      return doc ? clone(doc) : null;
    },
    async create({ collection, data, req }) {
      assert.match(req.transactionID, /^tx-/);
      rows[collection].push(clone(data));
      return clone(data);
    },
    async update({ collection, id, data, draft, req, context }) {
      calls.update.push({ collection, id, draft: draft === true, transactionID: req?.transactionID || null, context: clone(context || null) });
      assert.match(req.transactionID, /^tx-/);
      const target = rows[collection].findIndex((row) => String(row.id) === String(id));
      if (target < 0) throw new Error(`Unknown ${collection} id ${id}`);
      rows[collection][target] = { ...rows[collection][target], ...clone(data), _status: "draft" };
      if (hooks.afterUpdate) await hooks.afterUpdate({ collection, id, rows, publishedRows, calls });
      return clone(rows[collection][target]);
    },
  };

  return {
    payload,
    currentRows: () => clone(rows),
    currentPublishedRows: () => clone(publishedRows),
  };
}
