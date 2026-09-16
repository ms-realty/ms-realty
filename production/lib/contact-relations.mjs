// What a contact is connected to: their enquiries, the properties those
// enquiries and viewings name, the viewings booked for them and the deals
// closed with them. A person's record is where a broker goes to answer "what
// is going on with this customer", so the answer is on the record, one click
// from each related record.
//
// Everything here is keyed by the contact's own enquiries, and the contact
// itself is built only from the operator's scoped enquiries, so a relation can
// never reach a record the operator could not already open. A source that could
// not be read is reported as such, never as an empty list.

export const CONTACT_RELATION_LIMIT = 25;

// What a Payload-only runtime cannot show on a contact yet: message threads
// and accounts still live only in file ledgers there.
export const CONTACT_DATA_UNAVAILABLE = Object.freeze({
  communicationThreads: Object.freeze({ status: "unavailable", reason_key: "durable_projection_unavailable" }),
  accounts: Object.freeze({ status: "unavailable", reason_key: "durable_projection_unavailable" }),
});

function newestFirst(field) {
  return (a, b) => String(b[field] || "").localeCompare(String(a[field] || ""));
}

function byLead(rows) {
  const index = new Map();
  for (const row of rows || []) {
    const leadId = String(row?.lead_id || "");
    if (!leadId) continue;
    if (!index.has(leadId)) index.set(leadId, []);
    index.get(leadId).push(row);
  }
  return index;
}

function reference(value) {
  return String(value || "").trim();
}

export function contactRelations(contact, { leadIndex, viewingIndex = null, dealIndex = null, listingIds = null, limit = CONTACT_RELATION_LIMIT } = {}) {
  const leadIds = contact?.lead_ids || [];
  const enquiries = leadIds
    .flatMap((leadId) => leadIndex?.get(leadId) || [])
    .map((lead) => ({
      id: String(lead.lead_id),
      received_at: lead.received_at || null,
      lead_type: String(lead.lead_type || ""),
      status: String(lead.status || ""),
      listing_reference: reference(lead.listing_reference) || null,
    }))
    .sort(newestFirst("received_at"));
  const viewings = viewingIndex
    ? leadIds
        .flatMap((leadId) => viewingIndex.get(leadId) || [])
        .map((row) => ({
          id: String(row.id || row.viewing_id || ""),
          lead_id: String(row.lead_id),
          starts_at: row.starts_at || null,
          status: String(row.status || ""),
          listing_reference: reference(row.listing_reference) || null,
        }))
        .filter((row) => row.id)
        .sort(newestFirst("starts_at"))
    : null;
  const deals = dealIndex
    ? leadIds
        .flatMap((leadId) => dealIndex.get(leadId) || [])
        .map((row) => ({
          id: String(row.id || ""),
          lead_id: String(row.lead_id),
          closed_at: row.closed_at || null,
          status: String(row.status || row.stage || ""),
          listing_reference: reference(row.listing_reference) || null,
        }))
        .filter((row) => row.id)
        .sort(newestFirst("closed_at"))
    : null;
  // A property is related when anything about this person names it; the most
  // recent mention comes first. A reference is typed by people, so it is only
  // "known" when a listing with that id exists; null means nobody checked.
  const latestMention = new Map();
  for (const [id, at] of [
    ...enquiries.map((row) => [row.listing_reference, row.received_at]),
    ...(viewings || []).map((row) => [row.listing_reference, row.starts_at]),
    ...(deals || []).map((row) => [row.listing_reference, row.closed_at]),
  ]) {
    if (!id) continue;
    const seen = latestMention.get(id);
    if (seen === undefined || String(at || "") > seen) latestMention.set(id, String(at || ""));
  }
  const listings = [...latestMention.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]) || a[0].localeCompare(b[0]))
    .map(([id]) => ({ id, known: listingIds ? listingIds.has(id) : null }));
  const cap = (rows) => (rows ? rows.slice(0, limit) : []);
  return {
    enquiries: cap(enquiries),
    enquiry_count: enquiries.length,
    listings: cap(listings),
    listing_count: listings.length,
    viewings: cap(viewings),
    viewing_count: viewings ? viewings.length : null,
    deals: cap(deals),
    deal_count: deals ? deals.length : null,
    sources: {
      enquiries: { status: "read" },
      viewings: { status: viewings ? "read" : "unavailable" },
      deals: { status: deals ? "read" : "unavailable" },
    },
  };
}

// Reads the related sources once for the whole contact screen and attaches
// each contact's share. A source that fails is unavailable for this render;
// the contacts themselves still show.
export async function withContactRelations(contacts, { leads = [], loadViewings = null, loadDeals = null, loadListings = null, limit } = {}) {
  const read = async (loader) => {
    if (!loader) return null;
    try {
      const rows = await loader();
      return Array.isArray(rows) ? rows : null;
    } catch {
      return null;
    }
  };
  const viewings = await read(loadViewings);
  const deals = await read(loadDeals);
  const listings = await read(loadListings);
  const listingIds = listings ? new Set(listings.map((listing) => String(listing?.id || ""))) : null;
  const leadIndex = byLead(leads);
  const viewingIndex = viewings ? byLead(viewings) : null;
  const dealIndex = deals ? byLead(deals) : null;
  return contacts.map((contact) => ({
    ...contact,
    relations: contactRelations(contact, { leadIndex, viewingIndex, dealIndex, listingIds, limit }),
  }));
}
