// What happened to a listing, told from the record itself.
//
// In production the audit trail for listing edits is telemetry, not something
// the workbench can query; the authority is Payload's own version history.
// Listings keep every draft version, and every draft save stamps
// workflow.last_edit_event with who changed which fields, when, and through
// which channel. Reading the versions back therefore gives a history that
// survives deploys and needs no second store.
//
// Only field names are reported, never their values: the history says that the
// price changed, not what it changed to, so it cannot become a way around the
// editor's own access rules or a copy of draft content.
import { loadPayloadCmsImportRuntime } from "./payload-cms-import.mjs";

export const LISTING_HISTORY_LIMIT = 30;
// Newest versions read per request. A listing edited more often than this has
// its oldest events left out, and the result says so rather than implying the
// history is complete.
export const LISTING_HISTORY_VERSION_WINDOW = 200;

function stamp(value) {
  const text = String(value || "");
  return Number.isNaN(Date.parse(text)) ? "" : text;
}

function relationKey(entry) {
  const id = entry && typeof entry === "object" ? entry.id ?? entry.value : entry;
  return String(id ?? "");
}

function sameMembers(before, after) {
  if (before.length !== after.length) return false;
  const left = [...before].sort();
  const right = [...after].sort();
  return left.every((value, index) => value === right[index]);
}

function newestFirst(a, b) {
  return b.at.localeCompare(a.at) || a.order - b.order;
}

export function listingHistoryFromVersions(versions = [], { limit = LISTING_HISTORY_LIMIT } = {}) {
  const ordered = versions
    .filter((entry) => entry && entry.version && typeof entry.version === "object")
    .map((entry) => ({ entry, at: stamp(entry.updatedAt || entry.createdAt || entry.version.updatedAt) }))
    .filter((row) => row.at)
    .sort((a, b) => a.at.localeCompare(b.at));
  const events = [];
  const seenEdits = new Set();
  let previous = null;
  for (const { entry, at } of ordered) {
    const doc = entry.version;
    const edit = doc.workflow?.last_edit_event;
    const editedAt = stamp(edit?.edited_at);
    // Every later version carries the same last_edit_event until the next
    // edit, so an edit is reported once, at the moment it was made.
    if (edit && editedAt) {
      const fields = Array.isArray(edit.changed_fields) ? edit.changed_fields.map(String) : [];
      const key = `${editedAt}|${edit.actor_id || ""}|${fields.join(",")}`;
      if (!seenEdits.has(key)) {
        seenEdits.add(key);
        events.push({
          kind: "edited",
          at: editedAt,
          actor: edit.actor_id ? String(edit.actor_id) : null,
          channel: edit.channel === "mcp" ? "mcp" : "admin",
          fields,
          stale_locales: Array.isArray(edit.stale_locales) ? edit.stale_locales.map(String) : [],
          order: events.length,
        });
      }
    }
    if (previous) {
      if (doc.cms_status && previous.cms_status !== doc.cms_status) {
        events.push({ kind: "status", at, actor: null, from: previous.cms_status || null, to: String(doc.cms_status), order: events.length });
      }
      const before = (Array.isArray(previous.media) ? previous.media : []).map(relationKey);
      const after = (Array.isArray(doc.media) ? doc.media : []).map(relationKey);
      if (before.join("|") !== after.join("|")) {
        // Neither a reorder nor an attachment stamps who did it on the listing
        // itself, so the history does not pretend to know.
        events.push({
          kind: sameMembers(before, after) ? "gallery_reordered" : "gallery_changed",
          at,
          actor: null,
          count: after.length,
          order: events.length,
        });
      }
    }
    previous = doc;
  }
  return events.sort(newestFirst).slice(0, Math.max(1, limit)).map(({ order, ...event }) => event);
}

// The file audit log a local or fixed-origin runtime keeps. Entries about the
// listing itself, and about its media, are the listing's history there.
const AUDIT_KINDS = Object.freeze({
  listing_edited: "edited",
  listing_media_reordered: "gallery_reordered",
  media_reviewed: "media_reviewed",
  media_uploaded: "media_uploaded",
  listing_slug_changed: "slug_changed",
  listing_publication_executed: "published",
  listing_publication_reverted: "unpublished",
});

export function listingHistoryFromAudit(entries = [], listingId, { limit = LISTING_HISTORY_LIMIT } = {}) {
  const id = String(listingId || "");
  return entries
    .filter((entry) => entry && AUDIT_KINDS[entry.action])
    .filter((entry) =>
      (entry.object_type === "listing" && String(entry.object_id) === id) ||
      String(entry.metadata?.listing_id || "") === id)
    .map((entry, order) => ({
      kind: AUDIT_KINDS[entry.action],
      at: stamp(entry.recorded_at || entry.at || entry.created_at),
      actor: entry.actor ? String(entry.actor) : null,
      channel: entry.metadata?.source === "mcp_payload_draft" ? "mcp" : "admin",
      fields: Array.isArray(entry.metadata?.changed_fields) ? entry.metadata.changed_fields.map(String) : [],
      order,
    }))
    .filter((event) => event.at)
    .sort(newestFirst)
    .slice(0, Math.max(1, limit))
    .map(({ order, ...event }) => event);
}

export async function readListingVersionHistory({ listingId, payload = null, env = process.env, limit = LISTING_HISTORY_LIMIT } = {}) {
  const runtime = await loadPayloadCmsImportRuntime({ env, payload });
  if (typeof runtime.findVersions !== "function") throw new Error("Listing versions cannot be read here");
  // The admin route already required content:read for this listing; Payload's
  // own collection access is written for its admin UI, not for this reader.
  const result = await runtime.findVersions({
    collection: "listings",
    where: { parent: { equals: listingId } },
    sort: "-updatedAt",
    limit: LISTING_HISTORY_VERSION_WINDOW,
    depth: 0,
    overrideAccess: true,
  });
  const docs = Array.isArray(result?.docs) ? result.docs : [];
  return {
    source: "payload_versions",
    events: listingHistoryFromVersions(docs, { limit }),
    truncated: result?.hasNextPage === true,
  };
}

// One entry point for both runtimes. A history that cannot be read is reported
// as unavailable, never as a listing that nobody has touched.
export async function loadListingHistory({ listingId, readVersions = null, readAudit = null, limit = LISTING_HISTORY_LIMIT } = {}) {
  try {
    if (readVersions) return { status: "read", ...(await readVersions({ listingId, limit })) };
    if (readAudit) {
      return { status: "read", source: "audit_log", events: listingHistoryFromAudit(await readAudit(), listingId, { limit }), truncated: false };
    }
  } catch {
    // fall through
  }
  return { status: "unavailable", source: null, events: [], truncated: false };
}
