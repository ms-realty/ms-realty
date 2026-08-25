import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fromRoot } from "../lib/paths.mjs";
import { loadApprovedLaunchFreeze } from "../lib/launch-freeze.mjs";
import { operatorPublishedListingApproval } from "../lib/listing-publication-approval.mjs";
import { loadPayloadCollections } from "../lib/payload-collections.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import {
  applyListingPublicationSync,
  assertPublicationSchema,
  buildListingPublicationSyncPlan,
  PUBLICATION_REFUSAL_REASONS,
  PUBLICATION_SKIP_REASONS,
  publicationSyncAuditRecords,
  readPublicationRows,
  seedListingRecords,
  seedPublicationStateFor,
  TRANSLATION_HOLD_REASONS,
} from "../lib/listing-publication-projection.mjs";

const LOCALE_IDS = new Map([
  ["bg", 1],
  ["en", 2],
  ["ru", 5],
  ["el", 6],
  ["he", 7],
]);

const APPROVER = "agency_owner";
const APPROVED_AT = "2026-08-24T00:00:00.000Z";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function seedRecord(id, overrides = {}) {
  return {
    id,
    collection: "listings",
    cms_status: "published",
    workflow: { publish_approved: true, publish_approved_at: APPROVED_AT, publish_approved_by: APPROVER },
    source_locale: "bg",
    facts: { title: `Title ${id}`, price_eur: 100000, h1: `H1 ${id}` },
    seo: { title: `SEO ${id}` },
    translations: [
      {
        locale: "bg",
        source_locale: "bg",
        status: "published",
        translation_state: "published",
        human_approved: true,
        reviewer: "editor_bg",
        approved_at: "2026-07-04T00:00:00Z",
        public_indexable: true,
      },
      {
        locale: "el",
        source_locale: "bg",
        status: "approved",
        translation_state: "approved",
        human_approved: true,
        reviewer: "translator_el",
        approved_at: "2026-07-04T00:00:00Z",
        public_indexable: true,
      },
    ],
    ...overrides,
  };
}

// The database exactly as run-payload-cms-import.mjs leaves it: review-required
// listings, non-public draft translations.
function importedRows(records) {
  let translationId = 1000;
  const currentTranslations = [];
  const currentListings = records.map((record) => {
    for (const translation of record.translations || []) {
      currentTranslations.push({
        id: translationId++,
        listing: record.id,
        locale: LOCALE_IDS.get(translation.locale),
        source_locale: LOCALE_IDS.get(translation.source_locale),
        status: "draft",
        translation_state: "draft",
        public_indexable: false,
        reviewer: translation.reviewer || null,
        approved_at: null,
        _status: "draft",
      });
    }
    return {
      id: record.id,
      cms_status: "source_imported_review_required",
      _status: "draft",
      facts: { title: record.facts.title, price_eur: record.facts.price_eur, h1: record.facts.h1 },
      seo: clone(record.seo),
      workflow: { publish_approved: null, publish_approved_at: null, publish_approved_by: null, last_editor: "importer" },
      source_locale: LOCALE_IDS.get(record.source_locale),
    };
  });
  return { currentListings, currentTranslations };
}

function approvalFor(ids, excluded = []) {
  return {
    approval_id: "MSR-LISTING-PUBLICATION-1",
    scope: "full_freeze_catalog",
    decision: "publish_source_as_is",
    approved_by: APPROVER,
    approved_at: APPROVED_AT,
    reason: "Owner directive of 2026-08-24: publish all listings without additional verification.",
    listing_ids: ids,
    excluded_listings: excluded,
  };
}

function entryFor(plan, id) {
  return plan.entries.find((entry) => entry.listing_id === id);
}

function applyPlanToRows(plan, rows) {
  const listings = new Map(rows.currentListings.map((row) => [row.id, row]));
  const translations = new Map(rows.currentTranslations.map((row) => [row.id, row]));
  for (const entry of plan.entries) {
    if (entry.action !== "apply") continue;
    if (entry.listing) Object.assign(listings.get(entry.listing.id), clone(entry.listing.data));
    if (entry.translation) Object.assign(translations.get(entry.translation.id), clone(entry.translation.data));
  }
}

