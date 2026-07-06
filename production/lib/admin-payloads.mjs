import { renderAdminWorkspace } from "./admin-workflows.mjs";

export const LISTING_EDIT_FIELDS = [
  "title",
  "h1",
  "description",
  "location",
  "property_type",
  "offer_type",
  "listing_status",
  "bedrooms",
  "bedrooms_not_applicable",
  "price_eur",
  "price_on_request",
];

function listingRecord(seed, listingId) {
  return seed.records.find((record) => record.collection === "listings" && record.id === listingId);
}

export function renderAdminListingEditorPayload(registry, requestedLocale, seed, listingId, edits, translationTasks) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale });
  const record = listingRecord(seed, listingId || "MS-CRAWL-0001");
  if (!record) throw new Error("Known listingId is required");
  return {
    kind: "admin_listing_editor",
    status: 200,
    locale: workspace.locale,
    lang: workspace.lang,
    dir: workspace.dir,
    path: "/admin/listings/edit",
    canonical: "/admin/listings/edit",
    indexable: false,
    metadata: {
      title: "MS Realty property editor",
      description: "Admin-only listing fact editor with stale translation review state.",
      robots: "noindex,nofollow",
    },
    workspace,
    listing: record,
    edits: edits.filter((edit) => edit.listing_id === record.id),
    translationTasks: translationTasks.filter((task) => task.object_type === "listing" && task.object_id === record.id),
    editableFields: LISTING_EDIT_FIELDS,
  };
}

export function renderAdminLeadsPayload(registry, requestedLocale, data) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale });
  return {
    kind: "admin_lead_inbox",
    status: 200,
    locale: workspace.locale,
    lang: workspace.lang,
    dir: workspace.dir,
    path: "/admin/leads",
    canonical: "/admin/leads",
    indexable: false,
    metadata: {
      title: "MS Realty lead inbox",
      description: "Admin-only CRM lead inbox with broker-reviewed replies.",
      robots: "noindex,nofollow",
    },
    workspace,
    ...data,
    summary: {
      leads: data.leads.length,
      replies: data.replies.length,
      languageRequests: data.languageRequests.length,
      viewings: data.viewings.length,
      savedSearches: data.savedSearches.length,
      sellerPipeline: data.sellerPipeline.length,
      deals: data.deals.length,
    },
  };
}
