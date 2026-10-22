import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appointments,
  briefRevisions,
  cases,
  currentPublications,
  grants,
  interests,
  messages,
  operations,
  tasks,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { readCaseCandidate } from "../cases/matching";
import { caseFixture } from "../cases/testing";
import { createListingFixture, defaultFacts, publishForTest } from "../publication/testing";
import {
  type MaterializeWorkspaceProposalInput,
  materializeWorkspaceProposal,
} from "./workspace-materialize";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

function handoff(
  f: Awaited<ReturnType<typeof caseFixture>>,
  listingIds: string[] = [],
): MaterializeWorkspaceProposalInput {
  return {
    operationId: randomUUID(),
    parent: { type: "case", id: f.record.id, expectedVersion: 1 },
    proposal: {
      kind: "buyer_handoff",
      title: "Reviewed buyer handoff",
      body: "Review the requirements and each candidate before acting.",
      citations: [],
      requirements: "An apartment matching the reviewed requirements",
      preferences: "Near the centre",
      listingIds,
    },
  };
}
type Candidate = Awaited<ReturnType<typeof readCaseCandidate>>;
function review(
  listingId: string,
  candidate: Candidate,
  decision: "suggest" | "propose_despite_mismatch" = "suggest",
) {
  return {
    listingId,
    manifestId: candidate.candidate.manifestId,
    availability: candidate.candidate.availability.presented,
    violated: [...candidate.violated],
    unconfirmed: [...candidate.unconfirmed],
    explanation: "The person reviewed the current listing facts against the explicit criteria.",
    decision,
  };
}
async function currentCriteria(
  f: Awaited<ReturnType<typeof caseFixture>>,
  criteria: Record<string, unknown>,
) {
  await t.db.update(briefRevisions).set({ criteria }).where(eq(briefRevisions.caseId, f.record.id));
}
async function candidate(f: Awaited<ReturnType<typeof caseFixture>>, reference: string) {
  return readCaseCandidate(t.db, f.staff.session, { id: f.record.id, reference, briefRevision: 1 });
}

