// What a listing is connected to: the enquiries that name it and the viewings
// booked for it. A record page that shows its relationships is what lets a
// broker go from "this flat" to "who asked about it and when are they coming"
// without leaving it or remembering a reference.
//
// The relations are read through the same authority the enquiry and viewing
// screens use, and only from the operator's own scoped enquiries. A source the
// operator may not read, or that could not be read, is reported as such rather
// than shown as an empty list: "nobody asked" and "we could not look" are
// different facts.
import { canAdminAccess } from "./admin-auth.mjs";

export const LISTING_RELATION_LIMIT = 25;

function namesListing(row, listingId) {
  return [row?.listing_reference, row?.listing_id, row?.listingId].some((value) => String(value || "") === listingId);
}

function newestFirst(field) {
  return (a, b) => String(b[field] || "").localeCompare(String(a[field] || ""));
}

export function listingRelations({ listingId, leads = null, viewings = null, limit = LISTING_RELATION_LIMIT } = {}) {
  const id = String(listingId || "");
  const enquiries = leads
    ? leads
        .filter((row) => namesListing(row, id))
        .map((row) => ({
          id: String(row.lead_id || row.id || ""),
          name: String(row.contact?.name || row.contact_name || row.name || ""),
          received_at: row.received_at || row.created_at || null,
          status: String(row.status || row.state || ""),
          source: String(row.source || row.channel || ""),
        }))
        .filter((row) => row.id)
        .sort(newestFirst("received_at"))
    : null;
  const visits = viewings
    ? viewings
        .filter((row) => namesListing(row, id))
        .map((row) => ({
          id: String(row.id || row.viewing_id || ""),
          lead_id: String(row.lead_id || ""),
          name: String(row.contact_name || row.contact?.name || ""),
          starts_at: row.starts_at || row.scheduled_at || null,
          status: String(row.status || row.outcome || ""),
        }))
        .filter((row) => row.id)
        .sort(newestFirst("starts_at"))
    : null;
  return {
    listing_id: id,
    enquiries: enquiries ? enquiries.slice(0, limit) : [],
    enquiry_count: enquiries ? enquiries.length : null,
    viewings: visits ? visits.slice(0, limit) : [],
    viewing_count: visits ? visits.length : null,
    sources: {
      enquiries: enquiries ? { status: "read" } : { status: "unavailable" },
      viewings: visits ? { status: "read" } : { status: "unavailable" },
    },
  };
}

// Viewings are only read once the operator's own enquiries are known, because
// that is what scopes them; an operator who cannot read enquiries cannot read
// the viewings attached to them either.
export async function loadListingRelations({ listingId, principal, loadLeads, loadViewings }) {
  const read = async (loader) => {
    if (!canAdminAccess(principal, "operations:read")) return null;
    try {
      return await loader();
    } catch {
      return null;
    }
  };
  const leads = await read(loadLeads);
  const viewings = leads ? await read(() => loadViewings(leads)) : null;
  return listingRelations({ listingId, leads, viewings });
}

// Where the "back to listings" link goes. Only the listing manager itself is an
// acceptable destination, rebuilt from its query so nothing else - another
// host, another screen, a header break - can ride along.
export function safeListingManagerReturn(value) {
  const raw = String(value || "");
  if (!raw.startsWith("/admin/listings")) return "";
  let url;
  try {
    url = new URL(raw, "http://ms-realty.local");
  } catch {
    return "";
  }
  if (url.origin !== "http://ms-realty.local" || url.pathname !== "/admin/listings") return "";
  const kept = new URLSearchParams();
  for (const [key, entry] of url.searchParams) {
    if (/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(key) && entry.length <= 200 && !/[\r\n]/.test(entry)) kept.append(key, entry);
  }
  const query = kept.toString();
  return query ? `/admin/listings?${query}` : "/admin/listings";
}
