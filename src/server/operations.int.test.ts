import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { operationReceipts, persons } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import type { Actor } from "@/domain/capabilities";
import { hashRequest } from "./crypto";
import { AppError } from "./errors";
import { findOperation, reconcileOperation, runOperation } from "./operations";

// AD6 operation receipts: A18 (double submit, timeout, reload), A40, A72.
let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

const visitor: Actor = { kind: "visitor", id: "submission-a" };
let keyCounter = 0;
const key = () => {
  keyCounter += 1;
  return `key-${keyCounter}`;
};

/** A command that creates one person, so executions are countable. */
function createPerson(name: string) {
  return async ({ tx }: { tx: Parameters<Parameters<typeof t.db.transaction>[0]>[0] }) => {
    const [row] = await tx
      .insert(persons)
      .values({ displayName: name })
      .returning({ id: persons.id });
    return { personId: row?.id };
  };
}

const countPeople = async (name: string) =>
  (await t.db.select().from(persons).where(eq(persons.displayName, name))).length;

describe("runOperation", () => {
  it("double submit: both calls converge on one execution and one outcome", async () => {
    const input = {
      actor: visitor,
      type: "test.create",
      idempotencyKey: key(),
      requestHash: hashRequest({ a: 1 }),
    };
    const [first, second] = await Promise.allSettled([
      runOperation(t.db, input, createPerson("double")),
      runOperation(t.db, input, createPerson("double")),
    ]);
    // One runs; the other either sees it pending or (if it arrived after) replays it.
    const outcomes = [first, second].map((r) =>
      r.status === "fulfilled" ? "done" : (r.reason as AppError).code,
    );
    expect(outcomes).toContain("done");
    expect(outcomes.every((o) => o === "done" || o === "operation_pending")).toBe(true);
    const retry = await runOperation(t.db, input, createPerson("double"));
    expect(retry.replayed).toBe(true);
    expect(await countPeople("double")).toBe(1);
  });

  it("retry after a client timeout returns the stored outcome without re-running", async () => {
    const input = {
      actor: visitor,
      type: "test.create",
      idempotencyKey: key(),
      requestHash: hashRequest({ b: 1 }),
    };
    const first = await runOperation(t.db, input, createPerson("timeout"));
    // The client never saw `first`; it asks again with the same key and body.
    const retry = await runOperation(t.db, input, createPerson("timeout"));
    expect(retry).toEqual({ ...first, replayed: true });
    expect(first.replayed).toBe(false);
    expect(await countPeople("timeout")).toBe(1);
    expect(await findOperation(t.db, visitor, "test.create", input.idempotencyKey)).toMatchObject({
      status: "succeeded",
      outcome: first.outcome,
    });
  });

  it("same key with a different payload is a conflict and runs nothing", async () => {
    const idempotencyKey = key();
    await runOperation(
      t.db,
      {
        actor: visitor,
        type: "test.create",
        idempotencyKey,
        requestHash: hashRequest({ amount: 1 }),
      },
      createPerson("payload"),
    );
    await expect(
      runOperation(
        t.db,
        {
          actor: visitor,
          type: "test.create",
          idempotencyKey,
          requestHash: hashRequest({ amount: 2 }),
        },
        createPerson("payload"),
      ),
    ).rejects.toMatchObject({ code: "idempotency_key_reused", status: 409 });
    expect(await countPeople("payload")).toBe(1);
  });

  it("keys are scoped per actor and operation type", async () => {
    const idempotencyKey = key();
    const requestHash = hashRequest({});
    const other: Actor = { kind: "visitor", id: "submission-b" };
    const a = await runOperation(
      t.db,
      { actor: visitor, type: "test.create", idempotencyKey, requestHash },
      createPerson("scoped"),
    );
    const b = await runOperation(
      t.db,
      { actor: other, type: "test.create", idempotencyKey, requestHash },
      createPerson("scoped"),
    );
    expect(a.operationId).not.toBe(b.operationId);
    expect(await countPeople("scoped")).toBe(2);
  });

  it("an in-flight duplicate is told the first call is pending", async () => {
    const input = {
      actor: visitor,
      type: "test.slow",
      idempotencyKey: key(),
      requestHash: hashRequest({}),
    };
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const running = new Promise<void>((resolve) => {
      started = resolve;
    });
    const first = runOperation(t.db, input, async (ctx) => {
      started();
      await gate;
      return createPerson("slow")(ctx);
    });
    await running;
    await expect(runOperation(t.db, input, createPerson("slow"))).rejects.toMatchObject({
      code: "operation_pending",
      retryable: true,
    });
    release();
    await first;
    expect((await runOperation(t.db, input, createPerson("slow"))).replayed).toBe(true);
    expect(await countPeople("slow")).toBe(1);
  });

  it("a non-retryable failure is stored and replayed, and its writes are rolled back", async () => {
    const input = {
      actor: visitor,
      type: "test.fail",
      idempotencyKey: key(),
      requestHash: hashRequest({}),
    };
    const failing = async (ctx: Parameters<Parameters<typeof runOperation>[2]>[0]) => {
      await createPerson("failed")(ctx);
      throw new AppError("version_conflict", { current: { version: 3 } });
    };
    await expect(runOperation(t.db, input, failing)).rejects.toMatchObject({
      code: "version_conflict",
      current: { version: 3 },
    });
    await expect(runOperation(t.db, input, createPerson("failed"))).rejects.toMatchObject({
      code: "version_conflict",
    });
    expect(await countPeople("failed")).toBe(0);
  });

  it("a retryable failure leaves no receipt, so the retry executes", async () => {
    const input = {
      actor: visitor,
      type: "test.retryable",
      idempotencyKey: key(),
      requestHash: hashRequest({}),
    };
    await expect(
      runOperation(t.db, input, async () => {
        throw new AppError("unavailable");
      }),
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(await findOperation(t.db, visitor, input.type, input.idempotencyKey)).toBeNull();
    const retry = await runOperation(t.db, input, createPerson("retryable"));
    expect(retry.replayed).toBe(false);
  });

  it("an external effect with unknown outcome is parked, never re-run, until reconciled", async () => {
    const input = {
      actor: visitor,
      type: "test.external",
      idempotencyKey: key(),
      requestHash: hashRequest({}),
    };
    let calls = 0;
    const external = async () => {
      calls += 1;
      throw new AppError("unavailable", { outcome: "unknown", detail: "provider timed out" });
    };
    await expect(runOperation(t.db, input, external)).rejects.toMatchObject({
      code: "outcome_unknown",
    });
    await expect(runOperation(t.db, input, external)).rejects.toMatchObject({
      code: "outcome_unknown",
    });
    expect(calls).toBe(1);

    const receipt = await findOperation(t.db, visitor, input.type, input.idempotencyKey);
    expect(receipt?.status).toBe("outcome_unknown");
    expect(
      await reconcileOperation(t.db, receipt?.operationId ?? "", {
        status: "succeeded",
        outcome: { providerReference: "p-1" },
      }),
    ).toBe(true);
    const replay = await runOperation(t.db, input, external);
    expect(replay).toMatchObject({ replayed: true, outcome: { providerReference: "p-1" } });
    expect(calls).toBe(1);
  });

  it("unexpected errors roll back everything and propagate", async () => {
    const input = {
      actor: visitor,
      type: "test.crash",
      idempotencyKey: key(),
      requestHash: hashRequest({}),
    };
    await expect(
      runOperation(t.db, input, async (ctx) => {
        await createPerson("crash")(ctx);
        throw new Error("bug");
      }),
    ).rejects.toThrow("bug");
    expect(await countPeople("crash")).toBe(0);
    const rows = await t.db
      .select()
      .from(operationReceipts)
      .where(eq(operationReceipts.idempotencyKey, input.idempotencyKey));
    expect(rows).toHaveLength(0);
  });
});