describe("F29 person materialization through ordinary commands", () => {
  it("materializes an internal task as the current person without executing its named work", async () => {
    const f = await caseFixture(t.db);
    const before = await Promise.all(
      [messages, appointments, currentPublications, grants].map((table) =>
        t.db.select().from(table),
      ),
    );
    const input: MaterializeWorkspaceProposalInput = {
      operationId: randomUUID(),
      parent: { type: "case", id: f.record.id, expectedVersion: 1 },
      proposal: {
        kind: "task",
        title: "Review a possible customer reply",
        body: "Prepare source-backed wording for a person to review.",
        citations: [],
      },
      taskType: "communication",
    };
    const done = await materializeWorkspaceProposal(t.db, f.staff.session, input);
    expect(done).toMatchObject({
      replayed: false,
      outcome: { type: "task", version: 1, parentVersion: 2 },
    });
    expect(done.butlerReceipt).toBeUndefined();
    expect((await materializeWorkspaceProposal(t.db, f.staff.session, input)).outcome).toEqual(
      done.outcome,
    );
    const [task] = await t.db.select().from(tasks).where(eq(tasks.id, done.outcome.id));
    expect(task).toMatchObject({
      ownerId: f.staff.id,
      state: "open",
      promisedToClient: false,
      completedAt: null,
      type: "communication",
    });
    const after = await Promise.all(
      [messages, appointments, currentPublications, grants].map((table) =>
        t.db.select().from(table),
      ),
    );
    expect(after.map((rows) => rows.length)).toEqual(before.map((rows) => rows.length));
  });

  it("persists a new broker Brief and explicit manual candidate handoff without inventing fit or client consent", async () => {
    const f = await caseFixture(t.db);
    const listing = await createListingFixture(t.db, { reviewerId: f.staff.id });
    await publishForTest(t.db, f.staff.actor, listing);
    const input = handoff(f, [listing.listingId]);
    const done = await materializeWorkspaceProposal(t.db, f.staff.session, input);
    expect(done.outcome).toEqual({
      type: "case",
      id: f.record.id,
      version: 2,
      briefRevision: 2,
      interestIds: [],
      manualReviewListingIds: [listing.listingId],
    });
    expect(await materializeWorkspaceProposal(t.db, f.staff.session, input)).toMatchObject({
      replayed: true,
      outcome: done.outcome,
    });
    await expect(
      materializeWorkspaceProposal(t.db, f.staff.session, { ...input, operationId: randomUUID() }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    const rows = await t.db
      .select()
      .from(briefRevisions)
      .where(eq(briefRevisions.caseId, f.record.id));
    expect(rows).toHaveLength(2);
    const saved = rows.find((row) => row.revisionNumber === 2);
    expect(saved).toMatchObject({
      authorKind: "staff",
      authorId: f.staff.id,
      clientAcknowledgedAt: null,
      criteria: {},
    });
    expect(saved?.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ origin: "broker_interpretation" })]),
    );
    expect(await t.db.select().from(interests).where(eq(interests.caseId, f.record.id))).toEqual(
      [],
    );
  });

  it("uses the updated Brief and sequential Case versions for independently reviewed suggested interests", async () => {
    const f = await caseFixture(t.db);
    const a = await createListingFixture(t.db, { reviewerId: f.staff.id });
    const b = await createListingFixture(t.db, { reviewerId: f.staff.id });
    await publishForTest(t.db, f.staff.actor, a);
    await publishForTest(t.db, f.staff.actor, b);
    const criteria = { purpose: "sale" as const };
    await currentCriteria(f, criteria);
    const input = handoff(f, [a.listingId, b.listingId]);
    input.buyerReview = {
      criteria,
      candidates: [
        review(a.listingId, await candidate(f, a.reference)),
        review(b.listingId, await candidate(f, b.reference)),
      ],
    };
    const done = await materializeWorkspaceProposal(t.db, f.staff.session, input);
    expect(done.outcome).toMatchObject({
      type: "case",
      version: 4,
      briefRevision: 2,
      manualReviewListingIds: [],
    });
    expect(done.outcome.interestIds).toHaveLength(2);
    const suggestions = await t.db
      .select()
      .from(interests)
      .where(eq(interests.caseId, f.record.id));
    expect(suggestions.map((row) => row.state)).toEqual(["suggested", "suggested"]);
    expect((await materializeWorkspaceProposal(t.db, f.staff.session, input)).outcome).toEqual(
      done.outcome,
    );
    await expect(
      materializeWorkspaceProposal(t.db, f.staff.session, {
        ...input,
        proposal: { ...input.proposal, body: "Different reviewed payload" },
      }),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
  });

  it("rolls back the Brief and earlier suggestions when any selected fact is unconfirmed", async () => {
    const f = await caseFixture(t.db);
    const known = await createListingFixture(t.db, {
      reviewerId: f.staff.id,
      facts: { ...defaultFacts, "feature.step_free_access": { state: "known", value: true } },
    });
    const unknown = await createListingFixture(t.db, { reviewerId: f.staff.id });
    await publishForTest(t.db, f.staff.actor, known);
    await publishForTest(t.db, f.staff.actor, unknown);
    const criteria = { purpose: "sale" as const, mustHave: ["step_free_access"] };
    await currentCriteria(f, criteria);
    const input = handoff(f, [known.listingId, unknown.listingId]);
    input.buyerReview = {
      criteria,
      candidates: [
        review(known.listingId, await candidate(f, known.reference)),
        review(unknown.listingId, await candidate(f, unknown.reference)),
      ],
    };
    await expect(materializeWorkspaceProposal(t.db, f.staff.session, input)).rejects.toMatchObject({
      code: "validation_failed",
      fieldErrors: { matchReview: ["unconfirmed_facts"] },
    });
    expect(
      await t.db.select().from(briefRevisions).where(eq(briefRevisions.caseId, f.record.id)),
    ).toHaveLength(1);
    expect(await t.db.select().from(interests).where(eq(interests.caseId, f.record.id))).toEqual(
      [],
    );
    const [parent] = await t.db.select().from(cases).where(eq(cases.id, f.record.id));
    expect(parent?.version).toBe(1);
    const operationRows = await t.db
      .select()
      .from(operations)
      .where(eq(operations.actorId, f.staff.id));
    expect(operationRows.filter((row) => row.operationType === "case.brief.revise")).toHaveLength(
      0,
    );
    expect(operationRows.filter((row) => row.operationType === "case.interest.add")).toHaveLength(
      0,
    );
  });

  it("requires an explicit human alternative decision for a hard mismatch", async () => {
    const f = await caseFixture(t.db);
    const listing = await createListingFixture(t.db, {
      reviewerId: f.staff.id,
      propertyType: "house",
    });
    await publishForTest(t.db, f.staff.actor, listing);
    const criteria = { purpose: "sale" as const, propertyTypes: ["apartment" as const] };
    await currentCriteria(f, criteria);
    const checked = await candidate(f, listing.reference);
    expect(checked.violated).toContain("propertyType");
    const input = handoff(f, [listing.listingId]);
    input.buyerReview = { criteria, candidates: [review(listing.listingId, checked)] };
    await expect(materializeWorkspaceProposal(t.db, f.staff.session, input)).rejects.toMatchObject({
      code: "validation_failed",
      fieldErrors: { alternativeDecision: ["required_for_hard_mismatch"] },
    });
    input.operationId = randomUUID();
    input.buyerReview.candidates[0] = review(
      listing.listingId,
      checked,
      "propose_despite_mismatch",
    );
    expect(
      (await materializeWorkspaceProposal(t.db, f.staff.session, input)).outcome.interestIds,
    ).toHaveLength(1);
    const [suggestion] = await t.db
      .select()
      .from(interests)
      .where(eq(interests.caseId, f.record.id));
    expect(suggestion?.state).toBe("suggested");
  });

  it("rejects stale manifests and current authority revocation without partial business state", async () => {
    const f = await caseFixture(t.db);
    const listing = await createListingFixture(t.db, { reviewerId: f.staff.id });
    await publishForTest(t.db, f.staff.actor, listing);
    const criteria = { purpose: "sale" as const };
    await currentCriteria(f, criteria);
    const input = handoff(f, [listing.listingId]);
    input.buyerReview = {
      criteria,
      candidates: [
        {
          ...review(listing.listingId, await candidate(f, listing.reference)),
          manifestId: randomUUID(),
        },
      ],
    };
    await expect(materializeWorkspaceProposal(t.db, f.staff.session, input)).rejects.toMatchObject({
      code: "version_conflict",
    });
    expect(
      await t.db.select().from(briefRevisions).where(eq(briefRevisions.caseId, f.record.id)),
    ).toHaveLength(1);
    const manual = handoff(f, [listing.listingId]);
    await materializeWorkspaceProposal(t.db, f.staff.session, manual);
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(eq(grants.principalId, f.staff.id));
    await expect(materializeWorkspaceProposal(t.db, f.staff.session, manual)).rejects.toMatchObject(
      { code: "not_found" },
    );
    await expect(
      materializeWorkspaceProposal(t.db, f.client.session, manual),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
