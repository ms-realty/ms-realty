// Activity, audit, operations, the outbox, external actions, inbox events, privacy requests and
// release evidence (architecture §4.1, §5.1, §8.4, §15, §20.1). Activity, audit, consent and
// release evidence are append-only: a trigger rejects updates and deletes.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, instant, mutable, reference } from "./columns";
import {
  actorKindEnum,
  audienceEnum,
  evidenceEnvironmentEnum,
  externalActionKindEnum,
  externalActionStateEnum,
  inboxEventStateEnum,
  operationStatusEnum,
  outboxEventStateEnum,
  privacyRequestKindEnum,
  privacyRequestStateEnum,
  redactionStatusEnum,
} from "./enums";
import { principals } from "./identity";
import { contactMethods, parties } from "./parties";

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

/** Restricted, attributable technical history, readable only with audit.read. */
export const auditEvents = pgTable(
  "audit_events",
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
    index("audit_events_record_idx").on(t.recordType, t.recordId, t.occurredAt),
    index("audit_events_operation_idx").on(t.operationId),
  ],
);

/**
 * One row per logical consequential command (§5.1). The unique key (actor, command type,
 * idempotency key) makes reloads, second tabs and worker retries converge on one outcome; the
 * payload digest makes a reused key with another payload a conflict.
 */
export const operations = pgTable(
  "operations",
  {
    ...mutable(),
    actorKind: actorKindEnum("actor_kind").notNull(),
    /** Principal id, or the submission-scoped id of an anonymous visitor. */
    actorId: text("actor_id").notNull(),
    operationType: text("operation_type").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    /** SHA-256 of the canonical request; a reused key with another body is rejected. */
    requestHash: text("request_hash").notNull(),
    expectedRevision: integer("expected_revision"),
    status: operationStatusEnum("status").notNull().default("accepted"),
    outcome: jsonb("outcome"),
    resultType: text("result_type"),
    resultId: uuid("result_id"),
    completedAt: instant("completed_at"),
  },
  (t) => [
    uniqueIndex("operations_key_idx").on(t.actorKind, t.actorId, t.operationType, t.idempotencyKey),
    index("operations_status_idx").on(t.status, t.updatedAt),
  ],
);

/**
 * Durable business intent, committed in the same transaction as the change. The queue job is
 * only the execution item; its binding is unique so a reconciler never dispatches twice.
 */
export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: id(),
    eventType: text("event_type").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    payload: jsonb("payload").notNull().default({}),
    /** Publication generation (or other fence) the intent was created under. */
    sourceGeneration: integer("source_generation"),
    operationId: uuid("operation_id").references(() => operations.id),
    state: outboxEventStateEnum("state").notNull().default("pending"),
    dispatchJobId: text("dispatch_job_id").unique(),
    createdAt: createdAt(),
    dispatchedAt: instant("dispatched_at"),
    completedAt: instant("completed_at"),
  },
  (t) => [
    check(
      "outbox_events_dispatch_binding",
      sql`${t.state} = 'pending' or ${t.state} = 'cancelled' or ${t.dispatchJobId} is not null`,
    ),
    index("outbox_events_state_idx").on(t.state, t.createdAt),
  ],
);

/**
 * One logical external effect (an email send, a destination publish or withdrawal). A retry
 * reuses the row and its key; an unknown outcome waits for reconciliation and is never resent
 * automatically. The payload and its digest are stored before any provider call.
 */
