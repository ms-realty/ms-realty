import "server-only";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  activityEvents,
  appointments,
  auditEvents,
  caseStageHistory,
  inquiries,
  principals,
  proposals,
  tasks,
} from "@/db/schema";
import { staffAppointmentVisibility } from "../appointments/visibility";
import type { Session } from "../auth/sessions";
import { can, resolveGrants } from "../authz";
import { listCaseButlerReceipts } from "../butler/receipts";
import type { Executor } from "../db";
import { visibleWhere } from "../work/shared";
import { readCaseMessages } from "./queries";
import { caseFor } from "./shared";

/** O05/O26: internal Case scope plus each child capability precede the bounded timeline. */
export async function readCaseTimeline(db: Executor, session: Session, id: string) {
  const { live, resource } = await caseFor(db, session, id, "case.read_internal");
  const grants = await resolveGrants(db, live.actor);
  const [inquiryRows, taskRows, appointmentRows, proposalRows, conversation, receipts] =
    await Promise.all([
      db
        .select({ id: inquiries.id, reference: inquiries.reference })
        .from(inquiries)
        .where(and(eq(inquiries.caseId, id), visibleWhere(grants, "inquiry.read", "inquiry")))
        .limit(50),
      db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.caseId, id), visibleWhere(grants, "task.manage", "task")))
        .limit(50),
      db
        .select({ id: appointments.id })
        .from(appointments)
        .where(and(eq(appointments.caseId, id), await staffAppointmentVisibility(db, live)))
        .limit(50),
      db.select({ id: proposals.id }).from(proposals).where(eq(proposals.caseId, id)).limit(50),
      readCaseMessages(db, live, id),
      listCaseButlerReceipts(db, live, id),
    ]);
  const readableProposals = [];
  for (const proposal of proposalRows)
    if (
      await can(db, live.actor, "proposal.manage", {
        type: "proposal",
        id: proposal.id,
        caseId: id,
        audience: "case_participants",
      })
    )
      readableProposals.push(proposal.id);
  const record = (type: string, ids: string[]) =>
    ids.length
      ? and(eq(activityEvents.recordType, type), inArray(activityEvents.recordId, ids))
      : undefined;
  const activity = await db
    .select({
      id: activityEvents.id,
      messageKey: activityEvents.messageKey,
      at: activityEvents.occurredAt,
      params: activityEvents.params,
      actorName: principals.displayName,
      actorKind: activityEvents.actorKind,
    })
    .from(activityEvents)
    .leftJoin(
      principals,
      and(
        eq(activityEvents.actorKind, "staff"),
        sql`${principals.id}::text = ${activityEvents.actorId}`,
      ),
    )
    .where(
      or(
        record("case", [id]),
        record(
          "inquiry",
          inquiryRows.map((row) => row.id),
        ),
        record(
          "task",
          taskRows.map((row) => row.id),
        ),
        record(
          "appointment",
          appointmentRows.map((row) => row.id),
        ),
        record("proposal", readableProposals),
        record(
          "message",
          conversation.map((row) => row.id),
        ),
      ),
    )
    .orderBy(desc(activityEvents.occurredAt), desc(activityEvents.id))
    .limit(40);
  const stages = await db
    .select({
      id: caseStageHistory.id,
      from: caseStageHistory.fromStage,
      to: caseStageHistory.toStage,
      reason: caseStageHistory.reason,
      at: caseStageHistory.occurredAt,
    })
    .from(caseStageHistory)
    .where(eq(caseStageHistory.caseId, id))
    .orderBy(desc(caseStageHistory.occurredAt))
    .limit(20);
  const audit = (await can(db, live.actor, "audit.read", resource))
    ? await db
        .select({
          id: auditEvents.id,
          action: auditEvents.action,
          at: auditEvents.occurredAt,
          actorKind: auditEvents.actorKind,
          actorName: principals.displayName,
          operationId: auditEvents.operationId,
        })
        .from(auditEvents)
        .leftJoin(
          principals,
          and(
            eq(auditEvents.actorKind, "staff"),
            sql`${principals.id}::text = ${auditEvents.actorId}`,
          ),
        )
        .where(and(eq(auditEvents.recordType, "case"), eq(auditEvents.recordId, id)))
        .orderBy(desc(auditEvents.occurredAt))
        .limit(40)
    : null;
  return { activity, stages, receipts, audit, inquiries: inquiryRows };
}
