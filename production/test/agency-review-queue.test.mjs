import test from "node:test";
import assert from "node:assert/strict";
import { buildAgencyReviewQueue } from "../lib/agency-review-queue.mjs";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";

test("agency review queue defers decisions without weakening public guardrails", () => {
  const queue = buildAgencyReviewQueue({
    pendingRoutes: [{ id: "url-1", old_url: "https://makler-realty.com/old", source_domain: "makler-realty.com" }],
    listingQuality: {
      rows: [{ listing_id: "MS-1", title: "Listing", source_locale: "bg", editor_path: "/admin/listings/edit?listingId=MS-1" }],
      review_queue: { summary: { pending_review_rows: 1 } },
    },
    listingVerification: {
      rows: [{ listing_id: "MS-1", source_locale: "bg", priority: "high", admin_path: "/admin/listings/edit?listingId=MS-1", verification_task: { id: "verify-MS-1", owner: "broker_bg" } }],
    },
    translationCoverage: {
      summary: { open_translation_tasks: 1 },
      rows: [{ listing_id: "MS-1", target_locale: "de", current_status: "missing", reviewer_role: "translator_de", admin_path: "/admin/translations?objectId=MS-1&locale=de", task: { id: "translation-MS-1-de", owner: "translator_de" } }],
    },
    seoEvidence: { missingRequiredSources: ["search_console"] },
    launchReadiness: {
      launch_ready: false,
      gates: [{ id: "production_recovery", status: "blocked" }],
    },
  });

  assert.equal(queue.deployment_mode, "production_review");
  assert.equal(queue.review_after_deploy, true);
  assert.equal(queue.public_launch_ready, false);
  assert.equal(queue.summary.open_lanes, 6);
  assert.equal(queue.summary.open_tasks, 6);
  assert.equal(queue.guardrails.unreviewed_listing_publication, "blocked");
  assert.equal(queue.guardrails.unreviewed_translation_indexing, "blocked");
  assert.equal(queue.guardrails.unapproved_customer_messages, "blocked");
  assert.equal(queue.guardrails.legacy_route_compatibility, "review_required");
  assert.equal(queue.lanes.find((laneItem) => laneItem.id === "broker_contacts").count, 1);
  const tasks = queue.lanes.flatMap((laneItem) => laneItem.tasks);
  assert.ok(tasks.every((item) => item.owner === "unassigned" && item.requires_assignment === true));
  assert.equal(tasks.find((item) => item.id === "route-url-1")?.role, "content_and_seo");
  assert.equal(tasks.find((item) => item.id === "translation-MS-1-de")?.role, "translator_de");
  assert.equal(tasks.find((item) => item.id === "signoff-production_recovery")?.role, "operations");
  assert.equal(queue.lanes.find((laneItem) => laneItem.id === "operational_signoff")?.owner, "operations");
  assert.doesNotMatch(JSON.stringify(queue), /agency_admin|broker_bg|broker_ru|broker_international|content_editor|ru_preservation_editor|seo_editor/);
});

test("agency review queue keeps an unassigned role when no real broker is configured", () => {
  const queue = buildAgencyReviewQueue({
    listingQuality: {
      rows: [{ listing_id: "MS-1", source_locale: "bg", editor_path: "/admin/listings/edit?listingId=MS-1" }],
      review_queue: { summary: { pending_review_rows: 1 } },
    },
    listingVerification: {
      rows: [{ listing_id: "MS-1", source_locale: "bg", admin_path: "/admin/listings/edit?listingId=MS-1", verification_task: { owner: "broker_ru" } }],
    },
    brokerProfiles: [{ id: "broker_bg", languages: ["bg"] }],
  });

  const tasks = queue.lanes.flatMap((laneItem) => laneItem.tasks);
  assert.equal(tasks.find((item) => item.id === "listing-quality-MS-1")?.owner, "unassigned");
  assert.equal(tasks.find((item) => item.id === "verify-MS-1")?.owner, "unassigned");
  assert.ok(tasks.every((item) => item.role === "broker" && item.requires_assignment === true));
  assert.doesNotMatch(JSON.stringify(queue), /agency_admin|broker_bg|broker_ru|broker_international|content_editor|ru_preservation_editor|seo_editor/);
});

