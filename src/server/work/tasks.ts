// O18 Tasks and next actions (spec §07.6, F19, F20, A45). Completion records what happened with
// evidence text; a missed call is an attempted contact, not a completion; snoozing needs a next
// review point and never moves the due point of a promise, so a missed commitment stays missed.
import "server-only";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { cases, inquiries, listings, staffAccounts, tasks } from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import {
  type CommitmentKind,
  commitmentKinds,
  highImpactTaskTypes,
  type TaskState,
  type TaskType,
  taskStates,
  taskTransitions,
} from "@/domain/task";
import { recordActivity } from "../activity";
import { recordAudit } from "../audit";
import { can } from "../authz";
import type { Executor, Transaction } from "../db";
import { AppError } from "../errors";
import { executeTransition, tableStore } from "../transitions";
import {
  applied,
  authorize,
  bumpTask,
  type CommandOptions,
  type CommandResult,
  checkVersion,
  denied,
  dueView,
  invalid,
  lockInquiry,
  lockTask,
  openInquiryStates,
  openTaskStates,
  ownerRef,
  parseInstant,
  patchedStore,
  ref,
  requiredText,
  requireId,
  requireStaff,
  runCommand,
  staffNames,
  taskResource,
  type VersionedCommand,
} from "./shared";
import type { RecordRef, TaskRow } from "./types";

const taskBase = tableStore<TaskState>(tasks, {
  id: tasks.id,
  version: tasks.version,
  state: tasks.state,
  caseId: tasks.caseId,
});

function taskStore(patch: Partial<typeof tasks.$inferInsert>) {
  return patchedStore(taskBase, (tx, next, expectedVersion) =>
    tx
      .update(tasks)
      .set({ ...patch, state: next.state, version: next.version })
      .where(and(eq(tasks.id, next.id), eq(tasks.version, expectedVersion)))
      .returning({ id: tasks.id }),
  );
}

// Listing.

export interface TaskFilters {
  /** Whose tasks: the actor's (default), unowned ones, or everyone's. */
  readonly view?: "mine" | "unassigned" | "all";
  /** Defaults to open, in progress and waiting. */
  readonly states?: readonly TaskState[];
  readonly inquiryId?: string;
  readonly caseId?: string;
  /** Only tasks due (or to be reviewed) before this ISO instant. */
  readonly dueBefore?: string;
  readonly limit?: number;
  readonly now?: Date;
}

/** Tasks ordered by due point (undated last), then age. */
export async function listTasks(
  db: Executor,
  actor: Actor,
  filters: TaskFilters = {},
): Promise<TaskRow[]> {
  requireStaff(actor);
  const now = filters.now ?? new Date();
  if (!(await can(db, actor, "task.manage", undefined, now))) throw new AppError("forbidden");
  const states = filters.states ?? openTaskStates;
  if (!states.length || states.some((s) => !taskStates.includes(s))) {
    throw invalid("states", "invalid_state");
  }
  const view = filters.view ?? "mine";
  const effectiveDue = sql`coalesce(case when ${tasks.state} = 'waiting' then ${tasks.followUpAt} end, ${tasks.dueAt})`;
  const conditions = [
    inArray(tasks.state, [...states]),
    view === "mine" ? eq(tasks.ownerStaffId, actor.id) : undefined,
    view === "unassigned" ? isNull(tasks.ownerStaffId) : undefined,
    filters.inquiryId ? eq(tasks.inquiryId, requireId(filters.inquiryId, "inquiryId")) : undefined,
    filters.caseId ? eq(tasks.caseId, requireId(filters.caseId, "caseId")) : undefined,
    filters.dueBefore
      ? sql`${effectiveDue} < ${parseInstant(filters.dueBefore, "dueBefore").toISOString()}::timestamptz`
      : undefined,
  ];
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
    .where(and(...conditions))
    .orderBy(sql`${effectiveDue} asc nulls last`, asc(tasks.createdAt), asc(tasks.id))
    .limit(Math.min(Math.max(filters.limit ?? 200, 1), 500));
  const names = await staffNames(
    db,
    rows.flatMap((r) => [r.task.ownerStaffId, r.task.pendingOwnerStaffId]),
  );
  return rows.map((r) => toTaskRow(r.task, r, names, now));
}

