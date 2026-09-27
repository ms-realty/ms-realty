// Publication manifests, current publication pointers, destination deliveries, editorial
// content pages and public shares (architecture §7.2–§7.4, §8.3, §10).
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, instant, mutable } from "./columns";
import {
  contentPageKindEnum,
  deliveryKindEnum,
  deliveryStateEnum,
  editorialStateEnum,
  pointerStateEnum,
  publicationDestinationEnum,
  publicationStateEnum,
  publicLocaleEnum,
} from "./enums";
import { geographyPlaces } from "./geography";
import { principals } from "./identity";
import { listingRevisions, listings, localizedRevisions, propertyFactRevisions } from "./inventory";
import { externalActions } from "./records";

/**
 * Immutable (trigger) binding of everything one public presentation shows: revisions, media
 * relations/derivatives/rights, disclosure, availability basis, policy revision, decisions
 * and digests, for one locale and destination under one publication generation.
 */
export const publicationManifests = pgTable(
  "publication_manifests",
  {
    id: id(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    locale: publicLocaleEnum("locale").notNull(),
    destination: publicationDestinationEnum("destination").notNull(),
    /** The listing's publication generation when the manifest was prepared. */
    generation: integer("generation").notNull(),
    listingRevisionId: uuid("listing_revision_id")
      .notNull()
      .references(() => listingRevisions.id),
    factRevisionId: uuid("fact_revision_id")
      .notNull()
      .references(() => propertyFactRevisions.id),
    /** Null only for the source locale, which needs no localized revision. */
    localizedRevisionId: uuid("localized_revision_id").references(() => localizedRevisions.id),
    /** [{ relationId, assetId, position, derivativeKey, rightsReference }]. */
    media: jsonb("media").notNull(),
    disclosure: jsonb("disclosure").notNull(),
    availabilityBasis: jsonb("availability_basis").notNull(),
    policyRevision: text("policy_revision").notNull(),
    /** Approval ids by kind: factual, editorial, language, legal/process, publication. */
    decisions: jsonb("decisions").notNull(),
    contentDigest: text("content_digest").notNull(),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => principals.id),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "publication_manifests_locale_copy",
      sql`(${t.locale} = 'bg') = (${t.localizedRevisionId} is null)`,
    ),
    index("publication_manifests_listing_idx").on(t.listingId, t.locale, t.destination),
  ],
);

/**
 * The one authoritative publication pointer per listing, locale and destination. Switching it
 * happens in one transaction with the generation check, search projection and audit (§7.3).
 */
export const currentPublications = pgTable(
  "current_publications",
  {
    ...mutable(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    locale: publicLocaleEnum("locale").notNull(),
    destination: publicationDestinationEnum("destination").notNull(),
    manifestId: uuid("manifest_id")
      .notNull()
      .references(() => publicationManifests.id),
    state: pointerStateEnum("state").notNull(),
    /** The generation the manifest was activated under. */
    generation: integer("generation").notNull(),
    activatedAt: instant("activated_at").notNull(),
    activatedById: uuid("activated_by_id")
      .notNull()
      .references(() => principals.id),
    restrictedAt: instant("restricted_at"),
    withdrawnAt: instant("withdrawn_at"),
    reason: text("reason"),
  },
  (t) => [
    uniqueIndex("current_publications_pointer_idx").on(t.listingId, t.locale, t.destination),
    check("current_publications_reason", sql`${t.state} = 'active' or ${t.reason} is not null`),
  ],
);

/** Outcome of one publish or withdraw at one destination; the website is one of them. */
export const destinationDeliveries = pgTable(
  "destination_deliveries",
  {
    ...mutable(),
    manifestId: uuid("manifest_id")
      .notNull()
      .references(() => publicationManifests.id),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    locale: publicLocaleEnum("locale").notNull(),
    destination: publicationDestinationEnum("destination").notNull(),
    kind: deliveryKindEnum("kind").notNull(),
    /** Generation the work was created under; obsolete generations are cancelled. */
    generation: integer("generation").notNull(),
    state: deliveryStateEnum("state").notNull().default("queued"),
    externalActionId: uuid("external_action_id").references(() => externalActions.id),
    acknowledgedAt: instant("acknowledged_at"),
    /** Read-back or recorded human verification that the destination shows the manifest. */
    verifiedAt: instant("verified_at"),
    failedAt: instant("failed_at"),
    errorCode: text("error_code"),
    /** Manual destinations: the recorded evidence of the manual action. */
    evidence: jsonb("evidence"),
  },
  (t) => [
    check(
      "destination_deliveries_verified_evidence",
      sql`${t.state} not in ('verified', 'withdrawn') or ${t.verifiedAt} is not null`,
    ),
    index("destination_deliveries_listing_idx").on(t.listingId, t.state),
  ],
);

/** Approved area, guide, service and help content with the same approval rules. */
export const contentPages = pgTable(
  "content_pages",
  {
    ...mutable(),
    kind: contentPageKindEnum("kind").notNull(),
    slug: text("slug").notNull(),
    placeId: uuid("place_id").references(() => geographyPlaces.id),
    editorialState: editorialStateEnum("editorial_state").notNull().default("draft"),
    publicationState: publicationStateEnum("publication_state")
      .notNull()
      .default("never_published"),
    currentVersionNumber: integer("current_version_number").notNull().default(0),
    publishedVersionNumber: integer("published_version_number"),
  },
  (t) => [uniqueIndex("content_pages_slug_idx").on(t.kind, t.slug)],
);

/** Immutable (trigger). Guides record jurisdiction, review scope and review date. */
export const contentPageVersions = pgTable(
  "content_page_versions",
  {
    id: id(),
    contentPageId: uuid("content_page_id")
      .notNull()
      .references(() => contentPages.id),
    versionNumber: integer("version_number").notNull(),
    contentHash: text("content_hash").notNull(),
    sourceLocale: publicLocaleEnum("source_locale").notNull().default("bg"),
    body: jsonb("body").notNull(),
    jurisdiction: text("jurisdiction"),
    reviewScope: text("review_scope"),
    reviewedAt: instant("reviewed_at"),
    createdById: uuid("created_by_id").references(() => principals.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("content_page_versions_number_idx").on(t.contentPageId, t.versionNumber)],
);

/**
 * Public shortlist shares: an unguessable revocable token over public listing references
 * only. No participant, note, budget, contact data or case link is stored here (§8.3, AT09).
 */
export const publicShares = pgTable("public_shares", {
  id: id(),
  tokenHash: text("token_hash").notNull().unique(),
  listingReferences: text("listing_references").array().notNull(),
  createdAt: createdAt(),
  expiresAt: instant("expires_at"),
  revokedAt: instant("revoked_at"),
});
