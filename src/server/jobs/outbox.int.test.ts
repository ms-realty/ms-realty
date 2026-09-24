import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { outboxMessages } from "@/db/schema";
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

// Outbox delivery states (spec §07.5): accepted is not delivered, unknown is never re-sent.
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
  (await t.db.select().from(outboxMessages).where(eq(outboxMessages.id, id)))[0];

describe("outbox", () => {
  it("enqueueing the same logical message twice yields one message", async () => {
    const input = message();
    const a = await enqueueMessage(t.db, input);
    const b = await enqueueMessage(t.db, input);
    expect(b).toEqual({ id: a.id, created: false });
  });

  it("records provider acceptance separately from delivery", async () => {
    const provider = new TestMessageProvider();
    const { id } = await enqueueMessage(
      t.db,
      message({ secretParams: { url: "https://x/secret" } }),
    );
    expect(await dispatchMessage(t.db, provider, id)).toBe("provider_accepted");
    expect(provider.sent[0]).toMatchObject({
      outboxId: id,
      secretParams: { url: "https://x/secret" },
    });
    const accepted = await stateOf(id);
    expect(accepted).toMatchObject({ state: "provider_accepted", attempts: 1, secretParams: null });
    expect(accepted?.deliveredAt).toBeNull();

    expect(
      await recordDeliveryReport(t.db, {
        provider: "test",
        providerMessageId: accepted?.providerMessageId ?? "",
        status: "delivered",
      }),
    ).toBe(true);
    expect((await stateOf(id))?.state).toBe("delivered");
    // Dispatching again is a no-op: one logical message, one send.
    expect(await dispatchMessage(t.db, provider, id)).toBe("delivered");
    expect(provider.sent).toHaveLength(1);
  });

  it("parks a timed-out send as outcome_unknown and never re-sends it", async () => {
    const provider = new TestMessageProvider();
    provider.script("throw");
    const { id } = await enqueueMessage(t.db, message());
    expect(await dispatchMessage(t.db, provider, id)).toBe("outcome_unknown");
    await dispatchQueued(t.db, provider);
    expect(await dispatchMessage(t.db, provider, id)).toBe("outcome_unknown");
    expect(provider.sent.filter((m) => m.outboxId === id)).toHaveLength(1);
    expect(await stateOf(id)).toMatchObject({
      lastErrorCode: "provider_unreachable",
      secretParams: null,
    });

    expect(await reconcileMessage(t.db, id, { state: "failed", code: "not_received" })).toBe(true);
    expect((await stateOf(id))?.state).toBe("failed");
    expect(await reconcileMessage(t.db, id, { state: "delivered" })).toBe(false);
  });

  it("requeues a definite transient rejection, keeping its secret, up to the attempt limit", async () => {
    const provider = new TestMessageProvider();
    const rejected = { status: "rejected" as const, code: "throttled", retryable: true };
    provider.script(rejected, rejected, rejected);
    const { id } = await enqueueMessage(t.db, message({ secretParams: { url: "https://x/s" } }));
    expect(await dispatchMessage(t.db, provider, id)).toBe("queued");
    expect((await stateOf(id))?.secretParams).toEqual({ url: "https://x/s" });
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
      await vi.waitFor(async () => expect((await stateOf(id))?.state).toBe("provider_accepted"), {
        timeout: 15_000,
        interval: 200,
      });
      expect(provider.sent.map((m) => m.idempotencyKey)).not.toContain("rolled-back");
    } finally {
      await queue.stop();
    }
  }, 30_000);
});
