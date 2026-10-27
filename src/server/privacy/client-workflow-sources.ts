import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import {
  appointmentParticipantResponses,
  listings,
  personalSavedListings,
  savedSelectionTransfers,
} from "@/db/schema";
import type { Executor } from "../db";
import { AppError } from "../errors";

const bounded = <T>(rows: T[]) => {
  if (rows.length > 1000) throw new AppError("validation_failed");
  return rows;
};
/** Own client-authored records only; never nonce/hash material or other participants' answers. */
export async function ownClientWorkflowData(db: Executor, clientIds: readonly string[]) {
  if (!clientIds.length) return { personalSaves: [], savedTransfers: [], appointmentResponses: [] };
  const personalSaves = bounded(
    await db
      .select({
        id: personalSavedListings.id,
        reference: listings.reference,
        createdAt: personalSavedListings.createdAt,
      })
      .from(personalSavedListings)
      .innerJoin(listings, eq(listings.id, personalSavedListings.listingId))
      .where(inArray(personalSavedListings.principalId, [...clientIds]))
      .orderBy(asc(personalSavedListings.id))
      .limit(1001),
  );
  const savedTransfers = bounded(
    await db
      .select({
        id: savedSelectionTransfers.id,
        references: savedSelectionTransfers.listingReferences,
        createdAt: savedSelectionTransfers.createdAt,
        consumedAt: savedSelectionTransfers.consumedAt,
      })
      .from(savedSelectionTransfers)
      .where(inArray(savedSelectionTransfers.consumedById, [...clientIds]))
      .orderBy(asc(savedSelectionTransfers.id))
      .limit(1001),
  );
  const appointmentResponses = bounded(
    await db
      .select({
        id: appointmentParticipantResponses.id,
        decision: appointmentParticipantResponses.decision,
        startsAt: appointmentParticipantResponses.startsAt,
        endsAt: appointmentParticipantResponses.endsAt,
        timezone: appointmentParticipantResponses.timezone,
        text: appointmentParticipantResponses.note,
        createdAt: appointmentParticipantResponses.createdAt,
      })
      .from(appointmentParticipantResponses)
      .where(inArray(appointmentParticipantResponses.principalId, [...clientIds]))
      .orderBy(asc(appointmentParticipantResponses.id))
      .limit(1001),
  );
  return { personalSaves, savedTransfers, appointmentResponses };
}