export function toTaskRow(
  task: typeof tasks.$inferSelect,
  refs: {
    inquiryReference: string | null;
    caseReference: string | null;
    listingReference: string | null;
  },
  names: Map<string, string>,
  now: Date,
): TaskRow {
  const records: RecordRef[] = [];
  if (task.inquiryId) records.push(ref("inquiry", task.inquiryId, refs.inquiryReference));
  if (task.caseId) records.push(ref("case", task.caseId, refs.caseReference));
  if (task.listingId) records.push(ref("listing", task.listingId, refs.listingReference));
  const done = task.state === "done" || task.state === "cancelled";
  return {
    task: ref("task", task.id),
    version: task.version,
    title: task.title,
    purpose: task.purpose,
    type: task.type,
    commitment: task.commitment,
    state: task.state,
    owner: ownerRef(names, task.ownerStaffId),
    pendingOwner: ownerRef(names, task.pendingOwnerStaffId),
    due: done
      ? task.dueAt
        ? { at: task.dueAt.toISOString(), overdue: false }
        : null
      : dueView(task.dueAt, now),
    dueTimezone: task.dueTimezone,
    waitingOn: task.waitingOn,
    reviewAt: task.followUpAt?.toISOString() ?? null,
    evidenceRequired: task.evidenceRequired,
    highImpact: (highImpactTaskTypes as readonly TaskType[]).includes(task.type),
    outcomeNote: task.outcomeNote,
    completedAt: task.completedAt?.toISOString() ?? null,
    records,
  };
}

// Completion.

export interface CompleteTaskInput extends VersionedCommand {
  readonly taskId: string;
  readonly evidence: {
    /** `attempted_contact` records the attempt and leaves the task open (F19). */
    readonly outcome: "completed" | "attempted_contact";
    /** What actually happened. Required. */
    readonly note: string;
    readonly evidenceIds?: readonly string[];
  };
}

export interface CompleteTaskOutcome {
  readonly taskId: string;
  readonly version: number;
  readonly state: TaskState;
  readonly completed: boolean;
}

export async function completeTask(
  db: Executor,
  actor: Actor,
  input: CompleteTaskInput,
  options: CommandOptions = {},
): Promise<CommandResult<CompleteTaskOutcome>> {
  requireStaff(actor);
  const now = options.now ?? new Date();
  const note = requiredText(input.evidence?.note, "evidence.note");
  const outcome = input.evidence.outcome;
  if (outcome !== "completed" && outcome !== "attempted_contact") {
    throw invalid("evidence.outcome", "invalid_outcome");
  }
  return runCommand(db, actor, "task.complete", input, async ({ tx, operationId }) => {
    const task = await lockTask(tx, input.taskId);
    await authorize(tx, actor, "task.manage", null, taskResource(task), now);

    if (outcome === "attempted_contact") {
      checkVersion(task, input.expectedVersion);
      if (!openTaskStates.includes(task.state)) throw denied("task_closed");
      const version = await bumpTask(tx, task.id, input.expectedVersion, {});
      for (const record of [
        { type: "task", id: task.id },
        ...(task.inquiryId ? [{ type: "inquiry", id: task.inquiryId }] : []),
      ]) {
        await recordActivity(tx, {
          recordType: record.type,
          recordId: record.id,
          messageKey: "activity.task.contact_attempted",
          params: { taskId: task.id, note },
          summary: `Contact attempted for "${task.title}"; the task stays open.`,
          actor,
          operationId,
          at: now,
        });
      }
      await recordAudit(tx, {
        action: "task.contact_attempted",
        actor,
        capability: "task.manage",
        recordType: "task",
        recordId: task.id,
        operationId,
        ...(options.correlationId ? { correlationId: options.correlationId } : {}),
        payload: { expectedVersion: input.expectedVersion, newVersion: version },
        at: now,
      });
      return { taskId: task.id, version, state: task.state, completed: false };
    }

    const evidenceIds = input.evidence.evidenceIds?.length ? [...input.evidence.evidenceIds] : null;
    const record = applied(
      await executeTransition(
        tx,
        taskTransitions,
        taskStore({
          outcomeNote: note,
          evidenceIds,
          completedAt: now,
          completedByStaffId: actor.id,
        }),
        {
          actor,
          recordId: task.id,
          expectedVersion: input.expectedVersion,
          to: "done",
          evidence: {
            outcomeNote: note,
            ...(evidenceIds ? { evidenceIds } : {}),
            evidenceRequired: task.evidenceRequired,
          },
          operationId,
          now,
          ...(options.correlationId ? { correlationId: options.correlationId } : {}),
        },
      ),
    );
    return { taskId: task.id, version: record.version, state: record.state, completed: true };
  });
}

