import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { externalActions, inquiries, outboxEvents, recoveryControl } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { canonicalJson } from "@/domain/approval";
import { dispatchMessage, dispatchQueued, enqueueMessage, recordOutboxEvent } from "../jobs/outbox";
import { TestMessageProvider } from "../jobs/provider";
import { JobQueue, registerWorkers } from "../jobs/queue";
import { quarantineRestoredDatabase } from "../recovery/quarantine";
import {
  inquiryCoverageNoticeKey,
  inquiryCoverageNoticeTemplate,
  sweepInquiryCoverageNotices,
} from "./notifications";

let t: TestDatabase;
let queue: JobQueue;
beforeAll(async () => {
  t = await createTestDatabase();
  queue = new JobQueue(t.url, { producer: true });
  await queue.start();
}, 30_000);
afterAll(async () => {
  await queue?.stop();
  await t?.drop();
});
beforeEach(async () => {
  vi.stubEnv("STAGING", "true");
  vi.stubEnv("INQUIRY_COVERAGE_NOTICE_ENABLED", "1");
  vi.stubEnv("INQUIRY_COVERAGE_TEST_INBOX_REVIEWED", "true");
  vi.stubEnv("INQUIRY_COVERAGE_TEST_INBOX", "reviewed-test-inbox@example.test");
  vi.stubEnv("STAFF_ORIGIN", "https://staff-staging.example.test");
  // No worker is registered until the final test; remove jobs for the previous fixtures.
  await t.sql`delete from pgboss.job`;
  await t.db.delete(externalActions);
  await t.db.delete(outboxEvents);
  await t.db.delete(inquiries);
});
afterEach(() => vi.unstubAllEnvs());

let sequence = 0;
async function received(payload?: Record<string, unknown>) {
  const [inquiry] = await t.db
    .insert(inquiries)
    .values({
      reference: `RQ-2026-${String(++sequence).padStart(6, "0")}`,
      purpose: "question",
      source: "website",
      submissionKey: randomUUID(),
      payloadDigest: "synthetic-local-digest",
      coverageQueue: "intake",
      preferredName: "Synthetic Private Name",
      message: "Synthetic private inquiry text",
    })
    .returning();
  if (!inquiry) throw new Error("Inquiry fixture missing");
  const eventId = await recordOutboxEvent(t.db, {
    eventType: "inquiry.received",
    subjectType: "inquiry",
    subjectId: inquiry.id,
    payload: payload ?? {
      reference: inquiry.reference,
      purpose: "question",
      coverageQueue: "intake",
    },
  });
  return { inquiry, eventId };
}
const event = async (id: string) =>
  (await t.db.select().from(outboxEvents).where(eq(outboxEvents.id, id)))[0];
const action = async (eventId: string) =>
  (await t.db.select().from(externalActions).where(eq(externalActions.outboxEventId, eventId)))[0];