test("the projector applies the publication state the seed records for approved listings", () => {
  const records = [seedRecord("MS-1"), seedRecord("MS-2")];
  const rows = importedRows(records);
  const plan = buildListingPublicationSyncPlan({ ...rows, seedRecords: records, approval: approvalFor(["MS-1", "MS-2"]) });

  assert.equal(plan.summary.apply, 2);
  assert.equal(plan.summary.refused, 0);
  assert.equal(plan.summary.skipped, 0);
  assert.equal(plan.idempotent, false);

  const entry = entryFor(plan, "MS-1");
  assert.deepEqual(entry.listing.data, {
    cms_status: "published",
    workflow: {
      publish_approved: true,
      publish_approved_at: APPROVED_AT,
      publish_approved_by: APPROVER,
      last_editor: "importer",
    },
    _status: "published",
  });
  assert.deepEqual(entry.translation.data, {
    status: "published",
    translation_state: "published",
    public_indexable: true,
    reviewer: "editor_bg",
    approved_at: "2026-07-04T00:00:00.000Z",
    _status: "published",
  });
});

test("the projector never publishes a listing the seed does not mark published", () => {
  const records = [
    seedRecord("MS-DRAFT", { cms_status: "draft" }),
    seedRecord("MS-REVIEW", { cms_status: "source_imported_review_required" }),
  ];
  const rows = importedRows(records);
  const plan = buildListingPublicationSyncPlan({
    ...rows,
    seedRecords: records,
    approval: approvalFor(["MS-DRAFT", "MS-REVIEW"]),
  });

  assert.equal(plan.summary.apply, 0);
  assert.equal(plan.summary.refused, 2);
  for (const id of ["MS-DRAFT", "MS-REVIEW"]) {
    assert.equal(entryFor(plan, id).action, "refuse");
    assert.equal(entryFor(plan, id).reason, PUBLICATION_REFUSAL_REASONS.SEED_NOT_PUBLISHED);
  }
});

test("the projector refuses a seed record that carries no human publish approval", () => {
  const records = [
    seedRecord("MS-NO-FLAG", { workflow: { publish_approved: false, publish_approved_by: APPROVER, publish_approved_at: APPROVED_AT } }),
    seedRecord("MS-NO-WORKFLOW", { workflow: {} }),
  ];
  const plan = buildListingPublicationSyncPlan({
    ...importedRows(records),
    seedRecords: records,
    approval: approvalFor(["MS-NO-FLAG", "MS-NO-WORKFLOW"]),
  });

  assert.equal(plan.summary.apply, 0);
  assert.equal(entryFor(plan, "MS-NO-FLAG").reason, PUBLICATION_REFUSAL_REASONS.SEED_NOT_APPROVED);
  assert.equal(entryFor(plan, "MS-NO-WORKFLOW").reason, PUBLICATION_REFUSAL_REASONS.SEED_NOT_APPROVED);
});

test("the projector refuses an approval that names no approver or no timestamp", () => {
  const records = [
    seedRecord("MS-NO-WHO", { workflow: { publish_approved: true, publish_approved_at: APPROVED_AT } }),
    seedRecord("MS-NO-WHEN", { workflow: { publish_approved: true, publish_approved_by: APPROVER } }),
    seedRecord("MS-BAD-WHEN", { workflow: { publish_approved: true, publish_approved_by: APPROVER, publish_approved_at: "whenever" } }),
  ];
  const plan = buildListingPublicationSyncPlan({
    ...importedRows(records),
    seedRecords: records,
    approval: approvalFor(["MS-NO-WHO", "MS-NO-WHEN", "MS-BAD-WHEN"]),
  });

  assert.equal(plan.summary.apply, 0);
  assert.equal(plan.summary.refused, 3);
  for (const id of ["MS-NO-WHO", "MS-NO-WHEN", "MS-BAD-WHEN"]) {
    assert.equal(entryFor(plan, id).reason, PUBLICATION_REFUSAL_REASONS.SEED_APPROVAL_INCOMPLETE);
  }
});