// Snoozing.

export interface SnoozeTaskInput extends VersionedCommand {
  readonly taskId: string;
  /** ISO instant of the next review point. Required and in the future. */
  readonly until: string;
  readonly reason?: string;
}

export async function snoozeTask(
  db: Executor,
  actor: Actor,
  input: SnoozeTaskInput,
  options: CommandOptions = {},
): Promise<CommandResult<{ taskId: string; version: number; reviewAt: string }>> {
  requireStaff(actor);
  const now = options.now ?? new Date();
  if (!input.until) throw invalid("until", "next_review_point_required");
  const until = parseInstant(input.until, "until");
  if (until <= now) throw invalid("until", "must_be_in_future");
  return runCommand(db, actor, "task.snooze", input, async ({ tx, operationId }) => {
    const task = await lockTask(tx, input.taskId);
    await authorize(tx, actor, "task.manage", null, taskResource(task), now);
    checkVersion(task, input.expectedVersion);
    if (!openTaskStates.includes(task.state)) throw denied("task_closed");
    // The due point is untouched: a promise already missed stays visible as missed (A45).
    const version = await bumpTask(tx, task.id, input.expectedVersion, { followUpAt: until });
    await recordActivity(tx, {
      recordType: "task",
      recordId: task.id,
      messageKey: "activity.task.snoozed",
      params: { until: until.toISOString(), reason: input.reason ?? null },
      summary: `"${task.title}" snoozed until ${until.toISOString()}.`,
      actor,
      operationId,
      at: now,
    });
    await recordAudit(tx, {
      action: "task.snooze",
      actor,
      capability: "task.manage",
      recordType: "task",
      recordId: task.id,
      operationId,
      ...(options.correlationId ? { correlationId: options.correlationId } : {}),
      payload: {
        expectedVersion: input.expectedVersion,
        newVersion: version,
        until: until.toISOString(),
        previousReviewAt: task.followUpAt?.toISOString() ?? null,
      },
      at: now,
    });
    return { taskId: task.id, version, reviewAt: until.toISOString() };
  });
}

// Next action (F18 step 7, F20).

export interface SetNextActionInput extends VersionedCommand {
  /**
   * Exactly one target. `taskId` updates that task (`expectedVersion` is the task's); an
   * inquiry or case gets a new task and `expectedVersion` is that record's version.
   */
  readonly taskId?: string;
  readonly inquiryId?: string;
  readonly caseId?: string;
  readonly title: string;
  /** ISO instant. */
  readonly dueAt: string;
  /** IANA timezone the due point was agreed in. */
  readonly dueTimezone?: string;
  readonly commitment?: CommitmentKind;
  readonly ownerStaffId?: string;
}

export interface NextActionOutcome {
  readonly taskId: string;
  readonly taskVersion: number;
  /** New version of the inquiry or case whose next action changed. */
  readonly targetVersion: number;
}

