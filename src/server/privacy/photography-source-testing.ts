// Synthetic property logistics only; no photo license, customer ownership or booking proof.
import { randomUUID } from "node:crypto";
import { appointmentParticipants, appointments, appointmentVersions, listings } from "@/db/schema";
import type { Executor } from "../db";
import { createProperty } from "../testing";

export async function syntheticPhotographySource(
  db: Executor,
  actorId: string,
  partyId?: string,
  propertyId?: string,
) {
  const property = propertyId ?? (await createProperty(db));
  const [listing] = await db
    .insert(listings)
    .values({ reference: `MS-SOURCE-${randomUUID()}`, propertyId: property, purpose: "sale" })
    .returning();
  if (!listing) throw new Error("Missing synthetic photo listing");
  const [appointment] = await db
    .insert(appointments)
    .values({
      reference: `APP-SOURCE-${randomUUID()}`,
      purpose: "photography",
      format: "in_person",
      hostId: actorId,
      propertyId: property,
      listingId: listing.id,
      timezone: "Europe/Sofia",
      icsUid: `${randomUUID()}@example.test`,
      photographyScope: "SYNTHETIC_PRIVATE_PHOTOGRAPHY_SCOPE",
    })
    .returning();
  if (!appointment) throw new Error("Missing synthetic photography request");
  const snapshot = {
    state: "requested",
    purpose: "photography",
    photographyScope: appointment.photographyScope,
    hostId: actorId,
  };
  const [version] = await db
    .insert(appointmentVersions)
    .values({
      appointmentId: appointment.id,
      versionNumber: 1,
      snapshot,
      actorKind: "staff",
      actorId,
    })
    .returning();
  if (partyId)
    await db
      .insert(appointmentParticipants)
      .values({ appointmentId: appointment.id, partyId, role: "synthetic_custodian" });
  return { appointment, version, snapshot, property, listing };
}
