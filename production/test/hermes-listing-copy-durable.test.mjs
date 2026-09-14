import test from "node:test";
import assert from "node:assert/strict";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { listingDraftRevision } from "../lib/payload-cms-import.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { createPayloadDraftRuntime } from "./payload-draft-runtime.fixture.mjs";

const LISTING_ID = "MS-00922";
const EDITOR = { id: "copy_editor", source: "credential_registry", roles: ["editor"], can_mutate: true };

function currentSource({ listingId = LISTING_ID } = {}) {
  const seed = loadCmsSeed();
  const listing = structuredClone(seed.records.find((row) => row.id === LISTING_ID));
  const property = structuredClone(seed.properties.find((row) => row.id === listing.property));
  listing.id = listingId;
  listing.facts.price_eur = 860;
  // A shared-property edit can leave the old listing mirrors in place.
  listing.facts.area_sqm = 65;
  listing.facts.bedrooms = 2;
  listing.facts.floor = 1;
  listing.facts.total_floors = 2;
  listing.facts.land_area_sqm = 50;
  property.facts.living_area_sqm = 92;
  property.facts.primary_area_sqm = 65;
  property.facts.bedrooms_count = 3;
  property.facts.floor_number = 3;
  property.facts.total_floors = 7;
  property.facts.land_area_sqm = 175;
  property.facts.location_label = "Melnik";
  property.fact_verification = [{ field: "living_area_sqm", state: "broker_verified" }];
  return createPayloadDraftRuntime({ ...seed, records: [listing], properties: [property] });
}

function requestDraft(runtime, provider, input = {}, config = {}) {
  return renderAppAdminResponse(new Request("http://localhost/api/admin/listings/copy/draft", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ listingId: LISTING_ID, field: "description", ...input }),
  }), {
    config: {
      ...appAdminConfigFromEnv({}),
      adminPrincipal: EDITOR,
      runtimeDataDurableOnly: true,
      payloadListingEnv: {},
      payloadListingRuntime: runtime?.payload || null,
      hermesListingCopyProvider: provider,
      auditLogPath: null,
      ...config,
    },
  });
}

test("durable listing copy uses current listing and shared-property facts, bound to the editor revision", async () => {
  const runtime = currentSource();
  const before = runtime.currentRows();
  const read = runtime.payload.findByID.bind(runtime.payload);
  runtime.payload.findByID = async (input) => {
    assert.equal(input.overrideAccess, false, "Payload access checks must run for every source read");
    assert.equal(input.req.user.id, EDITOR.id);
    assert.equal(input.req.user.role, "editor");
    assert.equal(input.depth, 0);
    return read(input);
  };
  let prompt;
  const response = await requestDraft(runtime, async (value) => {
    assert.equal(runtime.payload.calls.commit, 1, "do not hold a database transaction open during the model call");
    prompt = value;
    return { text: "Имот с площ 92 кв.м. и 3 спални. Цена 860 евро.", citations: [{ source: "listing_facts" }] };
  });
  const result = await response.json();
  assert.equal(response.status, 201, JSON.stringify(result));
  assert.equal(prompt.propertyFacts.price_eur, 860);
  assert.equal(prompt.propertyFacts.area_sqm, 92);
  assert.equal(prompt.propertyFacts.bedrooms, 3);
  assert.equal(prompt.propertyFacts.floor, 3);
  assert.equal(prompt.propertyFacts.total_floors, 7);
  assert.equal(prompt.propertyFacts.land_area_sqm, 175);
  assert.equal(prompt.propertyFacts.location, "Melnik");
  assert.equal(prompt.listingReference, LISTING_ID);
  assert.equal(prompt.sourceUrl, before.listings[0].source_url);
  assert.equal(result.source_snapshot.draft_revision, listingDraftRevision(before.listings[0], before.properties[0]));
  assert.equal(result.source_snapshot.source_locale, "bg");
  assert.equal(result.can_publish, false);
  assert.equal(result.public_indexable, false);
  assert.equal(result.human_approval_required, true);
  assert.ok(!result.unverified_facts_used.includes("area_sqm"));
  assert.deepEqual(runtime.currentRows(), before, "generating copy does not save or publish the listing");
  assert.equal(runtime.payload.calls.find.length, 0, "a draft request does not scan the catalogue");
  assert.equal(runtime.payload.calls.findByID.length, 6, "only the listing, linked property and locale are read and rechecked");
});