export async function setNextAction(
  db: Executor,
  actor: Actor,
  input: SetNextActionInput,
  options: CommandOptions = {},
): Promise<CommandResult<NextActionOutcome>> {
  requireStaff(actor);
  const now = options.now ?? new Date();
  const targets = [input.taskId, input.inquiryId, input.caseId].filter(Boolean);
  if (targets.length !== 1) throw invalid("target", "exactly_one_target_required");
  const title = requiredText(input.title, "title");
  const dueAt = parseInstant(input.dueAt, "dueAt");
  if (input.commitment && !commitmentKinds.includes(input.commitment)) {
    throw invalid("commitment", "invalid_commitment");
  }
  return runCommand(db, actor, "work.set_next_action", input, async ({ tx, operationId }) => {
    const ctx = { tx, actor, operationId, now, correlationId: options.correlationId };
    if (input.taskId) {
      const task = await lockTask(tx, input.taskId);
      await authorize(tx, actor, "task.manage", null, taskResource(task), now);
      checkVersion(task, input.expectedVersion);
      if (!openTaskStates.includes(task.state)) throw denied("task_closed");
      // A missed promise is completed or cancelled with what happened, never re-dated (A45).
      if (task.commitment === "client_promise" && task.dueAt && task.dueAt < now) {
        throw denied("missed_commitment");
      }
      const owner = input.ownerStaffId ? await activeStaff(tx, input.ownerStaffId) : undefined;
      const version = await bumpTask(tx, task.id, input.expectedVersion, {
        title,
        dueAt,
        dueTimezone: input.dueTimezone ?? task.dueTimezone,
        ...(input.commitment ? { commitment: input.commitment } : {}),
        ...(owner ? { ownerStaffId: owner } : {}),
      });
      await taskEvent(ctx, task.id, "activity.task.rescheduled", `Next action set: "${title}".`, {
        dueAt: dueAt.toISOString(),
        previousDueAt: task.dueAt?.toISOString() ?? null,
      });
      return { taskId: task.id, taskVersion: version, targetVersion: version };
    }

    if (input.inquiryId) {
      const inquiry = await lockInquiry(tx, input.inquiryId);
      await authorize(
        tx,
        actor,
        "inquiry.read",
        "task.manage",
        { type: "inquiry", id: inquiry.id },
        now,
      );
      checkVersion(inquiry, input.expectedVersion);
      if (!openInquiryStates.includes(inquiry.state)) throw denied("inquiry_closed");
      const [bumped] = await tx
        .update(inquiries)
        .set({ version: sql`${inquiries.version} + 1` })
        .where(and(eq(inquiries.id, inquiry.id), eq(inquiries.version, input.expectedVersion)))
        .returning({ version: inquiries.version });
      if (!bumped) throw new AppError("version_conflict");
      const taskId = await createTask(ctx, {
        title,
        dueAt,
        dueTimezone: input.dueTimezone ?? null,
        commitment: input.commitment ?? "internal",
        ownerStaffId: input.ownerStaffId
          ? await activeStaff(tx, input.ownerStaffId)
          : (inquiry.ownerStaffId ?? actor.id),
        inquiryId: inquiry.id,
        caseId: inquiry.caseId,
        listingId: inquiry.listingId,
        parent: { type: "inquiry", id: inquiry.id, reference: inquiry.reference },
      });
      return { taskId, taskVersion: 1, targetVersion: bumped.version };
    }

    const caseId = requireId(input.caseId, "caseId");
    const [row] = await tx.select().from(cases).where(eq(cases.id, caseId)).for("update");
    if (!row) throw new AppError("not_found");
    await authorize(tx, actor, "case.read", "task.manage", { type: "case", id: row.id }, now);
    checkVersion({ id: row.id, version: row.version, state: row.stage }, input.expectedVersion);
    const [bumped] = await tx
      .update(cases)
      .set({ nextActionSummary: title, nextActionDueAt: dueAt, version: sql`${cases.version} + 1` })
      .where(and(eq(cases.id, row.id), eq(cases.version, input.expectedVersion)))
      .returning({ version: cases.version });
    if (!bumped) throw new AppError("version_conflict");
    const taskId = await createTask(ctx, {
      title,
      dueAt,
      dueTimezone: input.dueTimezone ?? null,
      commitment: input.commitment ?? "internal",
      ownerStaffId: input.ownerStaffId
        ? await activeStaff(tx, input.ownerStaffId)
        : (row.ownerStaffId ?? actor.id),
      caseId: row.id,
      parent: { type: "case", id: row.id, reference: row.reference },
    });
    return { taskId, taskVersion: 1, targetVersion: bumped.version };
  });
}

