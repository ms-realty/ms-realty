// O01 Today (spec F19, L07, A45). Rows come in the F19 order: unresolved consequential
// failures, overdue client commitments, today's appointments, requests awaiting a first
// response, approvals blocking work, then planned tasks. The actor sees their own work plus,
// in the duty role (anyone who can assign inquiries), all unowned work.
import "server-only";
import { and, eq, gte, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import {
  appointments,
  approvals,
  cases,
  inquiries,
  listings,
  messages,
  outboxMessages,
  tasks,
} from "@/db/schema";
import { type ApprovalKind, approvalCapability } from "@/domain/approval";
import { type Actor, hasCapability } from "@/domain/capabilities";
import { resolveGrants } from "../authz";
import type { Executor } from "../db";
import { AppError } from "../errors";
import {
  assertTimeZone,
  dayBounds,
  firstResponseDueAt,
  loadServicePolicies,
  officeAt,
} from "./policy";
import {
  dueView,
  openInquiryStates,
  openTaskStates,
  ownerRef,
  ref,
  requireStaff,
  staffNames,
} from "./shared";
import {
  type RecordRef,
  type TodayGroup,
  type TodayGroupBy,
  type TodayRow,
  type TodaySection,
  type TodayView,
  todaySections,
} from "./types";

export interface TodayOptions {
  readonly now?: Date;
  /** IANA timezone of the operator; decides what "today" is. */
  readonly timeZone: string;
  readonly groupBy?: TodayGroupBy;
}

/** An outcome_unknown this old is parked for reconciliation, not a send in flight. */
const unknownOutcomeGraceMs = 5 * 60_000;

interface Candidate extends Omit<TodayRow, "owner"> {
  readonly ownerId: string | null;
  /** Secondary order: oldest first when there is no due point. */
  readonly sortAt: number;
}

export async function getToday(
  db: Executor,
  actor: Actor,
  options: TodayOptions,
): Promise<TodayView> {
  requireStaff(actor);
  const now = options.now ?? new Date();
  const groupBy = options.groupBy ?? "due";
  if (!["due", "case", "type"].includes(groupBy)) {
    throw new AppError("validation_failed", { fieldErrors: { groupBy: ["invalid_group_by"] } });
  }
  assertTimeZone(options.timeZone);
  const { end: endOfDay, start: startOfDay } = dayBounds(now, options.timeZone);

  const grants = await resolveGrants(db, actor, now);
  const holds = (capability: Parameters<typeof hasCapability>[2]) =>
    hasCapability(actor, grants, capability, { now: now.toISOString() });
  const readsInquiries = holds("inquiry.read");
  const managesTasks = holds("task.manage");
  const managesAppointments = holds("appointment.manage");
  const approvalKinds = (Object.keys(approvalCapability) as ApprovalKind[]).filter((kind) =>
    holds(approvalCapability[kind]),
  );
  if (!readsInquiries && !managesTasks && !managesAppointments && !approvalKinds.length) {
    throw new AppError("forbidden");
  }
  const duty = holds("inquiry.assign");
  const policies = await loadServicePolicies(db);

  const candidates: Candidate[] = [];
  if (readsInquiries) {
    candidates.push(...(await deliveryProblems(db, now)));
    candidates.push(...(await inquiryRows(db, now, endOfDay, policies)));
  }
  if (managesTasks) candidates.push(...(await taskRows(db, now, endOfDay)));
  if (managesAppointments)
    candidates.push(...(await appointmentRows(db, now, startOfDay, endOfDay)));
  if (approvalKinds.length) candidates.push(...(await approvalRows(db, approvalKinds)));

  const mine = candidates.filter(
    (row) =>
      row.ownerId === actor.id || (row.ownerId === null && (duty || row.kind === "approval")),
  );
  mine.sort(
    (a, b) =>
      todaySections.indexOf(a.section) - todaySections.indexOf(b.section) ||
      (a.due ? Date.parse(a.due.at) : Number.POSITIVE_INFINITY) -
        (b.due ? Date.parse(b.due.at) : Number.POSITIVE_INFINITY) ||
      a.sortAt - b.sortAt ||
      a.id.localeCompare(b.id),
  );
  const names = await staffNames(
    db,
    mine.map((row) => row.ownerId),
  );
  const rows: TodayRow[] = mine.map(({ ownerId, sortAt: _sortAt, ...row }) => ({
    ...row,
    owner: ownerRef(names, ownerId),
  }));

  const counts = Object.fromEntries(todaySections.map((s) => [s, 0])) as Record<
    TodaySection,
    number
  >;
  for (const row of rows) counts[row.section] += 1;

  return {
    now: now.toISOString(),
    timeZone: options.timeZone,
    groupBy,
    office: officeAt(policies, now),
    counts,
    unownedCount: rows.filter((row) => row.owner === null).length,
    overdueCount: rows.filter((row) => row.due?.overdue).length,
    groups: group(rows, groupBy),
    empty: rows.length
      ? null
      : { nextDueAt: managesTasks ? await nextDueAt(db, actor, now) : null },
  };
}

function group(rows: readonly TodayRow[], groupBy: TodayGroupBy): TodayGroup[] {
  if (groupBy === "due") {
    return todaySections
      .map((section) => ({
        key: section,
        label: section,
        rows: rows.filter((row) => row.section === section),
      }))
      .filter((g) => g.rows.length);
  }
  // Groups keep the order of their most urgent row, which is already F19 order.
  const groups = new Map<string, { key: string; label: string; rows: TodayRow[] }>();
  for (const row of rows) {
    const record =
      row.records.find((r) => r.type === "case") ??
      row.records.find((r) => r.type === "inquiry") ??
      row.records.find((r) => r.type === "listing");
    const key = groupBy === "type" ? row.kind : record ? `${record.type}:${record.id}` : "unlinked";
    const label = groupBy === "type" ? row.kind : (record?.reference ?? "unlinked");
    const existing = groups.get(key);
    if (existing) existing.rows.push(row);
    else groups.set(key, { key, label, rows: [row] });
  }
  return [...groups.values()];
}

/** Failed or unknown outbound deliveries of case and inquiry messages. */
async function deliveryProblems(db: Executor, now: Date): Promise<Candidate[]> {
  const grace = new Date(now.getTime() - unknownOutcomeGraceMs);
  const rows = await db
    .select({
      outboxId: outboxMessages.id,
      state: outboxMessages.state,
      errorCode: outboxMessages.lastErrorCode,
      updatedAt: outboxMessages.updatedAt,
      channel: outboxMessages.channel,
      messageId: messages.id,
      authorKind: messages.authorKind,
      authorId: messages.authorId,
      inquiryId: inquiries.id,
      inquiryReference: inquiries.reference,
      inquiryOwner: inquiries.ownerStaffId,
      caseId: cases.id,
      caseReference: cases.reference,
      caseOwner: cases.ownerStaffId,
    })
    .from(outboxMessages)
    .innerJoin(messages, eq(messages.id, outboxMessages.messageId))
    .leftJoin(inquiries, eq(inquiries.id, messages.inquiryId))
    .leftJoin(cases, eq(cases.id, messages.caseId))
    .where(
      or(
        eq(outboxMessages.state, "failed"),
        and(
          eq(outboxMessages.state, "outcome_unknown"),
          or(isNotNull(outboxMessages.lastErrorCode), lt(outboxMessages.dispatchStartedAt, grace)),
        ),
      ),
    );
  return rows.map((row) => {
    const records: RecordRef[] = [ref("message", row.messageId)];
    if (row.inquiryId) records.push(ref("inquiry", row.inquiryId, row.inquiryReference));
    if (row.caseId) records.push(ref("case", row.caseId, row.caseReference));
    const subject = row.caseReference ?? row.inquiryReference ?? "a client";
    const failed = row.state === "failed";
    return {
      id: `delivery:${row.outboxId}`,
      kind: "delivery_problem",
      section: "consequential_failures",
      title: failed ? `Resolve failed message to ${subject}` : `Check delivery to ${subject}`,
      reason: failed
        ? `The ${row.channel} message was not delivered (${row.errorCode ?? "failed"}).`
        : `The ${row.channel} message outcome is unknown; reconcile it before any retry.`,
      reasonCode: failed ? "delivery_failed" : "delivery_outcome_unknown",
      records,
      ownerId:
        row.inquiryOwner ?? row.caseOwner ?? (row.authorKind === "staff" ? row.authorId : null),
      due: null,
      severity: "consequential",
      action: { kind: "reconcile_delivery", target: ref("message", row.messageId) },
      sortAt: row.updatedAt.getTime(),
    };
  });
}

/** Unanswered requests and client follow-ups due by the end of today. */
async function inquiryRows(
  db: Executor,
  now: Date,
  endOfDay: Date,
  policies: Awaited<ReturnType<typeof loadServicePolicies>>,
): Promise<Candidate[]> {
  const rows = await db
    .select({
      id: inquiries.id,
      reference: inquiries.reference,
      state: inquiries.state,
      ownerStaffId: inquiries.ownerStaffId,
      createdAt: inquiries.createdAt,
      firstResponseAt: inquiries.firstResponseAt,
      followUpAt: inquiries.followUpAt,
      listingId: inquiries.listingId,
      listingReference: listings.reference,
    })
    .from(inquiries)
    .leftJoin(listings, eq(listings.id, inquiries.listingId))
    .where(inArray(inquiries.state, [...openInquiryStates]));
  const result: Candidate[] = [];
  for (const row of rows) {
    const target = ref("inquiry", row.id, row.reference);
    const records: RecordRef[] = [target];
    if (row.listingId) records.push(ref("listing", row.listingId, row.listingReference));
    const base = { records, ownerId: row.ownerStaffId, sortAt: row.createdAt.getTime() };

    if (row.state === "awaiting_client") {
      if (!row.followUpAt || row.followUpAt >= endOfDay) continue;
      const overdue = row.followUpAt < now;
      result.push({
        ...base,
        id: `follow-up:${row.id}`,
        kind: "client_follow_up",
        section: overdue ? "overdue_commitments" : "planned_tasks",
        title: `Follow up ${row.reference}`,
        reason: overdue
          ? "The agreed follow-up with the client has passed."
          : "The agreed follow-up with the client is due today.",
        reasonCode: overdue ? "follow_up_overdue" : "follow_up_due_today",
        due: dueView(row.followUpAt, now),
        severity: overdue ? "consequential" : "due",
        action: { kind: "follow_up", target },
      });
      continue;
    }
    if (row.firstResponseAt) continue;

    const dueAt = firstResponseDueAt(policies, row.createdAt);
    const overdue = dueAt !== null && dueAt < now;
    const duplicate = row.state === "suspected_duplicate";
    result.push({
      ...base,
      id: `inquiry:${row.id}`,
      kind: duplicate ? "duplicate_review" : overdue ? "first_response_overdue" : "first_response",
      section: overdue ? "consequential_failures" : "awaiting_first_response",
      title: duplicate
        ? `Review possible duplicate ${row.reference}`
        : row.ownerStaffId
          ? `Reply to ${row.reference}`
          : `Claim ${row.reference}`,
      reason: overdue
        ? "The first-response promise to the client has passed."
        : row.ownerStaffId
          ? "The request has no first response yet."
          : "The request has no owner and no first response yet.",
      reasonCode: overdue
        ? "first_response_overdue"
        : row.ownerStaffId
          ? "awaiting_first_response"
          : "unowned_request",
      due: dueView(dueAt, now),
      severity: overdue ? "consequential" : "due",
      action: {
        kind: duplicate ? "review_duplicate" : row.ownerStaffId ? "reply" : "claim_inquiry",
        target,
      },
    });
  }
  return result;
}

/**
 * Client promises past due stay in "overdue commitments" whatever their snooze (A45). Other
 * open tasks appear when due (or to be reviewed) by the end of today, unless snoozed further.
 */
async function taskRows(db: Executor, now: Date, endOfDay: Date): Promise<Candidate[]> {
  const rows = await db
    .select({
      task: tasks,
      inquiryReference: inquiries.reference,
      caseReference: cases.reference,
      listingReference: listings.reference,
    })
    .from(tasks)
    .leftJoin(inquiries, eq(inquiries.id, tasks.inquiryId))
    .leftJoin(cases, eq(cases.id, tasks.caseId))
    .leftJoin(listings, eq(listings.id, tasks.listingId))
    .where(
      and(
        inArray(tasks.state, [...openTaskStates]),
        or(lt(tasks.dueAt, endOfDay), lt(tasks.followUpAt, endOfDay)),
      ),
    );
  const result: Candidate[] = [];
  for (const { task, ...refs } of rows) {
    const waiting = task.state === "waiting";
    const reviewAt = task.followUpAt;
    const snoozed = !waiting && reviewAt !== null && reviewAt > now;
    const missedPromise =
      task.commitment === "client_promise" && task.dueAt !== null && task.dueAt < now;
    const effectiveDue = waiting ? reviewAt : task.dueAt;
    if (!missedPromise) {
      if (snoozed) continue;
      const reviewReached = reviewAt !== null && reviewAt < endOfDay;
      const dueToday = effectiveDue !== null && effectiveDue < endOfDay;
      if (!dueToday && !reviewReached) continue;
    }
    const records: RecordRef[] = [ref("task", task.id)];
    if (task.inquiryId) records.push(ref("inquiry", task.inquiryId, refs.inquiryReference));
    if (task.caseId) records.push(ref("case", task.caseId, refs.caseReference));
    if (task.listingId) records.push(ref("listing", task.listingId, refs.listingReference));
    const due = dueView(effectiveDue ?? reviewAt, now);
    const promise = task.commitment === "client_promise";
    result.push({
      id: `task:${task.id}`,
      kind: promise ? "client_commitment" : "task",
      section: missedPromise ? "overdue_commitments" : "planned_tasks",
      title: task.title,
      reason: missedPromise
        ? "A promise made to the client is past due."
        : waiting
          ? `Waiting on ${task.waitingOn}; the follow-up is due.`
          : due?.overdue
            ? "The task is past due."
            : promise
              ? "A promise made to the client is due today."
              : "The task is due today.",
      reasonCode: missedPromise
        ? "client_promise_overdue"
        : waiting
          ? "waiting_follow_up_due"
          : due?.overdue
            ? "task_overdue"
            : "due_today",
      records,
      ownerId: task.ownerStaffId,
      due,
      severity: missedPromise ? "consequential" : due?.overdue || promise ? "due" : "planned",
      action: {
        kind: waiting ? "review_dependency" : "complete_task",
        target: ref("task", task.id),
      },
      sortAt: task.createdAt.getTime(),
    });
  }
  return result;
}

/** Confirmed arrangements today, and proposals for today that are not confirmed yet. */
async function appointmentRows(
  db: Executor,
  now: Date,
  startOfDay: Date,
  endOfDay: Date,
): Promise<Candidate[]> {
  const confirmedToday = and(
    inArray(appointments.state, ["confirmed", "reschedule_requested"]),
    gte(appointments.confirmedStartsAt, startOfDay),
    lt(appointments.confirmedStartsAt, endOfDay),
  );
  const proposedToday = and(
    inArray(appointments.state, ["requested", "proposed"]),
    gte(appointments.proposedStartsAt, startOfDay),
    lt(appointments.proposedStartsAt, endOfDay),
  );
  const rows = await db
    .select({
      appointment: appointments,
      caseReference: cases.reference,
      listingReference: listings.reference,
    })
    .from(appointments)
    .leftJoin(cases, eq(cases.id, appointments.caseId))
    .leftJoin(listings, eq(listings.id, appointments.listingId))
    .where(or(confirmedToday, proposedToday));
  return rows.map(({ appointment: a, caseReference, listingReference }) => {
    const target = ref("appointment", a.id, a.reference);
    const records: RecordRef[] = [target];
    if (a.caseId) records.push(ref("case", a.caseId, caseReference));
    if (a.listingId) records.push(ref("listing", a.listingId, listingReference));
    const confirmed = a.state === "confirmed" || a.state === "reschedule_requested";
    const startsAt = (confirmed ? a.confirmedStartsAt : a.proposedStartsAt) as Date;
    const started = startsAt < now;
    const accessPending = confirmed && a.propertyAccess !== "confirmed";
    return {
      id: `appointment:${a.id}`,
      kind: "appointment",
      section: "appointments_today",
      title: confirmed
        ? started
          ? `Record the outcome of ${a.reference}`
          : `Attend ${a.reference}`
        : `Confirm ${a.reference}`,
      reason: !confirmed
        ? "A time is proposed for today but not confirmed."
        : a.state === "reschedule_requested"
          ? "A reschedule is requested; the confirmed time still stands."
          : accessPending
            ? "Confirmed for today; property access is not confirmed."
            : "Confirmed for today.",
      reasonCode: !confirmed
        ? "proposed_not_confirmed"
        : a.state === "reschedule_requested"
          ? "reschedule_requested"
          : accessPending
            ? "access_unconfirmed"
            : "confirmed_today",
      records,
      ownerId: a.hostStaffId,
      // Overdue only once a confirmed meeting's start has passed without an outcome.
      due: { at: startsAt.toISOString(), overdue: confirmed && started },
      severity: "due",
      action: {
        kind: !confirmed
          ? "confirm_appointment"
          : started
            ? "record_appointment_outcome"
            : "open_appointment",
        target,
      },
      sortAt: startsAt.getTime(),
    };
  });
}

/** Pending approvals the actor can decide. They have no owner until someone decides. */
async function approvalRows(db: Executor, kinds: readonly ApprovalKind[]): Promise<Candidate[]> {
  const rows = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.state, "pending"), inArray(approvals.kind, [...kinds])));
  return rows.map((a) => {
    const target = ref("approval", a.id);
    return {
      id: `approval:${a.id}`,
      kind: "approval",
      section: "blocking_approvals",
      title: `Review ${a.kind.replaceAll("_", " ")} approval`,
      reason: `Pending since ${a.createdAt.toISOString()}; ${a.subjectType.replaceAll("_", " ")} version ${a.subjectVersion} waits on it.`,
      reasonCode: "approval_pending",
      records: [target],
      ownerId: null,
      due: null,
      severity: "due",
      action: { kind: "review_approval", target },
      sortAt: a.createdAt.getTime(),
    };
  });
}

/** For the empty state: the next dated open task of the actor. */
async function nextDueAt(db: Executor, actor: Actor, now: Date): Promise<string | null> {
  const [row] = await db
    .select({
      at: sql<Date | null>`min(coalesce(case when ${tasks.state} = 'waiting' then ${tasks.followUpAt} end, ${tasks.dueAt}))`,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.ownerStaffId, actor.id),
        inArray(tasks.state, [...openTaskStates]),
        or(gte(tasks.dueAt, now), gte(tasks.followUpAt, now)),
      ),
    );
  const at = row?.at;
  return at ? new Date(at).toISOString() : null;
}
