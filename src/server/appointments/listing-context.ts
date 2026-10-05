import "server-only";
import { and, eq } from "drizzle-orm";
import { interests, listings } from "@/db/schema";
import type { PublicLocale } from "@/i18n/config";
import { getEnv } from "../config/env";
import type { Executor } from "../db";
import { loadCards } from "../publication/presentation";

/** Call only after appointmentFor has verified live Case access and appointment participation. */
export async function readAppointmentListing(
  db: Executor,
  caseId: string,
  interestId: string | null,
  locale: PublicLocale,
) {
  if (!interestId) return null;
  const [subject] = await db
    .select({ listingId: listings.id, reference: listings.reference })
    .from(interests)
    .innerJoin(listings, eq(listings.id, interests.listingId))
    .where(and(eq(interests.id, interestId), eq(interests.caseId, caseId)));
  if (!subject) return null;
  const [approved] = await loadCards(db, [subject.listingId], locale, new Date());
  const card = approved?.availability.primaryAction !== "view_similar" ? (approved ?? null) : null;
  return {
    reference: subject.reference,
    card,
    href: card
      ? `${getEnv().hosts.public}/${locale}/properties/${card.reference}/${card.slug}`
      : null,
  };
}
