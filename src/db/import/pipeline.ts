// Stage -> classify -> apply for the one-time legacy import (spec F32, A71, A72).
//
// Staging writes only import_batches and import_rows. Every row is classified against the
// live records: create | update_proposal | no_change | blocked | needs_review. Apply writes
// only rows that are still `create` when re-classified inside their own transaction, so a
// re-run converges on no_change, a partial failure leaves every other row intact and a
// resumed batch never writes twice. A difference from an existing record is only ever
// proposed (update_proposal), never written.
import { and, eq, inArray, like, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { canonicalJson } from "../../domain/approval";
import { formatReference, referencePrefixes } from "../../domain/ids";
import type { importRowClassifications, importRowOutcomes } from "../../domain/records";
import * as s from "../schema";
import {
  buildImportItems,
  type ContentItem,
  type ImportItem,
  type Issue,
  importActor,
  type ListingItem,
  legacySystemSource,
  type MediaItem,
  type PlaceItem,
  type UrlDecisionItem,
} from "./mapping";
import type { LegacySources } from "./sources";

export type ImportDb = PostgresJsDatabase<typeof s>;
type Tx = Parameters<Parameters<ImportDb["transaction"]>[0]>[0];
type Executor = ImportDb | Tx;

export type RowClassification = (typeof importRowClassifications)[number];
export type RowOutcome = (typeof importRowOutcomes)[number];

export interface FieldDiff {
  readonly field: string;
  readonly current: unknown;
  readonly incoming: unknown;
  /** The current value was reviewed by a person; only a reviewer may replace it. */
  readonly humanVerified: boolean;
}

export interface Classification {
  readonly classification: RowClassification;
  readonly targetId: string | null;
  readonly diffs: FieldDiff[];
}

/** How legacy fields land in the new model; stored on every batch for the report. */
export const fieldMapping = {
  place:
    "geography.json places + their district/region and municipality -> geography_places, aliases (official, transliteration, legacy_spelling for settlements only); GR regions use level district",
  "listing.property":
    "location -> properties (country, region, settlement, neighborhood); place via registry id; public precision settlement (region for municipality-only places, and for unreviewed default-mapped area labels, which are placed in the municipality); an archived duplicate joins its survivor's property and writes no property facts",
  "listing.purpose": "sale -> sale; rent -> long_term_rent (term never recorded, warned)",
  "listing.price":
    "sale amount -> facts.price Money EUR minor units, period total, basis asking; price_on_request -> facts.price withheld; rent amount, or a sale record whose headline advertises a rental -> facts.price unknown + facts.price.amount_without_period",
  "listing.facts":
    "rooms, bedrooms (a 0 needs the property record; listing/property disagreement -> unknown), area.<basis> (legacy human area decisions only), location, feature.* -> facts, source_class legacy_import, source_reference = legacy listing URL, observed_at = crawl capture",
  "listing.commercial":
    "active at freeze -> availability_unconfirmed (checked at freeze); archived -> withdrawn (reason in version + activity)",
  "listing.version":
    "version 1 snapshot with Bulgarian text (legacy source, or an unreviewed draft when the source was Russian) and the legacy source text",
  "listing.approval":
    "MSR-LISTING-PUBLICATION-1 -> approvals legacy_owner_publication_approval bound to version 1 hash; distribution stays never_published",
  "listing.translations":
    "non-bg legacy translations -> translations state draft, source version 1; never approved, never indexable",
  media:
    "R2 objects -> media_assets in staging, rights unknown, review pending (not publication-eligible, A54); size/hash/dimensions unknown",
  url_decision:
    "url-decisions.json -> legacy_url_decisions keyed by domain + decoded path; spellings of one key (encoding case, bare-host slash) fold into one row with every spelling in evidence",
  content_page:
    "approved area guides and guide documents -> content_pages + version 1 + legacy_content_approval; a municipality guide binds to the municipality place",
} as const;

class DependencyMissing extends Error {
  constructor(what: string) {
    super(`Dependency not imported yet: ${what}`);
  }
}

const hasSeverity = (issues: readonly Issue[], severity: Issue["severity"]) =>
  issues.some((i) => i.severity === severity);

const same = (a: unknown, b: unknown) => canonicalJson(a ?? null) === canonicalJson(b ?? null);

function diffFields(
  pairs: [field: string, current: unknown, incoming: unknown][],
  humanVerified = false,
): FieldDiff[] {
  return pairs
    .filter(([, current, incoming]) => !same(current, incoming))
    .map(([field, current, incoming]) => ({ field, current, incoming, humanVerified }));
}

// Lookups by natural key. The import keeps no id map of its own: re-runs find their records.

function parsePlaceKey(key: string) {
  const [, countryCode, slug] = key.split(":");
  return { countryCode: countryCode ?? "", slug: slug ?? "" };
}

async function findPlace(db: Executor, key: string) {
  const { countryCode, slug } = parsePlaceKey(key);
  const [row] = await db
    .select()
    .from(s.geographyPlaces)
    .where(and(eq(s.geographyPlaces.countryCode, countryCode), eq(s.geographyPlaces.slug, slug)));
  return row;
}

async function findListing(db: Executor, reference: string) {
  const [row] = await db.select().from(s.listings).where(eq(s.listings.reference, reference));
  return row;
}

async function findVersion(db: Executor, listingId: string, versionNumber = 1) {
  const [row] = await db
    .select()
    .from(s.listingVersions)
    .where(
      and(
        eq(s.listingVersions.listingId, listingId),
        eq(s.listingVersions.versionNumber, versionNumber),
      ),
    );
  return row;
}

async function findApproval(db: Executor, kind: string, subjectType: string, subjectId: string) {
  const [row] = await db
    .select()
    .from(s.approvals)
    .where(
      and(
        eq(s.approvals.kind, kind as (typeof s.approvals.$inferSelect)["kind"]),
        eq(s.approvals.subjectType, subjectType),
        eq(s.approvals.subjectId, subjectId),
      ),
    );
  return row;
}

// Classification.

async function compare(
  db: Executor,
  item: ImportItem,
): Promise<Omit<Classification, "classification"> | null> {
  switch (item.type) {
    case "place":
      return comparePlace(db, item);
    case "listing":
      return compareListing(db, item);
    case "media":
      return compareMedia(db, item);
    case "url_decision":
      return compareUrlDecision(db, item);
    case "content_page":
      return compareContent(db, item);
  }
}

async function comparePlace(db: Executor, item: PlaceItem) {
  const row = await findPlace(db, item.sourceKey);
  if (!row) return null;
  const parent = item.parentKey ? await findPlace(db, item.parentKey) : undefined;
  const aliases = await db
    .select({ kind: s.geographyPlaceAliases.kind, name: s.geographyPlaceAliases.name })
    .from(s.geographyPlaceAliases)
    .where(eq(s.geographyPlaceAliases.placeId, row.id));
  const missingAliases = item.aliases.filter(
    (a) => !aliases.some((c) => c.kind === a.kind && c.name === a.name),
  );
  return {
    targetId: row.id,
    diffs: [
      ...diffFields([
        ["level", row.level, item.place.level],
        ["registryId", row.registryId, item.place.registryId],
        ["nameNative", row.nameNative, item.place.nameNative],
        ["nameLatin", row.nameLatin, item.place.nameLatin],
        ["parent", row.parentId, parent?.id ?? (item.parentKey ? item.parentKey : null)],
      ]),
      ...(missingAliases.length
        ? [{ field: "aliases", current: aliases, incoming: missingAliases, humanVerified: false }]
        : []),
    ],
  };
}

async function compareListing(db: Executor, item: ListingItem) {
  const listing = await findListing(db, item.reference);
  if (!listing) return null;
  const [property] = await db
    .select()
    .from(s.properties)
    .where(eq(s.properties.id, listing.propertyId));
  const facts = await db
    .select()
    .from(s.facts)
    .where(
      sql`${s.facts.propertyId} = ${listing.propertyId} or ${s.facts.listingId} = ${listing.id}`,
    );
  const factKey = (subject: string, fieldKey: string) => `${subject}:${fieldKey}`;
  const current = new Map(
    facts.map((f) => [factKey(f.listingId ? "listing" : "property", f.fieldKey), f]),
  );
  const diffs: FieldDiff[] = diffFields([
    ["purpose", listing.purpose, item.listing.purpose],
    // A merged duplicate shares its survivor's property and never writes to it.
    ...(item.mergedInto
      ? []
      : [
          ["propertyType", property?.propertyType, item.property.propertyType] as [
            string,
            unknown,
            unknown,
          ],
        ]),
  ]);
  for (const f of item.facts) {
    const c = current.get(factKey(f.subject, f.fieldKey));
    const incoming = { state: f.state, value: f.value, unit: f.unit, basis: f.basis };
    const now = c ? { state: c.state, value: c.value, unit: c.unit, basis: c.basis } : null;
    if (!same(now, incoming)) {
      diffs.push({
        field: `fact.${f.fieldKey}`,
        current: c ? { ...now, sourceClass: c.sourceClass, reviewedAt: c.reviewedAt } : null,
        incoming,
        humanVerified: c?.reviewedByStaffId != null,
      });
    }
  }
  const version = await findVersion(db, listing.id);
  if (version?.contentHash !== item.version.contentHash) {
    diffs.push({
      field: "version.1",
      current: version?.contentHash ?? null,
      incoming: item.version.contentHash,
      humanVerified: false,
    });
  }
  const translations = await db
    .select()
    .from(s.translations)
    .where(
      and(
        eq(s.translations.subjectType, "listing"),
        eq(s.translations.subjectId, listing.id),
        eq(s.translations.sourceVersion, 1),
      ),
    );
  for (const t of item.translations) {
    const c = translations.find((r) => r.locale === t.locale);
    if (!c || !same({ title: c.title, body: c.body }, { title: t.title, body: t.body })) {
      diffs.push({
        field: `translation.${t.locale}`,
        current: c ? { state: c.state, title: c.title } : null,
        incoming: { state: "draft", title: t.title },
        humanVerified: c?.reviewedByStaffId != null,
      });
    }
  }
  if (item.approval && version) {
    const approval = await findApproval(db, item.approval.kind, "listing_version", version.id);
    if (!approval) {
      diffs.push({
        field: "approval",
        current: null,
        incoming: item.approval.kind,
        humanVerified: false,
      });
    }
  }
  return { targetId: listing.id, diffs };
}

async function compareMedia(db: Executor, item: MediaItem) {
  const [row] = await db
    .select()
    .from(s.mediaAssets)
    .where(eq(s.mediaAssets.r2Key, item.asset.r2Key));
  if (!row) return null;
  const owner = item.ownerListingRef ? await findListing(db, item.ownerListingRef) : undefined;
  return {
    targetId: row.id,
    diffs: diffFields([
      ["kind", row.kind, item.asset.kind],
      ["contentType", row.contentType, item.asset.contentType],
      ["caption", row.caption, item.asset.caption],
      ["legacyReference", row.legacyReference, item.asset.legacyReference],
      ["property", row.propertyId, owner?.propertyId ?? item.ownerListingRef],
    ]),
  };
}

async function compareUrlDecision(db: Executor, item: UrlDecisionItem) {
  const d = item.decision;
  const [row] = await db
    .select()
    .from(s.legacyUrlDecisions)
    .where(
      and(
        eq(s.legacyUrlDecisions.domain, d.domain),
        eq(s.legacyUrlDecisions.sourcePath, d.sourcePath),
        eq(s.legacyUrlDecisions.sourceQuery, ""),
      ),
    );
  if (!row) return null;
  return {
    targetId: row.id,
    diffs: diffFields([
      ["decision", row.decision, d.decision],
      ["statusCode", row.statusCode, d.statusCode],
      ["targetPath", row.targetPath, d.targetPath],
      ["listingReference", row.listingReference, item.listingRef],
      ["reason", row.reason, d.reason],
    ]),
  };
}

async function compareContent(db: Executor, item: ContentItem) {
  const [page] = await db
    .select()
    .from(s.contentPages)
    .where(and(eq(s.contentPages.kind, item.kind), eq(s.contentPages.slug, item.slug)));
  if (!page) return null;
  const [version] = await db
    .select()
    .from(s.contentPageVersions)
    .where(
      and(
        eq(s.contentPageVersions.contentPageId, page.id),
        eq(s.contentPageVersions.versionNumber, 1),
      ),
    );
  const diffs = diffFields([["version.1", version?.contentHash ?? null, item.version.contentHash]]);
  if (item.approval && version) {
    const approval = await findApproval(db, item.approval.kind, "content_page_version", version.id);
    if (!approval) {
      diffs.push({
        field: "approval",
        current: null,
        incoming: item.approval.kind,
        humanVerified: false,
      });
    }
  }
  return { targetId: page.id, diffs };
}

export async function classify(db: Executor, item: ImportItem): Promise<Classification> {
  const existing = await compare(db, item);
  if (existing) {
    return {
      classification: existing.diffs.length ? "update_proposal" : "no_change",
      ...existing,
    };
  }
  if (hasSeverity(item.issues, "blocking")) {
    return { classification: "blocked", targetId: null, diffs: [] };
  }
  if (hasSeverity(item.issues, "review")) {
    return { classification: "needs_review", targetId: null, diffs: [] };
  }
  return { classification: "create", targetId: null, diffs: [] };
}

// Apply: one item, inside the caller's transaction.

async function requirePlace(tx: Tx, key: string) {
  const place = await findPlace(tx, key);
  if (!place) throw new DependencyMissing(key);
  return place;
}

async function requireListing(tx: Tx, reference: string) {
  const listing = await findListing(tx, reference);
  if (!listing) throw new DependencyMissing(`listing:${reference}`);
  return listing;
}

async function nextSequence(tx: Tx, kind: string, year: number): Promise<number> {
  const [row] = await tx
    .insert(s.referenceSequences)
    .values({ kind, year, lastValue: 1 })
    .onConflictDoUpdate({
      target: [s.referenceSequences.kind, s.referenceSequences.year],
      set: { lastValue: sql`${s.referenceSequences.lastValue} + 1` },
    })
    .returning({ lastValue: s.referenceSequences.lastValue });
  if (!row) throw new Error("Reference sequence returned no row.");
  return row.lastValue;
}

function legacyApproval(
  approval: NonNullable<ListingItem["approval"]>,
  subjectType: string,
  subjectId: string,
  subjectHash: string,
): typeof s.approvals.$inferInsert {
  return {
    kind: approval.kind,
    // Recorded as the decision the legacy system holds evidence for, by its legacy role; no
    // staff account of the new system is claimed.
    state: "approved",
    subjectType,
    subjectId,
    subjectVersion: 1,
    subjectHash,
    scope: approval.scope,
    requestedByKind: importActor.kind,
    requestedById: importActor.id,
    decidedByKind: "staff",
    decidedById: approval.decidedById,
    decidedAt: new Date(approval.decidedAt),
    decisionNote: approval.decisionNote,
  };
}

async function applyPlace(tx: Tx, item: PlaceItem): Promise<string> {
  const parent = item.parentKey ? await requirePlace(tx, item.parentKey) : undefined;
  const [place] = await tx
    .insert(s.geographyPlaces)
    .values({ ...item.place, parentId: parent?.id ?? null })
    .returning({ id: s.geographyPlaces.id });
  if (!place) throw new Error("Place insert returned no row.");
  await tx
    .insert(s.geographyPlaceAliases)
    .values(item.aliases.map((a) => ({ placeId: place.id, kind: a.kind, name: a.name })));
  return place.id;
}

async function applyListing(tx: Tx, item: ListingItem, now: Date): Promise<string> {
  const place = item.placeKey ? await requirePlace(tx, item.placeKey) : undefined;
  if (item.lotNumber !== null) {
    // Listings keep legacy lot numbers (year 0): new listings must continue after them.
    await tx
      .insert(s.referenceSequences)
      .values({ kind: "listing", year: 0, lastValue: item.lotNumber })
      .onConflictDoUpdate({
        target: [s.referenceSequences.kind, s.referenceSequences.year],
        set: { lastValue: sql`greatest(${s.referenceSequences.lastValue}, excluded.last_value)` },
      });
  }
  // One physical property: an archived duplicate joins the property of the listing it was
  // merged into instead of creating a second record (F32 duplicate candidates).
  const [property] = item.mergedInto
    ? [{ id: (await requireListing(tx, item.mergedInto)).propertyId }]
    : await tx
        .insert(s.properties)
        .values({
          reference: formatReference(
            "property",
            now.getUTCFullYear(),
            await nextSequence(tx, "property", now.getUTCFullYear()),
          ),
          ...item.property,
          placeId: place?.id ?? null,
        })
        .returning({ id: s.properties.id });
  if (!property) throw new Error("Property insert returned no row.");
  const { availabilityCheckedAt, ...listingValues } = item.listing;
  const [listing] = await tx
    .insert(s.listings)
    .values({
      reference: item.reference,
      propertyId: property.id,
      ...listingValues,
      availabilityCheckedAt: availabilityCheckedAt ? new Date(availabilityCheckedAt) : null,
      distributionState: "never_published",
      currentVersionNumber: 1,
    })
    .returning({ id: s.listings.id });
  if (!listing) throw new Error("Listing insert returned no row.");
  const [version] = await tx
    .insert(s.listingVersions)
    .values({
      listingId: listing.id,
      versionNumber: 1,
      contentHash: item.version.contentHash,
      sourceLocale: "bg",
      snapshot: item.version.snapshot,
    })
    .returning({ id: s.listingVersions.id });
  if (!version) throw new Error("Version insert returned no row.");
  const observedAt = new Date(item.observedAt);
  await tx.insert(s.facts).values(
    item.facts.map((f) => ({
      propertyId: f.subject === "property" ? property.id : null,
      listingId: f.subject === "listing" ? listing.id : null,
      fieldKey: f.fieldKey,
      state: f.state,
      value: f.value,
      unit: f.unit,
      basis: f.basis,
      note: f.note,
      sourceClass: "legacy_import" as const,
      sourceReference: item.sourceUrl,
      observedAt,
    })),
  );
  if (item.approval) {
    await tx
      .insert(s.approvals)
      .values(
        legacyApproval(item.approval, "listing_version", version.id, item.version.contentHash),
      );
  }
  if (item.translations.length) {
    await tx.insert(s.translations).values(
      item.translations.map((t) => ({
        subjectType: "listing",
        subjectId: listing.id,
        locale: t.locale,
        sourceVersion: 1,
        state: "draft" as const,
        title: t.title,
        body: t.body,
        draftedByAi: t.draftedByAi,
      })),
    );
  }
  if (item.mediaKeys.length) {
    const assets = await tx
      .select({ id: s.mediaAssets.id, r2Key: s.mediaAssets.r2Key })
      .from(s.mediaAssets)
      .where(inArray(s.mediaAssets.r2Key, item.mediaKeys));
    if (assets.length) {
      await tx
        .insert(s.listingVersionMedia)
        .values(
          assets.map((a) => ({
            listingVersionId: version.id,
            mediaAssetId: a.id,
            position: item.mediaKeys.indexOf(a.r2Key),
          })),
        )
        .onConflictDoNothing();
    }
  }
  await tx.insert(s.activityEvents).values({
    recordType: "listing",
    recordId: listing.id,
    reference: item.reference,
    messageKey: "listing.imported_from_legacy",
    params: { commercialState: item.listing.commercialState },
    summary: item.summary,
    actorKind: importActor.kind,
    actorId: importActor.id,
  });
  return listing.id;
}

async function applyMedia(tx: Tx, item: MediaItem): Promise<string> {
  if (!item.ownerListingRef) throw new Error("Media without an owning listing cannot be applied.");
  const owner = await requireListing(tx, item.ownerListingRef);
  const position = item.shownIn.find((r) => r.reference === item.ownerListingRef)?.position ?? 0;
  const [asset] = await tx
    .insert(s.mediaAssets)
    .values({
      propertyId: owner.propertyId,
      listingId: owner.id,
      ...item.asset,
      storageArea: "staging",
      byteSize: null,
      sha256: null,
      rights: "unknown",
      review: "pending",
      modification: "none",
      sortOrder: position,
    })
    .returning({ id: s.mediaAssets.id });
  if (!asset) throw new Error("Media insert returned no row.");
  for (const shown of item.shownIn) {
    const listing = await findListing(tx, shown.reference);
    const version = listing ? await findVersion(tx, listing.id) : undefined;
    if (!version) continue;
    await tx
      .insert(s.listingVersionMedia)
      .values({ listingVersionId: version.id, mediaAssetId: asset.id, position: shown.position })
      .onConflictDoNothing();
  }
  return asset.id;
}

async function applyUrlDecision(tx: Tx, item: UrlDecisionItem): Promise<string> {
  const listing = item.listingRef ? await requireListing(tx, item.listingRef) : undefined;
  const [row] = await tx
    .insert(s.legacyUrlDecisions)
    .values({
      ...item.decision,
      sourceQuery: "",
      listingId: listing?.id ?? null,
      listingReference: item.listingRef,
    })
    .returning({ id: s.legacyUrlDecisions.id });
  if (!row) throw new Error("URL decision insert returned no row.");
  return row.id;
}

async function applyContent(tx: Tx, item: ContentItem): Promise<string> {
  const place = item.placeKey ? await requirePlace(tx, item.placeKey) : undefined;
  const [page] = await tx
    .insert(s.contentPages)
    .values({
      kind: item.kind,
      slug: item.slug,
      placeId: place?.id ?? null,
      currentVersionNumber: 1,
    })
    .returning({ id: s.contentPages.id });
  if (!page) throw new Error("Content page insert returned no row.");
  const [version] = await tx
    .insert(s.contentPageVersions)
    .values({
      contentPageId: page.id,
      versionNumber: 1,
      contentHash: item.version.contentHash,
      sourceLocale: item.version.sourceLocale,
      body: item.version.body,
      reviewedAt: item.version.reviewedAt ? new Date(item.version.reviewedAt) : null,
    })
    .returning({ id: s.contentPageVersions.id });
  if (!version) throw new Error("Content version insert returned no row.");
  if (item.approval) {
    await tx
      .insert(s.approvals)
      .values(
        legacyApproval(item.approval, "content_page_version", version.id, item.version.contentHash),
      );
  }
  return page.id;
}

function applyItem(tx: Tx, item: ImportItem, now: Date): Promise<string> {
  switch (item.type) {
    case "place":
      return applyPlace(tx, item);
    case "listing":
      return applyListing(tx, item, now);
    case "media":
      return applyMedia(tx, item);
    case "url_decision":
      return applyUrlDecision(tx, item);
    case "content_page":
      return applyContent(tx, item);
  }
}

// Batches.

async function nextBatchReference(db: Executor, year: number): Promise<string> {
  const prefix = `${referencePrefixes.import_batch}-${year}-`;
  const [row] = await db
    .select({ max: sql<string | null>`max(${s.importBatches.reference})` })
    .from(s.importBatches)
    .where(like(s.importBatches.reference, `${prefix}%`));
  const last = row?.max ? Number(row.max.slice(prefix.length)) : 0;
  return formatReference("import_batch", year, last + 1);
}

export interface StageOptions {
  readonly mode: "dry_run" | "apply";
  readonly now?: Date;
}

export interface StagedBatch {
  readonly id: string;
  readonly reference: string;
}

/** Stages and classifies every legacy item. Writes only the import tables (A71). */
export async function stageBatch(
  db: ImportDb,
  sources: LegacySources,
  options: StageOptions,
): Promise<StagedBatch> {
  const now = options.now ?? new Date();
  const items = buildImportItems(sources);
  return db.transaction(async (tx) => {
    const classified: { item: ImportItem; c: Classification }[] = [];
    for (const item of items) classified.push({ item, c: await classify(tx, item) });
    const reference = await nextBatchReference(tx, now.getUTCFullYear());
    const [batch] = await tx
      .insert(s.importBatches)
      .values({
        reference,
        source: legacySystemSource,
        scope:
          "geography, listings (property, facts, version 1, approval, translations), media, legacy URL decisions, content pages",
        mode: options.mode,
        state: "validated",
        sourceSha256: sources.sha256,
        fieldMapping: { ...fieldMapping, files: sources.fileSha256 },
        rowCount: items.length,
      })
      .returning({ id: s.importBatches.id, reference: s.importBatches.reference });
    if (!batch) throw new Error("Batch insert returned no row.");
    const rows = classified.map(({ item, c }, index) => ({
      batchId: batch.id,
      rowNumber: index + 1,
      sourceKey: item.sourceKey,
      classification: c.classification,
      targetType: item.type,
      targetId: c.targetId,
      diff: c.diffs.length ? { fields: c.diffs } : {},
      issues: item.issues,
      outcome: "pending" as const,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      await tx.insert(s.importRows).values(rows.slice(i, i + 500));
    }
    return batch;
  });
}

export interface ApplyOptions {
  /** Source keys to apply. Default: every `create` row not yet applied (resume). */
  readonly rows?: readonly string[];
  readonly now?: Date;
  /** Test hook: runs before each row's transaction; a throw fails only that row. */
  readonly beforeRow?: (row: { sourceKey: string; rowNumber: number }) => void | Promise<void>;
}

export interface ApplyResult {
  readonly reference: string;
  readonly state: (typeof s.importBatches.$inferSelect)["state"];
  readonly outcomes: Record<RowOutcome, number>;
  readonly failed: { sourceKey: string; errorCode: string }[];
}

export async function findBatch(db: ImportDb, reference: string) {
  const [batch] = await db
    .select()
    .from(s.importBatches)
    .where(eq(s.importBatches.reference, reference));
  if (!batch) throw new Error(`Import batch ${reference} not found.`);
  return batch;
}

/** Applies the selected rows of an apply batch, one transaction per row (A72). */
export async function applyBatch(
  db: ImportDb,
  sources: LegacySources,
  reference: string,
  options: ApplyOptions = {},
): Promise<ApplyResult> {
  const now = options.now ?? new Date();
  const batch = await findBatch(db, reference);
  if (batch.mode !== "apply") throw new Error(`${reference} is a dry run; stage an apply batch.`);
  if (batch.sourceSha256 !== sources.sha256) {
    throw new Error(`${reference} was staged from different legacy files; stage a new batch.`);
  }
  const items = new Map(buildImportItems(sources).map((i) => [i.sourceKey, i]));
  const rows = await db
    .select()
    .from(s.importRows)
    .where(eq(s.importRows.batchId, batch.id))
    .orderBy(s.importRows.rowNumber);

  let selected: typeof rows;
  if (options.rows) {
    const wanted = new Set(options.rows);
    selected = rows.filter((r) => wanted.has(r.sourceKey));
    const unknown = [...wanted].filter((k) => !rows.some((r) => r.sourceKey === k));
    if (unknown.length) throw new Error(`Rows not in ${reference}: ${unknown.join(", ")}`);
  } else {
    selected = rows.filter(
      (r) => r.classification === "create" && (r.outcome === "pending" || r.outcome === "failed"),
    );
  }

  await db
    .update(s.importBatches)
    .set({
      state: "applying",
      startedAt: batch.startedAt ?? now,
      version: sql`${s.importBatches.version} + 1`,
    })
    .where(eq(s.importBatches.id, batch.id));

  for (const row of selected) {
    const item = items.get(row.sourceKey);
    let outcome: RowOutcome;
    let errorCode: string | null = null;
    let targetId = row.targetId;
    try {
      if (!item) throw new Error("Source item no longer present.");
      await options.beforeRow?.({ sourceKey: row.sourceKey, rowNumber: row.rowNumber });
      const result = await db.transaction(async (tx) => {
        const fresh = await classify(tx, item);
        if (fresh.classification !== "create") {
          return {
            outcome: "skipped" as const,
            errorCode: fresh.classification,
            targetId: fresh.targetId,
          };
        }
        const id = await applyItem(tx, item, now);
        await tx.insert(s.auditLog).values({
          action: "import.row_applied",
          operationId: `${reference}#${row.rowNumber}`,
          actorKind: importActor.kind,
          actorId: importActor.id,
          capability: "import.run",
          recordType: item.type,
          recordId: id,
          payload: { batch: reference, sourceKey: row.sourceKey },
        });
        return { outcome: "applied" as const, errorCode: null, targetId: id };
      });
      ({ outcome, errorCode, targetId } = result);
    } catch (error) {
      outcome = "failed";
      errorCode =
        error instanceof DependencyMissing
          ? `dependency_missing: ${error.message.replace(/^.*: /, "")}`
          : `apply_error: ${(error as Error).message}`.slice(0, 500);
    }
    await db
      .update(s.importRows)
      .set({
        outcome,
        errorCode,
        targetId,
        appliedAt: outcome === "applied" ? now : row.appliedAt,
        version: sql`${s.importRows.version} + 1`,
      })
      .where(eq(s.importRows.id, row.id));
  }

  const after = await db
    .select({
      sourceKey: s.importRows.sourceKey,
      classification: s.importRows.classification,
      outcome: s.importRows.outcome,
      errorCode: s.importRows.errorCode,
    })
    .from(s.importRows)
    .where(eq(s.importRows.batchId, batch.id));
  const outcomes: Record<RowOutcome, number> = { pending: 0, applied: 0, skipped: 0, failed: 0 };
  for (const r of after) outcomes[r.outcome] += 1;
  const failed = after
    .filter((r) => r.outcome === "failed")
    .map((r) => ({ sourceKey: r.sourceKey, errorCode: r.errorCode ?? "" }));
  const openCreates = after.some(
    (r) => r.classification === "create" && (r.outcome === "pending" || r.outcome === "failed"),
  );
  const state =
    failed.length === 0 && !openCreates
      ? "completed"
      : outcomes.applied === 0
        ? "failed"
        : "partially_completed";
  await db
    .update(s.importBatches)
    .set({ state, finishedAt: now, version: sql`${s.importBatches.version} + 1` })
    .where(eq(s.importBatches.id, batch.id));
  return { reference, state, outcomes, failed };
}
