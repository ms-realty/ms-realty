import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assistanceRuns, generativeRuns, generativeSessions } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createStaff } from "../../testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
}, 60_000);
afterAll(async () => {
  await t?.drop();
});

describe("subscription migration on retained metered history", () => {
  it("classifies only confirmed outcomes as settled and preserves ambiguous queued continuations", async () => {
    const actor = await createStaff(t.db, { roles: ["assigned_broker"] });
    const [session] = await t.db
      .insert(generativeSessions)
      .values({
        ownerId: actor.id,
        goal: "Synthetic migration evidence",
        locale: "bg",
        selection: { caseId: null, inquiryId: null, listingIds: [] },
        contextDigest: "synthetic",
      })
      .returning();
    if (!session) throw new Error("Missing synthetic session");
    const assistanceCases = [
      { state: "failed", actualCostMicros: 17, expected: "settled" },
      { state: "running", actualCostMicros: null, expected: "pending" },
      { state: "queued", actualCostMicros: null, expected: "not_started" },
      { state: "failed", actualCostMicros: null, expected: "unknown" },
      { state: "queued", actualCostMicros: null, inputTokens: 1, expected: "unknown" },
      { state: "draft", actualCostMicros: null, generatedAt: new Date(), expected: "unknown" },
    ];
    const savedAssistance = await t.db
      .insert(assistanceRuns)
      .values(
        assistanceCases.map(({ expected: _expected, ...value }) => ({
          ...value,
          requestedById: actor.id,
          task: "reply_draft",
          sourceType: "inquiry",
          sourceId: randomUUID(),
          sourceVersion: 1,
          sourceDigest: "synthetic",
          sourceSnapshot: {},
          promptVersion: "synthetic",
          schemaVersion: "synthetic",
          model: "historical",
          reservedCostMicros: 50,
        })),
      )
      .returning();
    const runCases = [
      { state: "failed" as const, actualCostMicros: 23, expected: "settled" },
      { state: "running" as const, claimId: randomUUID(), expected: "pending" },
      { state: "queued" as const, expected: "not_started" },
      { state: "failed" as const, expected: "unknown" },
      { state: "queued" as const, steps: 1, observedCostMicros: 7, expected: "unknown" },
      { state: "queued" as const, claimId: randomUUID(), steps: 1, expected: "pending" },
      { state: "review" as const, observedCostMicros: 9, expected: "unknown" },
    ];
    const savedRuns = await t.db
      .insert(generativeRuns)
      .values(
        runCases.map(({ expected: _expected, ...value }, generation) => ({
          ...value,
          sessionId: session.id,
          requestedById: actor.id,
          generation,
          policyDigest: "historical",
          budget: {
            maxSteps: 8,
            maxTotalTokens: 10000,
            maxOutputTokens: 1024,
            maxInputBytes: 4096,
            timeoutMs: 1000,
            maxElapsedMs: 5000,
            maxCostMicros: 50,
            readRetries: 1,
          },
          contextDigest: "synthetic",
          reservedCostMicros: 50,
        })),
      )
      .returning();

    // Only this random disposable database is reconstructed to the pre-migration columns.
    await t.sql`drop table chatgpt_oauth_registrations, chatgpt_oauth_hosts`;
    await t.sql`alter table assistance_runs drop column billing_mode, drop column inference_outcome`;
    await t.sql`alter table generative_runs drop column billing_mode, drop column inference_outcome`;
    await t.sql`alter table generative_checkpoints drop column billing_mode`;
    const migration = await readFile(
      new URL("../../../../db/migrations/0025_chatgpt_oauth.sql", import.meta.url),
      "utf8",
    );
    await t.sql.begin(async (tx) => {
      for (const statement of migration.split("--> statement-breakpoint"))
        if (statement.trim()) await tx.unsafe(statement);
    });
    for (const [index, saved] of savedAssistance.entries()) {
      const [row] = await t.db.select().from(assistanceRuns).where(eq(assistanceRuns.id, saved.id));
      expect(row).toMatchObject({
        billingMode: "metered_usd",
        inferenceOutcome: assistanceCases[index]?.expected,
        actualCostMicros: saved.actualCostMicros,
        reservedCostMicros: saved.reservedCostMicros,
        inputTokens: saved.inputTokens,
        outputTokens: saved.outputTokens,
      });
    }
    for (const [index, saved] of savedRuns.entries()) {
      const [row] = await t.db.select().from(generativeRuns).where(eq(generativeRuns.id, saved.id));
      expect(row).toMatchObject({
        billingMode: "metered_usd",
        inferenceOutcome: runCases[index]?.expected,
        actualCostMicros: saved.actualCostMicros,
        reservedCostMicros: saved.reservedCostMicros,
        observedCostMicros: saved.observedCostMicros,
      });
    }
    const saved = savedRuns[0];
    if (!saved) throw new Error("Missing metered history");
    await expect(
      t.db
        .update(generativeRuns)
        .set({ billingMode: "chatgpt_subscription" })
        .where(eq(generativeRuns.id, saved.id)),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(
      t.db
        .update(generativeRuns)
        .set({ inferenceOutcome: "pending", claimId: null })
        .where(eq(generativeRuns.id, saved.id)),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });
});
