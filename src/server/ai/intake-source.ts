import "server-only";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { listings, properties, propertyFactRevisions } from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import { countActivePasskeys, staffPasskeyMinimum } from "../auth/passkeys";
import type { Session } from "../auth/sessions";
import { assertCan } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { liveStaff, parseInput } from "../work/shared";
import { type IntakeSource, minimizedBrokerNote } from "./intake-draft";
export async function intakeSourceFor(
  db: Executor,
  actor: Actor,
  sourceId: string,
  listingId: string,
  lock = false,
) {
  if (actor.kind !== "staff") throw new AppError("not_found");
  const query = db
    .select()
    .from(listings)
    .where(eq(listings.id, parseInput(z.uuid(), listingId)));
  const [listing] = await (lock ? query.for("share") : query);
  if (!listing) throw new AppError("not_found");
  const resource = { type: "listing", id: listing.id, propertyId: listing.propertyId };
  await assertCan(db, actor, "listing.read", resource);
  await assertCan(db, actor, "ai.draft", resource);
  if ((await countActivePasskeys(db, actor.id)) < staffPasskeyMinimum)
    throw new AppError("forbidden");
  if (lock)
    await db
      .select({ id: properties.id })
      .from(properties)
      .where(eq(properties.id, listing.propertyId))
      .for("share");
  const [pinned] = await db
    .select()
    .from(propertyFactRevisions)
    .where(eq(propertyFactRevisions.id, parseInput(z.uuid(), sourceId)));
  if (!pinned || pinned.propertyId !== listing.propertyId) throw new AppError("not_found");
  const [current] = await db
    .select()
    .from(propertyFactRevisions)
    .where(eq(propertyFactRevisions.propertyId, listing.propertyId))
    .orderBy(desc(propertyFactRevisions.revisionNumber))
    .limit(1);
  if (!current) throw new AppError("not_found");
  const note = current.note ?? "";
  if (!note.trim() || note.length > 4000)
    throw new AppError("validation_failed", {
      fieldErrors: { source: ["bounded_broker_note_required"] },
    });
  const source: IntakeSource = {
    id: current.id,
    version: current.revisionNumber,
    listingId,
    reference: listing.reference,
    noteDigest: hashRequest(note),
    factDigest: current.contentDigest,
    fields: { note: minimizedBrokerNote(note) },
  };
  return { source, digest: hashRequest(source) };
}
export async function readIntakeAssistanceSource(
  db: Executor,
  session: Session,
  reference: string,
) {
  const live = await liveStaff(db, session);
  const [listing] = await db
    .select()
    .from(listings)
    .where(eq(listings.reference, reference.trim().toUpperCase()));
  if (!listing) throw new AppError("not_found");
  const [revision] = await db
    .select({ id: propertyFactRevisions.id })
    .from(propertyFactRevisions)
    .where(eq(propertyFactRevisions.propertyId, listing.propertyId))
    .orderBy(desc(propertyFactRevisions.revisionNumber))
    .limit(1);
  if (!revision) throw new AppError("not_found");
  return (await intakeSourceFor(db, live.actor, revision.id, listing.id)).source;
}
