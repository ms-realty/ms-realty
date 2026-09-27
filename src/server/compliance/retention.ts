import "server-only";
import { and, eq, gt, or, type SQLWrapper, sql } from "drizzle-orm";
import {
  caseParticipants,
  caseProcessItems,
  caseProcessReviews,
  caseStageHistory,
  cases,
  documentRequests,
  documentVersions,
  principals,
  processPolicies,
  serviceAgreements,
  suspicionReports,
} from "@/db/schema";
import type { Executor } from "../db";

/** Boolean only: a privacy operator never learns which restricted record caused the hold.
 * Historical participation remains relevant after access is revoked. Revoking access must
 * not erase the retention duty attached to evidence already gathered for that party. */
export async function hasPrivacyRetentionHold(
  db: Executor,
  partyId: string,
  now = new Date(),
): Promise<boolean> {
  // A relationship's operating-policy clock cannot finish while the Case is open.
  // Reopening keeps the hold; a later closeout starts a new full policy interval. A
  // historical closed row without an auditable closeout remains held for human review.
  const closeout = sql`(select max(${caseStageHistory.occurredAt}) from ${caseStageHistory}
    where ${caseStageHistory.caseId} = ${cases.id}
      and ${caseStageHistory.evidence}->>'toDisposition' = 'closed')`;
  // Late-recorded or revised evidence cannot inherit an already expired interval.
  // Its own evidence time is a lower bound even for historical closed relationships.
  const lifetimeHold = (
    evidenceAt: SQLWrapper,
  ) => sql<boolean>`(${cases.disposition} <> 'closed' or ${closeout} is null
    or (((greatest(${closeout}, ${evidenceAt}) at time zone ${processPolicies.timezone})
      + make_interval(days => ${processPolicies.retentionDays}))
      at time zone ${processPolicies.timezone}) > ${now.toISOString()}::timestamptz)`;
  const [report] = await db
    .select({ id: suspicionReports.id })
    .from(suspicionReports)
    .innerJoin(cases, eq(cases.id, suspicionReports.caseId))
    .innerJoin(processPolicies, eq(processPolicies.id, suspicionReports.policyId))
    .where(
      and(
        eq(suspicionReports.partyId, partyId),
        or(gt(suspicionReports.retainUntil, now), lifetimeHold(suspicionReports.createdAt)),
      ),
    )
    .limit(1);
  if (report) return true;
  const [agreement] = await db
    .select({ id: serviceAgreements.id })
    .from(serviceAgreements)
    .innerJoin(cases, eq(cases.id, serviceAgreements.caseId))
    .innerJoin(processPolicies, eq(processPolicies.id, serviceAgreements.policyId))
    .where(
      and(
        or(
          eq(serviceAgreements.partyId, partyId),
          eq(serviceAgreements.commissionPayerPartyId, partyId),
        ),
        lifetimeHold(serviceAgreements.createdAt),
      ),
    )
    .limit(1);
  if (agreement) return true;
  const [requestedEvidence] = await db
    .select({ id: documentRequests.id })
    .from(documentRequests)
    .innerJoin(principals, eq(principals.id, documentRequests.recipientId))
    .innerJoin(cases, eq(cases.id, documentRequests.caseId))
    .innerJoin(processPolicies, eq(processPolicies.id, documentRequests.policyId))
    .where(
      and(
        eq(principals.partyId, partyId),
        lifetimeHold(sql`greatest(${documentRequests.updatedAt}, coalesce(
        (select max(${documentVersions.updatedAt}) from ${documentVersions}
          where ${documentVersions.documentId} = ${documentRequests.documentId}),
        ${documentRequests.updatedAt}))`),
      ),
    )
    .limit(1);
  if (requestedEvidence) return true;
  const [item] = await db
    .select({ id: caseProcessItems.id })
    .from(caseProcessItems)
    .innerJoin(caseProcessReviews, eq(caseProcessReviews.id, caseProcessItems.reviewId))
    .innerJoin(cases, eq(cases.id, caseProcessReviews.caseId))
    .innerJoin(processPolicies, eq(processPolicies.id, caseProcessReviews.policyId))
    .where(
      and(
        or(gt(caseProcessItems.retainUntil, now), lifetimeHold(caseProcessItems.updatedAt)),
        or(
          eq(caseProcessItems.partyScope, partyId),
          and(
            eq(caseProcessItems.partyScope, ""),
            sql<boolean>`exists (
            select 1 from ${caseParticipants} where ${caseParticipants.caseId} = ${cases.id}
              and ${caseParticipants.partyId} = ${partyId})`,
          ),
        ),
      ),
    )
    .limit(1);
  return Boolean(item);
}
