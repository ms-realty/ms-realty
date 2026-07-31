import test from "node:test";
import assert from "node:assert/strict";
import { buildAgencyReviewQueue } from "../lib/agency-review-queue.mjs";

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
  assert.equal(queue.summary.open_lanes, 7);
  assert.equal(queue.summary.open_tasks, 7);
  assert.equal(queue.guardrails.unreviewed_listing_publication, "blocked");
  assert.equal(queue.guardrails.unreviewed_translation_indexing, "blocked");
  assert.equal(queue.guardrails.unapproved_customer_messages, "blocked");
  assert.equal(queue.guardrails.legacy_domain_cutover, "blocked");
  assert.equal(queue.lanes.find((laneItem) => laneItem.id === "broker_contacts").count, 1);
});
