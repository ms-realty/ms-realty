// One search entry for the whole workbench. A broker looking for "Sandanski"
// or for a phone number should not have to know first whether the thing they
// remember is a listing, an enquiry, a person or a viewing.
//
// Everything here is pure: the caller reads whatever records it is allowed to
// read and hands them in. That keeps the two runtimes on one implementation and
// makes the ranking testable without a store.
//
// A source the caller could not read is reported as unavailable rather than
// quietly omitted. A search that silently drops enquiries looks exactly like a
// search that found none, and the operator would act on the difference.

import { canAdminAccess } from "./admin-auth.mjs";
import { buildContactRecords } from "./contact-records.mjs";

export const ADMIN_SEARCH_TYPES = Object.freeze(["listing", "lead", "contact", "viewing"]);
export const ADMIN_SEARCH_MIN_QUERY = 2;
const DEFAULT_LIMIT = 20;

// Bulgarian and Russian are the working languages here, so folding has to reach
// past ASCII: "Сандански" typed without its accents, or a Latin transliteration
// in a source record, must still meet in the middle.
function fold(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function terms(query) {
  return fold(query).split(/\s+/).filter(Boolean);
}

function text(...parts) {
  return parts.filter((part) => part !== null && part !== undefined && part !== "").map((part) => String(part));
}

// Exact identity first, then a title that starts with what was typed, then
// anything that merely contains it. A broker who types a reference wants that
// record, not the forty listings whose description mentions it.
function score(candidate, needles) {
  const identity = candidate.identity.map(fold);
  const title = fold(candidate.title);
  const haystack = fold(candidate.haystack.join(" "));
  let total = 0;
  for (const needle of needles) {
    if (identity.some((value) => value === needle)) { total += 100; continue; }
    if (identity.some((value) => value.includes(needle))) { total += 40; continue; }
    if (title.startsWith(needle)) { total += 30; continue; }
    if (title.includes(needle)) { total += 20; continue; }
    if (haystack.includes(needle)) { total += 8; continue; }
    return 0; // every term must land somewhere, or this is not the record
  }
  return total;
}

function listingCandidates(listings) {
  return listings
    .filter((record) => record && record.collection === "listings")
    .map((record) => {
      const facts = record.facts || {};
      const reference = facts.reference || record.lot_number || "";
      return {
        type: "listing",
        id: record.id,
        title: facts.title || record.id,
        subtitle: text(facts.location, facts.municipality, facts.district).join(", "),
        status: record.cms_status || "",
        href: `/admin/listings/edit?listingId=${encodeURIComponent(record.id)}`,
        identity: text(record.id, reference, record.lot_number, facts.id),
        haystack: text(
          facts.title,
          facts.h1,
          facts.location,
          facts.location_native,
          facts.municipality,
          facts.district,
          facts.region,
          facts.property_type,
          record.source_url,
        ),
      };
    });
}

function leadCandidates(leads) {
  return leads.filter(Boolean).map((row) => ({
    type: "lead",
    id: row.id || row.lead_id || "",
    title: row.contact?.name || row.contact_name || row.name || row.email || row.phone || row.id || row.lead_id || "",
    subtitle: text(row.listing_reference || row.listing_id, row.source || row.channel).join(" · "),
    status: row.status || row.state || "",
    href: `/admin/leads#lead-${encodeURIComponent(row.lead_id || row.id || "")}`,
    identity: text(row.id, row.lead_id, row.contact?.email, row.contact?.phone, row.email, row.phone),
    haystack: text(row.contact?.name, row.contact_name, row.name, row.contact?.email, row.contact?.phone, row.email, row.phone, row.listing_reference || row.listing_id, row.message, row.source || row.channel),
  }));
}

function contactCandidates(contacts) {
  return contacts.filter(Boolean).map((row) => ({
    type: "contact",
    id: row.id || row.contact_id || "",
    title: row.display_name || row.contact?.name || row.name || row.full_name || row.email || row.phone || row.id || "",
    subtitle: text(row.contact?.email || row.email, row.contact?.phone || row.phone).join(" · "),
    status: row.status || "",
    href: `/admin/contacts#contact-${encodeURIComponent(row.id || row.contact_id || "")}`,
    identity: text(row.id, row.contact_id, row.contact?.email, row.contact?.phone, row.email, row.phone),
    haystack: text(row.display_name, row.contact?.name, row.name, row.full_name, row.contact?.email, row.contact?.phone, row.email, row.phone, row.company),
  }));
}

function viewingCandidates(viewings) {
  return viewings.filter(Boolean).map((row) => ({
    type: "viewing",
    id: row.id || row.viewing_id || "",
    title: row.listing_reference || row.listing_id || row.contact_name || row.id || row.viewing_id || "",
    subtitle: text(row.scheduled_at || row.starts_at, row.contact_name).join(" · "),
    status: row.status || row.outcome || "",
    href: `/admin/viewings#viewing-${encodeURIComponent(row.id || row.viewing_id || "")}`,
    identity: text(row.id, row.viewing_id, row.listing_reference || row.listing_id),
    haystack: text(row.listing_reference || row.listing_id, row.contact_name, row.notes, row.outcome, row.status),
  }));
}

export function searchAdminRecords({
  query = "",
  listings = [],
  leads = null,
  contacts = null,
  viewings = null,
  limit = DEFAULT_LIMIT,
} = {}) {
  const needles = terms(query);
  // A source handed in as null is one the caller could not read. Saying so is
  // the difference between "no enquiries match" and "enquiries were not
  // searched", and an operator acts differently on each.
  const sources = {
    listing: listings ? { status: "searched" } : { status: "unavailable", reason_key: "listing_store_unavailable" },
    lead: leads ? { status: "searched" } : { status: "unavailable", reason_key: "lead_store_unavailable" },
    contact: contacts ? { status: "searched" } : { status: "unavailable", reason_key: "contact_store_unavailable" },
    viewing: viewings ? { status: "searched" } : { status: "unavailable", reason_key: "viewing_store_unavailable" },
  };
  const short = needles.join("").length < ADMIN_SEARCH_MIN_QUERY;
  if (short) {
    return { kind: "admin_record_search", query: String(query || ""), too_short: true, results: [], sources };
  }
  const candidates = [
    ...listingCandidates(listings || []),
    ...leadCandidates(leads || []),
    ...contactCandidates(contacts || []),
    ...viewingCandidates(viewings || []),
  ];
  const results = candidates
    .map((candidate) => ({ candidate, rank: score(candidate, needles) }))
    .filter((row) => row.rank > 0)
    .sort((a, b) => b.rank - a.rank || String(a.candidate.title).localeCompare(String(b.candidate.title)))
    .slice(0, Math.max(1, limit))
    .map(({ candidate }) => ({
      type: candidate.type,
      id: candidate.id,
      title: candidate.title,
      subtitle: candidate.subtitle,
      status: candidate.status,
      href: candidate.href,
    }));
  return { kind: "admin_record_search", query: String(query || ""), too_short: false, results, sources };
}

// Read through each destination's authority before ranking. A failed or
// forbidden source contributes no candidates and remains visible as unavailable.
export async function searchAuthorizedAdminRecords({ query, principal, loadListings, loadLeads, loadViewings }) {
  const read = async (capability, loader) => {
    if (!canAdminAccess(principal, capability)) return null;
    try { return await loader(); } catch { return null; }
  };
  const [listings, leads] = await Promise.all([
    read("content:read", loadListings),
    read("operations:read", loadLeads),
  ]);
  const contacts = leads ? buildContactRecords({ leads }) : null;
  const viewings = leads ? await read("operations:read", () => loadViewings(leads)) : null;
  return searchAdminRecords({ query, listings, leads, contacts, viewings });
}
