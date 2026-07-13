import { renderAdminWorkspace } from "./admin-workflows.mjs";
import { buildLeadSlaReport } from "./lead-sla.mjs";
import { latestTourForListing } from "./tours.mjs";

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

export function renderAdminListingEditorPayload(registry, requestedLocale, seed, listingId, edits, translationTasks, tourApprovals = []) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale });
  const record = listingRecord(seed, listingId || "MS-CRAWL-0001");
  if (!record) throw new Error("Known listingId is required");
  const reviewedTour = latestTourForListing(tourApprovals, record.id);
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
    listing: reviewedTour ? { ...record, tour: reviewedTour } : record,
    edits: edits.filter((edit) => edit.listing_id === record.id),
    translationTasks: translationTasks.filter((task) => task.object_type === "listing" && task.object_id === record.id),
    editableFields: LISTING_EDIT_FIELDS,
  };
}

export function renderAdminLeadsPayload(registry, requestedLocale, data) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale });
  const {
    leadSla: providedLeadSla,
    leadSlaGeneratedAt,
    operatorId,
    viewingFollowUpQueue: providedViewingFollowUpQueue,
    sellerPipelineQueue: providedSellerPipelineQueue,
    ...payloadData
  } = data;
  const leadSla =
    providedLeadSla ||
    buildLeadSlaReport({
      leads: data.leads,
      replies: data.replies,
      generatedAt: leadSlaGeneratedAt,
    });
  const viewingFollowUpQueue =
    providedViewingFollowUpQueue ||
    {
      rows: [],
      summary: { total_viewings: data.viewings.length, open: 0, overdue: 0, booked: 0, completed: 0, rescheduled: 0, no_show: 0 },
    };
  const sellerPipelineQueue =
    providedSellerPipelineQueue ||
    {
      rows: [],
      states: [],
      summary: { total: data.sellerPipeline.length, open: 0, overdue: 0, completed: 0, closed_lost: 0 },
    };
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
      title: `${workspace.copy.leadInbox || "Lead inbox"} | MS Realty`,
      description: workspace.copy.leadInboxDescription || "CRM lead inbox with broker-reviewed replies.",
      robots: "noindex,nofollow",
    },
    workspace: operatorId ? { ...workspace, operator_id: operatorId } : workspace,
    ...payloadData,
    leadSla,
    viewingFollowUpQueue,
    sellerPipelineQueue,
    summary: {
      leads: data.leads.length,
      replies: data.replies.length,
      leadSlaManagerEscalations: leadSla.summary.manager_escalation_required,
      leadSlaReminders: leadSla.summary.reminder_required,
      languageRequests: data.languageRequests.length,
      viewings: data.viewings.length,
      viewingFollowUpsOpen: viewingFollowUpQueue.summary.open,
      viewingFollowUpsOverdue: viewingFollowUpQueue.summary.overdue,
      savedSearches: data.savedSearches.length,
      sellerPipeline: data.sellerPipeline.length,
      sellerPipelineOpen: sellerPipelineQueue.summary.open,
      sellerPipelineOverdue: sellerPipelineQueue.summary.overdue,
      deals: data.deals.length,
    },
  };
}