test("agency review queue keeps a verified broker assignee and marks the task assigned", () => {
  const queue = buildAgencyReviewQueue({
    listingQuality: {
      rows: [{ listing_id: "MS-1", source_locale: "bg", editor_path: "/admin/listings/edit?listingId=MS-1" }],
      review_queue: { summary: { pending_review_rows: 1 } },
    },
    brokerProfiles: [{ id: "payload-owner-123", languages: ["bg"] }],
  });

  const assigned = queue.lanes[0].tasks[0];
  assert.equal(assigned.owner, "payload-owner-123");
  assert.equal(assigned.role, "broker");
  assert.equal(assigned.requires_assignment, false);
});

test("production-review admin renders localized mobile queue labels and unverified imported listings", async () => {
  const token = "agency-review-ui-test";
  const config = {
    ...appAdminConfigFromEnv({}),
    authEnv: { MS_REALTY_ADMIN_TOKEN: token },
  };
  const headers = { authorization: `Bearer ${token}` };
  const review = await renderAppAdminResponse(
    new Request("http://local/admin/migration/review?locale=bg", { headers }),
    { config },
  );
  const html = await review.text();

  assert.equal(review.status, 200);
  assert.match(html, /Опашка за решения на агенцията/);
  // No legacy-routes lane: every legacy URL is decided, 165 in the workspace
  // and 292 in the sealed contract. The queue used to list 292 phantom tasks.
  assert.doesNotMatch(html, /data-agency-review-lane="legacy_routes"/);
  assert.match(html, /data-agency-review-lane="listing_quality"/);
  assert.match(html, /data-label="Защитна граница"/);
  assert.doesNotMatch(html, /Agency decision queue|Legacy URL decisions/);

  const listings = await renderAppAdminResponse(
    new Request("http://local/api/admin/listings?locale=bg&q=MS-CRAWL-0001", { headers }),
    { config },
  );
  const payload = await listings.json();
  assert.equal(listings.status, 200);
  assert.equal(payload.listings[0].listing_status, "unverified");
});

test("signed-in migration review payload and HTML keep fixture broker identities out of the queue", async () => {
  const token = "agency-review-fixture-scrub-test";
  const config = {
    ...appAdminConfigFromEnv({}),
    authEnv: { MS_REALTY_ADMIN_TOKEN: token },
    brokerProfiles: [
      { id: "broker_bg", languages: ["bg"] },
      { id: "broker_ru", languages: ["ru"] },
      { id: "broker_international", languages: ["en"] },
    ],
  };
  const headers = { authorization: `Bearer ${token}` };

  const payloadResponse = await renderAppAdminResponse(
    new Request("http://local/api/admin/migration/review?locale=en", { headers }),
    { config },
  );
  const payload = await payloadResponse.json();
  assert.equal(payloadResponse.status, 200);
  const taskOwners = payload.agencyReviewQueue.lanes.flatMap((laneItem) => laneItem.tasks.map((task) => task.owner));
  assert.ok(taskOwners.length > 0);
  assert.ok(taskOwners.every((owner) => owner === "unassigned"));
  assert.doesNotMatch(JSON.stringify(payload.agencyReviewQueue), /agency_admin|broker_bg|broker_ru|broker_international|content_editor|ru_preservation_editor|seo_editor/);

  const htmlResponse = await renderAppAdminResponse(
    new Request("http://local/admin/migration/review?locale=ru", { headers }),
    { config },
  );
  const html = await htmlResponse.text();
  assert.equal(htmlResponse.status, 200);
  assert.match(html, /Очередь решений агентства/);
  assert.doesNotMatch(html, /agency_admin|broker_bg|broker_ru|broker_international|content_editor|ru_preservation_editor|seo_editor/);
});
