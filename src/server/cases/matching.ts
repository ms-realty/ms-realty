// O07: a staff Case read over the current public search projection. A Brief without reviewed
// structured criteria cannot silently become a broad inventory recommendation.
import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { briefRevisions, interests, listings } from "@/db/schema";
import type { Area, AreaBasis, Fact } from "@/domain/facts";
import { publicLocales } from "@/domain/ids";
import {
  evaluateListing,
  type ListingSearchView,
  type SearchCriteria,
} from "@/domain/search/filters";
import type { Session } from "../auth/sessions";
import type { Executor } from "../db";
import { AppError } from "../errors";
import {
  bedroomsFact,
  loadPublishedListings,
  type PublishedListing,
  presentationOf,
  priceFact,
  toCard,
} from "../publication/presentation";
import { caseMatchCriteriaInput, offeredStates, searchListings } from "../search/search";
import { parseInput } from "../work/shared";
import { caseFor } from "./shared";

const requestSchema = z
  .object({
    id: z.uuid(),
    locale: z.enum(publicLocales).default("bg"),
    pageSize: z.number().int().min(1).max(60).default(24),
    cursor: z.string().max(512).optional(),
    briefRevision: z.number().int().min(1).optional(),
  })
  .refine((input) => !input.cursor || input.briefRevision !== undefined, {
    path: ["briefRevision"],
    message: "required_for_cursor",
  });

const candidateSchema = z.object({
  id: z.uuid(),
  reference: z
    .string()
    .trim()
    .regex(/^MS-\d{5,}$/i),
  locale: z.enum(publicLocales).default("bg"),
  briefRevision: z.number().int().min(1),
});

const unknown: Fact<never> = { state: "unknown" };
const publicFact = <T>(listing: PublishedListing, key: string): Fact<T> =>
  (listing.facts.get(key)?.fact as Fact<T> | undefined) ?? unknown;

/** Assess one currently public listing against the same hard-filter semantics as public search. */
export function assessPublishedCandidate(
  listing: PublishedListing,
  criteria: SearchCriteria,
  now: Date,
) {
  const areas: Partial<Record<AreaBasis, Fact<Area>>> = {};
  for (const basis of ["living", "built", "total", "land"] as const) {
    const area = listing.facts.get(`area.${basis}`)?.fact;
    if (area) areas[basis] = area as Fact<Area>;
  }
  const features: Record<string, Fact<boolean>> = {};
  for (const key of criteria.mustHave ?? []) {
    const feature = listing.facts.get(`feature.${key}`)?.fact;
    if (feature) features[key] = feature as Fact<boolean>;
  }
  const view: ListingSearchView = {
    listingId: listing.listingId,
    reference: listing.reference,
    purpose: listing.purpose,
    propertyType: listing.propertyType,
    placeIds: listing.placeChain.map((place) => place.id),
    commercial: presentationOf(listing, now).availability,
    price: priceFact(listing),
    bedrooms: bedroomsFact(listing),
    rooms: publicFact<number>(listing, "rooms"),
    areas,
    features,
  };
  return evaluateListing(view, { ...criteria, availability: offeredStates });
}