describe("staging inquiry coverage notices", () => {
  it.each([
    ["STAGING", "false"],
    ["STAGING", ""],
    ["INQUIRY_COVERAGE_NOTICE_ENABLED", ""],
    ["INQUIRY_COVERAGE_TEST_INBOX_REVIEWED", "false"],
    ["INQUIRY_COVERAGE_TEST_INBOX", ""],
    ["INQUIRY_COVERAGE_TEST_INBOX", "a@example.test,b@example.test"],
    ["STAFF_ORIGIN", "https://staff-staging.example.test/path"],
  ])("leaves intent pending when %s is %s", async (key, value) => {
    const input = await received();
    vi.stubEnv(key, value);
    expect(await sweepInquiryCoverageNotices(t.db, queue)).toBe(0);
    expect(await event(input.eventId)).toMatchObject({ state: "pending", dispatchJobId: null });
    expect(await t.db.select().from(externalActions)).toEqual([]);
  });

  it("concurrent sweeps bind one identifiers-only effect and one real pg-boss job", async () => {
    const input = await received();
    const results = await Promise.all([
      sweepInquiryCoverageNotices(t.db, queue),
      sweepInquiryCoverageNotices(t.db, queue),
    ]);
    expect(results.reduce((sum, value) => sum + value, 0)).toBe(1);
    expect(await sweepInquiryCoverageNotices(t.db, queue)).toBe(0);
    const effect = await action(input.eventId);
    if (!effect) throw new Error("Effect missing");
    expect(effect).toMatchObject({
      subjectType: "inquiry_coverage_notice",
      subjectId: input.inquiry.id,
      effectKey: `inquiry.coverage-notice.v1:${input.eventId}`,
      state: "queued",
      secretPayload: null,
      payload: {
        channel: "email",
        recipient: "reviewed-test-inbox@example.test",
        template: "inquiry.coverage-notice.v1",
        params: {
          eventId: input.eventId,
          inquiryId: input.inquiry.id,
          reference: input.inquiry.reference,
          coverageQueue: "intake",
          queueUrl: "https://staff-staging.example.test/bg/inquiries",
        },
      },
    });
    expect(Object.keys((effect.payload as { params: object }).params).sort()).toEqual(
      ["eventId", "inquiryId", "reference", "coverageQueue", "queueUrl"].sort(),
    );
    const bound = await event(input.eventId);
    expect(bound?.state).toBe("dispatched");
    if (!bound?.dispatchJobId) throw new Error("Dispatch job missing");
    const jobs =
      await t.sql`select id, name, data from pgboss.job where id = ${bound.dispatchJobId}`;
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ name: "outbox.dispatch", data: { outboxId: effect?.id } });
    expect(await t.db.select().from(externalActions)).toHaveLength(1);
  });

  it("outer rollback removes the effect and pg-boss job and leaves the event pending", async () => {
    const input = await received();
    let jobId = "";
    await expect(
      t.db.transaction(async (tx) => {
        expect(await sweepInquiryCoverageNotices(tx, queue)).toBe(1);
        jobId =
          (await tx.select().from(outboxEvents).where(eq(outboxEvents.id, input.eventId)))[0]
            ?.dispatchJobId ?? "";
        throw new Error("synthetic rollback");
      }),
    ).rejects.toThrow("synthetic rollback");
    expect(await action(input.eventId)).toBeUndefined();
    expect(await event(input.eventId)).toMatchObject({ state: "pending", dispatchJobId: null });
    expect(await t.sql`select id from pgboss.job where id = ${jobId}`).toEqual([]);
    expect(await sweepInquiryCoverageNotices(t.db, queue)).toBe(1);
  });

  it("queue failure rolls back the ledger and keeps intent pending", async () => {
    const input = await received();
    const send = vi
      .spyOn(queue, "send")
      .mockRejectedValueOnce(new Error("synthetic queue failure"));
    try {
      await expect(sweepInquiryCoverageNotices(t.db, queue)).rejects.toThrow(
        "synthetic queue failure",
      );
      expect(await action(input.eventId)).toBeUndefined();
      expect(await event(input.eventId)).toMatchObject({ state: "pending", dispatchJobId: null });
    } finally {
      send.mockRestore();
    }
  });

  it.each([
    { reference: "RQ-2026-999999", purpose: "question", coverageQueue: "intake" },
    { reference: "RQ-2026-999999", purpose: "question", coverageQueue: "intake", body: "private" },
  ])("retains malformed or mismatched source intent as cancelled evidence %j", async (payload) => {
    const input = await received(payload);
    expect(await sweepInquiryCoverageNotices(t.db, queue)).toBe(0);
    expect(await event(input.eventId)).toMatchObject({ state: "cancelled", payload });
    expect(await action(input.eventId)).toBeUndefined();
  });

  it("invalid source intent cannot starve the next bounded consumer batch", async () => {
    const malformed = await received({
      reference: "invalid",
      purpose: "question",
      coverageQueue: "intake",
    });
    const valid = await received();
    expect(await sweepInquiryCoverageNotices(t.db, queue, { limit: 1 })).toBe(0);
    expect(await event(malformed.eventId)).toMatchObject({ state: "cancelled" });
    expect(await sweepInquiryCoverageNotices(t.db, queue, { limit: 1 })).toBe(1);
    expect(await action(valid.eventId)).toBeDefined();
  });

  it("parks queued notices after staging is disabled and records acceptance separately from delivery", async () => {
    const input = await received();
    await sweepInquiryCoverageNotices(t.db, queue);
    const effect = await action(input.eventId);
    if (!effect) throw new Error("Effect missing");
    const provider = new TestMessageProvider();
    vi.stubEnv("STAGING", "false");
    expect(await dispatchMessage(t.db, provider, effect.id)).toBe("queued");
    expect(provider.sent).toEqual([]);
    vi.stubEnv("STAGING", "true");
    expect(await dispatchMessage(t.db, provider, effect.id)).toBe("acknowledged");
    expect(await action(input.eventId)).toMatchObject({ attempts: 1, verifiedAt: null });
    expect(await dispatchMessage(t.db, provider, effect.id)).toBe("acknowledged");
    expect(provider.sent).toHaveLength(1);
  });

  it("unknown outcomes never resend through dispatch or another intent sweep", async () => {
    const input = await received();
    await sweepInquiryCoverageNotices(t.db, queue);
    const effect = await action(input.eventId);
    if (!effect) throw new Error("Effect missing");
    const provider = new TestMessageProvider();
    provider.script("throw");
    expect(await dispatchMessage(t.db, provider, effect.id)).toBe("outcome_unknown");
    expect(await sweepInquiryCoverageNotices(t.db, queue)).toBe(0);
    expect(await dispatchMessage(t.db, provider, effect.id)).toBe("outcome_unknown");
    expect(provider.sent).toHaveLength(1);
  });

  it("disabled notices do not starve eligible messages in the bounded outbox sweep", async () => {
    const input = await received();
    await sweepInquiryCoverageNotices(t.db, queue);
    const eligible = await enqueueMessage(t.db, {
      idempotencyKey: "synthetic-eligible-message",
      channel: "email",
      recipient: "other-test-inbox@example.test",
      template: "test.notice",
    });
    vi.stubEnv("STAGING", "false");
    const provider = new TestMessageProvider();
    expect(await dispatchQueued(t.db, provider, 1)).toBe(1);
    expect(provider.sent.map((message) => message.outboxId)).toEqual([eligible.id]);
    expect(await action(input.eventId)).toMatchObject({ state: "queued", attempts: 0 });
  });

  it.each(["recipient", "body", "link", "binding"])(
    "rejects digest-valid %s tampering before a provider call",
    async (change) => {
      const input = await received();
      await sweepInquiryCoverageNotices(t.db, queue);
      const effect = await action(input.eventId);
      if (!effect) throw new Error("Effect missing");
      const payload = structuredClone(effect.payload) as {
        recipient: string;
        params: Record<string, unknown>;
      };
      if (change === "recipient") payload.recipient = "customer@example.test";
      if (change === "body") payload.params.body = "free-form private content";
      if (change === "link") payload.params.queueUrl = "https://foreign.example.test/bg/inquiries";
      await t.db
        .update(externalActions)
        .set({
          payload,
          payloadDigest: createHash("sha256").update(canonicalJson(payload)).digest("hex"),
          ...(change === "binding" ? { outboxEventId: null } : {}),
        })
        .where(eq(externalActions.id, effect.id));
      const provider = new TestMessageProvider();
      expect(await dispatchMessage(t.db, provider, effect.id)).toBe("cancelled");
      expect(provider.sent).toEqual([]);
    },
  );

  it("a notice template cannot bypass linkage as a generic external action", async () => {
    const input = await received();
    const result = await enqueueMessage(t.db, {
      idempotencyKey: inquiryCoverageNoticeKey(input.eventId),
      channel: "email",
      recipient: "reviewed-test-inbox@example.test",
      template: inquiryCoverageNoticeTemplate,
      params: {
        eventId: input.eventId,
        inquiryId: input.inquiry.id,
        reference: input.inquiry.reference,
        coverageQueue: "intake",
        queueUrl: "https://staff-staging.example.test/bg/inquiries",
      },
    });
    const provider = new TestMessageProvider();
    expect(await dispatchMessage(t.db, provider, result.id)).toBe("cancelled");
    expect(provider.sent).toEqual([]);
  });

  it("recovery quarantine blocks consumption and dispatch", async () => {
    const input = await received();
    await sweepInquiryCoverageNotices(t.db, queue);
    const effect = await action(input.eventId);
    if (!effect) throw new Error("Effect missing");
    const pending = await received();
    await quarantineRestoredDatabase(t.db, {
      restoreId: randomUUID(),
      snapshotDigest: "a".repeat(64),
    });
    try {
      await expect(sweepInquiryCoverageNotices(t.db, queue)).rejects.toThrow("Recovery quarantine");
      const provider = new TestMessageProvider();
      await expect(dispatchMessage(t.db, provider, effect.id)).rejects.toThrow(
        "Recovery quarantine",
      );
      expect(provider.sent).toEqual([]);
      expect(await event(pending.eventId)).toMatchObject({ state: "pending" });
    } finally {
      await t.db.update(recoveryControl).set({ state: "normal" });
    }
  });

  it("the registered pg-boss sweep consumes intent and dispatches its notice", async () => {
    const input = await received();
    const provider = new TestMessageProvider();
    await registerWorkers(queue, { db: t.db, provider });
    await queue.send("inquiry_notices.sweep", {});
    await vi.waitFor(
      async () => {
        expect(await action(input.eventId)).toMatchObject({
          state: "acknowledged",
          verifiedAt: null,
        });
      },
      { timeout: 15_000, interval: 200 },
    );
    expect(await event(input.eventId)).toMatchObject({ state: "dispatched" });
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]?.recipient).toBe("reviewed-test-inbox@example.test");
  }, 30_000);
});
