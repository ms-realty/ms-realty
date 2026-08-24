// Publication projector: carries the publication state the committed CMS seed
// records into the Payload/Postgres rows the production runtime reads.
//
// Why this exists. Production runs with MS_REALTY_RUNTIME_DATA_AUTHORITY=payload,
// so publicSeedFor() (production/lib/public-inventory.mjs) decides what the
// public site shows from the *database* row, not from the committed seed. The
// CMS importer deliberately never publishes: it writes every listing as
// `source_imported_review_required` and every translation as a non-public
// draft. Nothing else ever moved the owner's recorded publication decision into
// Postgres, so the seed said "published" while the database said "review
// required".
//
// What this projector may touch. Publication state only:
//
//   listings            cms_status
//                       workflow.publish_approved
//                       workflow.publish_approved_at
//                       workflow.publish_approved_by
//                       _status                       (Payload version state)
//   listing_translations (source locale row only)
//                       status
//                       translation_state
//                       public_indexable
//                       reviewer
//                       approved_at
//                       _status
//
// Content - titles, prices, facts, SEO, media, tours, routing, migration - is
// never read from the seed here and never written. Non-source translations are
// never touched: they stay unpublished until a human approves them, exactly as
// production/data/listing-publication-approval.json records.
//
// What it refuses. It applies approvals; it never invents them. A listing is
// projected only when the seed record itself carries the owner's approval
// (cms_status published + workflow.publish_approved with an approver and a
// timestamp) AND the signed operator approval artifact names that listing id.
// Everything else is refused per record with a reason, and the run says so.

const PUBLIC_LISTING_STATUSES = new Set(["available", "reserved"]);

export const PUBLICATION_LISTING_FIELDS = Object.freeze([
  "cms_status",
  "workflow.publish_approved",
  "workflow.publish_approved_at",
  "workflow.publish_approved_by",
  "_status",
]);

export const PUBLICATION_TRANSLATION_FIELDS = Object.freeze([
  "status",
  "translation_state",
  "public_indexable",
  "reviewer",
  "approved_at",
  "_status",
]);

export const PUBLICATION_REFUSAL_REASONS = Object.freeze({
  SEED_NOT_PUBLISHED: "seed_record_is_not_marked_published",
  SEED_NOT_APPROVED: "seed_record_carries_no_publish_approval",
  SEED_APPROVAL_INCOMPLETE: "seed_publish_approval_is_missing_approver_or_timestamp",
  NOT_IN_APPROVAL: "listing_is_not_named_by_the_owner_publication_approval",
  ABSENT_FROM_DATABASE: "listing_has_no_row_in_the_payload_database",
  DATABASE_STATUS_NOT_PUBLIC: "database_listing_status_is_not_publicly_listable",
});

export const PUBLICATION_SKIP_REASONS = Object.freeze({
  ABSENT_FROM_SEED: "database_listing_is_absent_from_the_committed_seed",
});

export const TRANSLATION_HOLD_REASONS = Object.freeze({
  SEED_NOT_HUMAN_APPROVED: "seed_source_locale_translation_is_not_human_approved",
  ABSENT_FROM_DATABASE: "source_locale_translation_row_is_absent_from_the_database",
});

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return String(value ?? "").trim();
}

// Payload returns relationships as an id at depth 0 and as a document deeper.
function relationId(value) {
  if (isRecord(value)) return text(value.id);
  return text(value);
}

function sameTimestamp(left, right) {
  const a = text(left);
  const b = text(right);
  if (!a || !b) return a === b;
  const parsedA = Date.parse(a);
  const parsedB = Date.parse(b);
  if (Number.isNaN(parsedA) || Number.isNaN(parsedB)) return a === b;
  return parsedA === parsedB;
}