test("the projector refuses a listing the owner approval does not name, and reports the recorded exclusion reason", () => {
  const records = [seedRecord("MS-IN"), seedRecord("MS-OUT"), seedRecord("MS-UNKNOWN")];
  const plan = buildListingPublicationSyncPlan({
    ...importedRows(records),
    seedRecords: records,
    approval: approvalFor(["MS-IN"], [{ id: "MS-OUT", reason: "Owner withdrew this listing" }]),
  });

  assert.equal(plan.summary.apply, 1);
  assert.equal(plan.summary.refused, 2);
  assert.equal(entryFor(plan, "MS-OUT").reason, PUBLICATION_REFUSAL_REASONS.NOT_IN_APPROVAL);
  assert.equal(entryFor(plan, "MS-OUT").detail, "Owner withdrew this listing");
  assert.equal(entryFor(plan, "MS-UNKNOWN").reason, PUBLICATION_REFUSAL_REASONS.NOT_IN_APPROVAL);
  assert.equal(entryFor(plan, "MS-UNKNOWN").detail, null);
});

test("the projector refuses a seed listing that has no row in the database", () => {
  const records = [seedRecord("MS-1"), seedRecord("MS-GHOST")];
  const rows = importedRows([records[0]]);
  const plan = buildListingPublicationSyncPlan({ ...rows, seedRecords: records, approval: approvalFor(["MS-1", "MS-GHOST"]) });

  assert.equal(plan.summary.apply, 1);
  assert.equal(entryFor(plan, "MS-GHOST").action, "refuse");
  assert.equal(entryFor(plan, "MS-GHOST").reason, PUBLICATION_REFUSAL_REASONS.ABSENT_FROM_DATABASE);
});

test("the projector refuses to publish over a database listing_status that is not publicly listable", () => {
  const records = [seedRecord("MS-SOLD"), seedRecord("MS-RESERVED"), seedRecord("MS-BLANK")];
  const rows = importedRows(records);
  rows.currentListings[0].facts.listing_status = "sold";
  rows.currentListings[1].facts.listing_status = "reserved";

  const plan = buildListingPublicationSyncPlan({
    ...rows,
    seedRecords: records,
    approval: approvalFor(["MS-SOLD", "MS-RESERVED", "MS-BLANK"]),
  });

  assert.equal(entryFor(plan, "MS-SOLD").action, "refuse");
  assert.equal(entryFor(plan, "MS-SOLD").reason, PUBLICATION_REFUSAL_REASONS.DATABASE_STATUS_NOT_PUBLIC);
  assert.equal(entryFor(plan, "MS-SOLD").detail, "sold");
  assert.equal(entryFor(plan, "MS-RESERVED").action, "apply");
  assert.equal(entryFor(plan, "MS-BLANK").action, "apply");
});

test("a database listing absent from the seed is reported and skipped, never touched", () => {
  const records = [seedRecord("MS-1")];
  const rows = importedRows([...records, seedRecord("MS-STRAY")]);
  const plan = buildListingPublicationSyncPlan({ ...rows, seedRecords: records, approval: approvalFor(["MS-1"]) });

  const stray = entryFor(plan, "MS-STRAY");
  assert.equal(stray.action, "skip");
  assert.equal(stray.reason, PUBLICATION_SKIP_REASONS.ABSENT_FROM_SEED);
  assert.equal(plan.summary.skipped, 1);
  assert.equal(plan.summary.apply, 1);
  assert.equal(publicationSyncAuditRecords(plan).some((record) => record.input.objectId === "MS-STRAY"), false);
});

