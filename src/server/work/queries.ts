import "server-only";
import { and, asc, desc, eq, exists, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  activityEvents,
  caseParticipants,
  cases,
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
import { caseGrantVisibility, liveParticipation } from "../cases/shared";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { normalizePhone } from "../inquiries/intake";
import { containsSearchControl } from "../search/controls";
import { serviceCaseCoverage } from "../service-intake/scope";
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
import {
  caseContinueQuery,
  deliveryExceptionQuery,
  draftContinueQuery,
  listingReviewQuery,
  operatorDeliveryExceptionQuery,
  publicationExceptionQuery,
  todayQueueResult,
  translationReviewPageQuery,
  translationReviewQuery,
  viewingQuery,
  workerQueueQuery,
} from "./today-queries";

export type InboxView = "all" | "unassigned" | "mine" | "awaiting" | "review";
const pageSchema = z.number().int().min(1).max(10000);
const inquirySearchSchema = z
  .string()
  .refine((value) => !containsSearchControl(value), "search_control_character")
  .trim()
  .min(2)
  .max(120);
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

/** O01 complete translation-review queue; each cursor read resolves live authority again. */
export async function listTranslationReviews(db: Executor, session: Session, cursor?: string) {
  return translationReviewPageQuery(db, await queueReadContext(db, session), cursor);
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

/** Staff Inbox search. The caller must submit personal terms in a POST body, never a URL. */
export async function searchInquiries(db: Executor, session: Session, q: string, page = 1) {
  const term = parseInput(inquirySearchSchema, q);
  const offset = (parseInput(pageSchema, page) - 1) * pageSize;
  const { grants } = await queueReadContext(db, session);
  // Only the contact captured by this inquiry is searchable. Another method on the party
  // cannot reveal a relationship to staff who can read the inquiry but not that contact.
  const phone = normalizePhone(term);
  const contact = phone
    ? { kind: "phone" as const, normalized: phone }
    : term.includes("@")
      ? { kind: "email" as const, normalized: term.toLowerCase() }
      : null;
  const rows = await db
    .select({
      inquiry: {
        id: inquiries.id,
        reference: inquiries.reference,
        state: inquiries.state,
        preferredName: inquiries.preferredName,
        createdAt: inquiries.createdAt,
        followUpAt: inquiries.followUpAt,
      },
      ownerName: principals.displayName,
      needsCoverage: ownerNeedsCoverage(inquiries.ownerId),
    })
    .from(inquiries)
    .leftJoin(principals, eq(principals.id, inquiries.ownerId))
    .where(
      and(
        visibleWhere(grants, "inquiry.read", "inquiry"),
        or(
          sql`strpos(lower(${inquiries.preferredName}), lower(${term})) > 0`,
          contact
            ? exists(
                db
                  .select({ id: contactMethods.id })
                  .from(contactMethods)
                  .where(
                    and(
                      eq(contactMethods.id, inquiries.contactMethodId),
                      eq(contactMethods.kind, contact.kind),
                      eq(contactMethods.normalizedValue, contact.normalized),
                    ),
                  ),
              )
            : undefined,
        ),
      ),
    )
    .orderBy(desc(inquiries.createdAt), desc(inquiries.id))
    .limit(pageSize + 1)
    .offset(offset);
  return { rows: rows.slice(0, pageSize), hasMore: rows.length > pageSize, page };
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
      total: sql<number>`count(*) over ()`.mapWith(Number),
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
    .orderBy(
      ...(view === "mine" ? [sql`${inquiries.followUpAt} asc nulls last`] : []),
      asc(inquiries.createdAt),
      asc(inquiries.id),
    )
    .limit(pageSize + 1)
    .offset(offset);
  return {
    rows: rows.slice(0, pageSize).map(({ total: _total, ...row }) => row),
    total: rows[0]?.total ?? (page === 1 ? 0 : null),
    hasMore: rows.length > pageSize,
    page,
  };
}

/** Human reference lookup keeps duplicate selection usable beyond the recent picker page. */
export async function inquiryIdByReference(db: Executor, session: Session, reference: string) {
  const { grants } = await queueReadContext(db, session);
  const term = parseInput(
    z
      .string()
      .trim()
      .min(3)
      .max(80)
      .refine((value) => !containsSearchControl(value)),
    reference,
  );
  const [row] = await db
    .select({ id: inquiries.id })
    .from(inquiries)
    .where(and(eq(inquiries.reference, term), visibleWhere(grants, "inquiry.read", "inquiry")))
    .limit(1);
  if (!row)
    throw new AppError("validation_failed", { fieldErrors: { duplicateOfInquiryId: ["invalid"] } });
  return row.id;
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
            verification: contactMethods.verification,
          })
          .from(contactMethods)
          .where(
            and(
              eq(contactMethods.id, row.contactMethodId),
              eq(contactMethods.partyId, row.partyId),
            ),
          )
      : [];
  const duplicateCandidates = await db
    .select({
      id: inquiries.id,
      reference: inquiries.reference,
      preferredName: inquiries.preferredName,
    })
    .from(inquiries)
    .where(and(ne(inquiries.id, row.id), visibleWhere(grants, "inquiry.read", "inquiry")))
    .orderBy(
      ...(row.duplicateOfInquiryId
        ? [desc(sql`${inquiries.id} = ${row.duplicateOfInquiryId}`)]
        : []),
      desc(inquiries.createdAt),
      desc(inquiries.id),
    )
    .limit(200);
  return {
    inquiry: row,
    serviceCurrent:
      row.purpose === "service_consultation"
        ? (await serviceCaseCoverage(db, (row.context as { service?: unknown } | null)?.service))
            .current
        : undefined,
    duplicateCandidates,
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
  q?: string;
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
  const term = options.q ? parseInput(inquirySearchSchema, options.q) : "";
  const effectiveDue = effectiveTaskDue;
  const rows = await db
    .select({
      total: sql<number>`count(*) over ()`.mapWith(Number),
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
        term ? sql`strpos(lower(${tasks.title}), lower(${term})) > 0` : undefined,
        options.dueBefore
          ? sql`${effectiveDue} <= ${options.dueBefore.toISOString()}::timestamptz`
          : undefined,
      ),
    )
    .orderBy(asc(effectiveDue), asc(tasks.id))
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
  return {
    rows: rows.slice(0, pageSize).map(({ total: _total, ...row }) => row),
    total: rows[0]?.total ?? (page === 1 ? 0 : null),
    hasMore: rows.length > pageSize,
    page,
  };
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
  return {
    task: row,
    ownerName: owner?.name ?? null,
    needsCoverage: owner?.needsCoverage ?? true,
    canReadCase: Boolean(
      row.caseId &&
        (await can(db, live.actor, "case.read", {
          type: "case",
          id: row.caseId,
          audience: "internal",
        })),
    ),
    canReadInquiry: Boolean(
      row.inquiryId &&
        (await can(db, live.actor, "inquiry.read", {
          type: "inquiry",
          id: row.inquiryId,
          audience: "internal",
        })),
    ),
  };
}

/** Contacts are reached through authorized inquiries; a known party UUID grants nothing. */
export async function listContacts(db: Executor, session: Session, page = 1, q = "") {
  const live = await liveStaff(db, session);
  const grants = await resolveGrants(db, live.actor);
  const current = parseInput(pageSchema, page);
  const term = q ? parseInput(inquirySearchSchema, q) : "";
  const rows = await db
    .select({
      id: parties.id,
      name: parties.displayName,
      locale: parties.preferredLocale,
      latestInquiryAt: sql<string>`max(${inquiries.createdAt})::text`,
      inquiryCount: sql<number>`count(distinct ${inquiries.id})`.mapWith(Number),
      methods: sql<
        { kind: string; value: string; verification: string }[]
      >`coalesce(jsonb_agg(distinct jsonb_build_object('kind', ${contactMethods.kind}, 'value', ${contactMethods.value}, 'verification', ${contactMethods.verification})) filter (where ${contactMethods.id} is not null), '[]'::jsonb)`,
    })
    .from(parties)
    .innerJoin(inquiries, eq(inquiries.partyId, parties.id))
    .leftJoin(
      contactMethods,
      and(eq(contactMethods.id, inquiries.contactMethodId), eq(contactMethods.partyId, parties.id)),
    )
    .where(
      and(
        visibleWhere(grants, "inquiry.read", "inquiry"),
        term
          ? or(
              sql`strpos(lower(${parties.displayName}), lower(${term})) > 0`,
              sql`strpos(lower(${contactMethods.value}), lower(${term})) > 0`,
            )
          : undefined,
      ),
    )
    .groupBy(parties.id, parties.displayName, parties.preferredLocale)
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
    .select({
      id: inquiries.id,
      reference: inquiries.reference,
      state: inquiries.state,
      caseId: inquiries.caseId,
    })
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
  const relatedCases = await db
    .select({ id: cases.id, reference: cases.reference, title: cases.title })
    .from(cases)
    .where(
      and(
        caseGrantVisibility(grants, "case.read"),
        or(
          inArray(
            cases.id,
            related.flatMap((row) => row.caseId ?? []),
          ),
          exists(
            db
              .select({ id: caseParticipants.caseId })
              .from(caseParticipants)
              .where(
                and(
                  eq(caseParticipants.caseId, cases.id),
                  eq(caseParticipants.partyId, id),
                  liveParticipation(),
                ),
              ),
          ),
        ),
      ),
    )
    .orderBy(desc(cases.updatedAt))
    .limit(30);
  return { party, methods, inquiries: related, cases: relatedCases };
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
      total: sql<number>`count(*) over ()`.mapWith(Number),
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
  return {
    rows: rows.slice(0, pageSize).map(({ total: _total, ...row }) => row),
    total: rows[0]?.total ?? 0,
    hasMore: rows.length > pageSize,
  };
}

/** Bounded real queues; no synthetic metrics or inference that other modules are clear. */
export async function readToday(db: Executor, session: Session, now = new Date()) {
  const context = await queueReadContext(db, session);
  const results = await Promise.allSettled([
    inboxQuery(db, context, "unassigned"),
    tasksQuery(db, context, { mine: true, dueBefore: now }),
    inboxQuery(db, context, "mine"),
    tasksQuery(db, context, { awaitingAcceptance: true }),
    overdueKeyQuery(db, context, now),
    viewingQuery(db, context, now),
    caseContinueQuery(db, context),
    draftContinueQuery(db, context),
    listingReviewQuery(db, context, now),
    translationReviewQuery(db, context),
    deliveryExceptionQuery(db, context),
    publicationExceptionQuery(db, context),
    operatorDeliveryExceptionQuery(db, context),
    workerQueueQuery(db, context, now),
  ]);
  return {
    unassigned: todayQueueResult(results[0], now, "unassigned"),
    due: todayQueueResult(results[1], now, "due"),
    mine: todayQueueResult(results[2], now, "mine"),
    handovers: todayQueueResult(results[3], now, "handovers"),
    keyReturns: todayQueueResult(results[4], now, "keyReturns"),
    viewings: todayQueueResult(results[5], now, "viewings"),
    caseContinue: todayQueueResult(results[6], now, "caseContinue"),
    draftContinue: todayQueueResult(results[7], now, "draftContinue"),
    listingReviews: todayQueueResult(results[8], now, "listingReviews"),
    translationReviews: todayQueueResult(results[9], now, "translationReviews"),
    deliveryExceptions: todayQueueResult(results[10], now, "deliveryExceptions"),
    publicationExceptions: todayQueueResult(results[11], now, "publicationExceptions"),
    operatorDeliveryExceptions: todayQueueResult(results[12], now, "operatorDeliveryExceptions"),
    worker:
      results[13].status === "fulfilled"
        ? results[13].value
        : { state: "unavailable" as const, reason: "read_unavailable", completedAt: null },
    // The legacy overview mixes owned commitments with readable coverage intake. Do not
    // label it Mine/coverage/team or calculate staffed SLA from untyped policy JSON.
    scope: { state: "unknown" as const, reason: "scope_policy_not_bound" },
    staffedSla: { state: "unknown" as const, reason: "staffed_sla_policy_not_bound" },
    asOf: now,
  };
}
