// Operations (architecture §5.1, AT10, AT11). A consequential command runs at most
// once per (actor, type, idempotency key): the first call executes in a transaction that also
// stores its outcome; an identical retry gets that stored outcome back; the same key with a
// different request is a conflict; a duplicate arriving while the first is still running is
// told it is pending; and an external effect whose result is unknown is parked as
// outcome_unknown for reconciliation instead of being re-run.
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { operations } from "@/db/schema";
import { type ButlerReceipt, butlerReceipt } from "@/domain/butler";
import type { Actor } from "@/domain/capabilities";
import { decideReplay, type OperationStatus } from "@/domain/operation-receipt";
import { recordAudit } from "./audit";
import {
  type ButlerAuthorization,
  checkButlerAuthorization,
  isButlerOperation,
} from "./butler/authority";
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
  /** Server-selected record binding, retained even when a known failure has no result body. */
  readonly subject?: { readonly type: string; readonly id: string };
  /** Opaque authority issued by a fixed, server-only Butler action adapter. */
  readonly butlerAuthorization?: ButlerAuthorization;
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
  readonly butlerReceipt?: ButlerReceipt;
}

interface StoredButlerSuccess {
  readonly kind: "butler_outcome_v1";
  readonly result: unknown;
  readonly butlerReceipt: ButlerReceipt;
}
function storedButlerSuccess(value: unknown): value is StoredButlerSuccess {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "butler_outcome_v1" &&
    "butlerReceipt" in value
  );
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
 * Butler attempts retain a denial; historical unknown effects still require reconciliation.
 */
