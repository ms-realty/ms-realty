// Publication releases with per-destination outcomes, translations per locale per source
// version, and versioned content pages (spec §07.4, §18.2, F24, AD3, AD9).
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { staffAccounts } from "./accounts";
import { approvals } from "./approvals";
import { createdAt, id, instant, mutable, reference } from "./columns";
import {
  contentPageKindEnum,
  destinationOutcomeEnum,
  distributionStateEnum,
  editorialStateEnum,
  publicationDestinationEnum,
  publicLocaleEnum,
  releaseKindEnum,
  translationStateEnum,
} from "./enums";
import { geographyPlaces } from "./geography";

export const contentPages = pgTable(
  "content_pages",
  {
    ...mutable(),
    kind: contentPageKindEnum("kind").notNull(),
    slug: text("slug").notNull(),
    placeId: uuid("place_id").references(() => geographyPlaces.id),
    editorialState: editorialStateEnum("editorial_state").notNull().default("draft"),
    distributionState: distributionStateEnum("distribution_state")
      .notNull()
      .default("never_published"),
    currentVersionNumber: integer("current_version_number").notNull().default(0),
    publishedVersionNumber: integer("published_version_number"),
  },
  (t) => [uniqueIndex("content_pages_slug_idx").on(t.kind, t.slug)],
);

/** Immutable; a trigger rejects updates. Guides record jurisdiction, reviewer and review date. */
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
    createdByStaffId: uuid("created_by_staff_id").references(() => staffAccounts.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("content_page_versions_number_idx").on(t.contentPageId, t.versionNumber)],
);

/** One row per subject, locale and source version: a new source version starts a new row. */
export const translations = pgTable(
  "translations",
  {
    ...mutable(),
    /** listing or content_page. */
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    locale: publicLocaleEnum("locale").notNull(),
    sourceVersion: integer("source_version").notNull(),
    state: translationStateEnum("state").notNull().default("missing"),
    title: text("title"),
    body: jsonb("body"),
    draftedByAi: boolean("drafted_by_ai").notNull().default(false),
    unresolvedTerminology: jsonb("unresolved_terminology"),
    reviewedByStaffId: uuid("reviewed_by_staff_id").references(() => staffAccounts.id),
    reviewedAt: instant("reviewed_at"),
    approvalId: uuid("approval_id").references(() => approvals.id),
    rejectionReason: text("rejection_reason"),
  },
  (t) => [
    uniqueIndex("translations_subject_locale_version_idx").on(
      t.subjectType,
      t.subjectId,
      t.locale,
      t.sourceVersion,
    ),
    check("translations_not_source_locale", sql`${t.locale} <> 'bg'`),
    check(
      "translations_approved_by_human",
      sql`${t.state} <> 'approved' or (${t.reviewedByStaffId} is not null and ${t.approvalId} is not null)`,
    ),
  ],
);

export const publicationReleases = pgTable(
  "publication_releases",
  {
    ...mutable(),
    reference: reference(),
    kind: releaseKindEnum("kind").notNull(),
    /** listing or content_page, and the exact immutable version released. */
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    subjectVersionNumber: integer("subject_version_number").notNull(),
    locales: publicLocaleEnum("locales").array().notNull(),
    /** Derived from destination outcomes; never set by a button click alone. */
    state: distributionStateEnum("state").notNull().default("scheduled"),
    urgent: boolean("urgent").notNull().default(false),
    scheduledAt: instant("scheduled_at"),
    confirmedByStaffId: uuid("confirmed_by_staff_id")
      .notNull()
      .references(() => staffAccounts.id),
    approvalId: uuid("approval_id")
      .notNull()
      .references(() => approvals.id),
    /** The pinned translation versions included, per locale. */
    translationIds: jsonb("translation_ids").notNull().default({}),
  },
  (t) => [index("publication_releases_subject_idx").on(t.subjectType, t.subjectId)],
);

export const publicationDestinationOutcomes = pgTable(
  "publication_destination_outcomes",
  {
    ...mutable(),
    releaseId: uuid("release_id")
      .notNull()
      .references(() => publicationReleases.id),
    destination: publicationDestinationEnum("destination").notNull(),
    locale: publicLocaleEnum("locale").notNull(),
    state: destinationOutcomeEnum("state").notNull().default("pending"),
    attempt: integer("attempt").notNull().default(0),
    requestedAt: instant("requested_at"),
    acknowledgedAt: instant("acknowledged_at"),
    /** Read-back check proving the destination serves the released version. */
    verifiedAt: instant("verified_at"),
    failedAt: instant("failed_at"),
    errorCode: text("error_code"),
  },
  (t) => [uniqueIndex("publication_outcomes_idx").on(t.releaseId, t.destination, t.locale)],
);