test("a second run is a no-op decided by current-vs-target comparison, not a marker", () => {
  const records = [seedRecord("MS-1"), seedRecord("MS-2")];
  const rows = importedRows(records);
  const approval = approvalFor(["MS-1", "MS-2"]);

  const first = buildListingPublicationSyncPlan({ ...rows, seedRecords: records, approval });
  applyPlanToRows(first, rows);

  const second = buildListingPublicationSyncPlan({ ...rows, seedRecords: records, approval });
  assert.equal(second.summary.apply, 0);
  assert.equal(second.summary.unchanged, 2);
  assert.equal(second.idempotent, true);
  assert.equal(publicationSyncAuditRecords(second).length, 0);

  // Timestamps that differ only in ISO formatting must not look like a change.
  rows.currentListings[0].workflow.publish_approved_at = "2026-08-24T00:00:00Z";
  const third = buildListingPublicationSyncPlan({ ...rows, seedRecords: records, approval });
  assert.equal(third.idempotent, true);
});

test("the plan never carries a content field into the database", () => {
  const records = [seedRecord("MS-1")];
  const rows = importedRows(records);
  const plan = buildListingPublicationSyncPlan({ ...rows, seedRecords: records, approval: approvalFor(["MS-1"]) });
  const entry = entryFor(plan, "MS-1");

  assert.deepEqual(Object.keys(entry.listing.data).sort(), ["_status", "cms_status", "workflow"]);
  for (const field of ["facts", "seo", "media", "tour", "routing", "migration", "property", "location", "translations"]) {
    assert.equal(Object.hasOwn(entry.listing.data, field), false, `${field} must never be written`);
  }
  assert.deepEqual(Object.keys(entry.listing.data.workflow).sort(), [
    "last_editor",
    "publish_approved",
    "publish_approved_at",
    "publish_approved_by",
  ]);
  assert.deepEqual(Object.keys(entry.translation.data).sort(), [
    "_status",
    "approved_at",
    "public_indexable",
    "reviewer",
    "status",
    "translation_state",
  ]);
});

test("only the source-locale translation is published; other locales stay untouched", () => {
  const records = [seedRecord("MS-1")];
  const rows = importedRows(records);
  const plan = buildListingPublicationSyncPlan({ ...rows, seedRecords: records, approval: approvalFor(["MS-1"]) });

  const sourceRow = rows.currentTranslations.find((row) => row.locale === LOCALE_IDS.get("bg"));
  const otherRow = rows.currentTranslations.find((row) => row.locale === LOCALE_IDS.get("el"));
  assert.equal(entryFor(plan, "MS-1").translation.id, sourceRow.id);

  applyPlanToRows(plan, rows);
  assert.equal(otherRow.status, "draft");
  assert.equal(otherRow.public_indexable, false);
  assert.equal(otherRow._status, "draft");
});

test("the listing still publishes when its source translation is not human approved, and the hold is reported", () => {
  const record = seedRecord("MS-1");
  record.translations[0] = { ...record.translations[0], human_approved: false, status: "draft", translation_state: "draft" };
  const rows = importedRows([record]);
  const plan = buildListingPublicationSyncPlan({ ...rows, seedRecords: [record], approval: approvalFor(["MS-1"]) });

  const entry = entryFor(plan, "MS-1");
  assert.equal(entry.action, "apply");
  assert.equal(entry.translation, null);
  assert.equal(entry.translation_hold, TRANSLATION_HOLD_REASONS.SEED_NOT_HUMAN_APPROVED);
  assert.equal(plan.summary.translations_held, 1);
});

test("a missing source-locale translation row is reported as a hold, not invented", () => {
  const records = [seedRecord("MS-1")];
  const rows = importedRows(records);
  rows.currentTranslations = rows.currentTranslations.filter((row) => row.locale !== LOCALE_IDS.get("bg"));
  const plan = buildListingPublicationSyncPlan({ ...rows, seedRecords: records, approval: approvalFor(["MS-1"]) });

  const entry = entryFor(plan, "MS-1");
  assert.equal(entry.action, "apply");
  assert.equal(entry.translation, null);
  assert.equal(entry.translation_hold, TRANSLATION_HOLD_REASONS.ABSENT_FROM_DATABASE);
});

