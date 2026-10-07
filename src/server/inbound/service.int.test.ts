import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { caseParticipants, inboundEmails, inboxEvents, messages } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { caseFixture } from "../cases/testing";
import type { ReceivedEmail, ReceivingProvider } from "../jobs/resend-receiving";
import {
  listInboundEmails,
  readInboundEmail,
  retrieveInboundEmail,
  reviewInboundEmail,
  sweepInboundEmails,
} from "./service";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
function mail(): ReceivedEmail {
  return {
    id: randomUUID(),
    from: "untrusted@example.test",
    senderAddress: "untrusted@example.test",
    recipients: ["reply@example.test"],
    subject: "Synthetic incoming reply",
    text: "Please record this synthetic reply.",
    receivedAt: new Date().toISOString(),
    htmlOmitted: true,
    authentication: { spf: "fail" },
    attachments: [
      {
        id: randomUUID(),
        filename: "untrusted.pdf",
        contentType: "application/pdf",
        size: 100,
        state: "not_downloaded",
      },
    ],
  };
}
async function event(email: ReceivedEmail, signatureVerified = true) {
  const [row] = await t.db
    .insert(inboxEvents)
    .values({
      provider: "resend",
      eventId: randomUUID(),
      eventType: "email.received",
      signatureVerified,
      payload: { emailId: email.id },
      state: "received",
    })
    .returning();
  if (!row) throw new Error("fixture");
  return row;
}
async function received(email = mail()) {
  const e = await event(email),
    provider = {
      name: "resend",
      retrieve: vi.fn<ReceivingProvider["retrieve"]>().mockResolvedValue(email),
    };
  await retrieveInboundEmail(t.db, provider, e.id, "reply.example.test");
  const [row] = await t.db
    .select()
    .from(inboundEmails)
    .where(eq(inboundEmails.providerEmailId, email.id));
  if (!row) throw new Error("fixture");
  return { email, e, provider, row };
}
it("stores private triage exactly once across duplicate and distinct signed receipts", async () => {
  const f = await received();
  await retrieveInboundEmail(t.db, f.provider, f.e.id, "reply.example.test");
  expect(f.provider.retrieve).toHaveBeenCalledTimes(1);
  const second = await event(f.email);
  await retrieveInboundEmail(t.db, f.provider, second.id, "reply.example.test");
  expect(
    await t.db.select().from(inboundEmails).where(eq(inboundEmails.providerEmailId, f.email.id)),
  ).toHaveLength(1);
  expect(f.row).toMatchObject({
    state: "triage",
    caseId: null,
    senderPartyId: null,
    messageId: null,
    suggestedCaseId: null,
  });
});
it("rejects unsigned receipts without reading the provider", async () => {
  const email = mail(),
    e = await event(email, false),
    provider = { name: "resend", retrieve: vi.fn<ReceivingProvider["retrieve"]>() };
  await expect(
    retrieveInboundEmail(t.db, provider, e.id, "reply.example.test"),
  ).rejects.toMatchObject({ code: "validation_failed" });
  expect(provider.retrieve).not.toHaveBeenCalled();
});
it("does not overwrite a received snapshot when another receipt changes the source", async () => {
  const f = await received(),
    second = await event(f.email);
  f.provider.retrieve.mockResolvedValue({ ...f.email, text: "changed" });
  await expect(
    retrieveInboundEmail(t.db, f.provider, second.id, "reply.example.test"),
  ).rejects.toMatchObject({ code: "version_conflict" });
  expect(
    (await t.db.select().from(inboxEvents).where(eq(inboxEvents.id, second.id)))[0]?.state,
  ).toBe("received");
});
async function reviewFixture() {
  const f = await caseFixture(t.db),
    r = await received();
  return {
    ...f,
    ...r,
    input: {
      operationId: randomUUID(),
      id: r.row.id,
      expectedVersion: 1,
      decision: "assign" as const,
      caseId: f.record.id,
      caseVersion: f.record.version,
      partyId: f.client.partyId,
      reviewed: true as const,
      reason: "Verified manually against the synthetic Case.",
    },
  };
}
it("requires human review and records staff-only email without exposing attachments or granting access", async () => {
  const f = await reviewFixture();
  const result = await reviewInboundEmail(t.db, f.staff.session, f.input);
  expect((await reviewInboundEmail(t.db, f.staff.session, f.input)).outcome).toEqual(
    result.outcome,
  );
  const [message] = await t.db
    .select()
    .from(messages)
    .where(eq(messages.id, result.outcome.messageId ?? ""));
  expect(message).toMatchObject({
    direction: "inbound",
    channel: "email",
    audience: "internal",
    attachments: [],
    recipients: [],
    authorKind: "visitor",
  });
  expect((await readInboundEmail(t.db, f.staff.session, f.row.id)).state).toBe("assigned");
  await expect(readInboundEmail(t.db, f.client.session, f.row.id)).rejects.toMatchObject({
    code: "not_found",
  });
  await expect(listInboundEmails(t.db, f.client.session)).rejects.toMatchObject({
    code: "not_found",
  });
});
it.each(["client", "version", "participant", "review", "html-only"])(
  "denies %s assignment",
  async (kind) => {
    const f = await reviewFixture();
    if (kind === "participant")
      await t.db
        .update(caseParticipants)
        .set({ revokedAt: new Date() })
        .where(eq(caseParticipants.caseId, f.record.id));
    if (kind === "html-only")
      await t.db.update(inboundEmails).set({ body: null }).where(eq(inboundEmails.id, f.row.id));
    await expect(
      reviewInboundEmail(t.db, kind === "client" ? f.client.session : f.staff.session, {
        ...f.input,
        ...(kind === "version" ? { caseVersion: 99 } : {}),
        ...(kind === "review" ? { reviewed: false } : {}),
      }),
    ).rejects.toBeDefined();
    expect(
      (await t.db.select().from(inboundEmails).where(eq(inboundEmails.id, f.row.id)))[0]?.state,
    ).toBe("triage");
  },
);
it("rejects a triage item with a human reason and no Case message", async () => {
  const f = await reviewFixture();
  const result = await reviewInboundEmail(t.db, f.staff.session, {
    operationId: randomUUID(),
    id: f.row.id,
    expectedVersion: 1,
    decision: "reject",
    reviewed: true,
    reason: "Unrelated synthetic email; no Case assignment.",
  });
  expect(result.outcome).toMatchObject({ state: "rejected", messageId: null });
});
it("retains failed retrieval receipts with a redacted error for later retry", async () => {
  const email = mail(),
    e = await event(email);
  await sweepInboundEmails(
    t.db,
    {
      name: "resend",
      retrieve: async () => {
        throw new Error("private provider failure");
      },
    },
    "reply.example.test",
  );
  const [row] = await t.db.select().from(inboxEvents).where(eq(inboxEvents.id, e.id));
  expect(row).toMatchObject({ state: "received", errorCode: "inbound_fetch_needs_review" });
});
it("Case-scoped email read excludes clients even after human assignment", async () => {
  const { readCaseInboundEmails } = await import("./service");
  const f = await reviewFixture();
  await reviewInboundEmail(t.db, f.staff.session, f.input);
  expect(await readCaseInboundEmails(t.db, f.client.session, f.record.id)).toEqual([]);
  expect(await readCaseInboundEmails(t.db, f.staff.session, f.record.id)).toHaveLength(1);
});
it("revoked staff authority prevents a previously prepared assignment", async () => {
  const { grants } = await import("@/db/schema");
  const f = await reviewFixture();
  await t.db.delete(grants).where(eq(grants.principalId, f.staff.id));
  await expect(reviewInboundEmail(t.db, f.staff.session, f.input)).rejects.toBeDefined();
  expect(
    (await t.db.select().from(inboundEmails).where(eq(inboundEmails.id, f.row.id)))[0]?.state,
  ).toBe("triage");
});
it("pages unreviewed intake without processed mail hiding the backlog", async () => {
  const f = await caseFixture(t.db),
    sample = await received();
  await t.db.insert(inboundEmails).values(
    Array.from({ length: 51 }, () => ({
      provider: "resend",
      providerEmailId: randomUUID(),
      inboxEventId: sample.e.id,
      sourceDigest: "synthetic",
      sender: "synthetic@example.test",
      recipients: [],
      subject: "Synthetic backlog",
      body: "Synthetic",
      htmlOmitted: false,
      attachments: [],
      authentication: {},
      receivedAt: new Date(),
    })),
  );
  const first = await listInboundEmails(t.db, f.staff.session);
  expect(first.records).toHaveLength(50);
  expect(first.next).toBeTruthy();
  const second = await listInboundEmails(t.db, f.staff.session, { after: first.next ?? undefined });
  expect(second.records.length).toBeGreaterThan(0);
  expect(
    second.records.some((row) => first.records.some((previous) => previous.id === row.id)),
  ).toBe(false);
  expect([...first.records, ...second.records].every((row) => row.state === "triage")).toBe(true);
});
it("receiving worker consumes signed receipts via the actual pg-boss queue", async () => {
  const { JobQueue, registerWorkers } = await import("../jobs/queue");
  const { TestMessageProvider } = await import("../jobs/provider");
  const queue = new JobQueue(t.url),
    email = mail(),
    e = await event(email);
  const provider = new TestMessageProvider();
  await queue.start();
  try {
    await registerWorkers(queue, {
      db: t.db,
      provider,
      receiving: {
        provider: { name: "resend", retrieve: async (id) => ({ ...email, id }) },
        replyDomain: "reply.example.test",
      },
    });
    await queue.send("inbox.reconcile", {});
    await vi.waitFor(
      async () =>
        expect(
          (await t.db.select().from(inboxEvents).where(eq(inboxEvents.id, e.id)))[0]?.state,
        ).toBe("processed"),
      { timeout: 15000, interval: 200 },
    );
    expect(provider.sent).toHaveLength(0);
  } finally {
    await queue.stop();
  }
}, 20000);
