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
  assert.equal(runtime.payload.calls.begin, 1);
  assert.equal(runtime.payload.calls.commit, 1);
  assert.equal(runtime.payload.calls.rollback, 0);
  assert.equal(runtime.payload.calls.findByID.every((call) => call.transactionID === "tx-1"), true);
  assert.equal(runtime.payload.calls.find.every((call) => call.transactionID === "tx-1"), true);
  assert.equal(runtime.payload.calls.update[0].context.ms_realty_operator.id, "editor_bg");
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
  assert.equal(runtime.payload.calls.update.length, 1);
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
  assert.equal(second.edits.filter((edit) => edit.idempotent).length, 2);
  assert.equal(runtime.payload.calls.update.length, 2);
});
