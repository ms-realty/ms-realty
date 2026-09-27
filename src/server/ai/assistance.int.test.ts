import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assistanceRuns, grants, inquiries, messages, passkeys, tasks } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "../auth/sessions";
import { JobQueue } from "../jobs/queue";
import { createStaff } from "../testing";
import {
  processAssistanceRun,
  readAssistanceRun,
  requestAssistance,
  reviewAssistance,
} from "./assistance";
import type { AssistanceConfig } from "./config";
import type { DraftGenerator } from "./provider";

let t: TestDatabase;
let queue: JobQueue;
const config: AssistanceConfig = {
  enabled: true,
  model: "synthetic-provider-model",
  apiKey: "never-used",
  inputCostMicros: 1,
  outputCostMicros: 2,
  dailyLimitMicros: 10000000,
  maxOutputTokens: 1024,
  timeoutMs: 1000,
};
beforeAll(async () => {
  t = await createTestDatabase();
  queue = new JobQueue(t.url, { producer: true });
  await queue.start();
});
afterAll(async () => {
  await queue?.stop();
  await t?.drop();
});
async function fixture() {
  const person = await createStaff(t.db, { roles: ["assigned_broker"] });
  await t.db.insert(passkeys).values(
    [0, 1].map(() => ({
      principalId: person.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  const { session } = await createSession(t.db, { kind: "staff", id: person.id });
  const [source] = await t.db
    .insert(inquiries)
    .values({
      reference: `RQ-${randomUUID()}`,
      purpose: "question",
      source: "website",
      submissionKey: randomUUID(),
      payloadDigest: "synthetic",
      preferredLocale: "en",
      message: "I seek 2 bedrooms. Contact me at private@example.test.",
      coverageQueue: "new",
    })
    .returning();
  if (!source) throw new Error("Missing synthetic source");
  const input = {
    id: source.id,
    expectedVersion: 1,
    operationId: randomUUID(),
    task: "reply_draft" as const,
    sourceReviewed: true as const,
  };
  return { person, session, source, input };
}
const generate: DraftGenerator = async () => ({
  output: {
    body: "You asked about 2 bedrooms. A broker will review your request.",
    citations: [{ field: "message", quote: "2 bedrooms" }],
    warnings: ["No property availability is confirmed."],
  },
  inputTokens: 100,
  outputTokens: 60,
});

describe("source-bound Hermes drafts on PostgreSQL", () => {
  it("atomically queues once, records a minimized draft, and human acceptance has no message/task effect", async () => {
    const f = await fixture();
    const result = await requestAssistance(t.db, f.session, f.input, { queue, config });
    expect((await requestAssistance(t.db, f.session, f.input, { queue, config })).outcome).toEqual(
      result.outcome,
    );
    const jobs = await t.db.execute(
      sql`select id from pgboss.job where name = 'ai.draft' and data->>'runId' = ${result.outcome.id}`,
    );
    expect(jobs).toHaveLength(1);
    await processAssistanceRun(t.db, result.outcome.id, { config, generate });
    const { run, sourceCurrent } = await readAssistanceRun(t.db, f.session, result.outcome.id);
    expect(sourceCurrent).toBe(true);
    expect(run.state).toBe("draft");
    expect(JSON.stringify(run.sourceSnapshot)).not.toContain("private@example.test");
    expect(run.actualCostMicros).toBe(220);
    expect(run.validation).toMatchObject({ factualApproval: "human_required" });
    await reviewAssistance(t.db, f.session, {
      id: run.id,
      expectedVersion: run.version,
      operationId: randomUUID(),
      decision: "accepted",
      reviewed: true,
    });
    expect((await readAssistanceRun(t.db, f.session, run.id)).run).toMatchObject({
      state: "accepted",
      reviewedById: f.person.id,
    });
    expect(await t.db.select().from(messages)).toHaveLength(0);
    expect(await t.db.select().from(tasks)).toHaveLength(0);
  });
  it("source drift before generation prevents a call and drift after generation blocks review", async () => {
    const f = await fixture();
    const result = await requestAssistance(t.db, f.session, f.input, { queue, config });
    await t.db
      .update(inquiries)
      .set({ version: 2, message: "Changed intent" })
      .where(eq(inquiries.id, f.source.id));
    const spy = vi.fn(generate);
    await expect(
      processAssistanceRun(t.db, result.outcome.id, { config, generate: spy }),
    ).rejects.toThrow("source_changed");
    expect(spy).not.toHaveBeenCalled();
    expect((await readAssistanceRun(t.db, f.session, result.outcome.id)).run).toMatchObject({
      state: "stale",
      actualCostMicros: 0,
    });
    const fresh = await requestAssistance(
      t.db,
      f.session,
      { ...f.input, operationId: randomUUID(), expectedVersion: 2 },
      { queue, config },
    );
    await processAssistanceRun(t.db, fresh.outcome.id, {
      config,
      generate: async () => ({
        output: {
          body: "Changed intent",
          citations: [{ field: "message", quote: "Changed intent" }],
          warnings: [],
        },
        inputTokens: 10,
        outputTokens: 10,
      }),
    });
    const { run } = await readAssistanceRun(t.db, f.session, fresh.outcome.id);
    await t.db.update(inquiries).set({ version: 3 }).where(eq(inquiries.id, f.source.id));
    await expect(
      reviewAssistance(t.db, f.session, {
        id: run.id,
        expectedVersion: run.version,
        operationId: randomUUID(),
        decision: "accepted",
        reviewed: true,
      }),
    ).rejects.toMatchObject({ code: "approval_stale" });
  });
  it("revoked source access blocks worker execution and snapshot readback", async () => {
    const f = await fixture();
    const result = await requestAssistance(t.db, f.session, f.input, { queue, config });
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(eq(grants.principalId, f.person.id));
    const spy = vi.fn(generate);
    await expect(
      processAssistanceRun(t.db, result.outcome.id, { config, generate: spy }),
    ).rejects.toThrow("source_access_changed");
    expect(spy).not.toHaveBeenCalled();
    await expect(readAssistanceRun(t.db, f.session, result.outcome.id)).rejects.toMatchObject({
      code: "not_found",
    });
  });
  it("disabled provider, exhausted budget and in-flight work leave ordinary source records intact", async () => {
    const f = await fixture();
    await expect(
      requestAssistance(t.db, f.session, f.input, { queue, config: { ...config, enabled: false } }),
    ).rejects.toMatchObject({ code: "unavailable" });
    await expect(
      requestAssistance(t.db, f.session, f.input, {
        queue,
        config: { ...config, dailyLimitMicros: 1 },
      }),
    ).rejects.toMatchObject({ code: "rate_limited" });
    const result = await requestAssistance(t.db, f.session, f.input, { queue, config });
    await expect(
      requestAssistance(
        t.db,
        f.session,
        { ...f.input, operationId: randomUUID() },
        { queue, config },
      ),
    ).rejects.toMatchObject({ code: "rate_limited" });
    await expect(
      processAssistanceRun(t.db, result.outcome.id, {
        config,
        generate: async () => {
          throw new Error("timeout");
        },
      }),
    ).rejects.toThrow("timeout");
    const [failed] = await t.db
      .select()
      .from(assistanceRuns)
      .where(eq(assistanceRuns.id, result.outcome.id));
    expect(failed).toMatchObject({ state: "failed", actualCostMicros: null });
    expect(failed?.reservedCostMicros).toBeGreaterThan(0);
    expect(
      (await t.db.select().from(inquiries).where(eq(inquiries.id, f.source.id)))[0]?.version,
    ).toBe(1);
  });
  it("fabricated pointers are rejected and duplicate worker delivery does not call the provider twice", async () => {
    const f = await fixture();
    const result = await requestAssistance(t.db, f.session, f.input, { queue, config });
    const spy = vi.fn(async () => ({
      output: {
        body: "Draft",
        citations: [{ field: "message", quote: "Invented quote" }],
        warnings: [],
      },
      inputTokens: 10,
      outputTokens: 10,
    }));
    await expect(
      processAssistanceRun(t.db, result.outcome.id, { config, generate: spy }),
    ).rejects.toThrow("invalid_source_pointer");
    await processAssistanceRun(t.db, result.outcome.id, { config, generate: spy });
    expect(spy).toHaveBeenCalledTimes(1);
    expect((await readAssistanceRun(t.db, f.session, result.outcome.id)).run.output).toBeNull();
  });
});
