// Operation receipts (AD6, spec §19.4, A18, A40, A72). A consequential command runs at most
// once per (actor, type, idempotency key): the first call executes in a transaction that also
// stores its outcome; an identical retry gets that stored outcome back; the same key with a
// different request is a conflict; a duplicate arriving while the first is still running is
// told it is pending; and an external effect whose result is unknown is parked as
// outcome_unknown for reconciliation instead of being re-run.
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { operationReceipts } from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import { decideReplay, type OperationStatus } from "@/domain/operation-receipt";
import type { Executor, Transaction } from "./db";
import { AppError, type ErrorCode, isAppError } from "./errors";

export interface OperationInput {
  readonly actor: Actor;
  /** Command name, e.g. `inquiry.submit` or `inquiry.transition`. */
  readonly type: string;
  readonly idempotencyKey: string;
  /** `hashRequest(body)` of the command as submitted; it must include `expectedVersion`. */
  readonly requestHash: string;
  readonly expectedVersion?: number;
}

export interface OperationContext {
  readonly tx: Transaction;
  /** Receipt id; activity and audit entries carry it as the operation id. */
  readonly operationId: string;
  readonly actor: Actor;
  readonly expectedVersion?: number;
}

export interface OperationSuccess<T> {
  readonly operationId: string;
  /** True when this is a retry answered from the stored receipt. */
  readonly replayed: boolean;
  /** The JSON form of what the command returned; identical on first run and on replay. */
  readonly outcome: T;
}

interface StoredFailure {
  readonly code: ErrorCode;
  readonly fieldErrors?: Record<string, string[]>;
  readonly current?: unknown;
}

type Settled<T> =
  | { readonly kind: "success"; readonly value: OperationSuccess<T> }
  | { readonly kind: "error"; readonly error: AppError };

function toJson<T>(value: T): T {
  return value === undefined ? (null as T) : JSON.parse(JSON.stringify(value));
}

function failureError(failure: StoredFailure): AppError {
  return new AppError(failure.code, {
    ...(failure.fieldErrors ? { fieldErrors: failure.fieldErrors } : {}),
    ...(failure.current !== undefined ? { current: failure.current } : {}),
  });
}

/**
 * Runs `fn` once for this idempotency key. Throws `AppError` for a failure (the same one on
 * every retry), `idempotency_key_reused`, `operation_pending` or `outcome_unknown`.
 *
 * `fn` runs inside a savepoint: a non-retryable `AppError` it throws is stored as the failed
 * outcome; one with `outcome: "unknown"` parks the receipt as outcome_unknown; anything else
 * (including retryable errors) rolls everything back and leaves no receipt, so a retry runs.
 */
export async function runOperation<T>(
  db: Executor,
  input: OperationInput,
  fn: (ctx: OperationContext) => Promise<T>,
): Promise<OperationSuccess<T>> {
  const { actor, type, idempotencyKey, requestHash } = input;
  const settled = await db.transaction(async (tx): Promise<Settled<T>> => {
    // Serializes calls for one key; a concurrent holder means the first call is in flight.
    const lockKey = JSON.stringify([actor.kind, actor.id, type, idempotencyKey]);
    const [lock] = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) as locked`,
    );
    if (!lock?.locked) return { kind: "error", error: new AppError("operation_pending") };

    const [existing] = await tx
      .select()
      .from(operationReceipts)
      .where(
        and(
          eq(operationReceipts.actorKind, actor.kind),
          eq(operationReceipts.actorId, actor.id),
          eq(operationReceipts.operationType, type),
          eq(operationReceipts.idempotencyKey, idempotencyKey),
        ),
      );
    const decision = decideReplay(
      existing ? { ...existing, resultReference: existing.resultId ?? undefined } : null,
      requestHash,
    );
    if (decision.action === "reject") {
      return { kind: "error", error: new AppError("idempotency_key_reused") };
    }
    if (existing && decision.action !== "execute") {
      switch (existing.status) {
        case "succeeded":
          return {
            kind: "success",
            value: { operationId: existing.id, replayed: true, outcome: existing.outcome as T },
          };
        case "failed":
          return { kind: "error", error: failureError(existing.outcome as StoredFailure) };
        case "outcome_unknown":
          return { kind: "error", error: new AppError("outcome_unknown") };
        default:
          return { kind: "error", error: new AppError("operation_pending") };
      }
    }

    const [receipt] = await tx
      .insert(operationReceipts)
      .values({
        actorKind: actor.kind,
        actorId: actor.id,
        operationType: type,
        idempotencyKey,
        requestHash,
        status: "in_progress",
      })
      .returning({ id: operationReceipts.id });
    if (!receipt) throw new Error("Operation receipt insert returned no row.");
    const operationId = receipt.id;

    const settle = (status: OperationStatus, outcome: unknown) =>
      tx
        .update(operationReceipts)
        .set({
          status,
          outcome,
          completedAt: new Date(),
          version: sql`${operationReceipts.version} + 1`,
        })
        .where(eq(operationReceipts.id, operationId));

    try {
      const result = toJson(
        await tx.transaction((sp) =>
          fn({
            tx: sp,
            operationId,
            actor,
            ...(input.expectedVersion !== undefined
              ? { expectedVersion: input.expectedVersion }
              : {}),
          }),
        ),
      );
      await settle("succeeded", result);
      return { kind: "success", value: { operationId, replayed: false, outcome: result } };
    } catch (error) {
      if (!isAppError(error)) throw error;
      if (error.outcome === "unknown") {
        await settle("outcome_unknown", { code: error.code });
        return { kind: "error", error: new AppError("outcome_unknown", { cause: error }) };
      }
      if (error.retryable) throw error;
      const failure: StoredFailure = {
        code: error.code,
        ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
        ...(error.current !== undefined ? { current: toJson(error.current) } : {}),
      };
      await settle("failed", failure);
      return { kind: "error", error: failureError(failure) };
    }
  });
  if (settled.kind === "error") throw settled.error;
  return settled.value;
}

export interface OperationView {
  readonly operationId: string;
  readonly status: OperationStatus;
  readonly outcome: unknown;
}

/** Looks up a command by its key, for "did my timed-out submission go through?" (A18). */
export async function findOperation(
  db: Executor,
  actor: Actor,
  type: string,
  idempotencyKey: string,
): Promise<OperationView | null> {
  const [row] = await db
    .select({
      operationId: operationReceipts.id,
      status: operationReceipts.status,
      outcome: operationReceipts.outcome,
    })
    .from(operationReceipts)
    .where(
      and(
        eq(operationReceipts.actorKind, actor.kind),
        eq(operationReceipts.actorId, actor.id),
        eq(operationReceipts.operationType, type),
        eq(operationReceipts.idempotencyKey, idempotencyKey),
      ),
    );
  return row ?? null;
}

/**
 * Records what reconciliation established for an outcome_unknown operation. Returns false if
 * the operation was not awaiting reconciliation (already settled by someone else).
 */
export async function reconcileOperation(
  db: Executor,
  operationId: string,
  settlement: { status: "succeeded"; outcome: unknown } | { status: "failed"; code: ErrorCode },
): Promise<boolean> {
  const outcome =
    settlement.status === "succeeded" ? toJson(settlement.outcome) : { code: settlement.code };
  const rows = await db
    .update(operationReceipts)
    .set({
      status: settlement.status,
      outcome,
      completedAt: new Date(),
      version: sql`${operationReceipts.version} + 1`,
    })
    .where(
      and(eq(operationReceipts.id, operationId), eq(operationReceipts.status, "outcome_unknown")),
    )
    .returning({ id: operationReceipts.id });
  return rows.length === 1;
}
