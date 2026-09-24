// Transactional outbox for external messages (AD11, spec §07.5). Enqueueing happens in the
// same transaction as the business change. Dispatch marks the row outcome_unknown *before*
// calling the provider, so a crash or timeout mid-call can never lead to a silent re-send:
// only an explicit provider answer moves it on, and unknown outcomes wait for reconciliation.
import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { outboxMessages } from "@/db/schema";
import { type MessageChannel, maxDeliveryAttempts } from "@/domain/message";
import type { Executor } from "../db";
import type { MessageProvider } from "./provider";
import type { JobQueue } from "./queue";

export type OutboxState =
  | "queued"
  | "provider_accepted"
  | "delivered"
  | "failed"
  | "outcome_unknown";

export interface NewOutboxMessage {
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

/**
 * Adds a message unless one with the same idempotency key exists, and returns the logical
 * message id either way. With a queue, a dispatch job is enqueued in the same transaction.
 */
export async function enqueueMessage(
  db: Executor,
  message: NewOutboxMessage,
  queue?: JobQueue,
): Promise<{ id: string; created: boolean }> {
  const [inserted] = await db
    .insert(outboxMessages)
    .values({
      idempotencyKey: message.idempotencyKey,
      channel: message.channel,
      recipient: message.recipient,
      template: message.template,
      params: message.params ?? {},
      secretParams: message.secretParams ?? null,
      messageId: message.messageId,
    })
    .onConflictDoNothing({ target: outboxMessages.idempotencyKey })
    .returning({ id: outboxMessages.id });
  if (inserted) {
    await queue?.send("outbox.dispatch", { outboxId: inserted.id }, { db });
    return { id: inserted.id, created: true };
  }
  const [existing] = await db
    .select({ id: outboxMessages.id })
    .from(outboxMessages)
    .where(eq(outboxMessages.idempotencyKey, message.idempotencyKey));
  if (!existing) throw new Error("Outbox message vanished after a key conflict.");
  return { id: existing.id, created: false };
}

/**
 * Sends one queued message. Idempotent: anything not queued is left alone and its current
 * state returned, so duplicate jobs and sweeps are harmless.
 */
export async function dispatchMessage(
  db: Executor,
  provider: MessageProvider,
  outboxId: string,
  now: Date = new Date(),
): Promise<OutboxState> {
  const claimed = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(outboxMessages)
      .where(eq(outboxMessages.id, outboxId))
      .for("update");
    if (row?.state !== "queued") return { row, claimed: false as const };
    await tx
      .update(outboxMessages)
      .set({
        state: "outcome_unknown",
        attempts: sql`${outboxMessages.attempts} + 1`,
        provider: provider.name,
        dispatchStartedAt: now,
        secretParams: null,
        version: sql`${outboxMessages.version} + 1`,
      })
      .where(eq(outboxMessages.id, outboxId));
    return { row, claimed: true as const };
  });
  if (!claimed.row) throw new Error(`Outbox message ${outboxId} does not exist.`);
  if (!claimed.claimed) return claimed.row.state as OutboxState;
  const row = claimed.row;

  const finish = async (
    state: OutboxState,
    values: Partial<typeof outboxMessages.$inferInsert>,
  ) => {
    await db
      .update(outboxMessages)
      .set({ state, ...values, version: sql`${outboxMessages.version} + 1` })
      .where(and(eq(outboxMessages.id, outboxId), eq(outboxMessages.state, "outcome_unknown")));
    return state;
  };

  let result: Awaited<ReturnType<MessageProvider["send"]>>;
  try {
    result = await provider.send({
      outboxId,
      idempotencyKey: row.idempotencyKey,
      channel: row.channel,
      recipient: row.recipient,
      template: row.template,
      params: row.params as Record<string, unknown>,
      secretParams: row.secretParams as Record<string, unknown> | null,
    });
  } catch {
    // Stays outcome_unknown for reconciliation; the error text may carry provider detail.
    return finish("outcome_unknown", { lastErrorCode: "provider_unreachable" });
  }
  if (result.status === "accepted") {
    return finish("provider_accepted", {
      providerMessageId: result.providerMessageId,
      acceptedAt: now,
      lastErrorCode: null,
    });
  }
  if (result.retryable && row.attempts + 1 < maxDeliveryAttempts) {
    // The provider definitely did not take it: put it back, secrets included.
    return finish("queued", { lastErrorCode: result.code, secretParams: row.secretParams });
  }
  return finish("failed", { lastErrorCode: result.code, failedAt: now });
}

/** Dispatches every queued message, oldest first. The worker runs this as a safety sweep. */
export async function dispatchQueued(
  db: Executor,
  provider: MessageProvider,
  limit = 50,
): Promise<number> {
  const rows = await db
    .select({ id: outboxMessages.id })
    .from(outboxMessages)
    .where(eq(outboxMessages.state, "queued"))
    .orderBy(asc(outboxMessages.createdAt))
    .limit(limit);
  for (const { id } of rows) await dispatchMessage(db, provider, id);
  return rows.length;
}

/** Applies a provider delivery report (webhook). Returns false for an unknown message. */
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
    .update(outboxMessages)
    .set({
      state: report.status,
      ...(report.status === "delivered"
        ? { deliveredAt: at }
        : { failedAt: at, lastErrorCode: report.code ?? "delivery_failed" }),
      version: sql`${outboxMessages.version} + 1`,
    })
    .where(
      and(
        eq(outboxMessages.provider, report.provider),
        eq(outboxMessages.providerMessageId, report.providerMessageId),
        inArray(outboxMessages.state, ["provider_accepted", "outcome_unknown"]),
      ),
    )
    .returning({ id: outboxMessages.id });
  return rows.length > 0;
}

/**
 * Records what a person established for an outcome_unknown message (from the provider's
 * console, or the recipient). It never re-sends; a new message needs a new idempotency key.
 */
export async function reconcileMessage(
  db: Executor,
  outboxId: string,
  finding:
    | { state: "provider_accepted" | "delivered"; providerMessageId?: string }
    | { state: "failed"; code: string },
  now: Date = new Date(),
): Promise<boolean> {
  const values =
    finding.state === "failed"
      ? { failedAt: now, lastErrorCode: finding.code }
      : finding.state === "delivered"
        ? { deliveredAt: now, providerMessageId: finding.providerMessageId }
        : { acceptedAt: now, providerMessageId: finding.providerMessageId };
  const rows = await db
    .update(outboxMessages)
    .set({ state: finding.state, ...values, version: sql`${outboxMessages.version} + 1` })
    .where(and(eq(outboxMessages.id, outboxId), eq(outboxMessages.state, "outcome_unknown")))
    .returning({ id: outboxMessages.id });
  return rows.length === 1;
}
