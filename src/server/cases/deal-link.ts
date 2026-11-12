// ADR 0015 · one Deal path for both sides of one agreement. A seller's or landlord's Deal does
// not get its own proposal: the agreed proposal lives on the buyer's or tenant's Deal. The
// owner-side Deal reads "terms agreed" and the shared later steps from that Deal, so the broker
// records each fact once, on either page. Only the brokerage contract step stays per Deal: each
// side is the agency's own client with its own contract.
import "server-only";
import { and, desc, eq, inArray, ne, or } from "drizzle-orm";
import { cases, listings, proposalRevisions, proposals, sellerInstructions } from "@/db/schema";
import type { Executor } from "../db";
import { termsDigest } from "../proposals/shared";

type CaseRow = typeof cases.$inferSelect;

const ownerPurpose = (kind: CaseRow["kind"]) =>
  kind === "seller" ? "sale" : kind === "landlord" ? "long_term_rent" : null;

/** The listings an owner-side Deal is about: its property's, and those its instruction names. */
async function ownerListingIds(db: Executor, row: CaseRow): Promise<string[]> {
  const purpose = ownerPurpose(row.kind);
  if (!purpose) return [];
  const instructed = (
    await db
      .select({ listingId: sellerInstructions.listingId })
      .from(sellerInstructions)
      .where(eq(sellerInstructions.caseId, row.id))
  ).flatMap((r) => (r.listingId ? [r.listingId] : []));
  const scope = [
    row.propertyId ? eq(listings.propertyId, row.propertyId) : undefined,
    instructed.length ? inArray(listings.id, instructed) : undefined,
  ].filter((c) => c !== undefined);
  if (!scope.length) return [];
  const rows = await db
    .select({ id: listings.id })
    .from(listings)
    .where(and(eq(listings.purpose, purpose), or(...scope)));
  return rows.map((r) => r.id);
}

/**
 * The buyer's or tenant's Deal whose current proposal on this owner-side Deal's home is agreed
 * with unchanged terms; the latest such agreement when there is more than one. Null otherwise.
 */
export async function counterpartDeal(db: Executor, row: CaseRow): Promise<CaseRow | null> {
  const ids = await ownerListingIds(db, row);
  if (!ids.length) return null;
  const agreed = await db
    .select({ revision: proposalRevisions, deal: cases })
    .from(proposals)
    .innerJoin(
      proposalRevisions,
      and(
        eq(proposalRevisions.proposalId, proposals.id),
        eq(proposalRevisions.revisionNumber, proposals.activeRevisionNumber),
      ),
    )
    .innerJoin(cases, eq(cases.id, proposals.caseId))
    .where(
      and(
        inArray(proposals.listingId, ids),
        eq(proposalRevisions.state, "agreed_for_next_step"),
        ne(cases.id, row.id),
      ),
    )
    .orderBy(desc(proposalRevisions.respondedAt), desc(proposalRevisions.updatedAt));
  return agreed.find((a) => a.revision.termsHash === termsDigest(a.revision))?.deal ?? null;
}

/** The owner-side Deals that read their path from this buyer's or tenant's Deal. */
export async function ownerDeals(
  db: Executor,
  deal: CaseRow,
  agreedListingId: string | null,
): Promise<CaseRow[]> {
  if (!agreedListingId) return [];
  const [listing] = await db.select().from(listings).where(eq(listings.id, agreedListingId));
  if (!listing) return [];
  const kind = listing.purpose === "sale" ? "seller" : "landlord";
  const instructed = (
    await db
      .select({ caseId: sellerInstructions.caseId })
      .from(sellerInstructions)
      .where(eq(sellerInstructions.listingId, listing.id))
  ).flatMap((r) => (r.caseId ? [r.caseId] : []));
  const candidates = await db
    .select()
    .from(cases)
    .where(
      and(
        eq(cases.kind, kind),
        or(
          eq(cases.propertyId, listing.propertyId),
          instructed.length ? inArray(cases.id, instructed) : undefined,
        ),
      ),
    );
  const out: CaseRow[] = [];
  for (const candidate of candidates)
    if ((await counterpartDeal(db, candidate))?.id === deal.id) out.push(candidate);
  return out;
}
