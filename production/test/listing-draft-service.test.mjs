import test from "node:test";
import assert from "node:assert/strict";
import { loadCmsSeed } from "../lib/runtime.mjs";
import {
  DURABLE_LISTING_EDIT_FIELDS,
  listingDraftPatchFromInput,
  projectListingDraftSeed,
  saveBulkListingStatusDrafts,
  saveListingDraft,
} from "../lib/listing-draft-service.mjs";
import { createPayloadDraftRuntime } from "./payload-draft-runtime.fixture.mjs";

const principal = { id: "editor_bg", roles: ["editor"], source: "credential_registry", can_mutate: true };

function localeCodes(runtime) {
  return new Map(runtime.currentRows().locales.map((locale) => [String(locale.id), locale.code]));
}

function listingTranslationRow(runtime, listingId, locale) {
  const codes = localeCodes(runtime);
  return runtime.currentRows().listing_translations.find(
    (row) => String(row.listing) === String(listingId) && codes.get(String(row.locale)) === locale,
  );
}

function listingTranslationRows(runtime, listingId) {
  const codes = localeCodes(runtime);
  return runtime.currentRows().listing_translations
    .filter((row) => String(row.listing) === String(listingId))
    .map((row) => ({ ...row, locale: codes.get(String(row.locale)) || String(row.locale) }));
}

test("listingDraftPatchFromInput rejects approval fields and keeps the durable allowlist", () => {
  assert.equal(DURABLE_LISTING_EDIT_FIELDS.includes("publish_approved"), false);
  assert.equal(DURABLE_LISTING_EDIT_FIELDS.includes("seo_review_confirmed"), false);
  assert.throws(
    () => listingDraftPatchFromInput({ patch: { publish_approved: true } }),
    /cannot change: publish_approved/,
  );
  assert.throws(
    () => listingDraftPatchFromInput({ patch: { unknown_field: "x" } }),
    /unsupported fields: unknown_field/,
  );
});

test("saveListingDraft writes one durable draft mutation and overlays the importer projection with the same transaction", async () => {
  const seed = loadCmsSeed();
  const runtime = createPayloadDraftRuntime(seed);
  const result = await saveListingDraft(seed, {
    payload: runtime.payload,
    principal,
    input: {
      listingId: "MS-CRAWL-0001",
      patch: {
        title: "Durable operator title",
        location_precision: "exact",
        availability_verified_at: "2026-08-10T08:00:00.000Z",
      },
    },
    editedAt: "2026-08-10T09:00:00.000Z",
  });

  assert.equal(result.idempotent, false);
  assert.deepEqual(result.changedFields.sort(), ["availability_verified_at", "location_precision", "title"]);
  assert.equal(result.projectedSeed.payload_overlay.source, "payload_draft_overlay");
  assert.equal(
    result.projectedSeed.records.find((record) => record.id === "MS-CRAWL-0001").facts.title,
    "Durable operator title",
  );
  assert.deepEqual(
    result.staleTranslations.map((translation) => translation.locale).sort(),
    ["el", "he"],
  );
  assert.equal(result.staleTranslations.every((translation) => translation.previous_status === "approved"), true);
  for (const locale of ["el", "he"]) {
    const translationRow = listingTranslationRow(runtime, "MS-CRAWL-0001", locale);
    assert.equal(translationRow.status, "draft");
    assert.equal(translationRow.translation_state, "stale");
    assert.equal(translationRow.public_indexable, false);
    const overlayTranslation = result.projectedSeed.records
      .find((record) => record.id === "MS-CRAWL-0001")
      .translations.find((translation) => translation.locale === locale);
    assert.equal(overlayTranslation.status, "stale");
    assert.equal(overlayTranslation.translation_state, "stale");
    assert.equal(overlayTranslation.human_approved, false);
  }
  assert.equal(runtime.payload.calls.begin, 1);
  assert.equal(runtime.payload.calls.commit, 1);
  assert.equal(runtime.payload.calls.rollback, 0);
  assert.equal(runtime.payload.calls.findByID.every((call) => call.transactionID === "tx-1"), true);
  assert.equal(runtime.payload.calls.find.every((call) => call.transactionID === "tx-1"), true);
  assert.equal(runtime.payload.calls.update[0].context.ms_realty_operator.id, "editor_bg");
  const event = runtime.currentRows().listings.find((row) => row.id === "MS-CRAWL-0001").workflow.last_edit_event;
  assert.deepEqual({ ...event, source_hash_before: "hash", source_hash_after: "hash" }, {
    actor_id: "editor_bg",
    auth_source: "credential_registry",
    channel: "admin",
    changed_fields: ["availability_verified_at", "location_precision", "title"],
    edited_at: "2026-08-10T09:00:00.000Z",
    source_hash_before: "hash",
    source_hash_after: "hash",
    source_locale: "bg",
    stale_locales: ["el", "he"],
    stale_translation_count: 2,
  });
  assert.match(event.source_hash_before, /^[a-f0-9]{64}$/);
  assert.match(event.source_hash_after, /^[a-f0-9]{64}$/);
  assert.notEqual(event.source_hash_before, event.source_hash_after);
});

