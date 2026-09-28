// Email delivery through the external-action ledger (architecture §9, §15). Enqueueing happens
// in the same transaction as the business change and stores the payload and its digest before
// any provider call. Dispatch marks the action `attempting` before calling the provider, so a
// crash or timeout mid-call can never lead to a silent re-send: only an explicit provider answer
// moves it on, and unknown outcomes wait for reconciliation. Provider acceptance is recorded as
// `acknowledged`, delivery as `verified`: accepted is not delivered.
import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { externalActions, outboxEvents } from "@/db/schema";
import { canonicalJson } from "@/domain/approval";
import type { ExternalActionState } from "@/domain/external-action";
import {
  type MessageChannel,
  maxDeliveryAttempts,
  providerIdempotencyWindowMs,
} from "@/domain/message";
import type { Database, Executor } from "../db";
import { AppError } from "../errors";
import { alertSubjectType, alertTemplate } from "../subscriptions/template";
import type { MessageProvider } from "./provider";
import type { JobQueue } from "./queue";

export type OutboxState = ExternalActionState;

export interface NewOutboxEvent {
  /** Dotted business event, e.g. `inquiry.received` or `publication.withdrawn`. */
  readonly eventType: string;
  readonly subjectType: string;
  readonly subjectId: string;
  /** Identifiers only: consumers re-read the records, so no personal data travels here. */
  readonly payload?: Record<string, unknown>;
  /** Publication generation (or other fence) the intent was created under. */
  readonly sourceGeneration?: number;
  readonly operationId?: string;
}

/**
 * Records durable business intent in the caller's transaction (§5, §15): it commits with the
 * change it describes or not at all. The dispatcher binds it to queue work later.
 */
export async function recordOutboxEvent(db: Executor, event: NewOutboxEvent): Promise<string> {
  const [row] = await db
    .insert(outboxEvents)
    .values({
      eventType: event.eventType,
      subjectType: event.subjectType,
      subjectId: event.subjectId,
      payload: event.payload ?? {},
      sourceGeneration: event.sourceGeneration ?? null,
      operationId: event.operationId ?? null,
    })
    .returning({ id: outboxEvents.id });
  if (!row) throw new Error("Outbox event insert returned no row.");
  return row.id;
}

export interface NewOutboxMessage {
  /** Logical send identity; also the provider idempotency key for every retry. */
  readonly idempotencyKey: string;
  readonly channel: MessageChannel;
  readonly recipient: string;
  readonly template: string;
  readonly params?: Record<string, unknown>;
  /** Cleared as soon as dispatch starts; use for sign-in links and other secrets. */
  readonly secretParams?: Record<string, unknown>;
  /** The case message being delivered, if any. */
  readonly messageId?: string;
}

interface EmailPayload {
  readonly channel: MessageChannel;
  readonly recipient: string;
  readonly template: string;
  readonly params: Record<string, unknown>;
  /** Commitment to high-entropy access-link parameters, retained after the secret is erased. */
  readonly secretDigest?: string;
}

/**
 * Adds a logical send unless one with the same key exists, and returns its id either way. With
 * a queue, a dispatch job is enqueued in the same transaction.
 */
export async function enqueueMessage(
  db: Executor,
  message: NewOutboxMessage,
  queue?: JobQueue,
): Promise<{ id: string; created: boolean }> {
  const payload: EmailPayload = {
    channel: message.channel,
    recipient: message.recipient,
    template: message.template,
    params: message.params ?? {},
    ...(message.secretParams
      ? {
          secretDigest: createHash("sha256")
            .update(canonicalJson(message.secretParams))
            .digest("hex"),
        }
      : {}),
  };
  const [inserted] = await db
    .insert(externalActions)
    .values({
      kind: "email_send",
      effectKey: message.idempotencyKey,
      ...(message.messageId ? { subjectType: "message", subjectId: message.messageId } : {}),
      payload,
      payloadDigest: createHash("sha256").update(canonicalJson(payload)).digest("hex"),
      secretPayload: message.secretParams ?? null,
    })
    .onConflictDoNothing({ target: externalActions.effectKey })
    .returning({ id: externalActions.id });
  if (inserted) {
    await queue?.send("outbox.dispatch", { outboxId: inserted.id }, { db });
    return { id: inserted.id, created: true };
  }
  const [existing] = await db
    .select()
    .from(externalActions)
    .where(eq(externalActions.effectKey, message.idempotencyKey));
  if (!existing) throw new Error("External action vanished after a key conflict.");
  if (
    existing.kind !== "email_send" ||
    existing.subjectType !== (message.messageId ? "message" : null) ||
    existing.subjectId !== (message.messageId ?? null) ||
    existing.payloadDigest !== createHash("sha256").update(canonicalJson(payload)).digest("hex") ||
    canonicalJson(existing.payload) !== canonicalJson(payload)
  )
    throw new AppError("idempotency_key_reused");
  return { id: existing.id, created: false };
}

