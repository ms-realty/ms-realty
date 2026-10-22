import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { externalActions } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import {
  dispatchMessage,
  dispatchQueued,
  enqueueMessage,
  reconcileMessage,
  recordDeliveryReport,
} from "./outbox";
import { TestMessageProvider } from "./provider";
import { JobQueue, registerWorkers } from "./queue";

// Email delivery on the external-action ledger (architecture §9, §15): provider acceptance
// (acknowledged) is not delivery (verified), and an unknown outcome is never re-sent (AT46, AT47).
let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

let counter = 0;
const message = (overrides: Partial<Parameters<typeof enqueueMessage>[1]> = {}) => {
  counter += 1;
  return {
    idempotencyKey: `test:${counter}`,
    channel: "email" as const,
    recipient: "person@example.test",
    template: "test.notice",
    params: { locale: "en" },
    ...overrides,
  };
};
const stateOf = async (id: string) =>
  (await t.db.select().from(externalActions).where(eq(externalActions.id, id)))[0];

describe("outbox", () => {
  it("AT46: enqueueing the same logical send twice yields one external action", async () => {
    const input = message();
    const a = await enqueueMessage(t.db, input);
    const b = await enqueueMessage(t.db, input);
    expect(b).toEqual({ id: a.id, created: false });
  });

  it("AT46: an existing send key cannot silently accept another recipient, content or secret", async () => {
    const input = message({ secretParams: { url: "https://example.test/first-token" } });
    const first = await enqueueMessage(t.db, input);
    for (const change of [
      { recipient: "another@example.test" },
      { params: { locale: "bg" } },
      { template: "different.notice" },
      { messageId: "b68f5b89-8c16-4d10-8c58-e874157af49d" },
      { secretParams: { url: "https://example.test/replacement-token" } },
    ]) {
      await expect(enqueueMessage(t.db, { ...input, ...change })).rejects.toMatchObject({
        code: "idempotency_key_reused",
      });
    }
    const provider = new TestMessageProvider();
    await dispatchMessage(t.db, provider, first.id);
    expect(await enqueueMessage(t.db, input)).toEqual({ id: first.id, created: false });
    await expect(
      enqueueMessage(t.db, {
        ...input,
        secretParams: { url: "https://example.test/replacement-token" },
      }),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
    expect(provider.sent).toHaveLength(1);
  });

  it("AT47: a definite rejection is not replayed after the provider key window", async () => {
    const provider = new TestMessageProvider();
    provider.script({ status: "rejected", code: "throttled", retryable: true });
    const { id } = await enqueueMessage(t.db, message());
    const now = new Date();
    expect(await dispatchMessage(t.db, provider, id, now)).toBe("queued");
    expect(await dispatchMessage(t.db, provider, id, new Date(now.getTime() + 86_400_000))).toBe(
      "cancelled",
    );
    expect(provider.sent).toHaveLength(1);
    expect(await stateOf(id)).toMatchObject({
      lastErrorCode: "retry_window_expired",
      secretPayload: null,
    });
  });

  it("rejects replacement of a queued access-link secret before any provider call", async () => {
    const provider = new TestMessageProvider();
    const { id } = await enqueueMessage(
      t.db,
      message({ secretParams: { url: "https://example.test/original" } }),
    );
    await t.db
      .update(externalActions)
      .set({ secretPayload: { url: "https://example.test/replaced" } })
      .where(eq(externalActions.id, id));
    expect(await dispatchMessage(t.db, provider, id)).toBe("cancelled");
    expect(await stateOf(id)).toMatchObject({
      lastErrorCode: "secret_digest_mismatch",
      secretPayload: null,
    });
    expect(provider.sent).toHaveLength(0);
  });

  it("concurrent conflicting enqueues commit exactly one payload", async () => {
    const input = message();
    const results = await Promise.allSettled([
      enqueueMessage(t.db, input),
      enqueueMessage(t.db, { ...input, recipient: "other@example.test" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "idempotency_key_reused" },
    });
  });

  it("records provider acceptance separately from delivery", async () => {
    const provider = new TestMessageProvider();
    const { id } = await enqueueMessage(
      t.db,
      message({ secretParams: { url: "https://x/secret" } }),
    );
    expect(await dispatchMessage(t.db, provider, id)).toBe("acknowledged");
    expect(provider.sent[0]).toMatchObject({
      outboxId: id,
      secretParams: { url: "https://x/secret" },
    });
    const accepted = await stateOf(id);
    expect(accepted).toMatchObject({ state: "acknowledged", attempts: 1, secretPayload: null });
    expect(accepted?.verifiedAt).toBeNull();

    expect(
      await recordDeliveryReport(t.db, {
        provider: "test",
        providerMessageId: accepted?.providerReference ?? "",
        status: "delivered",
      }),
    ).toBe(true);
    expect((await stateOf(id))?.state).toBe("verified");
    // Dispatching again is a no-op: one logical send, one provider call.
    expect(await dispatchMessage(t.db, provider, id)).toBe("verified");
    expect(provider.sent).toHaveLength(1);
  });

  it("AT47: parks a timed-out send as outcome_unknown and never re-sends it", async () => {
    const provider = new TestMessageProvider();
    provider.script("throw");
    const { id } = await enqueueMessage(t.db, message());
    expect(await dispatchMessage(t.db, provider, id)).toBe("outcome_unknown");
    await dispatchQueued(t.db, provider);
    expect(await dispatchMessage(t.db, provider, id)).toBe("outcome_unknown");
    expect(provider.sent.filter((m) => m.outboxId === id)).toHaveLength(1);
    expect(await stateOf(id)).toMatchObject({
      lastErrorCode: "provider_unreachable",
      secretPayload: null,
    });

    expect(await reconcileMessage(t.db, id, { state: "failed", code: "not_received" })).toBe(true);
    expect((await stateOf(id))?.state).toBe("failed");
    expect(await reconcileMessage(t.db, id, { state: "verified" })).toBe(false);
  });

  it("requeues a definite transient rejection, keeping its secret, up to the attempt limit", async () => {
    const provider = new TestMessageProvider();
    const rejected = { status: "rejected" as const, code: "throttled", retryable: true };
    provider.script(rejected, rejected, rejected);
    const { id } = await enqueueMessage(t.db, message({ secretParams: { url: "https://x/s" } }));
    expect(await dispatchMessage(t.db, provider, id)).toBe("queued");
    expect((await stateOf(id))?.secretPayload).toEqual({ url: "https://x/s" });
    expect(await dispatchMessage(t.db, provider, id)).toBe("queued");
    expect(await dispatchMessage(t.db, provider, id)).toBe("failed");
    expect(await stateOf(id)).toMatchObject({ attempts: 3, lastErrorCode: "throttled" });
  });

  it("fails a permanent rejection immediately", async () => {
    const provider = new TestMessageProvider();
    provider.script({ status: "rejected", code: "invalid_recipient", retryable: false });
    const { id } = await enqueueMessage(t.db, message());
    expect(await dispatchMessage(t.db, provider, id)).toBe("failed");
  });

  it("dispatches through pg-boss when enqueued with a queue, in the caller's transaction", async () => {
    const queue = new JobQueue(t.url);
    await queue.start();
    try {
      const provider = new TestMessageProvider();
      // A rolled-back enqueue leaves neither a message nor a job behind.
      await expect(
        t.db.transaction(async (tx) => {
          await enqueueMessage(tx, message({ idempotencyKey: "rolled-back" }), queue);
          throw new Error("abort");
        }),
      ).rejects.toThrow("abort");

      const { id } = await t.db.transaction((tx) => enqueueMessage(tx, message(), queue));
      await registerWorkers(queue, { db: t.db, provider });
      await vi.waitFor(async () => expect((await stateOf(id))?.state).toBe("acknowledged"), {
        timeout: 15_000,
        interval: 200,
      });
      expect(provider.sent.map((m) => m.idempotencyKey)).not.toContain("rolled-back");
    } finally {
      await queue.stop();
    }
  }, 30_000);
});