test("saveListingDraft records the trusted MCP channel in the durable listing version data", async () => {
  const seed = loadCmsSeed();
  const runtime = createPayloadDraftRuntime(seed);
  await saveListingDraft(seed, {
    payload: runtime.payload,
    principal,
    input: { listingId: "MS-CRAWL-0001", patch: { condition: "MCP-reviewed condition" } },
    editedAt: "2026-08-10T09:05:00.000Z",
    requestChannel: "mcp",
  });

  const event = runtime.currentRows().listings.find((row) => row.id === "MS-CRAWL-0001").workflow.last_edit_event;
  assert.equal(event.channel, "mcp");
  assert.equal(event.auth_source, "credential_registry");
  assert.deepEqual(event.changed_fields, ["condition"]);
});

test("saveListingDraft stores blank verification timestamps as null without changing sibling fields", async () => {
  const seed = loadCmsSeed();
  const source = seed.records.find((record) => record.id === "MS-CRAWL-0001");
  source.workflow = {
    ...source.workflow,
    availability_verified_at: null,
    location_verified_at: null,
    price_verified_at: null,
    price_on_request_verified_at: null,
    review_status: "review_required",
  };
  const runtime = createPayloadDraftRuntime(seed);
  const before = runtime.currentRows().listings.find((row) => row.id === "MS-CRAWL-0001");

  const result = await saveListingDraft(seed, {
    payload: runtime.payload,
    principal,
    input: {
      listingId: "MS-CRAWL-0001",
      patch: {
        title: "Full-form title update",
        description: before.facts.description,
        availability_verified_at: "",
        location_verified_at: "",
        price_verified_at: "",
        price_on_request_verified_at: "",
      },
    },
    editedAt: "2026-08-10T09:05:00.000Z",
  });

  const after = runtime.currentRows().listings.find((row) => row.id === "MS-CRAWL-0001");
  assert.deepEqual(result.changedFields, ["title"]);
  for (const field of [
    "availability_verified_at",
    "location_verified_at",
    "price_verified_at",
    "price_on_request_verified_at",
  ]) {
    assert.equal(after.workflow[field], null);
  }
  assert.equal(after.workflow.review_status, before.workflow.review_status);
  assert.equal(after.facts.description, before.facts.description);

  await assert.rejects(
    () =>
      saveListingDraft(seed, {
        payload: runtime.payload,
        principal,
        input: { listingId: "MS-CRAWL-0001", patch: { availability_verified_at: "not-a-date" } },
        editedAt: "2026-08-10T09:06:00.000Z",
      }),
    /availability_verified_at must be a valid date and time/,
  );
});

test("saveListingDraft treats the unchanged 29-field admin form as idempotent", async () => {
  const seed = loadCmsSeed();
  const runtime = createPayloadDraftRuntime(seed);
  const current = runtime.currentRows().listings.find((row) => row.id === "MS-CRAWL-0001");
  const seo = current.seo || {};
  const form = { listingId: current.id, editor: principal.id };
  for (const field of DURABLE_LISTING_EDIT_FIELDS) {
    const value = field.startsWith("seo_")
      ? {
          seo_title: seo.title || "",
          seo_description: seo.description || "",
          seo_canonical: seo.canonical_override || "",
          seo_og_title: seo.og_title || "",
          seo_og_description: seo.og_description || "",
          seo_robots: seo.robots || "index,follow",
        }[field]
      : field === "availability_verified_at"
        ? current.workflow?.[field] || ""
        : ["bedrooms_not_applicable", "price_on_request"].includes(field)
          ? current.facts[field] === true ? "true" : "false"
          : current.facts[field] ?? { listing_status: "available", property_type: "property", offer_type: "sale", location_precision: "approximate" }[field] ?? "";
    form[field] = String(value);
  }

  const result = await saveListingDraft(seed, {
    payload: runtime.payload,
    principal,
    input: form,
    editedAt: "2026-08-10T09:07:00.000Z",
  });

  assert.equal(Object.keys(form).length, 29);
  assert.equal(result.idempotent, true);
  assert.deepEqual(result.changedFields, []);
  assert.equal(runtime.payload.calls.update.length, 0);
});

