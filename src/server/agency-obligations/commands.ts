import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { listings, operations } from "@/db/schema";
import { type AgencyCommand, agencyCommands } from "@/features/agency-obligations/contract";
import { propertyWorkFor } from "../appointments/property-work";
import { requestPhotography } from "../appointments/service";
import type { Session } from "../auth/sessions";
import type { Executor } from "../db";
import { AppError, isAppError } from "../errors";
import { liveStaff } from "../work/shared";
import { decidePartnerTerms, readPartnerTerms, savePartnerTerms } from "./partner-terms";
import { decideReviewConsent, readCaseReview, saveCaseReview, verifyCaseReview } from "./reviews";

export async function executeAgencyCommand(
  db: Executor,
  session: Session,
  command: AgencyCommand,
  raw: unknown,
) {
  switch (command) {
    case "partnerSave":
      return savePartnerTerms(db, session, raw);
    case "partnerDecision":
      return decidePartnerTerms(db, session, raw);
    case "reviewSave":
      return saveCaseReview(db, session, raw);
    case "reviewDocumentConsent":
      return decideReviewConsent(db, session, raw, true);
    case "reviewVerify":
      return verifyCaseReview(db, session, raw);
    case "clientConsent":
      return decideReviewConsent(db, session, raw);
    case "photography":
      return requestPhotography(db, session, raw);
  }
}

export async function readAgencyOperation(
  db: Executor,
  session: Session,
  command: AgencyCommand,
  id: string,
  key: string,
) {
  if (
    !Object.hasOwn(agencyCommands, command) ||
    !z.uuid().safeParse(id).success ||
    key.length < 16 ||
    key.length > 200
  )
    throw new AppError("not_found");
  const [row] = await db
    .select()
    .from(operations)
    .where(
      and(
        eq(operations.actorKind, session.actor.kind),
        eq(operations.actorId, session.actor.id),
        eq(operations.operationType, agencyCommands[command]),
        eq(operations.idempotencyKey, key),
        eq(operations.resultId, id),
      ),
    );
  if (command === "clientConsent") await readCaseReview(db, session, id);
  else {
    await liveStaff(db, session);
    try {
      if (command.startsWith("partner")) await readPartnerTerms(db, session, id);
      else if (command.startsWith("review")) await readCaseReview(db, session, id);
      else {
        const [listing] = await db.select().from(listings).where(eq(listings.id, id));
        if (!listing) throw new AppError("not_found");
        await propertyWorkFor(db, session, {
          listingId: listing.id,
          propertyId: listing.propertyId,
        });
      }
    } catch (error) {
      // A known failed creation has no record. Return only its actor-bound status, no input,
      // private outcome, source links or inferred authority. Existing records always reauthorize.
      if (!row || row.status === "succeeded" || !isAppError(error) || error.code !== "not_found")
        throw error;
      return { status: row.status, operationId: row.id, recordId: null, photoId: null };
    }
  }
  if (!row) return null;
  const outcome = z.object({ id: z.uuid() }).safeParse(row.outcome);
  return {
    status: row.status,
    operationId: row.id,
    recordId: id,
    photoId:
      command === "photography" && row.status === "succeeded" && outcome.success
        ? outcome.data.id
        : null,
  };
}
