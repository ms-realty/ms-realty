// Shared plumbing of the agency work services: staff-only access, command execution through
// operation receipts, transition outcomes as stable errors, and small read helpers.
import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { inquiries, staffAccounts, tasks } from "@/db/schema";
import type { Actor, Capability } from "@/domain/capabilities";
import { isUuid } from "@/domain/ids";
import type { InquiryState } from "@/domain/inquiry";
import type { TaskState } from "@/domain/task";
import { assertCan, assertCanRead, type Resource } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor, Transaction } from "../db";
import { AppError } from "../errors";
import { type OperationContext, type OperationSuccess, runOperation } from "../operations";
import type { RecordStore, TransitionOutcome } from "../transitions";
import type { DueView, OwnerRef, RecordRef, RecordType } from "./types";

/** Every consequential command names its logical operation (idempotency key). */
export interface CommandBase {
  readonly operationId: string;
}

export interface VersionedCommand extends CommandBase {
  /** Version of the record the command changes, as the actor last saw it. */
  readonly expectedVersion: number;
}

export interface CommandOptions {
  readonly now?: Date;
  readonly correlationId?: string;
}

export type CommandResult<T> = OperationSuccess<T>;

export const openInquiryStates: readonly InquiryState[] = [
  "received",
  "assigned",
  "awaiting_client",
  "ready_for_case",
  "suspected_duplicate",
];
/** States in which the owner is expected to respond to the client. */
export const respondingStates: readonly InquiryState[] = [
  "assigned",
  "awaiting_client",
  "ready_for_case",
];
export const openTaskStates: readonly TaskState[] = ["open", "in_progress", "waiting"];

/** The work surfaces are staff tools; clients, visitors and services get `forbidden`. */
export function requireStaff(actor: Actor): void {
  if (actor.kind !== "staff") throw new AppError("forbidden");
}

export function inquiryResource(row: { id: string; caseId?: string | null }): Resource {
  return { type: "inquiry", id: row.id, ...(row.caseId ? { caseId: row.caseId } : {}) };
}

export function taskResource(row: { id: string; caseId?: string | null }): Resource {
  return { type: "task", id: row.id, ...(row.caseId ? { caseId: row.caseId } : {}) };
}

/** Read access hides the record (`not_found`); the action capability then yields `forbidden`. */
export async function authorize(
  db: Executor,
  actor: Actor,
  read: Capability,
  act: Capability | null,
  resource: Resource,
  now: Date,
): Promise<void> {
  await assertCanRead(db, actor, read, resource, now);
  if (act) await assertCan(db, actor, act, resource, now);
}

/** Runs a command once per operation id; the request hash covers everything but the id. */
export async function runCommand<I extends CommandBase & { expectedVersion?: number }, T>(
  db: Executor,
  actor: Actor,
  type: string,
  input: I,
  fn: (ctx: OperationContext) => Promise<T>,
): Promise<CommandResult<T>> {
  const { operationId, ...body } = input;
  if (!operationId) {
    throw new AppError("validation_failed", { fieldErrors: { operationId: ["required"] } });
  }
  return runOperation(
    db,
    {
      actor,
      type,
      idempotencyKey: operationId,
      requestHash: hashRequest(body),
      ...(input.expectedVersion !== undefined ? { expectedVersion: input.expectedVersion } : {}),
    },
    fn,
  );
}

/** Turns a transition outcome into the record or a stable error (spec §07.7, §19.2). */
export function applied<R>(result: TransitionOutcome<R>): R {
  if (result.outcome === "applied") return result.record;
  if (result.outcome === "version_conflict") {
    throw new AppError("version_conflict", { current: result.current });
  }
  if (result.code === "missing_capability") throw new AppError("forbidden");
  throw denied(result.code);
}

export function denied(code: string): AppError {
  return new AppError("transition_denied", { fieldErrors: { transition: [code] }, detail: code });
}

export function invalid(field: string, code: string): AppError {
  return new AppError("validation_failed", { fieldErrors: { [field]: [code] } });
}

export function requiredText(value: string | undefined | null, field: string): string {
  const text = value?.trim();
  if (!text) throw invalid(field, "required");
  return text;
}

