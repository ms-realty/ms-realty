// Languages in one decision (ADR 0012). A translation goes public only after a person approved
// that translation. This replaces the per-listing workbench on the main path with one decision
// per language: the system checks each draft against the source ("Checked for you"), the person
// reads the text and ticks the languages they can read, and the command records their language
// approval for the published version and publishes that language. The source language must be
// live first. The workbench stays reachable under the detailed review.
import "server-only";
import { and, desc, eq, gt, ne } from "drizzle-orm";
import { type PublicationPolicy, publicationPolicy, type StaffLocale } from "@/config/tenant";
import {
  approvals,
  currentPublications,
  geographyPlaceAliases,
  geographyPlaces,
  listingRevisions,
  listings,
  localizedRevisions,
  properties,
  propertyFacts,
} from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import { type PublicLocale, publicLocales, sourceLocale } from "@/domain/ids";
import {
  type TranslationChecks,
  translationChecks,
  withoutLegacySuffix,
} from "@/domain/translation-checks";
import { recordActivity } from "../activity";
import { recordAudit } from "../audit";
import { requireFreshAuth, requireLiveSession, type Session } from "../auth/sessions";
import { can } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError, isAppError } from "../errors";
import type { FileStorage } from "../files/storage";
import { runOperation } from "../operations";
import { listingSearchClause, publishOneLocale } from "./attested";
import { localizedRevisionDigest } from "./commands";
import { termsFacts } from "./presentation";
import { staffAttestationBasis } from "./seller-evidence";

type ListingRow = typeof listings.$inferSelect;
type RevisionRow = typeof listingRevisions.$inferSelect;
type LocalizedRow = typeof localizedRevisions.$inferSelect;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
const text = (value: unknown) => (typeof value === "string" ? value : "");

/** One language of one listing as the decision sees it. */
export interface LanguageDraft {
  readonly locale: PublicLocale;
  /** The text that would go public: the draft, its title without the old site's ending. */
  readonly title: string;
  readonly description: string;
  /** The draft's own title when it carried the old site's ending. */
  readonly legacyTitle: string | null;
  readonly checks: TranslationChecks;
  /** The old site recorded this translation as human-approved and published by the agency. */
  readonly legacyApproved: boolean;
  readonly live: boolean;
  /** This person may approve this language (translation review for the locale). */
  readonly mayApprove: boolean;
}

export interface LanguageView {
  readonly listing: ListingRow;
  readonly source: { readonly title: string; readonly description: string } | null;
  /** The source language is live: a translation can be published after it, never before. */
  readonly sourceLive: boolean;
  readonly languages: readonly LanguageDraft[];
}

async function livePointers(db: Executor, listing: ListingRow): Promise<Set<PublicLocale>> {
  const rows = await db
    .select({ locale: currentPublications.locale })
    .from(currentPublications)
    .where(
      and(
        eq(currentPublications.listingId, listing.id),
        eq(currentPublications.state, "active"),
        eq(currentPublications.generation, listing.publicationGeneration),
      ),
    );
  return new Set(rows.map((row) => row.locale));
}

/** The figures a translation may state: price (major units), area, bedrooms, lot number. */
async function figures(db: Executor, listing: ListingRow, revision: RevisionRow) {
  const out: number[] = [];
  const price = record(termsFacts(revision.terms).price?.value);
  if (typeof price.amountMinor === "number") out.push(Math.trunc(price.amountMinor / 100));
  const withoutPeriod = record(termsFacts(revision.terms)["price.amount_without_period"]?.value);
  if (typeof withoutPeriod.amountMinor === "number")
    out.push(Math.trunc(withoutPeriod.amountMinor / 100));
  const facts = await db
    .select()
    .from(propertyFacts)
    .where(eq(propertyFacts.factRevisionId, revision.factRevisionId));
  for (const fact of facts) {
    if (fact.state !== "known") continue;
    if (typeof fact.value === "number") out.push(fact.value);
    const measured = record(fact.value).value;
    if (typeof measured === "number") out.push(measured);
  }
  const lot = /(\d+)$/u.exec(listing.reference)?.[1];
  if (lot) out.push(Number(lot));
  return out;
}

async function placeNames(db: Executor, listing: ListingRow) {
  const [property] = await db
    .select()
    .from(properties)
    .where(eq(properties.id, listing.propertyId));
  if (!property) return [];
  const names = [property.settlement];
  if (property.placeId) {
    const [place] = await db
      .select()
      .from(geographyPlaces)
      .where(eq(geographyPlaces.id, property.placeId));
    if (place) names.push(place.nameNative, place.nameLatin);
    const aliases = await db
      .select({ name: geographyPlaceAliases.name })
      .from(geographyPlaceAliases)
      .where(eq(geographyPlaceAliases.placeId, property.placeId));
    names.push(...aliases.map((alias) => alias.name));
  }
  return [...new Set(names.filter((name) => name?.trim()))];
}

