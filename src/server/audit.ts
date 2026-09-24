// Restricted technical audit trail (spec §07.7), readable only with `audit.read`. Written in
// the same transaction as the change so a rolled-back change leaves no audit claim behind.
import "server-only";
import { auditLog } from "@/db/schema";
import type { Actor, Capability } from "@/domain/capabilities";
import type { Executor } from "./db";

export interface AuditEntry {
  /** Dotted action name, e.g. `inquiry.transition` or `session.revoke_all`. */
  readonly action: string;
  readonly actor: Actor;
  readonly capability?: Capability;
  readonly recordType?: string;
  readonly recordId?: string;
  readonly operationId?: string;
  readonly correlationId?: string;
  /** Technical detail. Never put secrets or raw tokens here. */
  readonly payload?: Record<string, unknown>;
  readonly at?: Date;
}

export async function recordAudit(db: Executor, entry: AuditEntry): Promise<string> {
  const [row] = await db
    .insert(auditLog)
    .values({
      action: entry.action,
      operationId: entry.operationId,
      actorKind: entry.actor.kind,
      actorId: entry.actor.id,
      capability: entry.capability,
      recordType: entry.recordType,
      recordId: entry.recordId,
      payload: entry.payload ?? {},
      correlationId: entry.correlationId,
      ...(entry.at ? { occurredAt: entry.at } : {}),
    })
    .returning({ id: auditLog.id });
  if (!row) throw new Error("Audit insert returned no row.");
  return row.id;
}
