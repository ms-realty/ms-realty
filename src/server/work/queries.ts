import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { activityEvents, contactMethods, inquiries, parties, principals, tasks } from "@/db/schema";
import type { Session } from "../auth/sessions";
import { assertCanRead, can, resolveGrants } from "../authz";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { ownerNeedsCoverage } from "./coverage-policy";
import {
  inquiryResource,
  liveStaff,
  openInquiryStates,
  openTaskStates,
  parseInput,
  taskResource,
  visibleWhere,
} from "./shared";

export type InboxView = "all" | "unassigned" | "mine" | "awaiting" | "review";
const pageSchema = z.number().int().min(1).max(10000);
export const pageSize = 30;

export async function listInbox(db: Executor, session: Session, view: InboxView = "all", page = 1) {
  const live = await liveStaff(db, session);
  const grants = await resolveGrants(db, live.actor);
  const offset = (parseInput(pageSchema, page) - 1) * pageSize;
  const condition =
    view === "unassigned"
      ? isNull(inquiries.ownerId)
      : view === "mine"
        ? eq(inquiries.ownerId, live.account.id)
        : view === "awaiting"
          ? eq(inquiries.state, "awaiting_client")
          : view === "review"
            ? inArray(inquiries.state, [
                "suspected_spam",
                "duplicate_candidate",
                "contact_unreachable",
              ])
            : undefined;
  const rows = await db
    .select({
      inquiry: inquiries,
      ownerName: principals.displayName,
      needsCoverage: ownerNeedsCoverage(inquiries.ownerId),
    })
    .from(inquiries)
    .leftJoin(principals, eq(principals.id, inquiries.ownerId))
    .where(
      and(
        visibleWhere(grants, "inquiry.read", "inquiry"),
        inArray(inquiries.state, [...openInquiryStates]),
        condition,
      ),
    )
    .orderBy(asc(inquiries.createdAt), asc(inquiries.id))
    .limit(pageSize + 1)
    .offset(offset);
  return { rows: rows.slice(0, pageSize), hasMore: rows.length > pageSize, page };
}

export async function readInquiry(db: Executor, session: Session, id: string) {
  const live = await liveStaff(db, session);
  if (!z.uuid().safeParse(id).success) throw new AppError("not_found");
  const [row] = await db.select().from(inquiries).where(eq(inquiries.id, id));
  if (!row) throw new AppError("not_found");
  const resource = inquiryResource(row);
  await assertCanRead(db, live.actor, "inquiry.read", resource);
  const grants = await resolveGrants(db, live.actor);
  const [owner] = row.ownerId
    ? await db
        .select({ name: principals.displayName, needsCoverage: ownerNeedsCoverage(principals.id) })
        .from(principals)
        .where(eq(principals.id, row.ownerId))
    : [];
  const relatedTasks = await db
    .select({
      task: tasks,
      ownerName: principals.displayName,
      needsCoverage: ownerNeedsCoverage(tasks.ownerId),
    })
    .from(tasks)
    .leftJoin(principals, eq(principals.id, tasks.ownerId))
    .where(and(eq(tasks.inquiryId, row.id), visibleWhere(grants, "task.manage", "task")))
    .orderBy(asc(tasks.createdAt))
    .limit(50);
  const activity = await db
    .select({
      id: activityEvents.id,
      messageKey: activityEvents.messageKey,
      at: activityEvents.occurredAt,
      actorName: principals.displayName,
    })
    .from(activityEvents)
    .leftJoin(
      principals,
      and(
        sql`${principals.id}::text = ${activityEvents.actorId}`,
        eq(activityEvents.actorKind, "staff"),
      ),
    )
    .where(and(eq(activityEvents.recordType, "inquiry"), eq(activityEvents.recordId, row.id)))
    .orderBy(desc(activityEvents.occurredAt))
    .limit(30);
  return {
    inquiry: row,
    ownerName: owner?.name ?? null,
    needsCoverage: owner?.needsCoverage ?? true,
    tasks: relatedTasks,
    activity,
    canAssign: await can(db, live.actor, "inquiry.assign", resource),
    canRespond: await can(db, live.actor, "inquiry.respond", resource),
    canAssist: await can(db, live.actor, "ai.draft", resource),
    canCreateCase:
      (await can(db, live.actor, "case.transition", { type: "case", audience: "internal" })) &&
      (await can(db, live.actor, "case.read", { type: "case", audience: "internal" })),
    canCreateTask: await can(db, live.actor, "task.manage", {
      type: "task",
      ...(row.caseId ? { caseId: row.caseId } : {}),
      audience: "internal",
    }),
  };
}

