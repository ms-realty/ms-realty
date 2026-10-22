import "server-only";
import { and, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { appointments, inquiries, tasks } from "@/db/schema";
import type { Capability, CapabilityGrant } from "@/domain/capabilities";
import type { Decision } from "@/domain/state-machine";
import { recordActivity } from "../activity";
import { recordAudit } from "../audit";
import { countActivePasskeys, staffPasskeyMinimum } from "../auth/passkeys";
import { requireLiveSession, type Session } from "../auth/sessions";
import type { Resource } from "../authz";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { recordOutboxEvent } from "../jobs/outbox";
import type { OperationContext } from "../operations";

export const commandEnvelope = {
  id: z.uuid(),
  operationId: z.string().min(16).max(200),
  expectedVersion: z.number().int().positive().safe(),
};
export const openTaskStates = ["open", "in_progress", "waiting"] as const;
/** Show the earliest outstanding deadline or internal review without hiding a client promise. */
export const effectiveTaskDue = sql<Date | null>`least(${tasks.dueAt}, ${tasks.followUpAt})`;
export const openAppointmentStates = [
  "requested",
  "proposed",
  "confirmed",
  "reschedule_requested",
] as const;
export const openInquiryStates = [
  "received",
  "assigned",
  "awaiting_client",
  "suspected_spam",
  "duplicate_candidate",
  "contact_unreachable",
] as const;
export type Inquiry = typeof inquiries.$inferSelect;
export type Task = typeof tasks.$inferSelect;

export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= [];
      fieldErrors[key].push(issue.message);
    }
    throw new AppError("validation_failed", { fieldErrors });
  }
  return parsed.data;
}

export async function liveStaff(db: Executor, session: Session): Promise<Session> {
  const live = await requireLiveSession(db, session);
  if (live.account.kind !== "staff") throw new AppError("not_found");
  if ((await countActivePasskeys(db, live.account.id)) < staffPasskeyMinimum)
    throw new AppError("forbidden");
  return live;
}

export function inquiryResource(row: Inquiry): Resource {
  return {
    type: "inquiry",
    id: row.id,
    ...(row.preferredLocale ? { locale: row.preferredLocale } : {}),
    ...(row.caseId ? { caseId: row.caseId } : {}),
    audience: "internal",
  };
}

export function taskResource(row: Task): Resource {
  return {
    type: "task",
    id: row.id,
    ...(row.caseId ? { caseId: row.caseId } : {}),
    audience: "internal",
  };
}

/** Apply record, parent-case and locale scopes in SQL, before ordering or pagination. */
export function visibleWhere(
  grants: readonly CapabilityGrant[],
  capability: Capability,
  type: "inquiry" | "task" | "appointment",
): SQL {
  const table = type === "inquiry" ? inquiries : type === "appointment" ? appointments : tasks;
  const branches = grants
    .filter((g) => g.capability === capability)
    .flatMap(({ scope }) => {
      const parts: SQL[] = [];
      if (scope?.expiresAt && new Date(scope.expiresAt).getTime() <= Date.now()) return [];
      if (scope?.recordType) {
        if (scope.recordType === type) {
          if (scope.recordId) parts.push(eq(table.id, scope.recordId));
        } else if (scope.recordType === "case") {
          parts.push(
            scope.recordId ? eq(table.caseId, scope.recordId) : sql`${table.caseId} is not null`,
          );
        } else return [];
      }
      if (scope?.locales) {
        if (type !== "inquiry" || !scope.locales.length) return [];
        parts.push(inArray(inquiries.preferredLocale, [...scope.locales]));
      }
      return [and(...parts) ?? sql`true`];
    });
  return or(...branches) ?? sql`false`;
}

export function version(row: { version: number }, expected: number): void {
  if (row.version !== expected)
    throw new AppError("version_conflict", { current: { version: row.version } });
}

export function allow(decision: Decision): void {
  if (decision.outcome === "denied")
    throw new AppError("transition_denied", { fieldErrors: { form: [decision.code] } });
}

export async function recordChange(
  ctx: OperationContext,
  type: "inquiry" | "task",
  id: string,
  action: string,
  capability: Capability,
  params: Record<string, unknown> = {},
): Promise<void> {
  await recordActivity(ctx.tx, {
    recordType: type,
    recordId: id,
    messageKey: `work.${action}`,
    summary: action,
    params,
    actor: ctx.actor,
    operationId: ctx.operationId,
  });
  await recordAudit(ctx.tx, {
    action: `work.${action}`,
    recordType: type,
    recordId: id,
    actor: ctx.actor,
    capability,
    operationId: ctx.operationId,
    payload: params,
  });
  await recordOutboxEvent(ctx.tx, {
    eventType: `work.${action}`,
    subjectType: type,
    subjectId: id,
    operationId: ctx.operationId,
  });
}