test("the plan refuses to be built without a validated owner approval", () => {
  const records = [seedRecord("MS-1")];
  const rows = importedRows(records);
  assert.throws(
    () => buildListingPublicationSyncPlan({ ...rows, seedRecords: records, approval: null }),
    /validated owner publication approval/,
  );
  assert.throws(
    () => buildListingPublicationSyncPlan({ ...rows, seedRecords: records, approval: approvalFor([]) }),
    /validated owner publication approval/,
  );
});

test("the schema guard accepts the generated Payload collections and names every missing field", () => {
  const config = loadPayloadCollections();
  const listingFields = config.collections.find((collection) => collection.slug === "listings").fields;
  const translationFields = config.collections.find((collection) => collection.slug === "listing_translations").fields;

  assert.doesNotThrow(() => assertPublicationSchema({ listingFields, translationFields }));

  assert.throws(() => assertPublicationSchema({ listingFields: [], translationFields }), /listings collection schema/);
  assert.throws(() => assertPublicationSchema({ listingFields, translationFields: [] }), /listing_translations collection schema/);
  assert.throws(
    () => assertPublicationSchema({ listingFields: listingFields.filter((field) => field.name !== "cms_status"), translationFields }),
    /no cms_status field/,
  );
  assert.throws(
    () =>
      assertPublicationSchema({
        listingFields: listingFields.map((field) =>
          field.name === "workflow" ? { ...field, fields: field.fields.filter((row) => row.name !== "publish_approved") } : field,
        ),
        translationFields,
      }),
    /missing publication fields: publish_approved/,
  );
  assert.throws(
    () =>
      assertPublicationSchema({
        listingFields: listingFields.map((field) =>
          field.name === "facts" ? { ...field, fields: field.fields.filter((row) => row.name !== "listing_status") } : field,
        ),
        translationFields,
      }),
    /no listing_status field/,
  );
  assert.throws(
    () =>
      assertPublicationSchema({
        listingFields,
        translationFields: translationFields.filter((field) => field.name !== "public_indexable"),
      }),
    /missing publication fields: public_indexable/,
  );
});

test("every applied change gets one audit entry carrying the owner directive", () => {
  const records = [seedRecord("MS-1"), seedRecord("MS-SKIP", { cms_status: "draft" })];
  const rows = importedRows(records);
  const plan = buildListingPublicationSyncPlan({ ...rows, seedRecords: records, approval: approvalFor(["MS-1", "MS-SKIP"]) });
  const audit = publicationSyncAuditRecords(plan, "2026-08-25T00:00:00.000Z");

  assert.equal(audit.length, 1);
  const [record] = audit;
  assert.equal(record.recordedAt, "2026-08-25T00:00:00.000Z");
  assert.equal(record.input.action, "listing_publication_executed");
  assert.equal(record.input.actor, APPROVER);
  assert.equal(record.input.objectType, "listing");
  assert.equal(record.input.objectId, "MS-1");
  assert.equal(record.input.metadata.approval_id, "MSR-LISTING-PUBLICATION-1");
  assert.match(record.input.metadata.directive, /Owner directive of 2026-08-24/);
  assert.deepEqual(record.input.metadata.changed_fields, [
    "listings.cms_status",
    "listings.workflow.publish_approved",
    "listings.workflow.publish_approved_at",
    "listings.workflow.publish_approved_by",
    "listings._status",
    "listing_translations.status",
    "listing_translations.translation_state",
    "listing_translations.public_indexable",
    "listing_translations.approved_at",
    "listing_translations._status",
  ]);
});

// --- apply side -------------------------------------------------------------

