import "server-only";
import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import {
  activityEvents,
  contactMethods,
  inquiries,
  keySets,
  parties,
  principals,
  properties,
  tasks,
} from "@/db/schema";
import { hasCapability } from "@/domain/capabilities";
import { checkCodeNoncePrefix } from "@/domain/inquiry-check-code";
import { readInquiryContact } from "@/domain/inquiry-contact";
import type { Session } from "../auth/sessions";
import { assertCanRead, can, resolveGrants } from "../authz";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { ownerNeedsCoverage } from "./coverage-policy";
import {
  effectiveTaskDue,
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

// Shared only inside one read service call. Commands and later requests resolve authority again.
async function queueReadContext(db: Executor, session: Session) {
  const live = await liveStaff(db, session);
  return { live, grants: await resolveGrants(db, live.actor) };
}
type QueueReadContext = Awaited<ReturnType<typeof queueReadContext>>;

export async function listInbox(db: Executor, session: Session, view: InboxView = "all", page = 1) {
  return inboxQuery(db, await queueReadContext(db, session), view, page);
}

/** P12 telephone recovery: a short code narrows candidates; it never authorizes a receipt read. */
export async function findInquiriesByCheckCode(db: Executor, session: Session, checkCode: string) {
  const prefix = checkCodeNoncePrefix(checkCode);
  if (!prefix) throw new AppError("validation_failed", { fieldErrors: { checkCode: ["invalid"] } });
  const { grants } = await queueReadContext(db, session);
  const rows = await db
    .select({
      id: inquiries.id,
      reference: inquiries.reference,
      state: inquiries.state,
      preferredName: inquiries.preferredName,
      preferredLocale: inquiries.preferredLocale,
      createdAt: inquiries.createdAt,
      ownerName: principals.displayName,
    })
    .from(inquiries)
    .leftJoin(principals, eq(principals.id, inquiries.ownerId))
    .where(
      and(
        visibleWhere(grants, "inquiry.read", "inquiry"),
        sql`left(${inquiries.submissionKey}, 5) = ${prefix}`,
      ),
    )
    .orderBy(desc(inquiries.createdAt), desc(inquiries.id))
    .limit(pageSize + 1);
  return { rows: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
}

async function inboxQuery(
  db: Executor,
  { live, grants }: QueueReadContext,
  view: InboxView,
  page = 1,
) {
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
      params: activityEvents.params,
    })
    .from(activityEvents)
    .leftJoin(
      principals,
      and(
        sql`${principals.id}::text = ${activityEvents.actorId}`,
        eq(activityEvents.actorKind, "staff"),
      ),
    )
    .where(
      and(
        eq(activityEvents.recordType, "inquiry"),
        eq(activityEvents.recordId, row.id),
        eq(activityEvents.audience, "internal"),
      ),
    )
    .orderBy(desc(activityEvents.occurredAt))
    .limit(30);
  const [contactMethod] =
    row.partyId && row.contactMethodId
      ? await db
          .select({
            id: contactMethods.id,
            version: contactMethods.version,
            kind: contactMethods.kind,
            value: contactMethods.value,
          })
          .from(contactMethods)
          .where(
            and(
              eq(contactMethods.id, row.contactMethodId),
              eq(contactMethods.partyId, row.partyId),
            ),
          )
      : [];
  return {
    inquiry: row,
    ownerName: owner?.name ?? null,
    needsCoverage: owner?.needsCoverage ?? true,
    tasks: relatedTasks,
    contactMethod: contactMethod ?? null,
    activity: activity.map(({ params, ...entry }) => ({
      ...entry,
      contact: readInquiryContact(entry.messageKey, params),
    })),
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

interface TaskQueryOptions {
  page?: number;
  mine?: boolean;
  awaitingAcceptance?: boolean;
  dueBefore?: Date;
  caseId?: string;
}

export async function listTasks(db: Executor, session: Session, options: TaskQueryOptions = {}) {
  return tasksQuery(db, await queueReadContext(db, session), options);
}

async function tasksQuery(
  db: Executor,
  { live, grants }: QueueReadContext,
  options: TaskQueryOptions = {},
) {
  const page = parseInput(pageSchema, options.page ?? 1);
  const effectiveDue = effectiveTaskDue;
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

// The custody register requires global key.manage; holding a key does not grant that access.
// A timer only highlights the existing obligation. It never records a physical return.
async function overdueKeyQuery(db: Executor, context: QueueReadContext, now: Date) {
  if (
    !hasCapability(context.live.actor, context.grants, "key.manage", {
      now: new Date().toISOString(),
    })
  )
    return null;
  const rows = await db
    .select({
      id: keySets.id,
      reference: keySets.reference,
      dueAt: keySets.dueAt,
      propertyReference: properties.reference,
      holderName: principals.displayName,
      needsCoverage: ownerNeedsCoverage(keySets.holderId),
    })
    .from(keySets)
    .innerJoin(properties, eq(properties.id, keySets.propertyId))
    .leftJoin(principals, eq(principals.id, keySets.holderId))
    .where(and(eq(keySets.state, "checked_out"), lt(keySets.dueAt, now)))
    .orderBy(asc(keySets.dueAt), asc(keySets.id))
    .limit(pageSize + 1);
  return { rows: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
}

/** Bounded real queues; no synthetic metrics or inference that other modules are clear. */
export async function readToday(db: Executor, session: Session, now = new Date()) {
  const context = await queueReadContext(db, session);
  const [unassigned, due, mine, handovers, keyReturns] = await Promise.all([
    inboxQuery(db, context, "unassigned"),
    tasksQuery(db, context, { mine: true, dueBefore: now }),
    inboxQuery(db, context, "mine"),
    tasksQuery(db, context, { awaitingAcceptance: true }),
    overdueKeyQuery(db, context, now),
  ]);
  return { unassigned, due, mine, handovers, keyReturns, asOf: now };
}
