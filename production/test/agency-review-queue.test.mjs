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
  assert.doesNotMatch(JSON.stringify(queue), /broker_bg|broker_ru|broker_international/);
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
  assert.doesNotMatch(JSON.stringify(queue), /broker_bg|broker_ru|broker_international/);
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
  assert.match(html, /data-agency-review-lane="legacy_routes"/);
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
