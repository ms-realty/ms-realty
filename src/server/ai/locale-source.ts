import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  approvals,
  listingRevisions,
  listings,
  propertyFactRevisions,
  propertyFacts,
} from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import type { PublicLocale } from "@/domain/ids";
import { countActivePasskeys, staffPasskeyMinimum } from "../auth/passkeys";
import type { Session } from "../auth/sessions";
import { assertCan } from "../authz";
import { getEnv } from "../config/env";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { liveStaff, parseInput } from "../work/shared";
import { type LocaleSource, targetLocaleSchema } from "./locale-draft";

/** Resolve the current approved source through the pinned revision's listing; drift stays visible. */
export async function localeSourceFor(
  db: Executor,
  actor: Actor,
  sourceId: string,
  targetLocale: PublicLocale,
  lock = false,
) {
  const language = parseInput(targetLocaleSchema, targetLocale);
  const [pinned] = await db
    .select({ listingId: listingRevisions.listingId })
    .from(listingRevisions)
    .where(eq(listingRevisions.id, parseInput(z.uuid(), sourceId)));
  if (!pinned || actor.kind !== "staff") throw new AppError("not_found");
  const query = db.select().from(listings).where(eq(listings.id, pinned.listingId));
  const [listing] = await (lock ? query.for("share") : query);
  if (!listing) throw new AppError("not_found");
  const resource = {
    type: "listing",
    id: listing.id,
    propertyId: listing.propertyId,
    locale: targetLocale,
  };
  for (const capability of ["listing.read", "translation.draft", "ai.draft"] as const)
    await assertCan(db, actor, capability, resource);
  if ((await countActivePasskeys(db, actor.id)) < staffPasskeyMinimum)
    throw new AppError("forbidden");
  if (!listing.approvedRevisionId) throw new AppError("approval_stale");
  const [revision] = await db
    .select()
    .from(listingRevisions)
    .where(eq(listingRevisions.id, listing.approvedRevisionId));
  if (!revision) throw new AppError("not_found");
  const [facts] = await db
    .select()
    .from(propertyFactRevisions)
    .where(eq(propertyFactRevisions.id, revision.factRevisionId));
  if (!facts) throw new AppError("not_found");
  const approvalQuery = db
    .select()
    .from(approvals)
    .where(
      and(inArray(approvals.subjectId, [revision.id, facts.id]), eq(approvals.state, "approved")),
    );
  const decisions = await (lock ? approvalQuery.for("share") : approvalQuery),
    now = new Date();
  for (const subject of [
    {
      kind: "editorial",
      type: "listing_revision",
      id: revision.id,
      version: revision.revisionNumber,
      hash: revision.contentDigest,
    },
    {
      kind: "factual",
      type: "property_fact_revision",
      id: facts.id,
      version: facts.revisionNumber,
      hash: facts.contentDigest,
    },
  ]) {
    if (
      !decisions.some(
        (d) =>
          d.kind === subject.kind &&
          d.subjectType === subject.type &&
          d.subjectId === subject.id &&
          d.subjectVersion === subject.version &&
          d.subjectHash === subject.hash &&
          d.decidedByKind === "staff" &&
          d.decidedById &&
          d.decidedWithCapability === "listing.review_facts" &&
          d.decidedAt &&
          d.decidedAt <= now &&
          !d.invalidatedAt &&
          (!d.expiresAt || d.expiresAt > now),
      )
    )
      throw new AppError("approval_stale");
  }
  const copy = parseInput(
    z.object({
      locale: z.literal("bg"),
      text: z.object({
        title: z.string().min(1).max(180),
        description: z.string().min(1).max(12000),
      }),
    }),
    revision.sourceCopy,
  );
  const rows = await db
    .select({
      key: propertyFacts.fieldKey,
      state: propertyFacts.state,
      value: propertyFacts.value,
      unit: propertyFacts.unit,
      basis: propertyFacts.basis,
    })
    .from(propertyFacts)
    .where(eq(propertyFacts.factRevisionId, facts.id));
  // Do not include private addresses, document/source references, notes or personal data.
  const rawTerms = revision.terms as {
    purpose?: unknown;
    facts?: { price?: { state?: unknown; value?: unknown } };
  };
  const priceValue = z
    .object({
      amountMinor: z.number().int(),
      currency: z.enum(["EUR", "BGN"]),
      period: z.string(),
      basis: z.string(),
    })
    .safeParse(rawTerms.facts?.price?.value);
  const protectedFacts = {
    reference: listing.reference,
    terms: {
      purpose: rawTerms.purpose,
      price: {
        state: rawTerms.facts?.price?.state,
        value: priceValue.success ? priceValue.data : null,
      },
    },
    facts: rows.filter((row) => /^(bedrooms|rooms|area\.[a-z_]+|feature\.[a-z_]+)$/.test(row.key)),
    locationDisclosure: revision.disclosure,
  };
  const source: LocaleSource = {
    id: revision.id,
    version: revision.revisionNumber,
    listingId: listing.id,
    reference: listing.reference,
    targetLocale: language,
    sourceUrl: `${getEnv().canonicalOrigin}/bg/properties/${encodeURIComponent(listing.reference)}/${listing.reference.toLowerCase()}`,
    fields: copy.text,
    protectedFacts,
    protectedFactsDigest: hashRequest({
      sourceDigest: revision.contentDigest,
      factsDigest: facts.contentDigest,
      protectedFacts,
    }),
  };
  return { source, digest: hashRequest(source) };
}
export async function readLocaleAssistanceSource(
  db: Executor,
  session: Session,
  reference: string,
  locale: PublicLocale,
) {
  const live = await liveStaff(db, session);
  const [listing] = await db
    .select({ id: listings.approvedRevisionId })
    .from(listings)
    .where(eq(listings.reference, reference.trim().toUpperCase()));
  if (!listing?.id) throw new AppError("not_found");
  return (await localeSourceFor(db, live.actor, listing.id, locale)).source;
}