test("saveListingDraft is idempotent when the same patch is already present", async () => {
  const seed = loadCmsSeed();
  const runtime = createPayloadDraftRuntime(seed);
  const input = {
    listingId: "MS-CRAWL-0001",
    patch: { description: "Shared durable draft description for idempotency." },
  };
  const first = await saveListingDraft(seed, {
    payload: runtime.payload,
    principal,
    input,
    editedAt: "2026-08-10T09:10:00.000Z",
  });
  const second = await saveListingDraft(seed, {
    payload: runtime.payload,
    principal,
    input,
    editedAt: "2026-08-10T09:11:00.000Z",
  });

  assert.equal(first.idempotent, false);
  assert.equal(second.idempotent, true);
  assert.equal(first.staleTranslations.length > 0, true);
  assert.equal(second.staleTranslations.length, 0);
  assert.equal(runtime.payload.calls.update.filter((call) => call.collection === "listings").length, 1);
  assert.equal(runtime.payload.calls.update.filter((call) => call.collection === "listing_translations").length, 2);
});

test("saveListingDraft rolls back the draft mutation when readback fails", async () => {
  const seed = loadCmsSeed();
  const runtime = createPayloadDraftRuntime(seed, {
    failRead(collection, calls) {
      if (calls.update.length && collection === "locales") return new Error("simulated snapshot failure");
      return null;
    },
  });

  await assert.rejects(
    () =>
      saveListingDraft(seed, {
        payload: runtime.payload,
        principal,
        input: { listingId: "MS-CRAWL-0001", patch: { title: "Should roll back" } },
        editedAt: "2026-08-10T09:15:00.000Z",
      }),
    /simulated snapshot failure/,
  );

  assert.equal(runtime.payload.calls.commit, 0);
  assert.equal(runtime.payload.calls.rollback, 1);
  assert.notEqual(runtime.currentRows().listings.find((row) => row.id === "MS-CRAWL-0001").facts.title, "Should roll back");
  const preservedRows = listingTranslationRows(runtime, "MS-CRAWL-0001").filter((row) => row.locale !== "bg");
  assert.equal(preservedRows.every((row) => row.translation_state === "approved"), true);
  assert.equal(preservedRows.every((row) => row.public_indexable === true), true);
});

test("projectListingDraftSeed overlays durable draft rows without requiring a second writer path", async () => {
  const seed = loadCmsSeed();
  const runtime = createPayloadDraftRuntime(seed);
  await saveListingDraft(seed, {
    payload: runtime.payload,
    principal,
    input: { listingId: "MS-CRAWL-0001", patch: { title: "Projected title" } },
    editedAt: "2026-08-10T09:20:00.000Z",
  });
  const overlay = await projectListingDraftSeed(seed, { payload: runtime.payload });
  assert.equal(overlay.records.find((record) => record.id === "MS-CRAWL-0001").facts.title, "Projected title");
});

test("saveBulkListingStatusDrafts keeps the batch durable and idempotent", async () => {
  const seed = loadCmsSeed();
  const runtime = createPayloadDraftRuntime(seed);
  const first = await saveBulkListingStatusDrafts(seed, {
    payload: runtime.payload,
    principal,
    input: { listingIds: ["MS-CRAWL-0001", "MS-CRAWL-0002"], targetStatus: "reserved" },
    editedAt: "2026-08-10T09:30:00.000Z",
  });
  const second = await saveBulkListingStatusDrafts(seed, {
    payload: runtime.payload,
    principal,
    input: { listingIds: ["MS-CRAWL-0001", "MS-CRAWL-0002"], targetStatus: "reserved" },
    editedAt: "2026-08-10T09:31:00.000Z",
  });

  assert.equal(first.edits.filter((edit) => !edit.idempotent).length, 2);
  assert.equal(first.staleTranslations.length > 0, true);
  assert.deepEqual(
    first.edits.map((edit) => ({ listingId: edit.listing_id, staleCount: edit.staleTranslations.length })),
    [
      { listingId: "MS-CRAWL-0001", staleCount: 2 },
      { listingId: "MS-CRAWL-0002", staleCount: 0 },
    ],
  );
  assert.equal(second.edits.filter((edit) => edit.idempotent).length, 2);
  assert.equal(second.staleTranslations.length, 0);
  assert.equal(runtime.payload.calls.update.filter((call) => call.collection === "listings").length, 2);
  assert.equal(runtime.payload.calls.update.filter((call) => call.collection === "listing_translations").length >= 2, true);
  assert.equal(runtime.payload.calls.find.filter((call) => call.collection === "listing_translations").length, 4);
});
