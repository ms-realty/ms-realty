import test from "node:test";
import assert from "node:assert/strict";
import { assertOperationsReport, buildOperationsReport, renderOperationsReportCsv } from "../lib/operations-report.mjs";

function lead(leadId, source, leadType, receivedAt = "2026-07-19T08:00:00.000Z") {
  return {
    lead_id: leadId,
    source,
    lead_type: leadType,
    original_language: leadType === "renter" ? "ru" : "bg",
    admin_locale: leadType === "renter" ? "ru" : "bg",
    assigned_broker: "broker_one",
    received_at: receivedAt,
    sla_due_at: new Date(Date.parse(receivedAt) + 15 * 60 * 1000).toISOString(),
    manager_escalation_due_at: new Date(Date.parse(receivedAt) + 60 * 60 * 1000).toISOString(),
  };
}

test("operations report derives privacy-safe source, response, pipeline, inventory, and task metrics", () => {
  const leads = [
    lead("lead-buyer", "website_listing_detail", "buyer"),
    lead("lead-renter", "website_listing_detail", "renter", "2026-07-19T09:00:00.000Z"),
    lead("lead-seller", "website_seller_valuation", "seller", "2026-07-19T09:30:00.000Z"),
  ];
  const replies = [
    {
      id: "reply-lead-buyer",
      lead_id: "lead-buyer",
      reply_language: "bg",
      reviewer: "broker_one",
      reviewed_at: "2026-07-19T08:05:00.000Z",
    },
  ];
  const report = buildOperationsReport({
    leads,
    replies,
    replyDeliveryOutcomes: [
      {
        id: "delivery-1",
        reply_id: "reply-lead-buyer",
        lead_id: "lead-buyer",
        action: "sent",
        actor: "broker_one",
        channel: "email",
        sent_at: "2026-07-19T08:10:00.000Z",
        recorded_at: "2026-07-19T08:10:00.000Z",
      },
    ],
    leadPipelineOutcomes: [
      {
        id: "pipeline-1",
        lead_id: "lead-buyer",
        pipeline: "buyer",
        actor: "broker_one",
        action: "qualify",
        from_stage: "new",
        to_stage: "qualified",
        requirements: { budget_max_eur: 150000, locations: ["Sandanski"], timeline: "3 months" },
        recorded_at: "2026-07-19T08:06:00.000Z",
      },
    ],
    viewings: [
      {
        id: "viewing-1",
        lead_id: "lead-buyer",
        booked_at: "2026-07-19T08:20:00.000Z",
        starts_at: "2026-07-19T09:00:00.000Z",
        follow_up_task: { id: "viewing-follow-up-1", status: "open", due_at: "2026-07-19T10:00:00.000Z" },
        feedback_task: { id: "viewing-feedback-1", status: "open", due_at: "2026-07-19T10:30:00.000Z" },
      },
    ],
    deals: [
      {
        id: "deal-1",
        lead_id: "lead-buyer",
        closed_at: "2026-07-19T11:00:00.000Z",
        testimonial_request: { id: "testimonial-1", status: "open", due_at: "2026-07-19T11:30:00.000Z" },
        referral_request: { id: "referral-1", status: "open", due_at: "2026-07-21T11:00:00.000Z" },
      },
    ],
    translationTasks: [
      { id: "translation-1", object_type: "listing", object_id: "listing-1", target_locale: "ru", status: "stale" },
    ],
    seed: {
      records: [
        { id: "listing-1", collection: "listings", source_locale: "bg", facts: { listing_status: "available" }, migration: { metadata_gaps: {} } },
        { id: "listing-2", collection: "listings", source_locale: "ru", facts: { listing_status: "sold" }, routing: { review_required: true }, migration: { metadata_gaps: {} } },
        { id: "listing-3", collection: "listings", source_locale: "bg", facts: {}, migration: { metadata_gaps: {} } },
      ],
    },
    searchAnalytics: {
      summary: {
        search_events: 7,
        zero_result_events: 1,
        filtered_search_events: 3,
        locales: [{ key: "bg", count: 7 }],
        popular_filters: [{ key: "property_type=apartment", count: 3 }],
        zero_result_queries: [{ locale: "bg", query: "pool", filters: {} }],
      },
    },
    funnelEvents: [
      { recorded_at: "2026-07-19T08:30:00.000Z", type: "page_view", path: "/bg/", locale: "bg" },
      { recorded_at: "2026-07-19T08:31:00.000Z", type: "page_view", path: "/bg/imoti/MS-CRAWL-0001", locale: "bg", listing_reference: "MS-CRAWL-0001" },
      { recorded_at: "2026-07-19T08:32:00.000Z", type: "search", path: "/bg/imoti", locale: "bg" },
      { recorded_at: "2026-07-19T08:33:00.000Z", type: "cta_click", path: "/bg/imoti/MS-CRAWL-0001", locale: "bg", action: "request_viewing" },
      { recorded_at: "2026-07-19T09:01:00.000Z", type: "lead_submitted", path: "/api/leads", locale: "bg", action: "website_listing_detail" },
    ],
    generatedAt: "2026-07-19T12:00:00.000Z",
  });

  assert.equal(assertOperationsReport(report), true);
  assert.equal(report.summary.leads, 3);
  assert.equal(report.summary.replies_sent, 1);
  assert.equal(report.summary.response_rate_pct, 33.3);
  assert.equal(report.summary.median_response_minutes, 10);
  assert.equal(report.response_time.within_sla_rate_pct, 100);
  assert.equal(report.source_quality.find((row) => row.source === "website_listing_detail").qualified, 1);
  assert.equal(report.source_quality.find((row) => row.source === "website_listing_detail").closed_deals, 1);
  assert.equal(report.pipelines.buyer.closed, 1);
  assert.equal(report.pipelines.renter.open, 1);
  assert.equal(report.listing_inventory.total, 3);
  assert.equal(report.listing_inventory.active, 1);
  assert.equal(report.listing_inventory.by_status.find((row) => row.key === "unverified").count, 1);
  assert.equal(report.listing_inventory.translation_review, 1);
  assert.equal(report.task_health.rows.find((row) => row.queue === "translation_review").overdue, 1);
  assert.equal(report.search.zero_result_events, 1);
  assert.deepEqual(report.website_funnel.stages, [
    { key: "page_view", count: 2 },
    { key: "search", count: 1 },
    { key: "cta_click", count: 1 },
    { key: "lead", count: 1 },
  ]);
  assert.equal(report.website_funnel.cta_click_rate_pct, 50);
  assert.equal(report.website_funnel.lead_conversion_pct, 50);
  assert.equal(report.website_funnel.durable_website_leads, 2);
  assert.equal(report.website_funnel.lead_tracking_gap, 1);
  assert.equal(report.website_funnel.lead_tracking_status, "mismatch");
  assert.equal(JSON.stringify(report).includes("reviewed_reply"), false);
  assert.doesNotMatch(JSON.stringify(report), /\"(?:contact|email|message|phone|whatsapp)\":/);

  const csv = renderOperationsReportCsv(report);
  assert.match(csv, /^source,leads,replies_sent,response_rate_pct,/);
  assert.match(csv, /website_listing_detail,2,1,50,1,1,1,50/);
});

test("operations report rejects summaries that diverge from their queue evidence", () => {
  const report = buildOperationsReport({
    leads: [lead("lead-one", "website_listing_detail", "buyer")],
    generatedAt: "2026-07-19T08:30:00.000Z",
  });
  report.summary.open_tasks += 1;
  assert.throws(() => assertOperationsReport(report), /open-task summary/);
});