/**
 * The draft for a locale: the copy bound to the approved version, or else the newest draft the
 * listing has for that locale (the import binds its drafts to the first version).
 */
async function draftFor(
  db: Executor,
  listing: ListingRow,
  revision: RevisionRow,
  locale: PublicLocale,
): Promise<LocalizedRow | null> {
  const [current] = await db
    .select()
    .from(localizedRevisions)
    .where(
      and(
        eq(localizedRevisions.sourceRevisionId, revision.id),
        eq(localizedRevisions.locale, locale),
      ),
    );
  if (current && current.state !== "rejected") return current;
  const [older] = await db
    .select()
    .from(localizedRevisions)
    .where(
      and(
        eq(localizedRevisions.listingId, listing.id),
        eq(localizedRevisions.locale, locale),
        ne(localizedRevisions.state, "rejected"),
      ),
    )
    .orderBy(desc(localizedRevisions.updatedAt))
    .limit(1);
  return older ?? null;
}

/**
 * The capability this person approves a language with: translation review for that language, or,
 * where the tenant policy lets whoever publishes also approve a ticked language, the right to
 * publish this listing. Null when neither holds.
 */
async function languageCapability(
  db: Executor,
  actor: Actor,
  resource: { type: string; id: string; propertyId: string },
  locale: PublicLocale,
  policy: PublicationPolicy,
): Promise<"translation.review" | "publication.release" | null> {
  if (await can(db, actor, "translation.review", { ...resource, locale }))
    return "translation.review";
  if (policy.publisherApprovesLanguages && (await can(db, actor, "publication.release", resource)))
    return "publication.release";
  return null;
}

/** Read-only: every draft language of the listing with its checks, for one decision. */
export async function languageView(
  db: Executor,
  actor: Actor,
  reference: string,
  policy: PublicationPolicy = publicationPolicy,
): Promise<LanguageView> {
  if (actor.kind !== "staff") throw new AppError("forbidden");
  const [listing] = await db
    .select()
    .from(listings)
    .where(eq(listings.reference, reference.trim().toUpperCase()));
  if (!listing) throw new AppError("not_found");
  const resource = { type: "listing", id: listing.id, propertyId: listing.propertyId };
  if (!(await can(db, actor, "listing.read", resource))) throw new AppError("not_found");
  const live = await livePointers(db, listing);
  const [revision] = listing.approvedRevisionId
    ? await db
        .select()
        .from(listingRevisions)
        .where(eq(listingRevisions.id, listing.approvedRevisionId))
    : [];
  const sourceRevision =
    revision ??
    (
      await db
        .select()
        .from(listingRevisions)
        .where(eq(listingRevisions.listingId, listing.id))
        .orderBy(desc(listingRevisions.revisionNumber))
        .limit(1)
    )[0];
  if (!sourceRevision) return { listing, source: null, sourceLive: false, languages: [] };
  const copy = record(record(sourceRevision.sourceCopy).text);
  const source = { title: text(copy.title), description: text(copy.description) };
  const stated = await figures(db, listing, sourceRevision);
  const places = await placeNames(db, listing);
  const languages: LanguageDraft[] = [];
  for (const locale of publicLocales) {
    if (locale === sourceLocale) continue;
    const draft = await draftFor(db, listing, sourceRevision, locale);
    if (!draft) continue;
    const body = record(draft.body);
    const draftTitle = text(draft.title);
    const cleaned = withoutLegacySuffix(draftTitle, locale);
    const title = cleaned ?? draftTitle;
    const description = text(body.description);
    const legacy = record(body.legacy);
    languages.push({
      locale,
      title,
      description,
      legacyTitle: cleaned ? draftTitle : null,
      checks: translationChecks({
        locale,
        title,
        description,
        source,
        figures: stated,
        placeNames: places,
      }),
      legacyApproved: legacy.humanApproved === true && legacy.recordedState === "published",
      live: live.has(locale),
      mayApprove: (await languageCapability(db, actor, resource, locale, policy)) !== null,
    });
  }
  return { listing, source, sourceLive: live.has(sourceLocale), languages };
}

export type LanguageResult =
  | { readonly locale: PublicLocale; readonly status: "published" | "live" }
  | {
      readonly locale: PublicLocale;
      readonly status: "blocked";
      /** source_not_published · checks_failed · no_permission · no_draft · other */
      readonly reason: string;
      readonly checks?: TranslationChecks;
    };

export interface LanguageApprovalInput {
  readonly reference: string;
  /** One per decision; each language uses `${operationId}:${locale}`. */
  readonly operationId: string;
  readonly locales: readonly PublicLocale[];
  /** The staff language the attestation was shown in; its exact text is recorded per language. */
  readonly locale: StaffLocale;
  /** The attestation text for a language, as the person saw it. */
  readonly attestation: (locale: PublicLocale) => string;
}

