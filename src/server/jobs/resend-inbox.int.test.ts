import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Webhook } from "svix";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { externalActions, inboxEvents } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { dispatchMessage, enqueueMessage } from "./outbox";
import { receiveResendWebhook, reconcileResendInbox } from "./resend-inbox";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
const secret = `whsec_${randomBytes(32).toString("base64")}`;
function signed(type: string, emailId: string, at = new Date()) {
  const eventId = `msg_${randomUUID()}`;
  const raw = JSON.stringify({
    type,
    created_at: at.toISOString(),
    data: {
      email_id: emailId,
      from: "untrusted@example.test",
      subject: "Must not persist",
      html: "<script>untrusted</script>",
    },
  });
  return {
    raw,
    eventId,
    headers: new Headers({
      "svix-id": eventId,
      "svix-timestamp": String(Math.floor(at.getTime() / 1000)),
      "svix-signature": new Webhook(secret).sign(eventId, at, raw),
    }),
  };
}
async function accepted(emailId: string) {
  const row = await enqueueMessage(t.db, {
    idempotencyKey: randomUUID(),
    channel: "email",
    recipient: "person@example.test",
    template: "auth.email_link",
  });
  await dispatchMessage(
    t.db,
    { name: "resend", send: async () => ({ status: "accepted", providerMessageId: emailId }) },
    row.id,
  );
  return row.id;
}
describe("Resend signed durable inbox", () => {
  it("rejects tampering and stale signatures before any event is stored", async () => {
    const event = signed("email.delivered", randomUUID());
    await expect(
      receiveResendWebhook(t.db, `${event.raw} `, event.headers, secret),
    ).rejects.toMatchObject({ code: "unauthenticated" });
    expect(
      await t.db.select().from(inboxEvents).where(eq(inboxEvents.eventId, event.eventId)),
    ).toHaveLength(0);
    const old = signed("email.delivered", randomUUID(), new Date(Date.now() - 600_000));
    await expect(receiveResendWebhook(t.db, old.raw, old.headers, secret)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });
  it("deduplicates delivery, records later complaint, and cannot overwrite failure with delivery", async () => {
    const emailId = randomUUID(),
      id = await accepted(emailId),
      event = signed("email.delivered", emailId);
    expect(await receiveResendWebhook(t.db, event.raw, event.headers, secret)).toEqual({
      accepted: true,
      duplicate: false,
    });
    expect(await receiveResendWebhook(t.db, event.raw, event.headers, secret)).toEqual({
      accepted: true,
      duplicate: true,
    });
    expect(
      (await t.db.select().from(externalActions).where(eq(externalActions.id, id)))[0]?.state,
    ).toBe("verified");
    const complaint = signed("email.complained", emailId);
    await receiveResendWebhook(t.db, complaint.raw, complaint.headers, secret);
    const late = signed("email.delivered", emailId);
    await receiveResendWebhook(t.db, late.raw, late.headers, secret);
    expect(
      (await t.db.select().from(externalActions).where(eq(externalActions.id, id)))[0],
    ).toMatchObject({ state: "failed", lastErrorCode: "email.complained" });
    const rows = await t.db
      .select()
      .from(inboxEvents)
      .where(eq(inboxEvents.eventId, event.eventId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toEqual({ emailId, occurredAt: JSON.parse(event.raw).created_at });
  });
  it("persists early delivery and reconciles it after provider acknowledgment, without sending", async () => {
    const emailId = randomUUID(),
      event = signed("email.delivered", emailId);
    await receiveResendWebhook(t.db, event.raw, event.headers, secret);
    expect(
      (await t.db.select().from(inboxEvents).where(eq(inboxEvents.eventId, event.eventId)))[0],
    ).toMatchObject({ state: "received", errorCode: "delivery_awaiting_reference" });
    const id = await accepted(emailId);
    await reconcileResendInbox(t.db);
    expect(
      (await t.db.select().from(externalActions).where(eq(externalActions.id, id)))[0]?.state,
    ).toBe("verified");
    expect(
      (await t.db.select().from(inboxEvents).where(eq(inboxEvents.eventId, event.eventId)))[0]
        ?.state,
    ).toBe("processed");
  });
  it("keeps inbound email for human triage without trusting its sender or linking a Case", async () => {
    const event = signed("email.received", randomUUID());
    await receiveResendWebhook(t.db, event.raw, event.headers, secret);
    await reconcileResendInbox(t.db);
    const row = (
      await t.db.select().from(inboxEvents).where(eq(inboxEvents.eventId, event.eventId))
    )[0];
    expect(row).toMatchObject({
      state: "received",
      signatureVerified: true,
      errorCode: "inbound_requires_triage",
    });
    expect(JSON.stringify(row?.payload)).not.toContain("untrusted");
  });
});
it("denies a signed inbound receipt without its provider email identity", async () => {
  const eventId = `msg_${randomUUID()}`,
    at = new Date(),
    raw = JSON.stringify({ type: "email.received", created_at: at.toISOString(), data: {} });
  const headers = new Headers({
    "svix-id": eventId,
    "svix-timestamp": String(Math.floor(at.getTime() / 1000)),
    "svix-signature": new Webhook(secret).sign(eventId, at, raw),
  });
  await expect(receiveResendWebhook(t.db, raw, headers, secret)).rejects.toMatchObject({
    code: "validation_failed",
  });
  expect(
    await t.db.select().from(inboxEvents).where(eq(inboxEvents.eventId, eventId)),
  ).toHaveLength(0);
});
it("inbound intake cannot starve outgoing delivery reconciliation", async () => {
  const id = randomUUID(),
    early = signed("email.delivered", id);
  await receiveResendWebhook(t.db, early.raw, early.headers, secret);
  const outboxId = await accepted(id);
  await t.db.insert(inboxEvents).values({
    provider: "resend",
    eventId: randomUUID(),
    eventType: "email.received",
    signatureVerified: true,
    payload: { emailId: randomUUID() },
    state: "received",
    receivedAt: new Date(0),
  });
  await reconcileResendInbox(t.db, 1);
  expect(
    (await t.db.select().from(externalActions).where(eq(externalActions.id, outboxId)))[0]?.state,
  ).toBe("verified");
});