test("a shared-property edit during generation rejects the stale draft before returning it", async () => {
  const runtime = currentSource();
  const read = runtime.payload.findByID.bind(runtime.payload);
  let changed = false;
  runtime.payload.findByID = async (input) => {
    const document = await read(input);
    if (changed && input.collection === "properties") document.facts.bedrooms_count = 4;
    return document;
  };
  const response = await requestDraft(runtime, async () => {
    changed = true;
    return { text: "Имот с площ 92 кв.м. и 3 спални. Цена 860 евро.", citations: [{ source: "listing_facts" }] };
  });
  const result = await response.json();
  assert.equal(response.status, 409);
  assert.equal(result.kind, "listing_draft_conflict");
  assert.equal(result.text, undefined, "a conflicted draft cannot be applied");
  assert.equal(runtime.payload.calls.update.length, 0);
});

test("a linked locale code edit during generation rejects the draft even when the save revision is unchanged", async () => {
  const runtime = currentSource();
  const before = runtime.currentRows();
  const revision = listingDraftRevision(before.listings[0], before.properties[0]);
  const read = runtime.payload.findByID.bind(runtime.payload);
  let changed = false;
  let calls = 0;
  runtime.payload.findByID = async (input) => {
    const document = await read(input);
    if (changed && input.collection === "locales") document.code = "fr";
    return document;
  };
  const response = await requestDraft(runtime, async () => {
    calls += 1;
    changed = true;
    return { text: "Имот с площ 92 кв.м. и 3 спални. Цена 860 евро.", citations: [{ source: "listing_facts" }] };
  });
  const result = await response.json();
  assert.equal(response.status, 409);
  assert.equal(result.kind, "listing_draft_conflict");
  assert.equal(result.text, undefined, "copy from the previous source language cannot be applied");
  const after = runtime.currentRows();
  assert.equal(listingDraftRevision(after.listings[0], after.properties[0]), revision, "the ordinary save revision contract is unchanged");
  assert.equal(calls, 1, "a locale conflict never automatically replays the provider");
  assert.equal(runtime.payload.calls.update.length, 0);
});

test("a listing without its required shared property is unavailable instead of using stale mirrors", async () => {
  const runtime = currentSource();
  const read = runtime.payload.findByID.bind(runtime.payload);
  runtime.payload.findByID = async (input) => {
    const document = await read(input);
    if (input.collection === "listings") document.property = null;
    return document;
  };
  let calls = 0;
  const response = await requestDraft(runtime, async () => {
    calls += 1;
    return { text: "Имот за отдаване под наем. Свържете се с брокер за оглед.", citations: [] };
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).kind, "payload_draft_unavailable");
  assert.equal(calls, 0);
});

test("a listing created only in Payload can receive a draft", async () => {
  const listingId = "MS-99000";
  const runtime = currentSource({ listingId });
  let prompt;
  const response = await requestDraft(runtime, async (value) => {
    prompt = value;
    return { text: "Имот за отдаване под наем. Свържете се с брокер за оглед.", citations: [] };
  }, { listingId });
  const result = await response.json();
  assert.equal(response.status, 201, JSON.stringify(result));
  assert.equal(prompt.listingReference, listingId);
  assert.equal(result.listing_id, listingId);
  assert.equal(result.source_snapshot.listing_id, listingId);
});