/**
 * Records one person's approval of each ticked language for the listing's published version and
 * publishes it. Only languages whose checks pass, and only after the source language is live.
 */
export async function approveListingLanguages(
  db: Executor,
  session: Session,
  input: LanguageApprovalInput,
  dependencies: { storage?: FileStorage; policy?: PublicationPolicy } = {},
): Promise<LanguageResult[]> {
  const policy = dependencies.policy ?? publicationPolicy;
  if (session.actor.kind !== "staff") throw new AppError("forbidden");
  const live = await requireLiveSession(db, session);
  if (policy.signIn === "recent") requireFreshAuth(live);
  const actor = live.actor;
  const results: LanguageResult[] = [];
  for (const locale of [...new Set(input.locales)]) {
    if (locale === sourceLocale) continue;
    const view = await languageView(db, actor, input.reference, policy);
    const draft = view.languages.find((language) => language.locale === locale);
    if (!view.sourceLive) {
      results.push({ locale, status: "blocked", reason: "source_not_published" });
      continue;
    }
    if (!draft) {
      results.push({ locale, status: "blocked", reason: "no_draft" });
      continue;
    }
    if (!draft.mayApprove) {
      results.push({ locale, status: "blocked", reason: "no_permission" });
      continue;
    }
    if (draft.checks.blockers.length) {
      results.push({ locale, status: "blocked", reason: "checks_failed", checks: draft.checks });
      continue;
    }
    try {
      await recordLanguageApproval(db, actor, view.listing.id, draft, {
        operationId: `${input.operationId}:${locale}`,
        attestation: input.attestation(locale),
        staffLocale: input.locale,
        policy,
      });
      const outcome = await publishOneLocale(
        db,
        actor,
        view.listing.id,
        locale,
        policy,
        dependencies.storage ? { storage: dependencies.storage } : {},
      );
      results.push(
        outcome === "not_approved"
          ? { locale, status: "blocked", reason: "other" }
          : { locale, status: outcome },
      );
    } catch (error) {
      if (!isAppError(error) || error.code === "step_up_required") throw error;
      results.push({
        locale,
        status: "blocked",
        reason: error.code === "forbidden" ? "no_permission" : "other",
      });
    }
  }
  return results;
}

async function recordLanguageApproval(
  db: Executor,
  actor: Actor,
  listingId: string,
  draft: LanguageDraft,
  context: {
    operationId: string;
    attestation: string;
    staffLocale: StaffLocale;
    policy: PublicationPolicy;
  },
) {
  return runOperation(
    db,
    {
      actor,
      type: "translation.attest",
      idempotencyKey: context.operationId,
      requestHash: hashRequest({ listingId, locale: draft.locale, title: draft.title }),
    },
    async ({ tx, operationId }) => {
      const [listing] = await tx
        .select()
        .from(listings)
        .where(eq(listings.id, listingId))
        .for("update");
      if (!listing?.approvedRevisionId) throw new AppError("transition_denied");
      const capability = await languageCapability(
        tx,
        actor,
        { type: "listing", id: listing.id, propertyId: listing.propertyId },
        draft.locale,
        context.policy,
      );
      if (!capability) throw new AppError("forbidden");
      const [revision] = await tx
        .select()
        .from(listingRevisions)
        .where(eq(listingRevisions.id, listing.approvedRevisionId));
      if (!revision) throw new AppError("not_found");
      const source = await draftFor(tx, listing, revision, draft.locale);
      const body = {
        ...record(source?.body),
        description: draft.description,
        ...(draft.legacyTitle ? { legacyTitle: draft.legacyTitle } : {}),
      };
      const [existing] = await tx
        .select()
        .from(localizedRevisions)
        .where(
          and(
            eq(localizedRevisions.sourceRevisionId, revision.id),
            eq(localizedRevisions.locale, draft.locale),
          ),
        )
        .for("update");
      if (existing?.state === "approved_for_source") return { translationId: existing.id };
      // The approved copy is bound to the published version; the import's draft stays as it was.
      const [row] = existing
        ? await tx
            .update(localizedRevisions)
            .set({
              title: draft.title,
              body,
              state: "reviewing",
              version: existing.version + 1,
              rejectionReason: null,
            })
            .where(eq(localizedRevisions.id, existing.id))
            .returning()
        : await tx
            .insert(localizedRevisions)
            .values({
              listingId: listing.id,
              sourceRevisionId: revision.id,
              locale: draft.locale,
              state: "reviewing",
              title: draft.title,
              body,
              draftedByAi: source?.draftedByAi ?? false,
            })
            .returning();
      if (!row) throw new Error("Localized revision write failed");
      const now = new Date();
      const legacy = record(record(source?.body).legacy);
      const basis = {
        basis: staffAttestationBasis,
        attestation: context.attestation,
        staffLocale: context.staffLocale,
        checks: draft.checks,
        ...(draft.legacyApproved
          ? {
              legacyApproval: {
                humanApproved: legacy.humanApproved,
                recordedState: legacy.recordedState,
                contentOrigin: legacy.contentOrigin,
              },
            }
          : {}),
        ...(draft.legacyTitle ? { titleWithoutSiteEnding: true } : {}),
      };
      const [approval] = await tx
        .insert(approvals)
        .values({
          kind: "language",
          state: "approved",
          subjectType: "localized_revision",
          subjectId: row.id,
          subjectVersion: row.version + 1,
          subjectHash: localizedRevisionDigest(row),
          scope: { locale: draft.locale, sourceRevisionId: revision.id, ...basis },
          evidence: { checks: draft.checks },
          requestedByKind: "staff",
          requestedById: actor.id,
          decidedByKind: "staff",
          decidedById: actor.id,
          decidedWithCapability: capability,
          decidedAt: now,
          decisionNote: context.attestation,
        })
        .returning({ id: approvals.id });
      if (!approval) throw new Error("Language approval failed");
      await tx
        .update(localizedRevisions)
        .set({
          state: "approved_for_source",
          version: row.version + 1,
          approvalId: approval.id,
          reviewedById: actor.id,
          reviewedAt: now,
          reviewedFacts: { basis: staffAttestationBasis, checks: draft.checks },
        })
        .where(eq(localizedRevisions.id, row.id));
      const payload = { locale: draft.locale, approvalId: approval.id, ...basis };
      await recordAudit(tx, {
        action: "translation.approve",
        actor,
        capability,
        recordType: "localized_revision",
        recordId: row.id,
        operationId,
        payload,
        at: now,
      });
      await recordActivity(tx, {
        recordType: "localized_revision",
        recordId: row.id,
        reference: listing.reference,
        messageKey: "activity.translation.approve",
        params: { locale: draft.locale },
        summary: `${listing.reference}: ${draft.locale} approved on a staff attestation.`,
        actor,
        operationId,
        at: now,
      });
      return { translationId: row.id, approvalId: approval.id };
    },
  );
}

