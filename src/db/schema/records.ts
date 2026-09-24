// Activity timeline, restricted audit log and operation receipts (spec §04, §07.7, §19.4,
// AD6). Activity and audit are append-only: a trigger rejects updates and deletes.
import { index, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, instant, mutable } from "./columns";
import { actorKindEnum, audienceEnum, operationStatusEnum } from "./enums";

/** Human-readable timeline entries for work; no technical payload. */
export const activityEvents = pgTable(
  "activity_events",
  {
    id: id(),
    recordType: text("record_type").notNull(),
    recordId: uuid("record_id").notNull(),
    reference: text("reference"),
    messageKey: text("message_key").notNull(),
    params: jsonb("params").notNull().default({}),
    summary: text("summary").notNull(),
    /** Internal by default; client-visible entries are a curated, factual summary. */
    audience: audienceEnum("audience").notNull().default("internal"),
    actorKind: actorKindEnum("actor_kind").notNull(),
    actorId: text("actor_id").notNull(),
    operationId: text("operation_id"),
    occurredAt: instant("occurred_at").notNull().defaultNow(),
  },
  (t) => [index("activity_events_record_idx").on(t.recordType, t.recordId, t.occurredAt)],
);

/** Restricted technical audit trail, readable only with audit.read. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    action: text("action").notNull(),
    operationId: text("operation_id"),
    actorKind: actorKindEnum("actor_kind").notNull(),
    actorId: text("actor_id").notNull(),
    capability: text("capability"),
    recordType: text("record_type"),
    recordId: uuid("record_id"),
    payload: jsonb("payload").notNull(),
    /** Correlation id of the request, for joining with logs. */
    correlationId: text("correlation_id"),
    occurredAt: instant("occurred_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_record_idx").on(t.recordType, t.recordId, t.occurredAt),
    index("audit_log_operation_idx").on(t.operationId),
  ],
);

/**
 * One row per logical consequential command. The unique key (actor, operation type,
 * idempotency key) makes reloads, second tabs and worker retries converge on one outcome.
 */
export const operationReceipts = pgTable(
  "operation_receipts",
  {
    ...mutable(),
    actorKind: actorKindEnum("actor_kind").notNull(),
    /** Account id, or the submission-scoped id of an anonymous visitor. */
    actorId: text("actor_id").notNull(),
    operationType: text("operation_type").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    /** SHA-256 of the canonical request; a reused key with another body is rejected. */
    requestHash: text("request_hash").notNull(),
    status: operationStatusEnum("status").notNull().default("accepted"),
    outcome: jsonb("outcome"),
    resultType: text("result_type"),
    resultId: uuid("result_id"),
    completedAt: instant("completed_at"),
  },
  (t) => [
    uniqueIndex("operation_receipts_key_idx").on(
      t.actorKind,
      t.actorId,
      t.operationType,
      t.idempotencyKey,
    ),
    index("operation_receipts_status_idx").on(t.status, t.updatedAt),
  ],
);