export async function listTasks(
  db: Executor,
  session: Session,
  options: {
    page?: number;
    mine?: boolean;
    awaitingAcceptance?: boolean;
    dueBefore?: Date;
    caseId?: string;
  } = {},
) {
  const live = await liveStaff(db, session);
  const grants = await resolveGrants(db, live.actor);
  const page = parseInput(pageSchema, options.page ?? 1);
  const effectiveDue = sql<Date>`case when ${tasks.state} = 'waiting' then ${tasks.followUpAt} else ${tasks.dueAt} end`;
  const rows = await db
    .select({
      task: tasks,
      ownerName: principals.displayName,
      needsCoverage: ownerNeedsCoverage(tasks.ownerId),
    })
    .from(tasks)
    .leftJoin(principals, eq(principals.id, tasks.ownerId))
    .where(
      and(
        visibleWhere(grants, "task.manage", "task"),
        inArray(tasks.state, [...openTaskStates]),
        options.mine ? eq(tasks.ownerId, live.account.id) : undefined,
        options.awaitingAcceptance ? eq(tasks.pendingOwnerId, live.account.id) : undefined,
        options.caseId ? eq(tasks.caseId, options.caseId) : undefined,
        options.dueBefore
          ? sql`${effectiveDue} <= ${options.dueBefore.toISOString()}::timestamptz`
          : undefined,
      ),
    )
    .orderBy(asc(effectiveDue), asc(tasks.id))
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
  return { rows: rows.slice(0, pageSize), hasMore: rows.length > pageSize, page };
}

export async function readTask(db: Executor, session: Session, id: string) {
  const live = await liveStaff(db, session);
  if (!z.uuid().safeParse(id).success) throw new AppError("not_found");
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!row) throw new AppError("not_found");
  await assertCanRead(db, live.actor, "task.manage", taskResource(row));
  const [owner] = row.ownerId
    ? await db
        .select({ name: principals.displayName, needsCoverage: ownerNeedsCoverage(principals.id) })
        .from(principals)
        .where(eq(principals.id, row.ownerId))
    : [];
  return { task: row, ownerName: owner?.name ?? null, needsCoverage: owner?.needsCoverage ?? true };
}

/** Contacts are reached through authorized inquiries; a known party UUID grants nothing. */
export async function listContacts(db: Executor, session: Session, page = 1) {
  const live = await liveStaff(db, session);
  const grants = await resolveGrants(db, live.actor);
  const current = parseInput(pageSchema, page);
  const rows = await db
    .selectDistinct({ id: parties.id, name: parties.displayName, locale: parties.preferredLocale })
    .from(parties)
    .innerJoin(inquiries, eq(inquiries.partyId, parties.id))
    .where(visibleWhere(grants, "inquiry.read", "inquiry"))
    .orderBy(asc(parties.displayName), asc(parties.id))
    .limit(pageSize + 1)
    .offset((current - 1) * pageSize);
  return { rows: rows.slice(0, pageSize), hasMore: rows.length > pageSize, page: current };
}

export async function readContact(db: Executor, session: Session, id: string) {
  const live = await liveStaff(db, session);
  if (!z.uuid().safeParse(id).success) throw new AppError("not_found");
  const grants = await resolveGrants(db, live.actor);
  const related = await db
    .select({ id: inquiries.id, reference: inquiries.reference, state: inquiries.state })
    .from(inquiries)
    .where(and(eq(inquiries.partyId, id), visibleWhere(grants, "inquiry.read", "inquiry")))
    .orderBy(desc(inquiries.createdAt))
    .limit(30);
  if (!related.length) throw new AppError("not_found");
  const [party] = await db.select().from(parties).where(eq(parties.id, id));
  if (!party) throw new AppError("not_found");
  const methods = await db
    .select({
      id: contactMethods.id,
      kind: contactMethods.kind,
      value: contactMethods.value,
      verification: contactMethods.verification,
    })
    .from(contactMethods)
    .where(eq(contactMethods.partyId, id));
  return { party, methods, inquiries: related };
}

/** Bounded real queues; no synthetic metrics or inference that other modules are clear. */
export async function readToday(db: Executor, session: Session, now = new Date()) {
  const [unassigned, due, mine, handovers] = await Promise.all([
    listInbox(db, session, "unassigned"),
    listTasks(db, session, { mine: true, dueBefore: now }),
    listInbox(db, session, "mine"),
    listTasks(db, session, { awaitingAcceptance: true }),
  ]);
  return { unassigned, due, mine, handovers, asOf: now };
}
