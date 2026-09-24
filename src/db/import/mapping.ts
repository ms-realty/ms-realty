// Legacy extraction -> import items (spec F32). Pure: no IO. Every value comes from the
// extraction; a value the legacy system never held becomes an explicit non-known fact state,
// never a zero, false or guess.
import { createHash } from "node:crypto";
import { canonicalJson } from "../../domain/approval";
import type { FactState, ListingPurpose, PropertyType } from "../../domain/facts";
import { propertyTypes } from "../../domain/facts";
import type { PublicLocale } from "../../domain/ids";
import { isCurrencyCode, isPublicLocale } from "../../domain/ids";
import type { CommercialState, EditorialState } from "../../domain/listing";
import type { MediaKind } from "../../domain/media";
import { isAllowedMediaContentType } from "../../domain/media";
import type { placeAliasKinds, placeLevels } from "../../domain/records";
import type {
  LegacyContentRecord,
  LegacyListing,
  LegacyPlace,
  LegacySources,
  LegacyTranslation,
  LegacyUrlDecision,
} from "./sources";

type PlaceLevel = (typeof placeLevels)[number];
type PlaceAliasKind = (typeof placeAliasKinds)[number];

export type IssueSeverity = "warning" | "review" | "blocking";
export interface Issue {
  readonly code: string;
  readonly severity: IssueSeverity;
  readonly message: string;
}

export const importActor = { kind: "system", id: "legacy-import" } as const;
export const legacySystemSource = "data/legacy (git tag legacy-app-final)";

export interface PlaceItem {
  readonly type: "place";
  readonly sourceKey: string;
  readonly issues: Issue[];
  readonly place: {
    level: PlaceLevel;
    countryCode: string;
    slug: string;
    registryId: string;
    nameNative: string;
    nameLatin: string;
  };
  readonly parentKey: string | null;
  readonly aliases: { kind: PlaceAliasKind; name: string }[];
}

export interface FactInput {
  readonly subject: "property" | "listing";
  readonly fieldKey: string;
  readonly state: FactState;
  readonly value: unknown;
  readonly unit: string | null;
  readonly basis: string | null;
  readonly note: string | null;
}

export interface TranslationInput {
  readonly locale: PublicLocale;
  readonly title: string | null;
  readonly body: Record<string, unknown>;
  readonly draftedByAi: boolean;
}

export interface ApprovalInput {
  readonly kind: "legacy_owner_publication_approval" | "legacy_content_approval";
  readonly decidedById: string;
  readonly decidedAt: string;
  readonly decisionNote: string;
  readonly scope: Record<string, unknown>;
}

export interface ListingItem {
  readonly type: "listing";
  readonly sourceKey: string;
  readonly issues: Issue[];
  readonly reference: string;
  readonly lotNumber: number | null;
  /**
   * The surviving listing an archived duplicate was merged into. The duplicate's listing is
   * attached to that listing's property; it creates no property and writes no property facts.
   */
  readonly mergedInto: string | null;
  readonly placeKey: string | null;
  readonly property: {
    propertyType: PropertyType;
    country: string;
    region: string;
    settlement: string;
    neighborhood: string | null;
    publicPrecision: "settlement" | "region";
  };
  readonly listing: {
    purpose: ListingPurpose;
    commercialState: CommercialState;
    editorialState: EditorialState;
    availabilityCheckedAt: string | null;
  };
  readonly facts: FactInput[];
  readonly observedAt: string;
  readonly sourceUrl: string;
  readonly version: { snapshot: Record<string, unknown>; contentHash: string };
  readonly approval: ApprovalInput | null;
  readonly translations: TranslationInput[];
  readonly mediaKeys: string[];
  readonly summary: string;
}

export interface MediaItem {
  readonly type: "media";
  readonly sourceKey: string;
  readonly issues: Issue[];
  readonly ownerListingRef: string | null;
  /** Every listing whose imported version shows this object, with its gallery position. */
  readonly shownIn: { reference: string; position: number }[];
  readonly asset: {
    r2Key: string;
    kind: MediaKind;
    contentType: string;
    caption: string | null;
    width: number | null;
    height: number | null;
    legacyReference: string;
  };
}

export interface UrlDecisionItem {
  readonly type: "url_decision";
  readonly sourceKey: string;
  readonly issues: Issue[];
  readonly listingRef: string | null;
  readonly decision: {
    domain: "makler-realty.com" | "makler-realty.ru";
    sourcePath: string;
    decision: "retain_200" | "redirect_301" | "approved_410";
    statusCode: number;
    targetPath: string | null;
    reason: string;
    evidence: Record<string, unknown>;
  };
}