function fakePayloadRuntime(rows, { failWrite = null } = {}) {
  const listings = new Map(rows.currentListings.map((row) => [String(row.id), clone(row)]));
  const translations = new Map(rows.currentTranslations.map((row) => [String(row.id), clone(row)]));
  const calls = { begin: 0, commit: 0, rollback: 0, updates: [] };
  let snapshot = null;

  const bucket = (collection) => (collection === "listings" ? listings : translations);

  return {
    calls,
    currentRows: () => ({
      currentListings: [...listings.values()],
      currentTranslations: [...translations.values()],
    }),
    payload: {
      db: {
        async beginTransaction() {
          calls.begin += 1;
          snapshot = { listings: clone([...listings.values()]), translations: clone([...translations.values()]) };
          return `tx-${calls.begin}`;
        },
        async commitTransaction() {
          calls.commit += 1;
          snapshot = null;
        },
        async rollbackTransaction() {
          calls.rollback += 1;
          if (snapshot) {
            listings.clear();
            for (const row of snapshot.listings) listings.set(String(row.id), row);
            translations.clear();
            for (const row of snapshot.translations) translations.set(String(row.id), row);
          }
          snapshot = null;
        },
      },
      async find({ collection, req }) {
        assert.equal(req?.transactionID ? String(req.transactionID).startsWith("tx-") : true, true);
        return { docs: clone([...bucket(collection).values()]) };
      },
      async update({ collection, id, data, draft, overrideAccess, req }) {
        assert.match(String(req.transactionID), /^tx-/);
        assert.equal(draft, false);
        assert.equal(overrideAccess, true);
        calls.updates.push({ collection, id, data: clone(data) });
        if (failWrite) failWrite(calls);
        const target = bucket(collection).get(String(id));
        if (!target) throw new Error(`Unknown ${collection} id ${id}`);
        bucket(collection).set(String(id), { ...target, ...clone(data) });
        return clone(bucket(collection).get(String(id)));
      },
    },
  };
}

test("applying the plan writes publication state through the Local API and commits once", async () => {
  const records = [seedRecord("MS-1"), seedRecord("MS-2")];
  const rows = importedRows(records);
  const approval = approvalFor(["MS-1", "MS-2"]);
  const plan = buildListingPublicationSyncPlan({ ...rows, seedRecords: records, approval });
  const runtime = fakePayloadRuntime(rows);

  const result = await applyListingPublicationSync({ payload: runtime.payload, plan, seedRecords: records, approval });

  assert.equal(result.status, "committed");
  assert.deepEqual(result.applied, ["MS-1", "MS-2"]);
  assert.equal(runtime.calls.commit, 1);
  assert.equal(runtime.calls.rollback, 0);
  assert.equal(runtime.calls.updates.length, 4);
  assert.deepEqual(
    [...new Set(runtime.calls.updates.map((call) => call.collection))].sort(),
    ["listing_translations", "listings"],
  );

  const after = runtime.currentRows();
  for (const listing of after.currentListings) {
    assert.equal(listing.cms_status, "published");
    assert.equal(listing.workflow.publish_approved, true);
    assert.equal(listing.workflow.publish_approved_by, APPROVER);
    assert.equal(listing._status, "published");
    // content survived untouched
    assert.equal(listing.facts.price_eur, 100000);
    assert.match(listing.facts.title, /^Title MS-/);
  }

  // Running again over the written rows plans nothing and writes nothing.
  const second = buildListingPublicationSyncPlan({ ...after, seedRecords: records, approval });
  assert.equal(second.idempotent, true);
});

test("a dry run reads and plans without opening a transaction or writing a row", async () => {
  const records = [seedRecord("MS-1"), seedRecord("MS-2")];
  const rows = importedRows(records);
  const approval = approvalFor(["MS-1", "MS-2"]);
  // Any write at all fails this runtime, so planning cannot quietly write.
  const runtime = fakePayloadRuntime(rows, {
    failWrite: () => {
      throw new Error("a dry run must not write");
    },
  });

  const readBack = await readPublicationRows(runtime.payload);
  const plan = buildListingPublicationSyncPlan({ ...readBack, seedRecords: records, approval });

  assert.equal(plan.summary.apply, 2);
  assert.equal(runtime.calls.begin, 0);
  assert.equal(runtime.calls.commit, 0);
  assert.equal(runtime.calls.updates.length, 0);

  const untouched = runtime.currentRows();
  for (const listing of untouched.currentListings) {
    assert.equal(listing.cms_status, "source_imported_review_required");
    assert.equal(listing._status, "draft");
    assert.equal(listing.workflow.publish_approved, null);
  }
  for (const translation of untouched.currentTranslations) {
    assert.equal(translation.public_indexable, false);
    assert.equal(translation.status, "draft");
  }

  // And the command routes --dry-run before the apply step rather than after.
  const script = fs.readFileSync(fromRoot("production", "scripts", "run-payload-publication-sync.mjs"), "utf8");
  assert.ok(script.indexOf("dry_run_ready") < script.indexOf("applyListingPublicationSync({"));
});

