import "server-only";
import { and, eq } from "drizzle-orm";
import {
  appointmentParticipants,
  type appointments,
  caseParticipants,
  contactMethods,
  interests,
  listings,
  parties,
  properties,
} from "@/db/schema";
import type { Session } from "../auth/sessions";
import { can } from "../authz";
import { liveParticipation } from "../cases/shared";
import type { Executor } from "../db";

/** Call only after appointmentFor. Native actions expose current staff-authorized sources. */
export async function appointmentStaffContext(
  db: Executor,
  session: Session,
  row: typeof appointments.$inferSelect,
) {
  if (session.account.kind !== "staff") return null;
  const internal =
    row.caseId &&
    (await can(db, session.actor, "case.read_internal", {
      type: "case",
      id: row.caseId,
      audience: "internal",
    }));
  const contacts = internal
    ? await db
        .select({
          partyId: parties.id,
          name: parties.displayName,
          kind: contactMethods.kind,
          value: contactMethods.value,
          verification: contactMethods.verification,
        })
        .from(appointmentParticipants)
        .innerJoin(parties, eq(parties.id, appointmentParticipants.partyId))
        .innerJoin(
          caseParticipants,
          and(
            eq(caseParticipants.partyId, parties.id),
            eq(caseParticipants.caseId, row.caseId as string),
            liveParticipation(),
          ),
        )
        .innerJoin(contactMethods, eq(contactMethods.partyId, parties.id))
        .where(eq(appointmentParticipants.appointmentId, row.id))
    : [];
  const [source] =
    row.purpose === "viewing" && row.caseId && row.interestId
      ? await db
          .select({
            listingId: listings.id,
            propertyId: properties.id,
            reference: listings.reference,
            address: properties.exactAddress,
            settlement: properties.settlement,
            country: properties.country,
          })
          .from(interests)
          .innerJoin(listings, eq(listings.id, interests.listingId))
          .innerJoin(properties, eq(properties.id, listings.propertyId))
          .where(and(eq(interests.id, row.interestId), eq(interests.caseId, row.caseId)))
      : [];
  const location =
    source?.address?.trim() &&
    (await can(db, session.actor, "listing.read", {
      type: "listing",
      id: source.listingId,
      propertyId: source.propertyId,
    }))
      ? {
          address: [source.address, source.settlement, source.country].join(", "),
          reference: source.reference,
        }
      : null;
  return { contacts, location };
}