export interface ContentItem {
  readonly type: "content_page";
  readonly sourceKey: string;
  readonly issues: Issue[];
  readonly kind: "area" | "guide";
  readonly slug: string;
  readonly placeKey: string | null;
  readonly version: {
    sourceLocale: PublicLocale;
    body: Record<string, unknown>;
    contentHash: string;
    reviewedAt: string | null;
  };
  readonly approval: ApprovalInput | null;
}

export type ImportItem = PlaceItem | ListingItem | MediaItem | UrlDecisionItem | ContentItem;
export type ImportItemType = ImportItem["type"];
/** Apply order: every item's dependencies come earlier. */
export const itemTypes: readonly ImportItemType[] = [
  "place",
  "listing",
  "media",
  "url_decision",
  "content_page",
];

export function sha256Json(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const warn = (code: string, message: string): Issue => ({ code, severity: "warning", message });
const review = (code: string, message: string): Issue => ({ code, severity: "review", message });
const block = (code: string, message: string): Issue => ({ code, severity: "blocking", message });

/** The crawl stamp carries no zone; the crawl ran on a UTC host (artifact 20260704-211155). */
function crawlInstant(value: string): string {
  return /[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`;
}

// Geography.

const placeKey = (countryCode: string, slug: string) => `place:${countryCode}:${slug}`;

/** Legacy admin levels that have a place level here; GR regions sit where BG districts do. */
const levelMap: Record<string, PlaceLevel> = {
  district: "district",
  region: "district",
  municipality: "municipality",
  settlement: "settlement",
};

export function buildPlaceItems(places: readonly LegacyPlace[]): {
  items: PlaceItem[];
  /** Registry id -> place item key, for resolving listing and content locations. */
  byRegistryId: Map<string, string>;
  byPlaceKey: Map<string, string>;
} {
  const nodes = new Map<string, PlaceItem>();
  const byRegistryId = new Map<string, string>();

  const addNode = (
    entry: { id: string; level: string; names: { native: string; en: string } },
    countryCode: string,
    parentKey: string | null,
    settlementSlug?: string,
  ): PlaceItem => {
    const existing = nodes.get(entry.id);
    if (existing) return existing;
    const level = levelMap[entry.level];
    const issues: Issue[] = [];
    if (!level) issues.push(block("place_level_unmapped", `Legacy level ${entry.level}`));
    const slug = settlementSlug ?? slugify(`${entry.names.en}-${entry.level}`);
    const item: PlaceItem = {
      type: "place",
      sourceKey: placeKey(countryCode, slug),
      issues,
      place: {
        level: level ?? "settlement",
        countryCode,
        slug,
        registryId: entry.id,
        nameNative: entry.names.native,
        nameLatin: entry.names.en,
      },
      parentKey,
      aliases: [{ kind: "official", name: entry.names.native }],
    };
    if (entry.names.en !== entry.names.native) {
      item.aliases.push({ kind: "transliteration", name: entry.names.en });
    }
    nodes.set(entry.id, item);
    byRegistryId.set(entry.id, item.sourceKey);
    return item;
  };

  const byPlaceKey = new Map<string, string>();
  for (const p of places) {
    const cc = p.country.code;
    const region = addNode(p.region, cc, null);
    const municipalityEntry = p.ancestors.find((a) => a.level === "municipality");
    const municipality = municipalityEntry
      ? addNode(municipalityEntry, cc, region.sourceKey)
      : undefined;
    const isSettlement = p.registry_entry.level === "settlement";
    const own = addNode(
      p.registry_entry,
      cc,
      (isSettlement ? (municipality ?? region) : region).sourceKey,
      isSettlement ? p.place_key.replaceAll("_", "-") : undefined,
    );
    // Settlement names come from the reviewed legacy place, which may differ from the register.
    // A legacy place that resolves to a larger unit (a locality label such as "Derbere,
    // Sandanski" on a municipality) is not another spelling of it: its labels stay with the
    // listings that carry them, never as aliases that would match the whole municipality.
    if (isSettlement) {
      own.place.nameLatin = p.names.latin;
      for (const name of [...p.aliases, p.names.native, p.names.latin]) {
        if (!own.aliases.some((a) => a.name === name)) {
          own.aliases.push({ kind: "legacy_spelling", name });
        }
      }
    }
    byPlaceKey.set(p.place_key, own.sourceKey);
  }
  const items = [...nodes.values()].sort(
    (a, b) =>
      levelRank(a.place.level) - levelRank(b.place.level) || a.sourceKey.localeCompare(b.sourceKey),
  );
  return { items, byRegistryId, byPlaceKey };
}

function levelRank(level: PlaceLevel): number {
  return ["country", "district", "municipality", "settlement", "neighborhood"].indexOf(level);
}

// Listings.

function mapPropertyType(t: LegacyListing["property_type"]): PropertyType {
  const known = (v: string | null): v is PropertyType =>
    v !== null && (propertyTypes as readonly string[]).includes(v);
  if (known(t.subtype)) return t.subtype;
  if (known(t.family)) return t.family;
  return "other";
}

function fact(
  subject: FactInput["subject"],
  fieldKey: string,
  state: FactState,
  value: unknown = null,
  extra: Partial<Pick<FactInput, "unit" | "basis" | "note">> = {},
): FactInput {
  return {
    subject,
    fieldKey,
    state,
    value: state === "known" ? value : null,
    unit: extra.unit ?? null,
    basis: extra.basis ?? null,
    note: extra.note ?? null,
  };
}

/**
 * A bedroom count is known only when the legacy listing recorded it and nothing in the legacy
 * property contradicts it. A 0 needs the property record to confirm it: elsewhere it was a
 * placeholder default. When the two records disagree the count is not asserted.
 */
function bedroomsFact(b: LegacyListing["bedrooms"], issues: Issue[]): FactInput {
  const propertyNotApplicable = b.property_verification_state === "not_applicable";
  if (b.recorded && b.count !== null) {
    if (propertyNotApplicable) {
      issues.push(
        warn(
          "bedrooms_conflict",
          `The listing record holds ${b.count} bedrooms; the legacy property marks bedrooms not applicable.`,
        ),
      );
      return fact("property", "bedrooms", "unknown", null, {
        note: `Legacy records disagree: listing ${b.count}, property not applicable.`,
      });
    }
    if (b.count === 0 && b.property_record_count !== 0) {
      return fact("property", "bedrooms", "unknown", null, {
        note: "A legacy 0 not confirmed by the property record; treated as a placeholder.",
      });
    }
    return fact("property", "bedrooms", "known", b.count);
  }
  if (b.not_applicable || propertyNotApplicable)
    return fact("property", "bedrooms", "not_applicable");
  return fact("property", "bedrooms", "unknown", null, {
    note: b.zero_value_placeholder
      ? "The legacy record's 0 was a placeholder default, not a count."
      : null,
  });
}

// Rental wording in Bulgarian and Russian; the "а" of аренда may be a Latin "a" in legacy text.
const rentalWording = /сдава|сда[её]тся|сдает|[аa]ренд|под наем|(^|[\s,.–-])наем/iu;

/** A sale record whose own headline or title advertises a rental. */
function advertisesRental(l: LegacyListing): boolean {
  const { h1, title } = l.source_description;
  return rentalWording.test(`${h1 ?? ""} ${title ?? ""}`);
}

/** The settlement came from a default mapping of a legacy area label, not from a review. */
function settlementUnreviewed(l: LegacyListing): boolean {
  return l.location.review_status === "legacy_area_only";
}

function listingFacts(l: LegacyListing, issues: Issue[], purpose: ListingPurpose): FactInput[] {
  const facts: FactInput[] = [];
  const price = l.price;
  if (price.on_request) {
    facts.push(fact("listing", "price", "withheld", null, { note: "price_on_request" }));
  } else if (price.amount !== null && price.currency && isCurrencyCode(price.currency)) {
    const amountMinor = Math.round(price.amount * 100);
    if (!Number.isSafeInteger(amountMinor) || amountMinor !== price.amount * 100) {
      issues.push(block("price_not_exact", `Price ${price.amount} is not exact in minor units`));
    }
    const rentAdvert = purpose === "sale" && advertisesRental(l);
    if (rentAdvert) {
      issues.push(
        warn(
          "purpose_contradicts_source",
          "Recorded as a sale, but the source headline advertises a rental; the amount is not a sale price.",
        ),
      );
      facts.push(
        fact("listing", "price", "unknown", null, {
          note: "Recorded as a sale, but the source headline advertises a rental.",
        }),
        fact(
          "listing",
          "price.amount_without_period",
          "known",
          { amountMinor, currency: price.currency },
          { note: "Purpose and period contradict the source; confirm before use." },
        ),
      );
    } else if (purpose === "sale") {
      // A sale price is a total by definition (pricePeriodsByPurpose); nothing is guessed.
      facts.push(
        fact("listing", "price", "known", {
          amountMinor,
          currency: price.currency,
          period: "total",
          basis: "asking",
        }),
      );
    } else {
      facts.push(
        fact("listing", "price", "unknown", null, {
          note: "The legacy system recorded a rent amount without its period.",
        }),
        fact(
          "listing",
          "price.amount_without_period",
          "known",
          { amountMinor, currency: price.currency },
          { note: "Rent period not recorded; confirm month or year before use." },
        ),
      );
    }
  } else if (price.amount === null) {
    facts.push(fact("listing", "price", "unknown"));
  } else {
    issues.push(block("price_currency_invalid", `Unsupported currency ${price.currency}`));
  }

  facts.push(
    l.rooms.recorded && l.rooms.count !== null
      ? fact("property", "rooms", "known", l.rooms.count)
      : fact("property", "rooms", "unknown", null, { note: l.rooms.note ?? null }),
  );
  facts.push(bedroomsFact(l.bedrooms, issues));

  const extraction = l.areas.extraction;
  const decision = extraction.human_decision;
  if (decision?.action === "assign" && decision.values?.length) {
    const seen = new Set<string>();
    for (const v of decision.values) {
      if (seen.has(v.basis)) issues.push(block("area_basis_duplicate", `Two ${v.basis} areas`));
      seen.add(v.basis);
      facts.push(
        fact(
          "property",
          `area.${v.basis}`,
          "known",
          { value: v.value_sqm, unit: "m2", basis: v.basis },
          {
            unit: "m2",
            basis: v.basis,
            note: `Legacy human decision (production/data/legacy-area-overrides.json): ${decision.reason ?? "no reason recorded"}`,
          },
        ),
      );
    }
  } else {
    const proposal = extraction.proposal?.value_sqm;
    facts.push(
      fact("property", "area", "unknown", null, {
        note:
          proposal != null
            ? `Legacy extraction proposed ${proposal} m2 (status ${extraction.status}, decision ${decision?.action ?? "none"}); not a recorded value.`
            : `No area recorded (extraction status ${extraction.status}).`,
      }),
    );
    if (proposal != null && decision?.action !== "skip") {
      issues.push(warn("area_awaits_decision", `Area proposal ${proposal} m2 awaits a decision`));
    }
  }

  const loc = l.location;
  const areaOnly = settlementUnreviewed(l);
  facts.push(
    fact(
      "property",
      "location",
      "known",
      {
        country: loc.country.code,
        region: loc.region.name,
        municipality: loc.municipality?.name ?? null,
        // A default-mapped legacy area label names no reviewed settlement.
        settlement: areaOnly ? null : loc.settlement.name,
        neighborhood: loc.neighborhood.recorded ? loc.neighborhood.name : null,
        placeKey: loc.place_key,
        reviewStatus: loc.review_status,
      },
      areaOnly
        ? {
            note: `Legacy label "${loc.legacy_label}" was mapped by default, not reviewed; known to municipality level only.`,
          }
        : {},
    ),
  );
  for (const [field, value] of Object.entries(l.features.known)) {
    facts.push(fact("property", `feature.${field}`, "known", value));
  }
  for (const u of l.features.unknown) {
    facts.push(fact("property", `feature.${u.field}`, "unknown"));
  }
  return facts;
}

function text(t: LegacyTranslation) {
  return {
    title: t.title,
    description: t.description,
    seoTitle: t.seo_title,
    metaDescription: t.meta_description,
  };
}

const isAiTranslator = (t: LegacyTranslation) => t.translator?.startsWith("codex") ?? false;

function legacyTranslationRecord(t: LegacyTranslation) {
  return {
    translator: t.translator,
    contentOrigin: t.content_origin,
    recordedState: t.translation_state,
    humanApproved: t.human_approved,
    publicIndexable: t.public_indexable,
    sourceHash: t.source_hash,
    translatedHash: t.translated_hash,
  };
}

export function buildListingItem(
  l: LegacyListing,
  ctx: {
    placeKeyFor: (legacyPlaceKey: string) => string | undefined;
    /** The place one level up (a settlement's municipality). */
    parentPlaceKeyFor: (legacyPlaceKey: string) => string | undefined;
    placeLevelFor: (itemKey: string) => PlaceLevel | undefined;
    notCovered: readonly string[];
  },
): ListingItem {
  const issues: Issue[] = [];
  const reference = l.reference.id;
  // An unreviewed default-mapped area label is only known to its municipality.
  const areaOnly = settlementUnreviewed(l);
  const placeKeyValue =
    (areaOnly
      ? ctx.parentPlaceKeyFor(l.location.place_key)
      : ctx.placeKeyFor(l.location.place_key)) ?? null;
  if (!placeKeyValue) {
    issues.push(block("place_unresolved", `Place ${l.location.place_key} is not in geography`));
  }
  if (areaOnly) {
    issues.push(
      warn(
        "location_settlement_unreviewed",
        `Legacy label "${l.location.legacy_label}" was mapped to ${l.location.settlement.name} by default; the settlement awaits review, so the listing is placed in the municipality.`,
      ),
    );
  }

  let purpose: ListingPurpose = "sale";
  if (l.purpose === "rent") {
    purpose = "long_term_rent";
    issues.push(
      warn("rent_term_unrecorded", "Legacy 'rent' carried no term; imported as long-term rent."),
    );
  } else if (l.purpose !== "sale") {
    issues.push(block("purpose_unmapped", `Legacy purpose ${l.purpose}`));
  }
  const propertyType = mapPropertyType(l.property_type);
  if (l.property_type.taxonomy_review_status !== "mapped") {
    issues.push(
      warn(
        "taxonomy_review_required",
        `Legacy type ${l.property_type.legacy} imported as ${propertyType}; taxonomy review open.`,
      ),
    );
  }
  if (l.legacy_ids.merged_into) {
    issues.push(
      warn(
        "merged_duplicate",
        `Archived duplicate merged into ${l.legacy_ids.merged_into}; attached to its property.`,
      ),
    );
  }

  const active = l.lifecycle_at_freeze.state === "active";
  const commercialState: CommercialState = active ? "availability_unconfirmed" : "withdrawn";
  const commercialReason = active
    ? `Active at launch freeze ${l.lifecycle_at_freeze.freeze_approval_id}; availability not reconfirmed since.`
    : `Archived at launch freeze ${l.lifecycle_at_freeze.freeze_approval_id}: ${l.lifecycle_at_freeze.reason} (${l.lifecycle_at_freeze.source_review_status}).`;

  const facts = listingFacts(l, issues, purpose);

  const bg = l.translations.find((t) => t.locale === "bg");
  const source = l.translations.find((t) => t.is_source_locale);
  if (!bg) issues.push(block("bg_text_missing", "No Bulgarian text in any form."));
  if (!source) issues.push(block("source_text_missing", "No legacy source-locale text."));
  const bgIsSource = bg?.is_source_locale === true;
  if (bg && !bgIsSource) {
    issues.push(
      warn(
        "bg_source_text_unreviewed",
        `Legacy source is ${source?.locale}; the Bulgarian text is an unreviewed draft.`,
      ),
    );
  }

  const photoEntries = l.media.filter((m) => m.r2_key !== null);
  const mediaKeys = [...new Set(photoEntries.map((m) => m.r2_key as string))];

  const snapshot: Record<string, unknown> = {
    reference,
    purpose,
    propertyType,
    legacyPropertyType: l.property_type,
    location: {
      country: l.location.country.code,
      region: l.location.region.name,
      municipality: l.location.municipality?.name ?? null,
      settlement: l.location.settlement.name,
      neighborhood: l.location.neighborhood.recorded ? l.location.neighborhood.name : null,
      legacyLabel: l.location.legacy_label,
      legacyReviewStatus: l.location.review_status,
      legacyPublicPrecision: l.location.public_precision,
    },
    facts: Object.fromEntries(
      facts.map((f) => [
        f.fieldKey,
        { state: f.state, value: f.value, unit: f.unit, basis: f.basis, note: f.note },
      ]),
    ),
    commercial: { state: commercialState, reason: commercialReason },
    text: bg
      ? {
          locale: "bg",
          origin: bgIsSource ? "legacy_source" : "legacy_translation_draft",
          humanReviewed: bgIsSource,
          draftedByAi: isAiTranslator(bg),
          ...text(bg),
          sourceUrl: l.source_description.source_url,
        }
      : null,
    legacySource:
      source && !bgIsSource
        ? { locale: source.locale, h1: l.source_description.h1, ...text(source) }
        : null,
    media: mediaKeys.map((key, position) => ({
      r2Key: key,
      position,
      kind: mediaKindMap[photoEntries.find((m) => m.r2_key === key)?.type ?? ""] ?? null,
    })),
    legacy: {
      ids: l.legacy_ids,
      lifecycleAtFreeze: l.lifecycle_at_freeze,
      urls: l.legacy_urls.map((u) => ({ domain: u.domain, path: u.slug.path, ...u.decision })),
      provenance: l.provenance,
    },
  };

  const pa = l.publication_approval;
  const approval: ApprovalInput | null =
    pa?.covers_this_listing === true
      ? {
          kind: "legacy_owner_publication_approval",
          decidedById: `legacy:${pa.approved_by}`,
          decidedAt: pa.approved_at,
          decisionNote: pa.boundary,
          scope: {
            evidenceReference: pa.approval_id,
            evidenceArtifact: "production/data/listing-publication-approval.json",
            legacyScope: pa.scope,
            decision: pa.decision,
            coveredSurface: pa.covered_surface,
            coveredTextLocale: source?.locale ?? null,
            doesNotCover: ctx.notCovered,
          },
        }
      : null;

  const translations: TranslationInput[] = [];
  for (const t of l.translations) {
    if (t.locale === "bg" || !isPublicLocale(t.locale)) continue;
    translations.push({
      locale: t.locale,
      title: t.title,
      body: { ...text(t), legacy: legacyTranslationRecord(t) },
      draftedByAi: isAiTranslator(t),
    });
  }

  return {
    type: "listing",
    sourceKey: `listing:${reference}`,
    issues,
    reference,
    lotNumber: l.reference.kind === "lot_reference" ? l.reference.lot_number : null,
    mergedInto: l.legacy_ids.merged_into,
    placeKey: placeKeyValue,
    property: {
      propertyType,
      country: l.location.country.code,
      region: l.location.region.name,
      settlement: l.location.settlement.name,
      neighborhood: l.location.neighborhood.recorded ? l.location.neighborhood.name : null,
      publicPrecision:
        placeKeyValue && ctx.placeLevelFor(placeKeyValue) === "municipality"
          ? "region"
          : "settlement",
    },
    listing: {
      purpose,
      commercialState,
      editorialState: l.open_work.enrichment_task?.state === "pending" ? "needs_facts" : "draft",
      availabilityCheckedAt: active ? l.lifecycle_at_freeze.freeze_at : null,
    },
    // A duplicate's property facts stay in its version snapshot as evidence only.
    facts: l.legacy_ids.merged_into ? facts.filter((f) => f.subject === "listing") : facts,
    observedAt: crawlInstant(l.provenance.crawl_captured_at),
    sourceUrl: l.provenance.source_url,
    version: { snapshot, contentHash: sha256Json(snapshot) },
    approval,
    translations,
    mediaKeys,
    summary: `Imported from the legacy site. ${commercialReason}`,
  };
}

// Media.

const mediaKindMap: Record<string, MediaKind> = { photo: "photo", floorplan: "floor_plan" };

export function buildMediaItems(
  sources: LegacySources,
  listings: ReadonlyMap<string, LegacyListing>,
): MediaItem[] {
  const entryByKey = new Map<string, LegacyListing["media"][number]>();
  for (const l of listings.values()) {
    for (const m of l.media) if (m.r2_key && !entryByKey.has(m.r2_key)) entryByKey.set(m.r2_key, m);
  }
  return sources.media.objects.map((o) => {
    const issues: Issue[] = [];
    const entry = entryByKey.get(o.r2_key);
    const kind = entry ? mediaKindMap[entry.type] : undefined;
    if (!isAllowedMediaContentType(o.content_type)) {
      issues.push(block("content_type_not_allowed", `${o.content_type} is not allowed`));
    }
    const unknownRefs = o.listing_references.filter((r) => !listings.has(r));
    if (unknownRefs.length) {
      issues.push(block("listing_unknown", `Unknown listings ${unknownRefs.join(", ")}`));
    }
    let owner: string | null = null;
    if (o.listing_references.length === 0) {
      issues.push(
        block(
          "no_listing",
          "Referenced only by non-listing legacy pages; a media asset needs a property.",
        ),
      );
    } else {
      // An archived duplicate shares its photos with the listing it was merged into.
      const owners = [
        ...new Set(o.listing_references.map((r) => listings.get(r)?.legacy_ids.merged_into ?? r)),
      ].sort();
      if (owners.length === 1) owner = owners[0] as string;
      else {
        issues.push(
          review(
            "shared_between_properties",
            `Shown on ${owners.length} distinct listings (${owners.slice(0, 5).join(", ")}${owners.length > 5 ? ", …" : ""}); a reviewer must choose the owning property.`,
          ),
        );
      }
    }
    if (!kind && o.listing_references.length > 0) {
      issues.push(block("kind_unknown", "No listing entry gives this object a media kind."));
    }
    const shownIn = o.listing_references.flatMap((reference) => {
      const keys = [
        ...new Set((listings.get(reference)?.media ?? []).flatMap((m) => m.r2_key ?? [])),
      ];
      const position = keys.indexOf(o.r2_key);
      return position >= 0 ? [{ reference, position }] : [];
    });
    return {
      type: "media",
      sourceKey: `media:${o.r2_key}`,
      issues,
      ownerListingRef: owner,
      shownIn,
      asset: {
        r2Key: o.r2_key,
        kind: kind ?? "photo",
        contentType: o.content_type,
        caption: entry?.caption ?? null,
        // The legacy width/height are the thumbnail request size (timthumb w=45&h=45), not a
        // measurement of the object; nothing measured them.
        width: null,
        height: null,
        legacyReference: o.original_url,
      },
    };
  });
}

// Legacy URL decisions.

const decisionStatus: Record<string, number> = {
  retain_200: 200,
  redirect_301: 301,
  approved_410: 410,
};

/**
 * One item per request key (domain + decoded path). The extraction keeps a few spellings of
 * the same key (with and without the trailing slash of a bare host, upper- and lower-case
 * percent-encoding); they fold into one decision with every spelling kept as evidence, and
 * only spellings that disagree block.
 */
export function buildUrlDecisionItems(
  sources: LegacySources,
  listings: ReadonlyMap<string, LegacyListing>,
): UrlDecisionItem[] {
  const groups = new Map<string, LegacyUrlDecision[]>();
  for (const d of sources.urls.decisions) {
    const key = `url:${d.domain}${d.source_path}${d.source_query ? `?${d.source_query}` : ""}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  return [...groups].map(([key, [d, ...variants]]) => {
    if (!d) throw new Error(`Empty URL group ${key}`);
    const issues: Issue[] = [];
    const outcome = (v: LegacyUrlDecision) =>
      canonicalJson([v.decision, v.status, v.target.path, v.listing_reference]);
    if (variants.some((v) => outcome(v) !== outcome(d))) {
      issues.push(block("conflicting_spellings", "Spellings of one URL carry different decisions"));
    }
    if (d.domain !== "makler-realty.com" && d.domain !== "makler-realty.ru") {
      issues.push(block("domain_unknown", `Domain ${d.domain}`));
    }
    if (decisionStatus[d.decision] !== d.status) {
      issues.push(block("status_mismatch", `${d.decision} with status ${d.status}`));
    }
    if (d.source_query) issues.push(block("query_unsupported", "Query strings are not recorded."));
    if (d.listing_reference && !listings.has(d.listing_reference)) {
      issues.push(block("listing_unknown", `Unknown listing ${d.listing_reference}`));
    }
    if (d.domain === "makler-realty.ru") {
      issues.push(
        warn("domain_expired", "makler-realty.ru registration has expired; not servable yet."),
      );
    }
    if (variants.length) {
      issues.push(
        warn("spellings_folded", `${variants.length + 1} legacy spellings share this decision.`),
      );
    }
    return {
      type: "url_decision",
      sourceKey: key,
      issues,
      listingRef: d.listing_reference,
      decision: {
        domain: d.domain as UrlDecisionItem["decision"]["domain"],
        sourcePath: d.source_path,
        decision: d.decision as UrlDecisionItem["decision"]["decision"],
        statusCode: d.status,
        targetPath: d.target.path,
        reason: d.reason,
        evidence: {
          ...d.evidence,
          urlType: d.url_type,
          target: d.target,
          equivalentContent: d.equivalent_content,
          legacySpellings: [d, ...variants].map((v) => ({
            sourceUrl: v.source_url,
            sourcePathEncoded: v.source_path_encoded,
            crawlRecordId: v.evidence.crawl_record_id ?? null,
          })),
        },
      },
    };
  });
}

// Content pages.

const contentArtifacts = {
  area: "production/data/approved-area-guides.json",
  guide: "production/data/approved-cms-content.json",
} as const;

export function buildContentItem(
  record: LegacyContentRecord,
  kind: "area" | "guide",
  placeKeyFor: (legacyPlaceKey: string) => string | undefined,
  placeLevelFor: (itemKey: string) => PlaceLevel | undefined,
): ContentItem {
  const issues: Issue[] = [];
  const slug = slugify(
    kind === "area" ? (record.area_key ?? record.id) : (record.guide_key ?? record.id),
  );
  const areaKey = record.area_key ?? (record.location as string | undefined);
  // A guide about a municipality (its id or source document says so) is bound to the
  // municipality, not to the town of the same name.
  const municipalScope = /municipality/.test(
    `${record.id} ${String(record.derived_from_document_id ?? "")}`,
  );
  const legacyKey = areaKey ? slugify(areaKey).replaceAll("-", "_") : null;
  const placeKeyValue = legacyKey
    ? ((municipalScope ? placeKeyFor(`${legacyKey}_municipality`) : placeKeyFor(legacyKey)) ?? null)
    : null;
  if (kind === "area" && !placeKeyValue) {
    issues.push(block("place_unresolved", `Area ${record.area_key} is not in geography`));
  }
  if (municipalScope && placeKeyValue && placeLevelFor(placeKeyValue) !== "municipality") {
    issues.push(
      review("scope_level_mismatch", "A municipality guide resolves to a non-municipality place."),
    );
  }
  if (municipalScope && legacyKey && !placeKeyValue) {
    issues.push(review("scope_place_missing", `No municipality place for ${areaKey}.`));
  }
  const sourceLocale = record.source_locale;
  if (!isPublicLocale(sourceLocale)) {
    issues.push(block("locale_unsupported", `Locale ${sourceLocale}`));
  }
  if (sourceLocale !== "bg") {
    issues.push(warn("source_not_bg", `Approved in ${sourceLocale}; no Bulgarian source exists.`));
  }
  const {
    status: _status,
    human_approved: _humanApproved,
    reviewer: _reviewer,
    approved_at: _approvedAt,
    review_due_at: _reviewDueAt,
    ...body
  } = record;
  const approval: ApprovalInput | null =
    record.human_approved && record.reviewer && record.approved_at
      ? {
          kind: "legacy_content_approval",
          decidedById: `legacy:${record.reviewer}`,
          decidedAt: record.approved_at,
          decisionNote: `Approved in the legacy system (status ${record.status}); recorded as evidence, not as new-system publication approval.`,
          scope: {
            evidenceArtifact: contentArtifacts[kind],
            evidenceReference: record.id,
            legacySourceHash: record.source_hash,
            locale: record.locale,
          },
        }
      : null;
  return {
    type: "content_page",
    sourceKey: `content:${kind}:${slug}`,
    issues,
    kind,
    slug,
    placeKey: placeKeyValue,
    version: {
      sourceLocale: (isPublicLocale(sourceLocale) ? sourceLocale : "bg") as PublicLocale,
      body,
      contentHash: sha256Json(body),
      reviewedAt: record.approved_at,
    },
    approval,
  };
}

export function buildImportItems(sources: LegacySources): ImportItem[] {
  const geo = buildPlaceItems(sources.geography.places);
  const legacyPlaces = new Map(sources.geography.places.map((p) => [p.place_key, p]));
  const placeKeyFor = (k: string) => {
    const p = legacyPlaces.get(k);
    return p ? geo.byRegistryId.get(p.geography_id) : undefined;
  };
  const parentPlaceKeyFor = (k: string) => {
    const parentId = legacyPlaces.get(k)?.registry_entry.parent_id;
    return parentId ? geo.byRegistryId.get(parentId) : undefined;
  };
  const levelByKey = new Map(geo.items.map((i) => [i.sourceKey, i.place.level]));
  const placeLevelFor = (k: string) => levelByKey.get(k);
  const listingsByRef = new Map(sources.listings.listings.map((l) => [l.reference.id, l]));
  const notCovered = sources.listings.approvals.listing_publication.does_not_cover;

  const listingItems = sources.listings.listings.map((l) =>
    buildListingItem(l, { placeKeyFor, parentPlaceKeyFor, placeLevelFor, notCovered }),
  );
  const byReference = new Map(listingItems.map((i) => [i.reference, i]));
  for (const duplicate of listingItems) {
    const survivor = duplicate.mergedInto ? byReference.get(duplicate.mergedInto) : undefined;
    if (!duplicate.mergedInto) continue;
    if (!survivor) {
      duplicate.issues.push(
        block("merge_target_unknown", `Merged into unknown listing ${duplicate.mergedInto}`),
      );
      continue;
    }
    const facts = (i: ListingItem) => i.version.snapshot.facts as Record<string, unknown>;
    const differing = Object.keys(facts(duplicate)).filter(
      (key) => canonicalJson(facts(duplicate)[key]) !== canonicalJson(facts(survivor)[key]),
    );
    if (differing.length) {
      duplicate.issues.push(
        warn(
          "merged_duplicate_facts_differ",
          `Differs from ${survivor.reference} in ${differing.join(", ")}; the survivor's property facts stand.`,
        ),
      );
    }
  }

  return [
    ...geo.items,
    // Survivors first: a merged duplicate is attached to its survivor's property.
    ...listingItems.filter((i) => !i.mergedInto),
    ...listingItems.filter((i) => i.mergedInto),
    ...buildMediaItems(sources, listingsByRef),
    ...buildUrlDecisionItems(sources, listingsByRef),
    ...sources.content.area_guides.guides.map((g) =>
      buildContentItem(g, "area", placeKeyFor, placeLevelFor),
    ),
    ...sources.content.guide_documents.documents.map((g) =>
      buildContentItem(g, "guide", placeKeyFor, placeLevelFor),
    ),
  ];
}