test("a failed write rolls back and leaves the database at its previous publication state", async () => {
  const records = [seedRecord("MS-1"), seedRecord("MS-2")];
  const rows = importedRows(records);
  const approval = approvalFor(["MS-1", "MS-2"]);
  const plan = buildListingPublicationSyncPlan({ ...rows, seedRecords: records, approval });
  const runtime = fakePayloadRuntime(rows, {
    failWrite: (calls) => {
      if (calls.updates.length === 3) throw new Error("connection reset by peer");
    },
  });

  await assert.rejects(
    () => applyListingPublicationSync({ payload: runtime.payload, plan, seedRecords: records, approval }),
    /connection reset by peer/,
  );
  assert.equal(runtime.calls.rollback, 1);
  assert.equal(runtime.calls.commit, 0);
  for (const listing of runtime.currentRows().currentListings) {
    assert.equal(listing.cms_status, "source_imported_review_required");
    assert.equal(listing._status, "draft");
  }
});

test("the apply step refuses a runtime that cannot open a transaction", async () => {
  const records = [seedRecord("MS-1")];
  const rows = importedRows(records);
  const approval = approvalFor(["MS-1"]);
  const plan = buildListingPublicationSyncPlan({ ...rows, seedRecords: records, approval });

  await assert.rejects(
    () => applyListingPublicationSync({ payload: { find() {}, update() {} }, plan, seedRecords: records, approval }),
    /transaction-capable database access/,
  );
});

// --- the committed catalogue -------------------------------------------------

test("the committed seed and owner approval publish the full 165-listing catalogue", () => {
  const seed = loadCmsSeed();
  const approval = operatorPublishedListingApproval(loadApprovedLaunchFreeze());
  assert.ok(approval, "the committed publication approval must validate against the approved launch freeze");

  const seedRecords = seedListingRecords(seed);
  assert.equal(seedRecords.length, 165);
  for (const record of seedRecords) {
    const state = seedPublicationStateFor(record);
    if (record.id === "MS-CRAWL-0127") {
      // Recorded exclusion: the seed row exists but the approval deliberately
      // does not name it, so it must NOT present as owner-approved.
      assert.equal(state.ok, false, `${record.id} is excluded and must not carry the approval`);
      continue;
    }
    assert.equal(state.ok, true, `${record.id} must carry the owner approval`);
    assert.equal(state.state.publish_approved_by, APPROVER);
  }

  const rows = importedRows(seedRecords);
  const plan = buildListingPublicationSyncPlan({ ...rows, seedRecords, approval });
  assert.equal(plan.summary.apply, 164);
  // The excluded listing is refused with the approval's own recorded reason.
  assert.equal(plan.summary.refused, 1);
  assert.equal(plan.summary.skipped, 0);
  assert.equal(plan.summary.translations_apply, 164);
  assert.equal(plan.summary.translations_held, 0);
  assert.equal(publicationSyncAuditRecords(plan).length, 164);
  const refusal = plan.entries.find((entry) => entry.listing_id === "MS-CRAWL-0127");
  assert.equal(refusal?.action, "refuse");
  // cms:build reads the amended approval and reverts the excluded row's
  // publication in the seed itself, so the refusal fires on the earliest
  // honest ground: the seed no longer marks it published.
  assert.equal(refusal?.reason, "seed_record_is_not_marked_published");

  applyPlanToRows(plan, rows);
  const second = buildListingPublicationSyncPlan({ ...rows, seedRecords, approval });
  assert.equal(second.idempotent, true);
  // 164 applied stay in sync; the excluded row is refused again, not counted
  // as unchanged - idempotence over the same honest plan.
  assert.equal(second.summary.unchanged, 164);
  assert.equal(second.summary.refused, 1);
});
