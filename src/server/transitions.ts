// Executes a domain transition (spec §07.7, AD4): capability, optimistic version, transition
// table and evidence guard are checked by the domain contract; the change, its activity entry
// and its audit record are written in one transaction.
import "server-only";
import { and, eq, getTableColumns } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Actor } from "@/domain/capabilities";
import { applyTransition, type TransitionSpec, type VersionedRecord } from "@/domain/transition";
import { type ActivityAudience, recordActivity } from "./activity";
import { recordAudit } from "./audit";
import { grantsFor, type Resource } from "./authz";
import type { Executor, Transaction } from "./db";
import { AppError } from "./errors";

type Parents = Pick<Resource, "caseId" | "propertyId" | "audience">;

/** How a transition reads and writes one kind of record. */
export interface RecordStore<S extends string, R extends VersionedRecord<S>> {
  /** Loads the record and locks it for the rest of the transaction; null if absent. */
  load(tx: Transaction, id: string): Promise<R | null>;
  /**
   * Writes the new state and version; must only succeed from `expectedVersion`. Fields the
   * transition's evidence changes (owner, reason) are written by the caller in the same
   * transaction, before the transition when a database constraint depends on them.
   */
  save(tx: Transaction, next: R, expectedVersion: number): Promise<void>;
  /** Parent records whose relationships also grant access to this one, and its audience. */
  parents?(record: R): Parents;
}

export interface TransitionCommand<S extends string, E> {
  readonly actor: Actor;
  readonly recordId: string;
  readonly expectedVersion: number;
  readonly to: S;
  readonly evidence: E;
  /** Operation receipt id (see runOperation) shared by every retry of this command. */
  readonly operationId: string;
  readonly reason?: string;
  /** Who sees the timeline entry; internal unless the change is meant for participants. */
  readonly audience?: ActivityAudience;
  readonly correlationId?: string;
  readonly now?: Date;
}

export type TransitionOutcome<R> =
  | { readonly outcome: "applied"; readonly record: R }
  | { readonly outcome: "denied"; readonly code: string }
  | { readonly outcome: "version_conflict"; readonly current: R };

/**
 * Applies `command` to the record. A missing record throws `not_found`; everything else is
 * returned so the caller can show a comparison on conflict or the reason for a denial.
 */
export function executeTransition<S extends string, E, R extends VersionedRecord<S>>(
  db: Executor,
  spec: TransitionSpec<S, E>,
  store: RecordStore<S, R>,
  command: TransitionCommand<S, E>,
): Promise<TransitionOutcome<R>> {
  return db.transaction(async (tx) => {
    const now = command.now ?? new Date();
    const record = await store.load(tx, command.recordId);
    if (!record) throw new AppError("not_found");

    const resource: Resource = {
      type: spec.recordType,
      id: record.id,
      ...(record.locale ? { locale: record.locale } : {}),
      ...store.parents?.(record),
    };
    const result = applyTransition(spec, record, {
      actor: command.actor,
      capabilities: await grantsFor(tx, command.actor, resource, now),
      expectedVersion: command.expectedVersion,
      to: command.to,
      evidence: command.evidence,
      operationId: command.operationId,
      at: now.toISOString(),
      ...(command.reason ? { reason: command.reason } : {}),
    });
    if (result.outcome === "denied") return { outcome: "denied", code: result.code };
    if (result.outcome === "version_conflict") {
      return { outcome: "version_conflict", current: result.current };
    }

    await store.save(tx, result.record, command.expectedVersion);
    const { activity, audit } = result;
    await recordActivity(tx, {
      recordType: activity.recordType,
      recordId: activity.recordId,
      ...(activity.reference ? { reference: activity.reference } : {}),
      messageKey: activity.messageKey,
      params: { from: audit.fromState, to: audit.toState },
      summary: activity.summary,
      audience: command.audience ?? "internal",
      actor: activity.actor,
      operationId: activity.operationId,
      at: now,
    });
    await recordAudit(tx, {
      action: audit.action,
      actor: audit.actor,
      capability: audit.capability,
      recordType: audit.recordType,
      recordId: audit.recordId,
      operationId: audit.operationId,
      ...(command.correlationId ? { correlationId: command.correlationId } : {}),
      payload: {
        fromState: audit.fromState,
        toState: audit.toState,
        expectedVersion: audit.expectedVersion,
        newVersion: audit.newVersion,
        evidence: audit.evidence,
        ...(audit.reason ? { reason: audit.reason } : {}),
      },
      at: now,
    });
    return { outcome: "applied", record: result.record };
  });
}

interface TableStoreColumns {
  readonly id: PgColumn;
  readonly version: PgColumn;
  readonly state: PgColumn;
  readonly reference?: PgColumn;
  readonly locale?: PgColumn;
  readonly caseId?: PgColumn;
  readonly propertyId?: PgColumn;
  readonly audience?: PgColumn;
}

type TableRecord<S extends string> = VersionedRecord<S> & Parents;

/** A RecordStore for a table with `id`, `version` and a state column. */
export function tableStore<S extends string>(
  table: PgTable,
  columns: TableStoreColumns,
): RecordStore<S, TableRecord<S>> {
  const keyOf = (column: PgColumn) => {
    const entry = Object.entries(getTableColumns(table)).find(([, c]) => c === column);
    if (!entry) throw new Error(`Column ${column.name} is not in this table.`);
    return entry[0];
  };
  const stateKey = keyOf(columns.state);
  const versionKey = keyOf(columns.version);
  const optional = (["reference", "locale", "caseId", "propertyId", "audience"] as const).filter(
    (name) => columns[name],
  );

  return {
    async load(tx, id) {
      const selection: Record<string, PgColumn> = {
        id: columns.id,
        version: columns.version,
        state: columns.state,
      };
      for (const name of optional) selection[name] = columns[name] as PgColumn;
      const [row] = (await tx
        .select(selection)
        .from(table)
        .where(eq(columns.id, id))
        .for("update")) as Array<Record<string, unknown>>;
      if (!row) return null;
      const record: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) if (value != null) record[key] = value;
      return record as unknown as TableRecord<S>;
    },
    async save(tx, next, expectedVersion) {
      const updated = await tx
        .update(table)
        .set({ [stateKey]: next.state, [versionKey]: next.version })
        .where(and(eq(columns.id, next.id), eq(columns.version, expectedVersion)))
        .returning({ id: columns.id });
      if (updated.length !== 1) throw new AppError("version_conflict");
    },
    parents(record) {
      return {
        ...(record.caseId ? { caseId: record.caseId } : {}),
        ...(record.propertyId ? { propertyId: record.propertyId } : {}),
        ...(record.audience ? { audience: record.audience } : {}),
      };
    },
  };
}
