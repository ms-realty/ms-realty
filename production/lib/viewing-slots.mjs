// The public slot picker, as one contract both runtimes answer with.
//
// A visitor asks which times a listing's broker is free; the answer is derived
// from the broker's recorded availability minus the viewings already on the
// calendar. Nothing here books anything — the payload says so in as many words,
// because office hours are the agency's published week, not a claim about one
// broker's diary.
//
// The Node server (http.mjs) and the App Router adapter both serve
// GET /api/viewing-slots, and production only ever runs the second. Keeping the
// broker resolution, the date window and the response shape here is what stops
// the two from offering a visitor different times for the same listing.

import { brokerAvailabilityFor, officeTimeZone } from "./broker-availability.mjs";
import { latestApprovedBrokerContact } from "./broker-contacts.mjs";
import {
  DEFAULT_SLOT_STEP_MINUTES,
  DEFAULT_VIEWING_DURATION_MINUTES,
  addDays,
  computeFreeSlots,
  zonedParts,
} from "./broker-free-slots.mjs";
import { resolvePublicLocale } from "./locales.mjs";
import { deriveViewingFollowUpStates, readViewingFollowUps } from "./viewing-follow-ups.mjs";
import { readViewings } from "./viewing-ledger.mjs";
import {
  ViewingStoreUnavailableError,
  isViewingDurableStoreEnabled,
  readViewingsDurably,
} from "./viewing-durable-store.mjs";

// A slot parameter is a count, never an expression. Anything else is refused
// rather than coerced, so a malformed query cannot silently widen the window.
export function wholeNumberSlotParam(value, fallback) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error("Slot parameters must be whole numbers");
  return Number(raw);
}

// Viewings already on a calendar, with their current state: a rescheduled
// viewing must block its new time, not its original one.
export async function publicViewingSource({
  viewingDurableStore = null,
  viewingDurablePayload = null,
  viewingLedgerPath = null,
  viewingFollowUpLedgerPath = null,
} = {}) {
  if (!viewingDurableStore?.viewingDurableStoreEnabled) {
    return deriveViewingFollowUpStates(
      readViewings(viewingLedgerPath || undefined),
      readViewingFollowUps(viewingFollowUpLedgerPath || undefined),
    );
  }
  if (!isViewingDurableStoreEnabled(viewingDurableStore)) {
    throw new ViewingStoreUnavailableError("Durable viewing store is enabled but not fully configured");
  }
  const viewings = await readViewingsDurably({ payload: viewingDurablePayload || null });
  if (!Array.isArray(viewings)) throw new ViewingStoreUnavailableError("Durable viewing readback returned invalid rows");
  return viewings;
}

// Which broker a visitor would be talking to about this listing. Without an
// approved broker contact there is no source-backed calendar to expose.
export function viewingSlotBroker({ brokerContacts = [], listing, listingReference, localeCode }) {
  const brokerContact = latestApprovedBrokerContact(brokerContacts, listingReference);
  return brokerContact?.broker || null;
}

// Throws a 404-shaped error when the listing is not published: fail closed, no
// published listing, no slots.
export class ViewingSlotListingNotFoundError extends Error {
  constructor(listingReference) {
    super("Listing not found");
    this.name = "ViewingSlotListingNotFoundError";
    this.code = "listing_not_found";
    this.status = 404;
    this.listingReference = listingReference;
  }
}

export function publicViewingSlotsPayload({
  registry,
  seed,
  searchParams,
  brokerContacts = [],
  availabilityRows = [],
  viewings = [],
  now = new Date().toISOString(),
  env = process.env,
}) {
  const listingReference = String(searchParams.get("listing") || searchParams.get("listingReference") || "").trim();
  if (!listingReference) throw new Error("listing is required");
  const listing = seed.records.find((record) => record.collection === "listings" && record.id === listingReference);
  if (!listing) throw new ViewingSlotListingNotFoundError(listingReference);

  const requestedLocale = String(searchParams.get("locale") || registry.source_locale).trim();
  const resolvedLocale = resolvePublicLocale(registry, requestedLocale);
  const brokerId = viewingSlotBroker({
    brokerContacts,
    listing,
    listingReference,
    localeCode: resolvedLocale.locale.code,
  });
  const timeZone = officeTimeZone(env);
  const firstDay = searchParams.get("from") || addDays(zonedParts(Date.parse(now), timeZone).date, 1);
  const lastDay = searchParams.get("to") || addDays(firstDay, 13);
  const durationMinutes = wholeNumberSlotParam(searchParams.get("duration"), DEFAULT_VIEWING_DURATION_MINUTES);
  if (!brokerId) {
    return {
      kind: "viewing_slots",
      listing_reference: listingReference,
      locale: resolvedLocale.locale.code,
      broker_id: null,
      availability_source: "broker_confirmation_required",
      confirmation: "human_required",
      timezone: timeZone,
      from: firstDay,
      to: lastDay,
      duration_minutes: durationMinutes,
      slots: [],
      summary: { days: 0, open_days: 0, candidate_slots: 0, available_slots: 0, returned_slots: 0, blocked_by_viewings: 0 },
    };
  }
  const availability = brokerAvailabilityFor(availabilityRows, brokerId, { now, env });
  const slots = computeFreeSlots({
    availability,
    viewings,
    from: firstDay,
    to: lastDay,
    durationMinutes,
    stepMinutes: DEFAULT_SLOT_STEP_MINUTES,
    now,
    // A visitor cannot pick a slot a broker has no time to prepare for.
    leadTimeMinutes: wholeNumberSlotParam(searchParams.get("leadTime"), 24 * 60),
    limit: wholeNumberSlotParam(searchParams.get("limit"), 24),
  });
  return {
    kind: "viewing_slots",
    listing_reference: listingReference,
    locale: resolvedLocale.locale.code,
    broker_id: brokerId,
    // Office hours are the agency's published week, not a claim about this
    // broker's diary, so the visitor is told a broker confirms.
    availability_source: availability.source,
    confirmation: "human_required",
    timezone: slots.timezone,
    from: slots.from,
    to: slots.to,
    duration_minutes: slots.duration_minutes,
    slots: slots.slots.map((slot) => ({
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
      local_date: slot.local_date,
      local_start: slot.local_start,
      local_end: slot.local_end,
    })),
    summary: slots.summary,
  };
}