function isoTimestamp(value) {
  const parsed = Date.parse(text(value));
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

// ---------------------------------------------------------------------------
// Schema guard
// ---------------------------------------------------------------------------

function fieldNames(fields) {
  return new Set((Array.isArray(fields) ? fields : []).map((field) => text(field?.name)).filter(Boolean));
}

function groupFieldNames(fields, groupName) {
  const group = (Array.isArray(fields) ? fields : []).find((field) => text(field?.name) === groupName);
  return fieldNames(group?.fields);
}

// Fail-closed: if the collections in front of us do not carry the publication
// fields, we stop rather than write a half-understood shape into Postgres.
export function assertPublicationSchema({ listingFields, translationFields } = {}) {
  if (!Array.isArray(listingFields) || !listingFields.length) {
    throw new Error("The Payload runtime did not expose the listings collection schema, so publication state cannot be applied safely");
  }
  if (!Array.isArray(translationFields) || !translationFields.length) {
    throw new Error("The Payload runtime did not expose the listing_translations collection schema, so publication state cannot be applied safely");
  }

  const listingTop = fieldNames(listingFields);
  if (!listingTop.has("cms_status")) {
    throw new Error("The listings collection has no cms_status field, so the database cannot record a publication decision");
  }

  const workflow = groupFieldNames(listingFields, "workflow");
  const missingWorkflow = ["publish_approved", "publish_approved_at", "publish_approved_by"].filter((name) => !workflow.has(name));
  if (missingWorkflow.length) {
    throw new Error(`The listings workflow group is missing publication fields: ${missingWorkflow.join(", ")}`);
  }

  const facts = groupFieldNames(listingFields, "facts");
  if (!facts.has("listing_status")) {
    throw new Error("The listings facts group has no listing_status field, so public availability cannot be checked");
  }

  const translation = fieldNames(translationFields);
  const missingTranslation = ["status", "translation_state", "public_indexable", "reviewer", "approved_at"].filter(
    (name) => !translation.has(name),
  );
  if (missingTranslation.length) {
    throw new Error(`The listing_translations collection is missing publication fields: ${missingTranslation.join(", ")}`);
  }

  return { listing_fields: [...listingTop].sort(), translation_fields: [...translation].sort() };
}

// ---------------------------------------------------------------------------
// Seed side: what the committed record records about publication
// ---------------------------------------------------------------------------

export function seedListingRecords(seed) {
  return (seed?.records || []).filter((record) => record?.collection === "listings");
}

function seedSourceTranslation(record) {
  const sourceLocale = text(record?.source_locale);
  if (!sourceLocale) return null;
  return (record.translations || []).find((translation) => text(translation?.locale) === sourceLocale) || null;
}

// The publication state the seed record itself records - nothing derived, and
// nothing invented. A record that does not carry the owner's approval yields a
// refusal reason instead of a target state.
export function seedPublicationStateFor(record) {
  const listingId = text(record?.id);
  if (text(record?.cms_status) !== "published") {
    return { ok: false, reason: PUBLICATION_REFUSAL_REASONS.SEED_NOT_PUBLISHED };
  }
  const workflow = isRecord(record?.workflow) ? record.workflow : {};
  if (workflow.publish_approved !== true) {
    return { ok: false, reason: PUBLICATION_REFUSAL_REASONS.SEED_NOT_APPROVED };
  }
  const approvedBy = text(workflow.publish_approved_by);
  const approvedAt = isoTimestamp(workflow.publish_approved_at);
  if (!approvedBy || !approvedAt) {
    return { ok: false, reason: PUBLICATION_REFUSAL_REASONS.SEED_APPROVAL_INCOMPLETE };
  }

  const seedTranslation = seedSourceTranslation(record);
  const translationApproved =
    Boolean(seedTranslation) &&
    seedTranslation.human_approved === true &&
    text(seedTranslation.status) === "published" &&
    text(seedTranslation.translation_state) === "published" &&
    Boolean(text(seedTranslation.reviewer)) &&
    Boolean(isoTimestamp(seedTranslation.approved_at));

  return {
    ok: true,
    state: {
      listing_id: listingId,
      cms_status: "published",
      publish_approved: true,
      publish_approved_at: approvedAt,
      publish_approved_by: approvedBy,
      source_locale: text(record.source_locale),
      translation: translationApproved
        ? {
            locale: text(seedTranslation.locale),
            status: "published",
            translation_state: "published",
            public_indexable: true,
            reviewer: text(seedTranslation.reviewer),
            approved_at: isoTimestamp(seedTranslation.approved_at),
          }
        : null,
      translation_hold: translationApproved ? null : TRANSLATION_HOLD_REASONS.SEED_NOT_HUMAN_APPROVED,
    },
  };
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

function listingPatchFor(current, state) {
  const currentWorkflow = isRecord(current.workflow) ? current.workflow : {};
  const changed = [];
  if (text(current.cms_status) !== state.cms_status) changed.push("cms_status");
  if (currentWorkflow.publish_approved !== true) changed.push("workflow.publish_approved");
  if (!sameTimestamp(currentWorkflow.publish_approved_at, state.publish_approved_at)) changed.push("workflow.publish_approved_at");
  if (text(currentWorkflow.publish_approved_by) !== state.publish_approved_by) changed.push("workflow.publish_approved_by");
  if (text(current._status).toLowerCase() !== "published") changed.push("_status");
  if (!changed.length) return null;

  return {
    changed_fields: changed,
    // The workflow group is replaced wholesale by a Payload update, so the
    // fields this projector does not own are carried through untouched.
    data: {
      cms_status: state.cms_status,
      workflow: {
        ...currentWorkflow,
        publish_approved: true,
        publish_approved_at: state.publish_approved_at,
        publish_approved_by: state.publish_approved_by,
      },
      _status: "published",
    },
  };
}

function translationPatchFor(current, target) {
  const changed = [];
  if (text(current.status) !== target.status) changed.push("status");
  if (text(current.translation_state) !== target.translation_state) changed.push("translation_state");
  if (current.public_indexable !== true) changed.push("public_indexable");
  if (text(current.reviewer) !== target.reviewer) changed.push("reviewer");
  if (!sameTimestamp(current.approved_at, target.approved_at)) changed.push("approved_at");
  if (text(current._status).toLowerCase() !== "published") changed.push("_status");
  if (!changed.length) return null;

  return {
    changed_fields: changed,
    data: {
      status: target.status,
      translation_state: target.translation_state,
      public_indexable: true,
      reviewer: target.reviewer,
      approved_at: target.approved_at,
      _status: "published",
    },
  };
}

function sourceTranslationRow(listing, translations) {
  const listingId = text(listing.id);
  const sourceLocaleId = relationId(listing.source_locale);
  if (!sourceLocaleId) return null;
  return (
    translations.find(
      (row) => relationId(row?.listing) === listingId && relationId(row?.locale) === sourceLocaleId,
    ) || null
  );
}

function emptySummary() {
  return { total_seed_listings: 0, apply: 0, unchanged: 0, refused: 0, skipped: 0, translations_apply: 0, translations_held: 0 };
}

/**
 * Pure core. Compares the publication state recorded in the committed seed
 * against the current database rows and returns the plan, without writing
 * anything and without needing a Payload instance.
 *
 * @param currentListings      listings rows as Payload returns them at depth 0
 * @param currentTranslations  listing_translations rows at depth 0
 * @param seedRecords          committed seed listing records
 * @param approval             the validated operator publication approval
 */
export function buildListingPublicationSyncPlan({
  currentListings = [],
  currentTranslations = [],
  seedRecords = [],
  approval = null,
} = {}) {
  if (!approval || !Array.isArray(approval.listing_ids) || !approval.listing_ids.length) {
    throw new Error("Publication sync requires a validated owner publication approval naming the listings to publish");
  }

  const approvedIds = new Set(approval.listing_ids.map((id) => text(id)));
  const excludedReasons = new Map((approval.excluded_listings || []).map((row) => [text(row?.id), text(row?.reason)]));
  const listingsById = new Map(currentListings.map((row) => [text(row?.id), row]));
  const seedIds = new Set(seedRecords.map((record) => text(record?.id)));

  const entries = [];
  const summary = emptySummary();
  summary.total_seed_listings = seedRecords.length;

  for (const record of seedRecords) {
    const listingId = text(record?.id);
    const seedState = seedPublicationStateFor(record);

    if (!seedState.ok) {
      entries.push({ listing_id: listingId, action: "refuse", reason: seedState.reason, detail: null });
      continue;
    }
    if (!approvedIds.has(listingId)) {
      entries.push({
        listing_id: listingId,
        action: "refuse",
        reason: PUBLICATION_REFUSAL_REASONS.NOT_IN_APPROVAL,
        detail: excludedReasons.get(listingId) || null,
      });
      continue;
    }

    const current = listingsById.get(listingId);
    if (!current) {
      entries.push({ listing_id: listingId, action: "refuse", reason: PUBLICATION_REFUSAL_REASONS.ABSENT_FROM_DATABASE, detail: null });
      continue;
    }

    // The seed records no listing_status, so an empty database value is fine -
    // publicSeedFor() reads an owner-published listing with no status as
    // available. A concrete non-public status is an operator's content
    // decision, and this projector never overrides content.
    const databaseStatus = text(current.facts?.listing_status);
    if (databaseStatus && !PUBLIC_LISTING_STATUSES.has(databaseStatus)) {
      entries.push({
        listing_id: listingId,
        action: "refuse",
        reason: PUBLICATION_REFUSAL_REASONS.DATABASE_STATUS_NOT_PUBLIC,
        detail: databaseStatus,
      });
      continue;
    }

    const listingPatch = listingPatchFor(current, seedState.state);

    let translationPatch = null;
    let translationHold = seedState.state.translation_hold;
    let translationRow = null;
    if (seedState.state.translation) {
      translationRow = sourceTranslationRow(current, currentTranslations);
      if (!translationRow) translationHold = TRANSLATION_HOLD_REASONS.ABSENT_FROM_DATABASE;
      else translationPatch = translationPatchFor(translationRow, seedState.state.translation);
    }

    const entry = {
      listing_id: listingId,
      action: listingPatch || translationPatch ? "apply" : "unchanged",
      reason: null,
      approved_by: seedState.state.publish_approved_by,
      approved_at: seedState.state.publish_approved_at,
      source_locale: seedState.state.source_locale,
      listing: listingPatch ? { id: text(current.id), ...listingPatch } : null,
      translation: translationPatch ? { id: translationRow.id, ...translationPatch } : null,
      translation_hold: translationHold,
    };
    entries.push(entry);

    if (entry.action === "apply") summary.apply += 1;
    else summary.unchanged += 1;
    if (translationPatch) summary.translations_apply += 1;
    if (translationHold) summary.translations_held += 1;
  }

  for (const row of currentListings) {
    const listingId = text(row?.id);
    if (seedIds.has(listingId)) continue;
    entries.push({ listing_id: listingId, action: "skip", reason: PUBLICATION_SKIP_REASONS.ABSENT_FROM_SEED, detail: null });
  }

  summary.refused = entries.filter((entry) => entry.action === "refuse").length;
  summary.skipped = entries.filter((entry) => entry.action === "skip").length;

  return {
    kind: "listing_publication_sync_plan",
    approval: {
      approval_id: approval.approval_id,
      scope: approval.scope,
      decision: approval.decision,
      approved_by: approval.approved_by,
      approved_at: approval.approved_at,
      directive: approval.reason || null,
      approved_listing_ids: approvedIds.size,
      excluded_listing_ids: excludedReasons.size,
    },
    entries,
    summary,
    idempotent: summary.apply === 0,
  };
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

function assertPayload(payload) {
  if (
    !payload?.db ||
    typeof payload.db.beginTransaction !== "function" ||
    typeof payload.db.commitTransaction !== "function" ||
    typeof payload.db.rollbackTransaction !== "function"
  ) {
    throw new Error("Publication sync requires transaction-capable database access");
  }
  for (const method of ["find", "update"]) {
    if (typeof payload?.[method] !== "function") throw new Error(`Publication sync requires the Local API ${method} method`);
  }
}

function retryableTransactionError(error) {
  return /could not serialize|serialization failure|deadlock detected/i.test(String(error?.message || error));
}

async function findAll(payload, collection, req) {
  const result = await payload.find({
    collection,
    depth: 0,
    draft: true,
    overrideAccess: true,
    pagination: false,
    req,
  });
  if (!Array.isArray(result?.docs)) throw new Error(`The Payload ${collection} query did not return documents`);
  return result.docs;
}

export async function readPublicationRows(payload, req) {
  assertPayload(payload);
  return {
    currentListings: await findAll(payload, "listings", req),
    currentTranslations: await findAll(payload, "listing_translations", req),
  };
}

export function payloadPublicationSchemaFields(payload) {
  return {
    listingFields: payload?.collections?.listings?.config?.fields,
    translationFields: payload?.collections?.listing_translations?.config?.fields,
  };
}

function writeOptions(collection, id, data, req) {
  return {
    collection,
    id,
    data,
    depth: 0,
    // draft:false publishes the version, so the published row and the latest
    // version agree. The runtime reads listings with draft:true, but leaving a
    // "published" cms_status on a draft-only version would be a split brain.
    draft: false,
    overrideAccess: true,
    req,
  };
}

async function applyOnce(plan, payload, req) {
  const applied = [];
  for (const entry of plan.entries) {
    if (entry.action !== "apply") continue;
    if (entry.listing) await payload.update(writeOptions("listings", entry.listing.id, entry.listing.data, req));
    if (entry.translation) {
      await payload.update(writeOptions("listing_translations", entry.translation.id, entry.translation.data, req));
    }
    applied.push(entry.listing_id);
  }
  return applied;
}

// Fail-closed readback: if the rows do not actually carry the owner's
// publication state after the writes, the transaction is rolled back rather
// than reported as a success.
function verifyApplied(plan, rows) {
  const verification = buildListingPublicationSyncPlan({ ...rows, seedRecords: plan.seedRecords, approval: plan.approvalSource });
  const stillPending = verification.entries.filter((entry) => entry.action === "apply").map((entry) => entry.listing_id);
  return { ok: stillPending.length === 0, still_pending: stillPending };
}

export async function applyListingPublicationSync({
  payload,
  plan,
  seedRecords,
  approval,
  maxAttempts = 2,
} = {}) {
  assertPayload(payload);
  if (!plan) throw new Error("Publication sync needs a plan to apply");

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const transactionId = await payload.db.beginTransaction({ accessMode: "read write", isolationLevel: "serializable" });
    if (!transactionId) throw new Error("Publication sync could not open a transaction");
    const req = { payload, transactionID: transactionId };
    let committed = false;
    try {
      const applied = await applyOnce(plan, payload, req);
      const rows = await readPublicationRows(payload, req);
      const verification = verifyApplied({ ...plan, seedRecords, approvalSource: approval }, rows);
      if (!verification.ok) {
        await payload.db.rollbackTransaction(transactionId);
        return { status: "verification_failed", attempt, applied: [], verification };
      }
      await payload.db.commitTransaction(transactionId);
      committed = true;
      return { status: "committed", attempt, applied, verification };
    } catch (error) {
      if (!committed) await payload.db.rollbackTransaction(transactionId).catch(() => undefined);
      if (attempt === maxAttempts || !retryableTransactionError(error)) throw error;
    }
  }
  throw new Error("Publication sync exhausted transaction retries");
}

// The audit trail for an applied change, routed through the repo's audit log.
// The directive reference is what makes the row reviewable months later.
export function publicationSyncAuditRecords(plan, recordedAt = new Date().toISOString()) {
  return plan.entries
    .filter((entry) => entry.action === "apply")
    .map((entry) => ({
      recordedAt,
      input: {
        action: "listing_publication_executed",
        actor: entry.approved_by,
        objectType: "listing",
        objectId: entry.listing_id,
        status: "published",
        metadata: {
          approval_id: plan.approval.approval_id,
          approval_scope: plan.approval.scope,
          approval_decision: plan.approval.decision,
          approved_by: entry.approved_by,
          approved_at: entry.approved_at,
          directive: plan.approval.directive,
          executed_by: "payload:publication:sync",
          changed_fields: [
            ...(entry.listing?.changed_fields || []).map((field) => `listings.${field}`),
            ...(entry.translation?.changed_fields || []).map((field) => `listing_translations.${field}`),
          ],
        },
      },
    }));
}
