import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { approvals, contentPages, contentPageVersions } from "@/db/schema";
import { type ApprovalKind, approvalCapability } from "@/domain/approval";
import type { PublicLocale } from "@/i18n/config";
import { hashRequest } from "@/server/crypto";
import type { Executor } from "@/server/db";
import { loadPlaceChains, placeName } from "@/server/publication/presentation";

// A deliberately narrow plaintext projection. Rich text, embedded scripts and remote media
// have no renderer here. Operator-authored CMS content must use an explicit supported shape.
export const contentBody = z
  .object({
    title: z.string().trim().min(1).max(200),
    paragraphs: z.array(z.string().trim().min(1).max(5000)).min(1).max(30),
  })
  .strict();
type Version = typeof contentPageVersions.$inferSelect;
type Approval = typeof approvals.$inferSelect;
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
    if (
      !decisions.some((decision) => {
        const scope = decision.scope as { locale?: string; destination?: string } | null;
        return (
          decision.kind === kind &&
          decision.state === "approved" &&
          decision.subjectType === "content_page_version" &&
          decision.subjectId === version.id &&
          decision.subjectVersion === version.versionNumber &&
          decision.subjectHash === version.contentHash &&
          decision.decidedByKind === "staff" &&
          decision.decidedWithCapability === approvalCapability[kind] &&
          decision.decidedById &&
          decision.decidedAt &&
          decision.decidedAt <= now &&
          !decision.invalidatedAt &&
          (!decision.expiresAt || decision.expiresAt > now) &&
          scope?.locale === locale &&
          scope.destination === "public_web"
        );
      })
    )
      return null;
  }
  return {
    ...body.data,
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

export async function readApprovedContent(
  db: Executor,
  kind: typeof contentPages.$inferSelect.kind,
  slug: string,
  locale: PublicLocale,
  options: { lock?: boolean } = {},
) {
  if (!/^[a-z\d][a-z\d-]{0,100}$/.test(slug)) return null;
  const query = db
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
  const [row] = await (options.lock ? query.for("share") : query);
  if (!row) return null;
  const decisionQuery = db
    .select()
    .from(approvals)
    .where(
      and(
        eq(approvals.subjectType, "content_page_version"),
        eq(approvals.subjectId, row.version.id),
      ),
    );
  const decisions = await (options.lock ? decisionQuery.for("share") : decisionQuery);
  const content = approvedContent(row.version, decisions, locale);
  return content ? { ...content, placeId: row.page.placeId } : null;
}

/** P15: exact approved editions only. A guide without a place binding remains unbound. */
export async function readApprovedAreas(db: Executor, locale: PublicLocale) {
  // The CMS currently stores source editions only. Never turn BG text into a translation.
  if (locale !== "bg") return [];
  const rows = await db
    .select({ page: contentPages, version: contentPageVersions })
    .from(contentPages)
    .innerJoin(
      contentPageVersions,
      and(
        eq(contentPageVersions.contentPageId, contentPages.id),
        eq(contentPageVersions.versionNumber, contentPages.publishedVersionNumber),
      ),
    )
    .where(and(eq(contentPages.kind, "area"), eq(contentPages.publicationState, "active")))
    .orderBy(asc(contentPages.slug));
  if (!rows.length) return [];
  const decisions = await db
    .select()
    .from(approvals)
    .where(
      and(
        eq(approvals.subjectType, "content_page_version"),
        inArray(
          approvals.subjectId,
          rows.map(({ version }) => version.id),
        ),
      ),
    );
  const approved = rows.flatMap(({ page, version }) => {
    if (!/^[a-z\d][a-z\d-]{0,100}$/.test(page.slug)) return [];
    const content = approvedContent(version, decisions, locale);
    return content ? [{ ...content, slug: page.slug, placeId: page.placeId }] : [];
  });
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