/** Candidate status is bound to one Brief revision and one current search response. */
export async function readCaseMatches(
  db: Executor,
  session: Session,
  raw: z.input<typeof requestSchema>,
) {
  const input = parseInput(requestSchema, raw);
  const { row, live } = await caseFor(db, session, input.id, "case.read_internal");
  if (live.account.kind !== "staff" || !["buyer", "tenant"].includes(row.kind))
    throw new AppError("not_found");

  const [brief] = await db
    .select({
      id: briefRevisions.id,
      revision: briefRevisions.revisionNumber,
      criteria: briefRevisions.criteria,
      clientAcknowledgedAt: briefRevisions.clientAcknowledgedAt,
    })
    .from(briefRevisions)
    .where(eq(briefRevisions.caseId, row.id))
    .orderBy(desc(briefRevisions.revisionNumber))
    .limit(1);
  if (input.briefRevision && input.briefRevision !== brief?.revision)
    throw new AppError("version_conflict", {
      current: { briefRevision: brief?.revision ?? null },
    });
  const parsed = caseMatchCriteriaInput.safeParse(brief?.criteria);
  const purpose = row.kind === "buyer" ? "sale" : "long_term_rent";
  if (!brief || !parsed.success || parsed.data.purpose !== purpose)
    return {
      status: "criteria_required" as const,
      caseId: row.id,
      caseVersion: row.version,
      brief: brief
        ? {
            id: brief.id,
            revision: brief.revision,
            clientAcknowledgedAt: brief.clientAcknowledgedAt,
          }
        : null,
      reason:
        !brief || !parsed.success ? ("missing_or_invalid" as const) : ("kind_mismatch" as const),
    };

  const result = await searchListings(db, {
    ...parsed.data,
    locale: input.locale,
    includeUnconfirmed: true,
    pageSize: input.pageSize,
    cursor: input.cursor,
  });
  const existing = result.items.length
    ? await db
        .select({ id: interests.id, reference: listings.reference })
        .from(interests)
        .innerJoin(listings, eq(listings.id, interests.listingId))
        .where(
          and(
            eq(interests.caseId, row.id),
            inArray(
              listings.reference,
              result.items.map((item) => item.reference),
            ),
          ),
        )
    : [];
  const interestByReference = new Map(existing.map((item) => [item.reference, item.id]));
  const matches = result.items.map((item) => ({
    ...item,
    existingInterestId: interestByReference.get(item.reference) ?? null,
  }));
  return {
    status: "ready" as const,
    caseId: row.id,
    caseVersion: row.version,
    brief: {
      id: brief.id,
      revision: brief.revision,
      clientAcknowledgedAt: brief.clientAcknowledgedAt,
    },
    criteria: result.criteria,
    confirmed: matches.filter((item) => item.match === "match"),
    needsConfirmation: matches.filter((item) => item.match === "needs_confirmation"),
    count: result.count,
    nextCursor: result.nextCursor,
    queryId: result.queryId,
    sourceTimestamp: result.sourceTimestamp,
    stale: result.stale,
  };
}

/** Inspect a named public candidate before offering one that conflicts with the current Brief. */
export async function readCaseCandidate(
  db: Executor,
  session: Session,
  raw: z.input<typeof candidateSchema>,
) {
  const input = parseInput(candidateSchema, raw);
  const { row, live } = await caseFor(db, session, input.id, "case.read_internal");
  if (live.account.kind !== "staff" || !["buyer", "tenant"].includes(row.kind))
    throw new AppError("not_found");
  const [brief] = await db
    .select({ revision: briefRevisions.revisionNumber, criteria: briefRevisions.criteria })
    .from(briefRevisions)
    .where(eq(briefRevisions.caseId, row.id))
    .orderBy(desc(briefRevisions.revisionNumber))
    .limit(1);
  if (input.briefRevision !== brief?.revision)
    throw new AppError("version_conflict", {
      current: { briefRevision: brief?.revision ?? null },
    });
  const parsed = caseMatchCriteriaInput.safeParse(brief.criteria);
  const purpose = row.kind === "buyer" ? "sale" : "long_term_rent";
  if (!parsed.success || parsed.data.purpose !== purpose)
    throw new AppError("validation_failed", {
      fieldErrors: { briefRevision: ["criteria_required"] },
    });
  const [published] = await loadPublishedListings(
    db,
    { references: [input.reference.toUpperCase()] },
    input.locale,
  );
  if (!published) throw new AppError("listing_unavailable");
  const now = new Date();
  const assessment = assessPublishedCandidate(published, parsed.data, now);
  const [existing] = await db
    .select({ id: interests.id })
    .from(interests)
    .where(and(eq(interests.caseId, row.id), eq(interests.listingId, published.listingId)))
    .limit(1);
  return {
    caseId: row.id,
    caseVersion: row.version,
    briefRevision: brief.revision,
    candidate: toCard(published, now),
    match: assessment.result,
    violated: assessment.violated,
    unconfirmed: assessment.unconfirmed,
    existingInterestId: existing?.id ?? null,
    sourceTimestamp: now.toISOString(),
  };
}
