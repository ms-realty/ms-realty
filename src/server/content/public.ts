import "server-only";
import { and, asc, eq } from "drizzle-orm";
import {
  approvals,
  contentLocaleEditions,
  contentLocaleVersions,
  contentPages,
  contentPageVersions,
} from "@/db/schema";
import { type ApprovalKind, approvalCapability } from "@/domain/approval";
import { contentBody, contentParagraphs } from "@/domain/content-body";

export { contentBody } from "@/domain/content-body";

import type { PublicLocale } from "@/i18n/config";
import { hashRequest } from "@/server/crypto";
import { type Executor, inTransaction } from "@/server/db";
import { loadPlaceChains, placeName } from "@/server/publication/presentation";
import { reviewDisplayEligible } from "../agency-obligations/reviews";

type Version = typeof contentPageVersions.$inferSelect;
type Approval = typeof approvals.$inferSelect;
type LocaleVersion = typeof contentLocaleVersions.$inferSelect;

/** A language decision cannot stand in for a qualified claim or publication decision. */
export function contentDecisionValid(
  decision: Approval,
  kind: ApprovalKind,
  subject: { id: string; versionNumber: number; contentHash: string },
  locale: PublicLocale,
  now = new Date(),
  source?: { id: string; contentHash: string },
) {
  const scope = decision.scope as {
    locale?: string;
    destination?: string;
    sourceVersionId?: string;
    sourceVersionHash?: string;
  } | null;
  return Boolean(
    decision.kind === kind &&
      decision.state === "approved" &&
      decision.subjectType === (source ? "content_locale_version" : "content_page_version") &&
      decision.subjectId === subject.id &&
      decision.subjectVersion === subject.versionNumber &&
      decision.subjectHash === subject.contentHash &&
      decision.decidedByKind === "staff" &&
      decision.decidedWithCapability === approvalCapability[kind] &&
      decision.decidedById &&
      decision.decidedAt &&
      decision.decidedAt <= now &&
      !decision.invalidatedAt &&
      (!decision.expiresAt || decision.expiresAt > now) &&
      scope?.locale === locale &&
      scope.destination === "public_web" &&
      (!source ||
        (scope.sourceVersionId === source.id && scope.sourceVersionHash === source.contentHash)),
  );
}
export function approvedContent(
  version: Version,
  decisions: readonly Approval[],
  locale: PublicLocale,
  now = new Date(),
) {
  if (
    version.sourceLocale !== locale ||
    version.sourceLocale !== "bg" ||
    !version.reviewedAt ||
    version.reviewedAt > now ||
    !version.reviewScope ||
    !version.jurisdiction
  )
    return null;
  const body = contentBody.safeParse(version.body);
  if (!body.success || version.contentHash !== hashRequest(version.body)) return null;
  // Service/help prose may contain process or legal claims. Until claim classification has
  // an authoritative contract, require the qualified human scope as well as publication.
  const required: ApprovalKind[] = ["editorial", "publication", "legal_process_claim"];
  for (const kind of required) {
    if (!decisions.some((decision) => contentDecisionValid(decision, kind, version, locale, now)))
      return null;
  }
  return {
    ...body.data,
    paragraphs: contentParagraphs(body.data),
    placeId: body.data.placeId ?? null,
    version: {
      id: version.id,
      number: version.versionNumber,
      contentHash: version.contentHash,
      contentPageId: version.contentPageId,
    },
    locale,
    jurisdiction: version.jurisdiction,
    reviewScope: version.reviewScope,
    reviewedAt: version.reviewedAt.toISOString(),
  };
}

export function approvedLocaleContent(
  source: NonNullable<ReturnType<typeof approvedContent>>,
  edition: LocaleVersion,
  decisions: readonly Approval[],
  locale: PublicLocale,
  now = new Date(),
) {
  if (
    locale === "bg" ||
    edition.sourceVersionId !== source.version.id ||
    edition.sourceVersionHash !== source.version.contentHash ||
    edition.contentHash !== hashRequest(edition.body) ||
    edition.jurisdiction !== source.jurisdiction ||
    edition.reviewScope !== source.reviewScope
  )
    return null;
  const body = contentBody.safeParse(edition.body);
  if (!body.success || (body.data.placeId ?? null) !== source.placeId) return null;
  const binding = { id: source.version.id, contentHash: source.version.contentHash };
  for (const kind of ["legal_process_claim", "language", "editorial", "publication"] as const) {
    if (
      !decisions.some((decision) =>
        contentDecisionValid(decision, kind, edition, locale, now, binding),
      )
    )
      return null;
  }
  const claims = decisions.find((decision) =>
    contentDecisionValid(decision, "legal_process_claim", edition, locale, now, binding),
  );
  if (!claims?.decidedAt) return null;
  return {
    ...body.data,
    paragraphs: contentParagraphs(body.data),
    placeId: body.data.placeId ?? null,
    version: {
      id: edition.id,
      number: edition.versionNumber,
      contentHash: edition.contentHash,
      contentPageId: source.version.contentPageId,
    },
    locale,
    jurisdiction: edition.jurisdiction,
    reviewScope: edition.reviewScope,
    reviewedAt: claims.decidedAt.toISOString(),
  };
}