test("cleared current property facts never fall back to old listing mirrors or derived area", async () => {
  const runtime = currentSource();
  const read = runtime.payload.findByID.bind(runtime.payload);
  runtime.payload.findByID = async (input) => {
    const document = await read(input);
    if (input.collection === "properties") {
      Object.assign(document.facts, {
        living_area_sqm: null, built_area_sqm: null, usable_area_sqm: null,
        bedrooms_count: null, location_label: null,
      });
    }
    return document;
  };
  let prompt;
  const response = await requestDraft(runtime, async (value) => {
    prompt = value;
    return { text: "Имот за отдаване под наем. Свържете се с брокер за оглед.", citations: [] };
  });
  assert.equal(response.status, 201);
  for (const field of ["area_sqm", "bedrooms", "location"]) assert.equal(Object.hasOwn(prompt.propertyFacts, field), false, field);
});

test("missing or inaccessible listings cannot use their static catalogue row", async (t) => {
  for (const inaccessible of [false, true]) await t.test(inaccessible ? "access denied" : "missing listing", async () => {
    const runtime = currentSource();
    runtime.payload.findByID = async (input) => {
      assert.equal(input.collection, "listings", "read the listing before any linked source");
      assert.equal(input.overrideAccess, false);
      assert.equal(input.req.user.id, EDITOR.id);
      if (inaccessible) throw Object.assign(new Error("Forbidden"), { status: 403 });
      return null;
    };
    let calls = 0;
    const response = await requestDraft(runtime, async () => { calls += 1; });
    const result = await response.json();
    assert.equal(response.status, inaccessible ? 403 : 404);
    assert.equal(result.kind, inaccessible ? "forbidden" : "listing_draft_not_found");
    if (inaccessible) assert.equal(result.required_capability, "content:write");
    assert.equal(calls, 0);
    assert.equal(runtime.payload.calls.rollback, 1);
  });
});

test("unauthorized operators are rejected before opening the durable source", async () => {
  let reads = 0;
  let calls = 0;
  const runtime = { payload: { get db() { reads += 1; throw new Error("unexpected source access"); } } };
  const response = await requestDraft(runtime, async () => { calls += 1; }, {}, {
    adminPrincipal: { ...EDITOR, roles: ["broker"] },
  });
  assert.equal(response.status, 403);
  assert.equal(reads, 0);
  assert.equal(calls, 0);
});

test("an unavailable durable source fails closed without a model call or fallback", async (t) => {
  for (const failure of ["not configured", "initialization", "read", "properties", "locales"]) await t.test(failure, async () => {
    let runtime = currentSource();
    if (failure === "not configured") runtime = null;
    else if (failure === "initialization") runtime.payload = { get db() { throw new Error("database unavailable"); } };
    else {
      const read = runtime.payload.findByID.bind(runtime.payload);
      runtime.payload.findByID = async (input) => {
        if (failure === "read") throw new Error("database unavailable");
        if (input.collection === failure) return null;
        return read(input);
      };
    }
    let calls = 0;
    const response = await requestDraft(runtime, async () => { calls += 1; });
    const result = await response.json();
    assert.equal(response.status, 503);
    assert.equal(result.kind, "payload_draft_unavailable");
    assert.equal(result.text, undefined);
    assert.equal(calls, 0);
  });
});

test("loss of source access after generation returns no draft and does not replay the provider", async () => {
  const runtime = currentSource();
  const before = runtime.currentRows();
  let calls = 0;
  const response = await requestDraft(runtime, async () => {
    calls += 1;
    runtime.payload.findByID = async () => { throw new Error("database unavailable"); };
    return { text: "Имот за отдаване под наем. Свържете се с брокер за оглед.", citations: [] };
  });
  const result = await response.json();
  assert.equal(response.status, 503);
  assert.equal(result.kind, "payload_draft_unavailable");
  assert.equal(result.text, undefined);
  assert.equal(calls, 1);
  assert.deepEqual(runtime.currentRows(), before);
});