interface EventContext {
  readonly tx: Transaction;
  readonly actor: Actor;
  readonly operationId: string;
  readonly now: Date;
  readonly correlationId?: string | undefined;
}

async function taskEvent(
  ctx: EventContext,
  taskId: string,
  messageKey: string,
  summary: string,
  params: Record<string, unknown>,
): Promise<void> {
  await recordActivity(ctx.tx, {
    recordType: "task",
    recordId: taskId,
    messageKey,
    params,
    summary,
    actor: ctx.actor,
    operationId: ctx.operationId,
    at: ctx.now,
  });
  await recordAudit(ctx.tx, {
    action: messageKey.replace(/^activity\./, ""),
    actor: ctx.actor,
    capability: "task.manage",
    recordType: "task",
    recordId: taskId,
    operationId: ctx.operationId,
    ...(ctx.correlationId ? { correlationId: ctx.correlationId } : {}),
    payload: params,
    at: ctx.now,
  });
}

async function activeStaff(tx: Transaction, id: string): Promise<string> {
  requireId(id, "ownerStaffId");
  const [row] = await tx
    .select({ id: staffAccounts.id, status: staffAccounts.status })
    .from(staffAccounts)
    .where(eq(staffAccounts.id, id));
  if (row?.status !== "active") throw invalid("ownerStaffId", "owner_not_active");
  return row.id;
}

export interface NewTask {
  readonly title: string;
  readonly dueAt: Date;
  readonly dueTimezone: string | null;
  readonly commitment: CommitmentKind;
  readonly ownerStaffId: string;
  readonly inquiryId?: string | null;
  readonly caseId?: string | null;
  readonly listingId?: string | null;
  /** The record whose next action this is; its timeline gets an entry too. */
  readonly parent: { type: string; id: string; reference: string };
}

/** Creates a next-action task with activity on the task and its parent, and an audit record. */
export async function createTask(ctx: EventContext, task: NewTask): Promise<string> {
  const [row] = await ctx.tx
    .insert(tasks)
    .values({
      title: task.title,
      type: "follow_up",
      commitment: task.commitment,
      ownerStaffId: task.ownerStaffId,
      dueAt: task.dueAt,
      dueTimezone: task.dueTimezone,
      inquiryId: task.inquiryId ?? null,
      caseId: task.caseId ?? null,
      listingId: task.listingId ?? null,
    })
    .returning({ id: tasks.id });
  if (!row) throw new Error("Task insert returned no row.");
  const params = {
    taskId: row.id,
    title: task.title,
    dueAt: task.dueAt.toISOString(),
    commitment: task.commitment,
  };
  await recordActivity(ctx.tx, {
    recordType: task.parent.type,
    recordId: task.parent.id,
    reference: task.parent.reference,
    messageKey: `activity.${task.parent.type}.next_action_set`,
    params,
    summary: `Next action for ${task.parent.reference}: "${task.title}".`,
    actor: ctx.actor,
    operationId: ctx.operationId,
    at: ctx.now,
  });
  await taskEvent(ctx, row.id, "activity.task.created", `Task created: "${task.title}".`, {
    ...params,
    parentType: task.parent.type,
    parentId: task.parent.id,
    ownerStaffId: task.ownerStaffId,
  });
  return row.id;
}

/** Open tasks and promises on an inquiry; resolving must not drop them (A44). */
export async function openTaskCount(db: Executor, inquiryId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.inquiryId, inquiryId), inArray(tasks.state, [...openTaskStates])));
  return row?.count ?? 0;
}

/** The earliest open task of an inquiry: its next action. */
export async function nextTaskFor(db: Executor, where: { inquiryId: string }) {
  const [row] = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.inquiryId, where.inquiryId),
        inArray(tasks.state, [...openTaskStates]),
        or(sql`${tasks.dueAt} is not null`, sql`${tasks.followUpAt} is not null`),
      ),
    )
    .orderBy(
      sql`coalesce(case when ${tasks.state} = 'waiting' then ${tasks.followUpAt} end, ${tasks.dueAt}) asc nulls last`,
      asc(tasks.createdAt),
    )
    .limit(1);
  return row ?? null;
}