export async function runOperation<T>(
  db: Executor,
  input: OperationInput,
  fn: (ctx: OperationContext) => Promise<T>,
): Promise<OperationSuccess<T>> {
  const { actor, type, idempotencyKey, requestHash } = input;
  const automated = isButlerOperation(input);
  const settled = await db.transaction(async (tx): Promise<Settled<T>> => {
    // Serializes calls for one key; a concurrent holder means the first call is in flight.
    const lockKey = JSON.stringify([actor.kind, actor.id, type, idempotencyKey]);
    const [lock] = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) as locked`,
    );
    if (!lock?.locked) return { kind: "error", error: new AppError("operation_pending") };

    const [existing] = await tx
      .select()
      .from(operations)
      .where(
        and(
          eq(operations.actorKind, actor.kind),
          eq(operations.actorId, actor.id),
          eq(operations.operationType, type),
          eq(operations.idempotencyKey, idempotencyKey),
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
        case "succeeded": {
          const stored = existing.outcome;
          return {
            kind: "success",
            value: {
              operationId: existing.id,
              replayed: true,
              outcome: (storedButlerSuccess(stored) ? stored.result : stored) as T,
              ...(storedButlerSuccess(stored) ? { butlerReceipt: stored.butlerReceipt } : {}),
            },
          };
        }
        case "failed":
          return { kind: "error", error: failureError(existing.outcome as StoredFailure) };
        case "outcome_unknown":
          return {
            kind: "error",
            error: new AppError("outcome_unknown", {
              ...(automated ? { current: (existing.outcome as StoredFailure)?.current } : {}),
            }),
          };
        default:
          return { kind: "error", error: new AppError("operation_pending") };
      }
    }

    const [receipt] = await tx
      .insert(operations)
      .values({
        actorKind: actor.kind,
        actorId: actor.id,
        operationType: type,
        idempotencyKey,
        requestHash,
        expectedRevision: input.expectedVersion ?? null,
        resultType: input.subject?.type ?? null,
        resultId: input.subject?.id ?? null,
        status: "in_progress",
      })
      .returning({ id: operations.id });
    if (!receipt) throw new Error("Operation receipt insert returned no row.");
    const operationId = receipt.id;

    const settle = async (status: OperationStatus, outcome: unknown, verdict?: ButlerReceipt) => {
      await tx
        .update(operations)
        .set({
          status,
          outcome,
          completedAt: new Date(),
          version: sql`${operations.version} + 1`,
        })
        .where(eq(operations.id, operationId));
      if (verdict)
        await recordAudit(tx, {
          action: "butler.verdict",
          actor,
          operationId,
          recordType: input.subject?.type,
          recordId: input.subject?.id,
          payload: { receipt: verdict },
        });
    };

    let action = type.startsWith("butler.") ? type.slice("butler.".length) : "unclassified";
    let denial: "awaiting_approval" | "blocked" | undefined;
    let denialReason: string | undefined;

    try {
      const result = toJson(
        await tx.transaction(async (sp) => {
          const context: OperationContext = {
            tx: sp,
            operationId,
            actor,
            ...(input.expectedVersion !== undefined
              ? { expectedVersion: input.expectedVersion }
              : {}),
          };
          if (automated) {
            const checked = await checkButlerAuthorization(input, fn, context);
            action = checked.action;
            // Draft-only is an execution boundary, even for a valid registered intent.
            denial = checked.eligibility.decision;
            denialReason = checked.eligibility.reason;
            throw new AppError(
              denial === "awaiting_approval" ? "butler_approval_required" : "forbidden",
            );
          }
          return fn(context);
        }),
      );
      await settle("succeeded", result);
      return {
        kind: "success",
        value: {
          operationId,
          replayed: false,
          outcome: result,
        },
      };
    } catch (error) {
      if (!isAppError(error) && !automated) throw error;
      const failure = isAppError(error) ? error : new AppError("unavailable");
      // New Butler attempts cannot reach an effect. A failed evidence read cannot claim an
      // ambiguous external outcome; historical unknown receipts were handled by replay above.
      const known =
        automated && failure.outcome === "unknown"
          ? new AppError("unavailable", { cause: error })
          : failure;
      if (known.outcome === "unknown") {
        const verdict = automated
          ? butlerReceipt(operationId, action, "blocked", "outcome_unknown", "unknown")
          : undefined;
        const current = verdict ? { butlerReceipt: verdict } : undefined;
        await settle(
          "outcome_unknown",
          { code: known.code, ...(current ? { current } : {}) },
          verdict,
        );
        return { kind: "error", error: new AppError("outcome_unknown", { cause: error, current }) };
      }
      if (known.retryable && !automated) throw error;
      const verdict = automated
        ? butlerReceipt(
            operationId,
            action,
            denial ?? "blocked",
            denialReason ?? known.code,
            "not_applied",
          )
        : undefined;
      const storedFailure: StoredFailure = {
        code: known.code,
        ...(known.fieldErrors ? { fieldErrors: known.fieldErrors } : {}),
        ...(verdict
          ? { current: { butlerReceipt: verdict } }
          : known.current !== undefined
            ? { current: toJson(known.current) }
            : {}),
      };
      await settle("failed", storedFailure, verdict);
      return { kind: "error", error: failureError(storedFailure) };
    }
  });
  if (settled.kind === "error") throw settled.error;
  return settled.value;
}

export interface OperationView {
  readonly operationId: string;
  readonly status: OperationStatus;
  readonly outcome: unknown;
  readonly resultType: string | null;
  readonly resultId: string | null;
  readonly butlerReceipt?: ButlerReceipt;
}

/** Looks up a command by its key, for "did my timed-out submission go through?" (AT10). */
export async function findOperation(
  db: Executor,
  actor: Actor,
  type: string,
  idempotencyKey: string,
): Promise<OperationView | null> {
  const [row] = await db
    .select({
      operationId: operations.id,
      status: operations.status,
      outcome: operations.outcome,
      resultType: operations.resultType,
      resultId: operations.resultId,
    })
    .from(operations)
    .where(
      and(
        eq(operations.actorKind, actor.kind),
        eq(operations.actorId, actor.id),
        eq(operations.operationType, type),
        eq(operations.idempotencyKey, idempotencyKey),
      ),
    );
  if (!row) return null;
  const stored = row.outcome;
  const verdict = storedButlerSuccess(stored)
    ? stored.butlerReceipt
    : (stored as { current?: { butlerReceipt?: ButlerReceipt } } | null)?.current?.butlerReceipt;
  return {
    ...row,
    outcome: storedButlerSuccess(stored) ? stored.result : stored,
    ...(verdict ? { butlerReceipt: verdict } : {}),
  };
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
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(operations)
      .where(and(eq(operations.id, operationId), eq(operations.status, "outcome_unknown")))
      .for("update");
    if (!row) return false;
    const previous = (row.outcome as { current?: { butlerReceipt?: ButlerReceipt } } | null)
      ?.current?.butlerReceipt;
    const verdict = previous
      ? butlerReceipt(
          operationId,
          previous.action,
          settlement.status === "succeeded" ? "done_automatically" : "blocked",
          settlement.status === "succeeded" ? "reconciled_applied" : settlement.code,
          settlement.status === "succeeded" ? "applied" : "not_applied",
          previous.policy,
        )
      : undefined;
    const result = settlement.status === "succeeded" ? toJson(settlement.outcome) : undefined;
    const outcome =
      settlement.status === "succeeded"
        ? verdict
          ? { kind: "butler_outcome_v1", result, butlerReceipt: verdict }
          : result
        : { code: settlement.code, ...(verdict ? { current: { butlerReceipt: verdict } } : {}) };
    await tx
      .update(operations)
      .set({
        status: settlement.status,
        outcome,
        completedAt: new Date(),
        version: sql`${operations.version} + 1`,
      })
      .where(eq(operations.id, operationId));
    if (verdict)
      await recordAudit(tx, {
        action: "butler.reconciled",
        actor: { kind: row.actorKind, id: row.actorId },
        operationId,
        recordType: row.resultType ?? undefined,
        recordId: row.resultId ?? undefined,
        payload: { receipt: verdict },
      });
    return true;
  });
}
