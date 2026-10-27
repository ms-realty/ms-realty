import "server-only";
import { and, eq } from "drizzle-orm";
import { caseParticipants, contactMethods, parties } from "@/db/schema";
import type { Session } from "../auth/sessions";
import type { Executor } from "../db";
import { caseFor, liveParticipation } from "./shared";

/** Internal relationship scope is mandatory before exposing participant contact routes. */
export async function readStaffCaseContacts(db: Executor, session: Session, id: string) {
  await caseFor(db, session, id, "case.read_internal");
  return db
    .select({
      partyId: parties.id,
      name: parties.displayName,
      kind: contactMethods.kind,
      value: contactMethods.value,
      verification: contactMethods.verification,
    })
    .from(caseParticipants)
    .innerJoin(parties, eq(parties.id, caseParticipants.partyId))
    .innerJoin(contactMethods, eq(contactMethods.partyId, parties.id))
    .where(and(eq(caseParticipants.caseId, id), liveParticipation()));
}
