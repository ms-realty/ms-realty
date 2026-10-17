import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  approvals,
  assistanceRuns,
  grants,
  listingRevisions,
  listings,
  localizedRevisions,
  passkeys,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "../auth/sessions";
import { hashRequest } from "../crypto";
import { JobQueue } from "../jobs/queue";
import { approveFactRevision, approveListingRevision } from "../publication/commands";
import { createListingFixture, listingVersion } from "../publication/testing";
import { createStaff } from "../testing";
import {
  processAssistanceRun,
  readAssistanceRun,
  requestAssistance,
  reviewAssistance,
} from "./assistance";
import { readLocaleAssistanceSource } from "./locale-source";
import type { LocaleDraftGenerator } from "./provider";

let t: TestDatabase, queue: JobQueue;
const config = {
  enabled: true,
  model: "synthetic-fixture-model",
  apiKey: "not-used",
  inputCostMicros: 1,
  outputCostMicros: 1,
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
  const actor = await createStaff(t.db, { roles: ["content_editor", "publishing_approver"] });
  await t.db.insert(passkeys).values(
    [0, 1].map(() => ({
      principalId: actor.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  const { session } = await createSession(t.db, { kind: "staff", id: actor.id });
  const listing = await createListingFixture(t.db, {
    reviewerId: actor.id,
    photos: 0,
    title: "Синтетичен апартамент",
    description: "Синтетичен апартамент с 2 спални. Само тест.",
  });
  await approveFactRevision(t.db, {
    actor: session.actor,
    operationId: randomUUID(),
    expectedRevision: 1,
    factRevisionId: listing.factRevisionId,
    scope: "Synthetic test source review",
  });
  await approveListingRevision(t.db, {
    actor: session.actor,
    operationId: randomUUID(),
    expectedRevision: (await listingVersion(t.db, listing.listingId)).version,
    reference: listing.reference,
    revisionId: listing.revisionId,
  });
  const source = await readLocaleAssistanceSource(t.db, session, listing.reference, "en");
  const input = {
    id: source.id,
    expectedVersion: source.version,
    operationId: randomUUID(),
    task: "locale.draft" as const,
    targetLocale: "en" as const,
    sourceReviewed: true as const,
  };
  return { actor, session, listing, source, input };
}
const generateLocale: LocaleDraftGenerator = async () => ({
  output: {
    title: "Synthetic apartment",
    description: "Synthetic apartment with 2 bedrooms. Test only.",
    citations: [{ field: "description", quote: "2 спални" }],
    warnings: ["Synthetic fixture, no provider called"],
  },
  inputTokens: 40,
  outputTokens: 40,
});
describe("locale.draft source-bound proposal on PostgreSQL", () => {
  it("requires enabled provider, pins approved source, queues once and review cannot create or approve a translation", async () => {
    const f = await fixture();
    await expect(
      requestAssistance(t.db, f.session, f.input, { queue, config: { ...config, enabled: false } }),
    ).rejects.toMatchObject({ code: "unavailable" });
    const input = { ...f.input, operationId: randomUUID() },
      requested = await requestAssistance(t.db, f.session, input, { queue, config });
    expect((await requestAssistance(t.db, f.session, input, { queue, config })).outcome).toEqual(
      requested.outcome,
    );
    await processAssistanceRun(t.db, requested.outcome.id, { config, generateLocale });
    const { run, sourceCurrent } = await readAssistanceRun(t.db, f.session, requested.outcome.id);
    expect(sourceCurrent).toBe(true);
    expect(run.task).toBe("locale.draft");
    expect(run.targetLocale).toBe("en");
    expect(run.state).toBe("draft");
    expect(run.sourceSnapshot).toMatchObject({
      id: f.source.id,
      protectedFactsDigest: f.source.protectedFactsDigest,
      sourceUrl: expect.stringContaining(f.listing.reference),
    });
    await reviewAssistance(t.db, f.session, {
      id: run.id,
      expectedVersion: run.version,
      operationId: randomUUID(),
      decision: "accepted",
      reviewed: true,
    });
    expect(
      await t.db
        .select()
        .from(localizedRevisions)
        .where(eq(localizedRevisions.sourceRevisionId, f.source.id)),
    ).toHaveLength(0);
    expect((await readAssistanceRun(t.db, f.session, run.id)).run.state).toBe("accepted");
  });
  it("source drift during generation discards output, retains usage and never changes facts", async () => {
    const f = await fixture(),
      { outcome } = await requestAssistance(t.db, f.session, f.input, { queue, config });
    const generate: LocaleDraftGenerator = async (...args) => {
      const [original] = await t.db
        .select()
        .from(listingRevisions)
        .where(eq(listingRevisions.id, f.source.id));
      if (!original) throw new Error("Missing fixture");
      const next = {
        ...original,
        id: randomUUID(),
        revisionNumber: 2,
        sourceCopy: {
          locale: "bg",
          text: { title: "Синтетична промяна", description: "Синтетичен апартамент с 3 спални." },
        },
        contentDigest: hashRequest("synthetic changed copy"),
      };
      await t.db.insert(listingRevisions).values(next);
      await t.db.insert(approvals).values({
        kind: "editorial",
        state: "approved",
        subjectType: "listing_revision",
        subjectId: next.id,
        subjectVersion: 2,
        subjectHash: next.contentDigest,
        requestedByKind: "staff",
        requestedById: f.actor.id,
        decidedByKind: "staff",
        decidedById: f.actor.id,
        decidedWithCapability: "listing.review_facts",
        decidedAt: new Date(),
      });
      await t.db
        .update(listings)
        .set({ approvedRevisionId: next.id })
        .where(eq(listings.id, f.listing.listingId));
      return generateLocale(...args);
    };
    await expect(
      processAssistanceRun(t.db, outcome.id, { config, generateLocale: generate }),
    ).rejects.toThrow("source_changed");
    const { run, sourceCurrent } = await readAssistanceRun(t.db, f.session, outcome.id);
    expect(run.state).toBe("stale");
    expect(run.output).toBeNull();
    expect(run.actualCostMicros).toBe(80);
    expect(sourceCurrent).toBe(false);
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
  it("expired approval and revoked source access prevent a model call and snapshot access", async () => {
    const f = await fixture(),
      { outcome } = await requestAssistance(t.db, f.session, f.input, { queue, config });
    await t.db
      .update(approvals)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(approvals.subjectId, f.source.id));
    const generate = vi.fn(generateLocale);
    await expect(
      processAssistanceRun(t.db, outcome.id, { config, generateLocale: generate }),
    ).rejects.toThrow("source_access_changed");
    expect(generate).not.toHaveBeenCalled();
    expect(
      (await t.db.select().from(assistanceRuns).where(eq(assistanceRuns.id, outcome.id)))[0]
        ?.actualCostMicros,
    ).toBe(0);
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(eq(grants.principalId, f.actor.id));
    await expect(readAssistanceRun(t.db, f.session, outcome.id)).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});