/**
 * Sends one queued email. Idempotent: anything not queued is left alone and its current state
 * returned, so duplicate jobs and sweeps are harmless.
 */
export async function dispatchMessage(
  db: Database,
  provider: MessageProvider,
  outboxId: string,
  now: Date = new Date(),
): Promise<OutboxState> {
  // Consequential dispatch uses a pool: the attempting state must commit before I/O.
  // Optional digests have stricter current-consent/publication gates than access emails.
  const [subject] = await db
    .select({ type: externalActions.subjectType })
    .from(externalActions)
    .where(eq(externalActions.id, outboxId));
  if (subject?.type === alertSubjectType) {
    const { dispatchSearchAlert } = await import("../subscriptions/alerts");
    return dispatchSearchAlert(db, provider, outboxId, { now });
  }
  const claimed = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(externalActions)
      .where(eq(externalActions.id, outboxId))
      .for("update");
    if (row?.state !== "queued") return { row, claimed: false as const };
    if (
      row.firstAttemptAt &&
      now.getTime() - row.firstAttemptAt.getTime() >= providerIdempotencyWindowMs
    ) {
      await tx
        .update(externalActions)
        .set({
          state: "cancelled",
          lastErrorCode: "retry_window_expired",
          secretPayload: null,
          updatedAt: now,
          version: sql`${externalActions.version} + 1`,
        })
        .where(eq(externalActions.id, row.id));
      return { row: { ...row, state: "cancelled" as const }, claimed: false as const };
    }
    const payload = row.payload as Partial<EmailPayload> | null;
    const template = payload?.template;
    const secretChanged =
      payload?.secretDigest !== undefined &&
      (!row.secretPayload ||
        payload.secretDigest !==
          createHash("sha256").update(canonicalJson(row.secretPayload)).digest("hex"));
    // Optional notifications may only pass through their consent-aware dispatcher.
    // A malformed/mistagged ledger row must never fall back to generic access mail.
    if (
      template === alertTemplate ||
      secretChanged ||
      row.payloadDigest !== createHash("sha256").update(canonicalJson(row.payload)).digest("hex")
    ) {
      const code =
        template === alertTemplate
          ? "guarded_template_subject_mismatch"
          : secretChanged
            ? "secret_digest_mismatch"
            : "payload_digest_mismatch";
      await tx
        .update(externalActions)
        .set({
          state: "cancelled",
          lastErrorCode: code,
          secretPayload: null,
          updatedAt: now,
          version: sql`${externalActions.version} + 1`,
        })
        .where(eq(externalActions.id, outboxId));
      return { row: { ...row, state: "cancelled" as const }, claimed: false as const };
    }
    await tx
      .update(externalActions)
      .set({
        state: "attempting",
        attempts: sql`${externalActions.attempts} + 1`,
        provider: provider.name,
        firstAttemptAt: row.firstAttemptAt ?? now,
        lastAttemptAt: now,
        secretPayload: null,
        version: sql`${externalActions.version} + 1`,
      })
      .where(eq(externalActions.id, outboxId));
    return { row, claimed: true as const };
  });
  if (!claimed.row) throw new Error(`External action ${outboxId} does not exist.`);
  if (!claimed.claimed) return claimed.row.state;
  const row = claimed.row;
  const payload = row.payload as EmailPayload;

  const finish = async (
    state: OutboxState,
    values: Partial<typeof externalActions.$inferInsert>,
  ) => {
    await db
      .update(externalActions)
      .set({ state, ...values, version: sql`${externalActions.version} + 1` })
      .where(and(eq(externalActions.id, outboxId), eq(externalActions.state, "attempting")));
    return state;
  };

  let result: Awaited<ReturnType<MessageProvider["send"]>>;
  try {
    result = await provider.send({
      outboxId,
      idempotencyKey: row.effectKey,
      channel: payload.channel,
      recipient: payload.recipient,
      template: payload.template,
      params: payload.params,
      secretParams: row.secretPayload as Record<string, unknown> | null,
    });
  } catch {
    // Unknown: reconciled, never resent; the error text may carry provider detail.
    return finish("outcome_unknown", { lastErrorCode: "provider_unreachable" });
  }
  if (result.status === "accepted") {
    return finish("acknowledged", {
      providerReference: result.providerMessageId,
      acknowledgedAt: now,
      lastErrorCode: null,
    });
  }
  if (result.retryable && row.attempts + 1 < maxDeliveryAttempts) {
    // The provider definitely did not take it: put it back, secrets included.
    return finish("queued", { lastErrorCode: result.code, secretPayload: row.secretPayload });
  }
  return finish("failed", { lastErrorCode: result.code, failedAt: now });
}