export const externalActions = pgTable(
  "external_actions",
  {
    ...mutable(),
    kind: externalActionKindEnum("kind").notNull(),
    /** Logical effect identity, also the provider idempotency key. */
    effectKey: text("effect_key").notNull().unique(),
    subjectType: text("subject_type"),
    subjectId: uuid("subject_id"),
    sourceGeneration: integer("source_generation"),
    outboxEventId: uuid("outbox_event_id").references(() => outboxEvents.id),
    payload: jsonb("payload").notNull(),
    payloadDigest: text("payload_digest").notNull(),
    /** Values that must not outlive dispatch (sign-in links); cleared when dispatch starts. */
    secretPayload: jsonb("secret_payload"),
    state: externalActionStateEnum("state").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    provider: text("provider"),
    providerReference: text("provider_reference"),
    lastErrorCode: text("last_error_code"),
    firstAttemptAt: instant("first_attempt_at"),
    lastAttemptAt: instant("last_attempt_at"),
    acknowledgedAt: instant("acknowledged_at"),
    verifiedAt: instant("verified_at"),
    failedAt: instant("failed_at"),
    reconciledAt: instant("reconciled_at"),
    reconciledById: uuid("reconciled_by_id").references(() => principals.id),
  },
  (t) => [
    check(
      "external_actions_attempted",
      sql`${t.state} in ('queued', 'cancelled') or ${t.attempts} > 0`,
    ),
    index("external_actions_state_idx").on(t.state, t.updatedAt),
    index("external_actions_provider_idx").on(t.provider, t.providerReference),
    index("external_actions_subject_idx").on(t.subjectType, t.subjectId),
  ],
);

/** Signed provider webhooks, recorded durably and deduplicated before processing (AT48). */
export const inboxEvents = pgTable(
  "inbox_events",
  {
    id: id(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    signatureVerified: boolean("signature_verified").notNull(),
    payload: jsonb("payload").notNull(),
    state: inboxEventStateEnum("state").notNull().default("received"),
    receivedAt: instant("received_at").notNull().defaultNow(),
    processedAt: instant("processed_at"),
    errorCode: text("error_code"),
  },
  (t) => [
    uniqueIndex("inbox_events_provider_event_idx").on(t.provider, t.eventId),
    check(
      "inbox_events_processed_signed",
      sql`${t.state} <> 'processed' or ${t.signatureVerified}`,
    ),
  ],
);

/** Owned privacy work with verification, a responsible person and a due condition (§8.4). */
export const privacyRequests = pgTable(
  "privacy_requests",
  {
    ...mutable(),
    reference: reference(),
    kind: privacyRequestKindEnum("kind").notNull(),
    state: privacyRequestStateEnum("state").notNull().default("received"),
    partyId: uuid("party_id").references(() => parties.id),
    contactMethodId: uuid("contact_method_id").references(() => contactMethods.id),
    verifiedAt: instant("verified_at"),
    verificationMethod: text("verification_method"),
    responsibleId: uuid("responsible_id").references(() => principals.id),
    dueAt: instant("due_at"),
    scope: jsonb("scope").notNull().default({}),
    legalHoldReason: text("legal_hold_reason"),
    legalHoldDisposition: text("legal_hold_disposition"),
    completionEvidence: text("completion_evidence"),
    completedAt: instant("completed_at"),
    rejectionReason: text("rejection_reason"),
  },
  (t) => [
    check(
      "privacy_requests_in_progress_verified",
      sql`${t.state} in ('received', 'verifying', 'rejected') or (${t.verifiedAt} is not null and ${t.responsibleId} is not null)`,
    ),
    check(
      "privacy_requests_completed_evidence",
      sql`${t.state} <> 'completed' or (${t.completionEvidence} is not null and ${t.legalHoldDisposition} is not null and ${t.completedAt} is not null)`,
    ),
    index("privacy_requests_state_idx").on(t.state, t.dueAt),
  ],
);

/** Release-bound proof (§20.1). Evidence for another release or policy never clears a gate. */
export const releaseEvidence = pgTable(
  "release_evidence",
  {
    id: id(),
    schemaVersion: integer("schema_version").notNull(),
    environment: evidenceEnvironmentEnum("environment").notNull(),
    releaseSha: text("release_sha").notNull(),
    /** Web/worker/migration image, artifact and gateway digests by name. */
    digests: jsonb("digests").notNull(),
    policyRevision: text("policy_revision").notNull(),
    dataDigest: text("data_digest"),
    /** The gate (R00–R12) or acceptance scenarios the evidence is offered for. */
    gate: text("gate"),
    observedAt: instant("observed_at").notNull(),
    /** Tool or source identity that produced the observation. */
    source: text("source").notNull(),
    reviewer: text("reviewer"),
    assertions: jsonb("assertions").notNull(),
    redactionStatus: redactionStatusEnum("redaction_status").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("release_evidence_release_idx").on(t.releaseSha, t.environment, t.policyRevision)],
);
