import "server-only";
import { and, eq } from "drizzle-orm";
import { caseParticipants, cases, documentRequests, grants, principals } from "@/db/schema";
import type { Session } from "../auth/sessions";
import { can } from "../authz";
import { liveParticipation } from "../cases/shared";
import { activePolicy } from "../compliance/agreement-gate";
import type { Executor } from "../db";
import { AppError } from "../errors";

/** The request is an additional restriction, never a substitute for a document grant. */
export async function assertRequestedDocumentAccess(
  db: Executor,
  session: Session,
  documentId: string,
  action: "read" | "upload" | "review" | "metadata",
) {
  const [request] = await db
    .select()
    .from(documentRequests)
    .where(eq(documentRequests.documentId, documentId));
  if (!request) return null;
  const now = new Date();
  const [record] = await db.select().from(cases).where(eq(cases.id, request.caseId));
  if (!record) throw new AppError("not_found");
  if (session.actor.kind === "client") {
    const [principal] = await db
      .select()
      .from(principals)
      .where(eq(principals.id, session.account.id));
    if (!principal) throw new AppError("not_found");
    const [participant] = await db
      .select()
      .from(caseParticipants)
      .where(
        and(
          eq(caseParticipants.id, request.recipientParticipantId),
          eq(caseParticipants.caseId, request.caseId),
          eq(caseParticipants.partyId, principal.partyId),
          liveParticipation(now),
        ),
      );
    const [grant] = await db.select().from(grants).where(eq(grants.id, request.grantId));
    if (
      request.recipientId !== session.account.id ||
      !participant ||
      (participant.role === "specialist" && !participant.expiresAt) ||
      !grant ||
      grant.principalId !== session.account.id ||
      grant.capability !== "portal.document.upload" ||
      grant.recordType !== "document" ||
      grant.recordId !== documentId ||
      !(await can(db, session.actor, "portal.document.upload", {
        type: "case",
        id: request.caseId,
        audience: "case_participants",
      }))
    )
      throw new AppError("not_found");
    // A cancelled/expired request keeps its safe receipt, but no filename or file access.
    const receiptOnly = action === "metadata" && (request.cancelledAt || request.expiresAt <= now);
    if (
      !receiptOnly &&
      (request.cancelledAt ||
        request.expiresAt <= now ||
        grant.revokedAt ||
        (grant.expiresAt && grant.expiresAt <= now))
    )
      throw new AppError("not_found");
  }
  if (action === "upload" || action === "review") {
    if (request.cancelledAt || request.expiresAt <= now || record.disposition !== "active")
      throw new AppError("transition_denied");
    const policy = await activePolicy(db, request.policyId, now);
    if (policy.policyHash !== request.policyHash) throw new AppError("transition_denied");
  }
  return request;
}
