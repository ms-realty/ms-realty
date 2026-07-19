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
  "area_sqm",
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

export function renderAdminOperationsReportPayload(registry, requestedLocale, report, operatorId = null) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale });
  return {
    kind: "admin_operations_reports",
    status: 200,
    locale: workspace.locale,
    lang: workspace.lang,
    dir: workspace.dir,
    path: "/admin/reports",
    canonical: "/admin/reports",
    indexable: false,
    metadata: {
      title: `${workspace.copy.operationsReports || "Operations reports"} | MS Realty`,
      description:
        workspace.copy.operationsReportsDescription ||
        "Lead volume, actual customer response time, source quality, pipelines, and stale work from the operating ledgers.",
      robots: "noindex,nofollow",
    },
    workspace: operatorId ? { ...workspace, operator_id: operatorId } : workspace,
    report,
  };
}

export function renderAdminLeadsPayload(registry, requestedLocale, data) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale });
  const {
    leadSla: providedLeadSla,
    leadSlaGeneratedAt,
    operatorId,
    leadPipelineQueue: providedLeadPipelineQueue,
    replyDeliveryQueue: providedReplyDeliveryQueue,
    viewingFollowUpQueue: providedViewingFollowUpQueue,
    sellerPipelineQueue: providedSellerPipelineQueue,
    publicRequestQueue: providedPublicRequestQueue,
    ...payloadData
  } = data;
  const leadSla =
    providedLeadSla ||
    buildLeadSlaReport({
      leads: data.leads,
      replies: data.replies,
      replyDeliveryStates: providedReplyDeliveryQueue?.states || [],
      generatedAt: leadSlaGeneratedAt,
    });
  const replyDeliveryQueue =
    providedReplyDeliveryQueue ||
    {
      rows: [],
      states: [],
      summary: { total: data.replies.length, queued: data.replies.length, failed: 0, sent: 0 },
    };
  const leadPipelineQueue =
    providedLeadPipelineQueue ||
    {
      rows: [],
      states: [],
      summary: { total: 0, open: 0, overdue: 0, buyers_open: 0, renters_open: 0, lost: 0, closed: 0, qualified: 0 },
    };
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
  const publicRequestQueue =
    providedPublicRequestQueue ||
    {
      rows: [],
      states: [],
      contact_vault_status: "not_configured",
      summary: {
        total: (data.savedSearches?.length || 0) + (data.languageRequests?.length || 0),
        open: 0,
        overdue: 0,
        contacted: 0,
        completed: 0,
        closed: 0,
        saved_search_open: 0,
        language_request_open: 0,
        contacts_available: 0,
      },
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
    leadPipelineQueue,
    replyDeliveryQueue,
    viewingFollowUpQueue,
    sellerPipelineQueue,
    publicRequestQueue,
    summary: {
      leads: data.leads.length,
      replies: data.replies.length,
      repliesQueued: replyDeliveryQueue.summary.queued,
      repliesFailed: replyDeliveryQueue.summary.failed,
      repliesSent: replyDeliveryQueue.summary.sent,
      buyerPipelineOpen: leadPipelineQueue.summary.buyers_open,
      renterPipelineOpen: leadPipelineQueue.summary.renters_open,
      leadPipelineOverdue: leadPipelineQueue.summary.overdue,
      leadPipelineQualified: leadPipelineQueue.summary.qualified,
      leadSlaManagerEscalations: leadSla.summary.manager_escalation_required,
      leadSlaReminders: leadSla.summary.reminder_required,
      languageRequests: data.languageRequests.length,
      viewings: data.viewings.length,
      viewingFollowUpsOpen: viewingFollowUpQueue.summary.open,
      viewingFollowUpsOverdue: viewingFollowUpQueue.summary.overdue,
      savedSearches: data.savedSearches.length,
      publicRequestsOpen: publicRequestQueue.summary.open,
      publicRequestsOverdue: publicRequestQueue.summary.overdue,
      sellerPipeline: data.sellerPipeline.length,
      sellerPipelineOpen: sellerPipelineQueue.summary.open,
      sellerPipelineOverdue: sellerPipelineQueue.summary.overdue,
      deals: data.deals.length,
    },
  };
}