export type ReadyLanguageRow = LanguageDraft & { reference: string; sourceTitle: string };

/** Online listings read per request for the per-language lists (each costs one full view). */
export const languageExamineCap = 40;

export interface ReadyLanguagePage {
  readonly byLanguage: Map<PublicLocale, ReadyLanguageRow[]>;
  /** Pass back to read the next online listings; null when every online listing was read. */
  readonly nextCursor: string | null;
}

/**
 * For each language, the listings whose source is live and whose draft passes every check and
 * is not published yet: the per-language bulk decision. At most `languageExamineCap` online
 * listings are read per request, in reference order after the cursor, and the typed search
 * narrows them by reference or title.
 */
export async function readyLanguages(
  db: Executor,
  actor: Actor,
  options: {
    readonly cursor?: string | null;
    readonly query?: string;
    readonly policy?: PublicationPolicy;
  } = {},
): Promise<ReadyLanguagePage> {
  const byLanguage = new Map<PublicLocale, ReadyLanguageRow[]>();
  if (actor.kind !== "staff") return { byLanguage, nextCursor: null };
  const after =
    options.cursor && /^[A-Z]{2}-[0-9A-Z-]{1,40}$/.test(options.cursor) ? options.cursor : null;
  const liveSource = await db
    .select({ reference: listings.reference })
    .from(currentPublications)
    .innerJoin(listings, eq(listings.id, currentPublications.listingId))
    .where(
      and(
        eq(currentPublications.locale, sourceLocale),
        eq(currentPublications.state, "active"),
        eq(currentPublications.generation, listings.publicationGeneration),
        after ? gt(listings.reference, after) : undefined,
        listingSearchClause(options.query),
      ),
    )
    .orderBy(listings.reference)
    .limit(languageExamineCap + 1);
  const page = liveSource.slice(0, languageExamineCap);
  for (const { reference } of page) {
    const view = await languageView(db, actor, reference, options.policy).catch(() => null);
    for (const draft of view?.languages ?? []) {
      if (draft.live || !draft.mayApprove || draft.checks.blockers.length) continue;
      const rows = byLanguage.get(draft.locale) ?? [];
      rows.push({ ...draft, reference, sourceTitle: view?.source?.title ?? "" });
      byLanguage.set(draft.locale, rows);
    }
  }
  return {
    byLanguage,
    nextCursor: liveSource.length > languageExamineCap ? (page.at(-1)?.reference ?? null) : null,
  };
}
