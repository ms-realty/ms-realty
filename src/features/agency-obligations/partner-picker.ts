import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { caseParticipants, parties } from "@/db/schema";
import { counterpartyFor } from "@/server/agency-obligations/shared";
import type { Session } from "@/server/auth/sessions";
import { caseFor, liveParticipation } from "@/server/cases/shared";
import type { Executor } from "@/server/db";
import { isAppError } from "@/server/errors";
import { listContacts, readContact } from "@/server/work/queries";

/** A UUID and a picker link convey no authority. Never follow a merged identity. */
export async function readPartnerChoice(
  db: Executor,
  session: Session,
  id: string,
  caseId?: string,
) {
  const party = await counterpartyFor(db, session, id, caseId);
  return { id: party.id, name: party.displayName };
}
export async function partnerChoices(
  db: Executor,
  session: Session,
  page: number,
  caseId?: string,
) {
  const currentCase = caseId ? (await caseFor(db, session, caseId)).row : null;
  const contacts = await listContacts(db, session, page);
  const rows = [];
  for (const candidate of contacts.rows) {
    try {
      const choice = await readPartnerChoice(db, session, candidate.id, caseId);
      const contact = await readContact(db, session, candidate.id);
      rows.push({ ...choice, reference: contact.inquiries[0]?.reference ?? null });
    } catch (error) {
      if (!isAppError(error) || !["not_found", "forbidden"].includes(error.code)) throw error;
    }
  }
  const caseChoices = [];
  const seen = new Set<string>();
  if (currentCase) {
    const participants = await db
      .select({ id: parties.id })
      .from(caseParticipants)
      .innerJoin(parties, eq(parties.id, caseParticipants.partyId))
      .where(and(eq(caseParticipants.caseId, currentCase.id), liveParticipation()))
      .orderBy(asc(parties.displayName), asc(parties.id));
    for (const participant of participants) {
      if (seen.has(participant.id)) continue;
      seen.add(participant.id);
      try {
        caseChoices.push(await readPartnerChoice(db, session, participant.id, currentCase.id));
      } catch (error) {
        if (!isAppError(error) || !["not_found", "forbidden"].includes(error.code)) throw error;
      }
    }
  }
  // Keep the ordinary contact page's cursor, including a page whose contacts are all held.
  // Post-filtering must not make later currently permitted pages unreachable.
  return { rows, caseChoices, currentCase, page: contacts.page, hasMore: contacts.hasMore };
}
