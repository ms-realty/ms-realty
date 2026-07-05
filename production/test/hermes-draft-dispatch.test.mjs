import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { assertHermesDraftDispatch, buildHermesDraftDispatch } from "../lib/hermes-draft-dispatch.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { fromRoot } from "../lib/paths.mjs";

const registry = loadLocaleRegistry();

function seed() {
  return {
    records: [
      {
        id: "MS-TEST-1",
        collection: "listings",
        source_locale: "bg",
        facts: {
          title: "Sandanski apartment MS-TEST-1",
          description: "Apartment in Sandanski with city access.",
          location: "Sandanski",
          property_type: "apartment",
          offer_type: "sale",
          price_eur: 50000,
        },
      },
      {
        id: "MS-TEST-2",
        collection: "listings",
        source_locale: "bg",
        facts: {
          title: "Petrich house MS-TEST-2",
          description: "House near Petrich.",
          location: "Petrich",
          property_type: "house",
          offer_type: "sale",
        },
      },
    ],
  };
}

test("Hermes draft dispatch batches model-ready tasks without publish rights", () => {
  const dispatch = buildHermesDraftDispatch({
    registry,
    seed: seed(),
    translationCoverage: {
      rows: [
        {
          listing_id: "MS-TEST-2",
          source_locale: "bg",
          target_locale: "el",
          task_type: "hermes_draft_required",
          provider_mode: "hermes_draft",
          reviewer_role: "translator_el",
          admin_path: "/admin/translations?objectType=listing&objectId=MS-TEST-2&locale=el",
          task: { id: "translation-MS-TEST-2-el" },
        },
        {
          listing_id: "MS-TEST-1",
          source_locale: "bg",
          target_locale: "he",
          task_type: "stale_review_required",
          provider_mode: "hermes_draft",
          reviewer_role: "translator_he",
          admin_path: "/admin/translations?objectType=listing&objectId=MS-TEST-1&locale=he",
          task: { id: "translation-MS-TEST-1-he" },
        },
      ],
    },
    limit: 1,
    generatedAt: "2026-07-05T00:00:00Z",
  });

  assert.equal(assertHermesDraftDispatch(dispatch), true);
  assert.equal(dispatch.summary.eligible_tasks, 2);
  assert.equal(dispatch.summary.batch_size, 1);
  assert.equal(dispatch.summary.remaining_after_batch, 1);
  assert.equal(dispatch.rows[0].task_type, "stale_review_required");
  assert.equal(dispatch.rows[0].target_locale, "he");
  assert.equal(dispatch.rows[0].public_indexable, false);
  assert.equal(dispatch.rows[0].can_publish, false);
  assert.equal(dispatch.rows[0].requires_human_approval, true);
  assert.match(dispatch.rows[0].prompt.rules.join(" "), /Draft only; never publish/);
  assert.equal(dispatch.rows[0].citations.length, 2);
});

test("generated Hermes draft dispatch is valid when present", () => {
  const file = fromRoot("production", "data", "hermes-draft-dispatch.json");
  if (!fs.existsSync(file)) return;
  assert.equal(assertHermesDraftDispatch(JSON.parse(fs.readFileSync(file, "utf8"))), true);
});