export function parseInstant(value: string | undefined | null, field: string): Date {
  const at = value ? new Date(value) : null;
  if (!at || Number.isNaN(at.getTime())) throw invalid(field, "invalid_instant");
  return at;
}

/**
 * A table store whose save also writes `patch`, so evidence columns (owner, reason, case) land
 * in the same version-checked update as the state and satisfy the table's constraints.
 */
export function patchedStore<S extends string, R extends { id: string; state: S; version: number }>(
  base: RecordStore<S, R>,
  update: (tx: Transaction, next: R, expectedVersion: number) => Promise<Array<{ id: string }>>,
): RecordStore<S, R> {
  return {
    load: base.load,
    ...(base.parents ? { parents: base.parents } : {}),
    async save(tx, next, expectedVersion) {
      const rows = await update(tx, next, expectedVersion);
      if (rows.length !== 1) throw new AppError("version_conflict");
    },
  };
}

/** A malformed id names no record: `not_found`, never a database error. */
export function recordId(id: string | undefined | null): string {
  if (!id || !isUuid(id)) throw new AppError("not_found");
  return id;
}

/** A referenced id that must be well formed. */
export function requireId(id: string | undefined | null, field: string): string {
  if (!id || !isUuid(id)) throw invalid(field, "invalid_id");
  return id;
}

/** Locks and returns an inquiry, or throws `not_found`. */
export async function lockInquiry(tx: Transaction, id: string) {
  recordId(id);
  const [row] = await tx.select().from(inquiries).where(eq(inquiries.id, id)).for("update");
  if (!row) throw new AppError("not_found");
  return row;
}

export async function lockTask(tx: Transaction, id: string) {
  recordId(id);
  const [row] = await tx.select().from(tasks).where(eq(tasks.id, id)).for("update");
  if (!row) throw new AppError("not_found");
  return row;
}

/** A stale version is a conflict carrying the current snapshot, never an overwrite. */
export function checkVersion(
  record: { id: string; version: number; state?: string },
  expected: number,
): void {
  if (record.version !== expected) {
    throw new AppError("version_conflict", {
      current: { id: record.id, version: record.version, state: record.state },
    });
  }
}

export async function bumpInquiry(
  tx: Transaction,
  id: string,
  expectedVersion: number,
  values: Partial<typeof inquiries.$inferInsert>,
): Promise<number> {
  const [row] = await tx
    .update(inquiries)
    .set({ ...values, version: sql`${inquiries.version} + 1` })
    .where(and(eq(inquiries.id, id), eq(inquiries.version, expectedVersion)))
    .returning({ version: inquiries.version });
  if (!row) throw new AppError("version_conflict");
  return row.version;
}

export async function bumpTask(
  tx: Transaction,
  id: string,
  expectedVersion: number,
  values: Partial<typeof tasks.$inferInsert>,
): Promise<number> {
  const [row] = await tx
    .update(tasks)
    .set({ ...values, version: sql`${tasks.version} + 1` })
    .where(and(eq(tasks.id, id), eq(tasks.version, expectedVersion)))
    .returning({ version: tasks.version });
  if (!row) throw new AppError("version_conflict");
  return row.version;
}

/** Display names of staff owners, by id. */
export async function staffNames(
  db: Executor,
  ids: Iterable<string | null | undefined>,
): Promise<Map<string, string>> {
  const unique = [...new Set([...ids].filter((id): id is string => Boolean(id)))];
  if (!unique.length) return new Map();
  const rows = await db
    .select({ id: staffAccounts.id, name: staffAccounts.displayName })
    .from(staffAccounts)
    .where(inArray(staffAccounts.id, unique));
  return new Map(rows.map((row) => [row.id, row.name]));
}

export function ownerRef(
  names: Map<string, string>,
  id: string | null | undefined,
): OwnerRef | null {
  if (!id) return null;
  return { staffId: id, name: names.get(id) ?? "" };
}

export function ref(type: RecordType, id: string, reference: string | null = null): RecordRef {
  return { type, id, reference };
}

export function dueView(at: Date | null | undefined, now: Date): DueView | null {
  return at ? { at: at.toISOString(), overdue: at.getTime() < now.getTime() } : null;
}
