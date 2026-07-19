import { buildLeadSlaReport } from "./lead-sla.mjs";
import { buildLeadPipelineQueue, LEAD_PIPELINES } from "./lead-pipeline-outcomes.mjs";
import { buildPublicRequestQueue } from "./public-request-outcomes.mjs";
import { buildReplyDeliveryQueue } from "./reply-delivery-outcomes.mjs";
import { buildSellerPipelineQueue } from "./seller-pipeline-outcomes.mjs";
import { latestTranslationTasks } from "./translation-ledger.mjs";
import { buildViewingFollowUpQueue } from "./viewing-follow-ups.mjs";

const ACTIVE_LISTING_STATUSES = new Set(["available", "reserved"]);
const PRIVATE_KEYS = new Set(["contact", "email", "message", "name", "phone", "reviewed_reply", "translated_draft", "whatsapp"]);

function countBy(rows, keyFn) {
  const counts = new Map();
  for (const row of rows) {
    const key = String(keyFn(row) || "unknown");
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, count]) => ({ key, count }));
}

function percent(numerator, denominator) {
  return denominator ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function rounded(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function responseMetrics(leads, deliveryStates) {
  const leadsById = new Map(leads.map((lead) => [lead.lead_id, lead]));
  const sentRows = deliveryStates.flatMap((delivery) => {
    const lead = leadsById.get(delivery.lead_id);
    if (delivery.status !== "sent" || !lead || !delivery.sent_at || !lead.received_at) return [];
    const minutes = (Date.parse(delivery.sent_at) - Date.parse(lead.received_at)) / 60000;
    if (!Number.isFinite(minutes) || minutes < 0) return [];
    return [
      {
        lead_id: lead.lead_id,
        source: lead.source,
        original_language: lead.original_language,
        response_minutes: rounded(minutes),
        within_sla: Date.parse(delivery.sent_at) <= Date.parse(lead.sla_due_at),
      },
    ];
  });
  const minutes = sentRows.map((row) => row.response_minutes);
  const withinSla = sentRows.filter((row) => row.within_sla).length;
  return {
    sent: sentRows.length,
    awaiting_delivery: Math.max(0, leads.length - sentRows.length),
    response_rate_pct: percent(sentRows.length, leads.length),
    average_minutes: minutes.length ? rounded(minutes.reduce((sum, value) => sum + value, 0) / minutes.length) : null,
    median_minutes: rounded(percentile(minutes, 0.5)),
    p90_minutes: rounded(percentile(minutes, 0.9)),
    within_sla: withinSla,
    within_sla_rate_pct: percent(withinSla, sentRows.length),
    rows: sentRows,
  };
}

function sourceQuality(leads, deliveryStates, pipelineStates, viewings, deals) {
  const sentLeadIds = new Set(deliveryStates.filter((row) => row.status === "sent").map((row) => row.lead_id));
  const qualifiedLeadIds = new Set(pipelineStates.filter((row) => row.requirements).map((row) => row.lead_id));
  const viewedLeadIds = new Set(viewings.map((row) => row.lead_id));
  const dealLeadIds = new Set(deals.map((row) => row.lead_id));
  const sources = [...new Set(leads.map((lead) => lead.source || "unknown"))].sort();
  return sources
    .map((source) => {
      const sourceLeads = leads.filter((lead) => (lead.source || "unknown") === source);
      const ids = new Set(sourceLeads.map((lead) => lead.lead_id));
      const repliesSent = [...ids].filter((id) => sentLeadIds.has(id)).length;
      const qualified = [...ids].filter((id) => qualifiedLeadIds.has(id)).length;
      const viewingLeads = [...ids].filter((id) => viewedLeadIds.has(id)).length;
      const closedDeals = [...ids].filter((id) => dealLeadIds.has(id)).length;
      return {
        source,
        leads: sourceLeads.length,
        replies_sent: repliesSent,
        response_rate_pct: percent(repliesSent, sourceLeads.length),
        qualified,
        viewing_leads: viewingLeads,
        closed_deals: closedDeals,
        deal_conversion_pct: percent(closedDeals, sourceLeads.length),
      };
    })
    .sort((left, right) => right.leads - left.leads || left.source.localeCompare(right.source));
}

function pipelineFunnel(states, pipeline) {
  const stages = LEAD_PIPELINES[pipeline];
  const pipelineStates = states.filter((state) => state.pipeline === pipeline);
  const stageRows = stages.map((stage, index) => ({
    stage,
    current: pipelineStates.filter((state) => state.stage === stage).length,
    reached: pipelineStates.filter((state) => {
      if (state.status === "closed") return true;
      const effectiveStage = state.status === "lost" ? state.previous_stage : state.stage;
      return stages.indexOf(effectiveStage) >= index;
    }).length,
  }));
  return {
    total: pipelineStates.length,
    open: pipelineStates.filter((state) => state.status === "open").length,
    closed: pipelineStates.filter((state) => state.status === "closed").length,
    lost: pipelineStates.filter((state) => state.status === "lost").length,
    stages: stageRows,
  };
}

function dealAftercare(deals, nowTime) {
  const tasks = deals.flatMap((deal) => [deal.testimonial_request, deal.referral_request]).filter((task) => task?.status === "open");
  return {
    open: tasks.length,
    overdue: tasks.filter((task) => task.due_at && Date.parse(task.due_at) < nowTime).length,
  };
}

function taskHealth({ leadSla, leadPipeline, replyDelivery, viewingFollowUps, sellerPipeline, publicRequests, translationTasks, deals, nowTime }) {
  const staleReplyRows = replyDelivery.rows.filter(
    (row) => row.status === "failed" || (row.reviewed_at && Date.parse(row.reviewed_at) + 24 * 60 * 60 * 1000 < nowTime),
  );
  const translationRows = latestTranslationTasks(translationTasks).filter((row) => row.status !== "published");
  const aftercare = dealAftercare(deals, nowTime);
  const rows = [
    {
      queue: "lead_response_sla",
      open: leadSla.summary.reminder_required + leadSla.summary.manager_escalation_required,
      overdue: leadSla.summary.reminder_required + leadSla.summary.manager_escalation_required,
      blocked: leadSla.summary.manager_escalation_required,
    },
    { queue: "buyer_renter_pipeline", open: leadPipeline.summary.open, overdue: leadPipeline.summary.overdue, blocked: 0 },
    { queue: "reply_delivery", open: replyDelivery.rows.length, overdue: staleReplyRows.length, blocked: replyDelivery.summary.failed },
    { queue: "viewing_follow_up", open: viewingFollowUps.summary.open, overdue: viewingFollowUps.summary.overdue, blocked: 0 },
    { queue: "seller_pipeline", open: sellerPipeline.summary.open, overdue: sellerPipeline.summary.overdue, blocked: 0 },
    { queue: "website_requests", open: publicRequests.summary.open, overdue: publicRequests.summary.overdue, blocked: 0 },
    {
      queue: "translation_review",
      open: translationRows.length,
      overdue: translationRows.filter((row) => row.status === "stale").length,
      blocked: translationRows.filter((row) => row.status === "missing").length,
    },
    { queue: "deal_aftercare", open: aftercare.open, overdue: aftercare.overdue, blocked: 0 },
  ];
  return {
    open: rows.reduce((sum, row) => sum + row.open, 0),
    overdue: rows.reduce((sum, row) => sum + row.overdue, 0),
    blocked: rows.reduce((sum, row) => sum + row.blocked, 0),
    rows,
  };
}

function listingInventory(seed, translationTasks) {
  const listings = seed.records.filter((record) => record.collection === "listings");
  const tasks = latestTranslationTasks(translationTasks);
  return {
    total: listings.length,
    active: listings.filter((record) => ACTIVE_LISTING_STATUSES.has(record.facts?.listing_status || "available")).length,
    review_required: listings.filter(
      (record) => record.routing?.review_required === true || Object.values(record.migration?.metadata_gaps || {}).some(Boolean),
    ).length,
    translation_review: tasks.filter((task) => task.status !== "published").length,
    by_status: countBy(listings, (record) => record.facts?.listing_status || "available"),
    by_source_locale: countBy(listings, (record) => record.source_locale),
  };
}

function containsPrivateField(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsPrivateField);
  return Object.entries(value).some(([key, child]) => PRIVATE_KEYS.has(key) || containsPrivateField(child));
}

export function buildOperationsReport({
  leads = [],
  replies = [],
  replyDeliveryOutcomes = [],
  leadPipelineOutcomes = [],
  viewings = [],
  viewingFollowUps = [],
  deals = [],
  sellerPipelines = [],
  sellerPipelineOutcomes = [],
  savedSearches = [],
  languageRequests = [],
  publicRequestOutcomes = [],
  translationTasks = [],
  seed = { records: [] },
  searchAnalytics = { summary: { search_events: 0, zero_result_events: 0, filtered_search_events: 0, locales: [], popular_filters: [], zero_result_queries: [] } },
  generatedAt = new Date().toISOString(),
} = {}) {
  const nowTime = Date.parse(generatedAt);
  if (!Number.isFinite(nowTime)) throw new Error("generatedAt must be an ISO timestamp");
  const replyDelivery = buildReplyDeliveryQueue(replies, replyDeliveryOutcomes);
  const leadSla = buildLeadSlaReport({ leads, replies, replyDeliveryStates: replyDelivery.states, generatedAt });
  const leadPipeline = buildLeadPipelineQueue(
    { leads, outcomes: leadPipelineOutcomes, viewings, viewingFollowUps, deals },
    { now: generatedAt },
  );
  const viewingQueue = buildViewingFollowUpQueue(viewings, viewingFollowUps, { now: generatedAt });
  const sellerQueue = buildSellerPipelineQueue(sellerPipelines, sellerPipelineOutcomes, { now: generatedAt });
  const publicQueue = buildPublicRequestQueue({
    savedSearches,
    languageRequests,
    outcomes: publicRequestOutcomes,
    now: generatedAt,
  });
  const response = responseMetrics(leads, replyDelivery.states);
  const tasks = taskHealth({
    leadSla,
    leadPipeline,
    replyDelivery,
    viewingFollowUps: viewingQueue,
    sellerPipeline: sellerQueue,
    publicRequests: publicQueue,
    translationTasks,
    deals,
    nowTime,
  });
  const inventory = listingInventory(seed, translationTasks);
  const report = {
    kind: "operations_report",
    generated_at: new Date(nowTime).toISOString(),
    privacy: { raw_contacts_included: false, raw_messages_included: false },
    summary: {
      leads: leads.length,
      replies_sent: response.sent,
      response_rate_pct: response.response_rate_pct,
      median_response_minutes: response.median_minutes,
      closed_deals: deals.length,
      open_tasks: tasks.open,
      overdue_tasks: tasks.overdue,
      active_listings: inventory.active,
    },
    lead_volume: {
      by_source: countBy(leads, (lead) => lead.source),
      by_language: countBy(leads, (lead) => lead.original_language),
      by_type: countBy(leads, (lead) => lead.lead_type),
    },
    response_time: response,
    source_quality: sourceQuality(leads, replyDelivery.states, leadPipeline.states, viewings, deals),
    pipelines: {
      buyer: pipelineFunnel(leadPipeline.states, "buyer"),
      renter: pipelineFunnel(leadPipeline.states, "renter"),
      seller: {
        total: sellerQueue.summary.total,
        open: sellerQueue.summary.open,
        completed: sellerQueue.summary.completed,
        lost: sellerQueue.summary.closed_lost,
        stages: countBy(sellerQueue.states, (state) => state.stage),
      },
    },
    task_health: tasks,
    listing_inventory: inventory,
    search: searchAnalytics.summary,
  };
  assertOperationsReport(report);
  return report;
}

export function assertOperationsReport(report) {
  if (report.kind !== "operations_report" || !report.generated_at) throw new Error("Operations report is missing identity data");
  if (report.privacy?.raw_contacts_included !== false || report.privacy?.raw_messages_included !== false) {
    throw new Error("Operations report must declare its privacy boundary");
  }
  if (containsPrivateField(report)) throw new Error("Operations report must not contain raw private fields");
  if (report.summary.leads !== report.lead_volume.by_source.reduce((sum, row) => sum + row.count, 0)) {
    throw new Error("Operations lead summary must match source volume");
  }
  if (report.summary.open_tasks !== report.task_health.rows.reduce((sum, row) => sum + row.open, 0)) {
    throw new Error("Operations open-task summary must match queue rows");
  }
  if (report.summary.overdue_tasks !== report.task_health.rows.reduce((sum, row) => sum + row.overdue, 0)) {
    throw new Error("Operations overdue-task summary must match queue rows");
  }
  if (report.source_quality.some((row) => row.replies_sent > row.leads || row.closed_deals > row.leads)) {
    throw new Error("Operations source quality cannot exceed source lead volume");
  }
  return true;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function renderOperationsReportCsv(report) {
  assertOperationsReport(report);
  const headers = ["source", "leads", "replies_sent", "response_rate_pct", "qualified", "viewing_leads", "closed_deals", "deal_conversion_pct"];
  const rows = report.source_quality.map((row) => headers.map((header) => csvCell(row[header])).join(","));
  return `${[headers.join(","), ...rows].join("\n")}\n`;
}