/** Dispatches every queued email, oldest first. The worker runs this as a safety sweep. */
export async function dispatchQueued(
  db: Database,
  provider: MessageProvider,
  limit = 50,
): Promise<number> {
  const rows = await db
    .select({ id: externalActions.id })
    .from(externalActions)
    .where(and(eq(externalActions.kind, "email_send"), eq(externalActions.state, "queued")))
    .orderBy(asc(externalActions.createdAt))
    .limit(limit);
  for (const { id } of rows) await dispatchMessage(db, provider, id);
  return rows.length;
}

/**
 * Applies an authenticated provider delivery report. A delivery never overwrites a recorded
 * failure. Returns false for an unknown or already settled action.
 */
export async function recordDeliveryReport(
  db: Executor,
  report: {
    provider: string;
    providerMessageId: string;
    status: "delivered" | "failed";
    code?: string;
    at?: Date;
  },
): Promise<boolean> {
  const at = report.at ?? new Date();
  const rows = await db
    .update(externalActions)
    .set({
      state: report.status === "delivered" ? "verified" : "failed",
      ...(report.status === "delivered"
        ? { verifiedAt: at }
        : { failedAt: at, lastErrorCode: report.code ?? "delivery_failed" }),
      version: sql`${externalActions.version} + 1`,
    })
    .where(
      and(
        eq(externalActions.provider, report.provider),
        eq(externalActions.providerReference, report.providerMessageId),
        inArray(
          externalActions.state,
          report.status === "failed"
            ? ["acknowledged", "outcome_unknown", "verified"]
            : ["acknowledged", "outcome_unknown"],
        ),
      ),
    )
    .returning({ id: externalActions.id });
  return rows.length > 0;
}

/**
 * Records what a person established for an unknown outcome (from the provider's console, or
 * the recipient). It never re-sends; a new send needs a new logical key.
 */
export async function reconcileMessage(
  db: Executor,
  outboxId: string,
  finding:
    | { state: "acknowledged" | "verified"; providerMessageId?: string }
    | { state: "failed"; code: string },
  now: Date = new Date(),
): Promise<boolean> {
  const values =
    finding.state === "failed"
      ? { failedAt: now, lastErrorCode: finding.code }
      : finding.state === "verified"
        ? { verifiedAt: now, providerReference: finding.providerMessageId }
        : { acknowledgedAt: now, providerReference: finding.providerMessageId };
  const rows = await db
    .update(externalActions)
    .set({
      state: finding.state,
      ...values,
      reconciledAt: now,
      version: sql`${externalActions.version} + 1`,
    })
    .where(
      and(
        eq(externalActions.id, outboxId),
        inArray(externalActions.state, ["attempting", "outcome_unknown"]),
      ),
    )
    .returning({ id: externalActions.id });
  return rows.length === 1;
}