export async function readApprovedContent(
  db: Executor,
  kind: typeof contentPages.$inferSelect.kind,
  slug: string,
  locale: PublicLocale,
  _options: { lock?: boolean } = {},
) {
  if (!/^[a-z\d][a-z\d-]{0,100}$/.test(slug)) return null;
  // Share locks live through the caller's consent transaction (nested savepoints retain
  // them). Public reads use the same path, so a BG change cannot race between eligibility
  // checks. All source/locale commands lock the BG page before its edition.
  return inTransaction(db, async (tx) => {
    const query = tx
      .select({ page: contentPages, version: contentPageVersions })
      .from(contentPages)
      .innerJoin(
        contentPageVersions,
        and(
          eq(contentPageVersions.contentPageId, contentPages.id),
          eq(contentPageVersions.versionNumber, contentPages.publishedVersionNumber),
        ),
      )
      .where(
        and(
          eq(contentPages.kind, kind),
          eq(contentPages.slug, slug),
          eq(contentPages.publicationState, "active"),
        ),
      );
    // Consent callers pass their transaction so publication/withdrawal cannot change the
    // observed version before their separately authorized consent write commits.
    const [row] = await query.for("share");
    if (!row) return null;
    if (kind === "review" && !(await reviewDisplayEligible(tx, row.version.id, locale)))
      return null;
    const decisionQuery = tx
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.subjectType, "content_page_version"),
          eq(approvals.subjectId, row.version.id),
        ),
      );
    const decisions = await decisionQuery.for("share");
    const source = approvedContent(row.version, decisions, "bg");
    if (!source || locale === "bg") return source;
    // A changed working source is explicitly pending re-review. Previous translations do
    // not remain consent/indexability evidence while that source is being replaced.
    if (row.page.currentVersionNumber !== row.page.publishedVersionNumber) return null;
    const [localized] = await tx
      .select({ edition: contentLocaleEditions, version: contentLocaleVersions })
      .from(contentLocaleEditions)
      .innerJoin(
        contentLocaleVersions,
        and(
          eq(contentLocaleVersions.editionId, contentLocaleEditions.id),
          eq(contentLocaleVersions.versionNumber, contentLocaleEditions.publishedVersionNumber),
        ),
      )
      .where(
        and(
          eq(contentLocaleEditions.contentPageId, row.page.id),
          eq(contentLocaleEditions.locale, locale),
          eq(contentLocaleEditions.publicationState, "active"),
        ),
      )
      .for("share");
    if (!localized) return null;
    const localizedDecisions = await tx
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.subjectType, "content_locale_version"),
          eq(approvals.subjectId, localized.version.id),
        ),
      )
      .for("share");
    return approvedLocaleContent(source, localized.version, localizedDecisions, locale);
  });
}

/** P15: exact approved editions only. A guide without a place binding remains unbound. */
export async function readApprovedAreas(db: Executor, locale: PublicLocale) {
  const rows = await db
    .select({ slug: contentPages.slug })
    .from(contentPages)
    .where(and(eq(contentPages.kind, "area"), eq(contentPages.publicationState, "active")))
    .orderBy(asc(contentPages.slug));
  if (!rows.length) return [];
  const approved = (
    await Promise.all(
      rows.map(async ({ slug }) => {
        const content = await readApprovedContent(db, "area", slug, locale);
        return content ? [{ ...content, slug }] : [];
      }),
    )
  ).flat();
  const chains = await loadPlaceChains(
    db,
    approved.flatMap((area) => (area.placeId ? [area.placeId] : [])),
  );
  return approved.map((area) => ({
    ...area,
    geography: (chains.get(area.placeId ?? "") ?? []).map((place) => ({
      ...placeName(place, locale),
      countryCode: place.countryCode,
    })),
  }));
}

export type ApprovedArea = Awaited<ReturnType<typeof readApprovedAreas>>[number];
