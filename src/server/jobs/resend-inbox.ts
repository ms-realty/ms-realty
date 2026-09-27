// Signature validation precedes persistence. The inbox keeps identifiers only; payloads may
// contain arbitrary customer text and are never interpreted as authority or account identity.
import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { Webhook } from "svix";
import { z } from "zod";
import { externalActions, inboxEvents } from "@/db/schema";
import { canonicalJson } from "@/domain/approval";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { recordDeliveryReport } from "./outbox";

const eventSchema = z.object({
  type: z.string().min(1).max(80),
  created_at: z.iso.datetime({ offset: true }),
  data: z.object({ email_id: z.uuid().optional() }),
});
const delivered = "email.delivered";
const failures = ["email.bounced", "email.complained", "email.failed", "email.suppressed"];
const supported = (type: string) => type === delivered || failures.includes(type);
export async function receiveResendWebhook(
  db: Executor,
  raw: string,
  headers: Headers,
  secret: string,
) {
  if (!secret) throw new AppError("unavailable");
  if (Buffer.byteLength(raw) > 128 * 1024) throw new AppError("validation_failed");
  const eventId = headers.get("svix-id") ?? "";
  if (!eventId || eventId.length > 256) throw new AppError("unauthenticated");
  let verified: unknown;
  try {
    new Webhook(secret).verify(raw, {
      "svix-id": eventId,
      "svix-timestamp": headers.get("svix-timestamp") ?? "",
      "svix-signature": headers.get("svix-signature") ?? "",
    });
    verified = JSON.parse(raw);
  } catch {
    throw new AppError("unauthenticated");
  }
  const parsed = eventSchema.safeParse(verified);
  if (!parsed.success || (supported(parsed.data.type) && !parsed.data.data.email_id))
    throw new AppError("validation_failed");
  const event = parsed.data;
  const payload = { emailId: event.data.email_id ?? null, occurredAt: event.created_at };
  const [inserted] = await db
    .insert(inboxEvents)
    .values({
      provider: "resend",
      eventId,
      eventType: event.type,
      signatureVerified: true,
      payload,
      state: supported(event.type) || event.type === "email.received" ? "received" : "ignored",
      errorCode:
        event.type === "email.received"
          ? "inbound_requires_triage"
          : supported(event.type)
            ? null
            : "unsupported_event",
    })
    .onConflictDoNothing({ target: [inboxEvents.provider, inboxEvents.eventId] })
    .returning();
  const existing =
    inserted ??
    (
      await db
        .select()
        .from(inboxEvents)
        .where(and(eq(inboxEvents.provider, "resend"), eq(inboxEvents.eventId, eventId)))
    )[0];
  if (
    !existing ||
    existing.eventType !== event.type ||
    canonicalJson(existing.payload) !== canonicalJson(payload)
  )
    throw new AppError("validation_failed");
  await processResendEvent(db, existing.id);
  return { accepted: true as const, duplicate: !inserted };
}

export async function processResendEvent(db: Executor, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [event] = await tx.select().from(inboxEvents).where(eq(inboxEvents.id, id)).for("update");
    if (
      event?.provider !== "resend" ||
      !event.signatureVerified ||
      event.state !== "received" ||
      !supported(event.eventType)
    )
      return;
    const payload = event.payload as { emailId: string; occurredAt: string };
    const [target] = await tx
      .select({ id: externalActions.id, state: externalActions.state })
      .from(externalActions)
      .where(
        and(
          eq(externalActions.provider, "resend"),
          eq(externalActions.providerReference, payload.emailId),
        ),
      )
      .for("update");
    // Delivery can arrive before the send response is committed. A sweep retries matching
    // this signed report; it never performs another send or fabricates an acknowledgment.
    if (
      !target ||
      !["acknowledged", "outcome_unknown", "verified", "failed"].includes(target.state)
    ) {
      await tx
        .update(inboxEvents)
        .set({ errorCode: "delivery_awaiting_reference" })
        .where(eq(inboxEvents.id, id));
      return;
    }
    await recordDeliveryReport(tx, {
      provider: "resend",
      providerMessageId: payload.emailId,
      status: event.eventType === delivered ? "delivered" : "failed",
      code: event.eventType,
      at: new Date(payload.occurredAt),
    });
    await tx
      .update(inboxEvents)
      .set({ state: "processed", processedAt: new Date(), errorCode: null })
      .where(eq(inboxEvents.id, id));
  });
}
export async function reconcileResendInbox(db: Executor, limit = 100) {
  const events = await db
    .select({ id: inboxEvents.id })
    .from(inboxEvents)
    .where(and(eq(inboxEvents.provider, "resend"), eq(inboxEvents.state, "received")))
    .orderBy(asc(inboxEvents.receivedAt))
    .limit(limit);
  for (const event of events) await processResendEvent(db, event.id);
}
