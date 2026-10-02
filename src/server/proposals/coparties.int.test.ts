import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { caseParticipants, proposalRevisions } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "../auth/sessions";
import { createClient } from "../testing";
import { readProposal } from "./queries";
import { recordProposalDecision, reviseProposal, transitionProposal } from "./service";
import { partySnapshotsSchema } from "./terms";
import { prepareProposalAgreement, proposalCounterparty, proposalFixture } from "./testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
async function fixture() {
  const f = await proposalFixture(t.db),
    co = await createClient(t.db, { email: `co-${randomUUID()}@example.test` });
  const signed = await createSession(t.db, { kind: "client", id: co.id });
  await t.db
    .insert(caseParticipants)
    .values({ caseId: f.record.id, partyId: co.partyId, role: "co_buyer" });
  const command = {
    id: f.proposal.id,
    revisionId: f.revision.id,
    expectedVersion: 1,
    operationId: randomUUID(),
    clientPartyId: f.client.partyId,
    additionalPartyIds: [co.partyId],
    reason: "Include the second required buyer",
    ...f.terms,
  };
  return { ...f, co: { ...co, ...signed }, command };
}
async function revised(f: Awaited<ReturnType<typeof fixture>>) {
  const result = await reviseProposal(t.db, f.staff.session, f.command);
  const [revision] = await t.db
    .select()
    .from(proposalRevisions)
    .where(
      and(eq(proposalRevisions.proposalId, f.proposal.id), eq(proposalRevisions.revisionNumber, 2)),
    );
  if (!revision) throw new Error("Missing new terms revision");
  return { ...f, proposal: result.outcome, revision };
}
async function submit(f: Awaited<ReturnType<typeof revised>>) {
  for (const [action, expectedVersion] of [
    ["review", 2],
    ["submit", 3],
  ] as const)
    await transitionProposal(t.db, f.staff.session, {
      id: f.proposal.id,
      revisionId: f.revision.id,
      expectedVersion,
      operationId: randomUUID(),
      action,
      reviewed: true,
      reason: "Reviewed exact three-party terms",
    });
}
it("requires every named buyer and seller before overall agreement, retaining per-party responses", async () => {
  const f = await revised(await fixture()),
    seller = await proposalCounterparty(t.db, f);
  expect(partySnapshotsSchema.parse(f.revision.parties).map((p) => p.partyId)).toEqual([
    f.client.partyId,
    f.co.partyId,
    seller.partyId,
  ]);
  await expect(readProposal(t.db, f.co.session, f.proposal.id)).rejects.toMatchObject({
    code: "not_found",
  });
  await prepareProposalAgreement(t.db, f);
  await submit(f);
  let expectedVersion = 4;
  for (const session of [f.client.session, seller.session, f.co.session]) {
    await recordProposalDecision(t.db, session, {
      id: f.proposal.id,
      revisionId: f.revision.id,
      expectedVersion: expectedVersion++,
      operationId: randomUUID(),
      state: "agreed_for_next_step",
      reason: "I agree to this exact three-party revision",
    });
    const view = await readProposal(t.db, f.staff.session, f.proposal.id);
    expect(view.revision.state).toBe(
      expectedVersion === 7 ? "agreed_for_next_step" : "awaiting_response",
    );
    expect(view.responses).toHaveLength(expectedVersion - 4);
  }
});
it("rejects unrelated, collaborator and duplicate additional identities", async () => {
  const f = await fixture(),
    outsider = await createClient(t.db);
  for (const additionalPartyIds of [[outsider.partyId], [f.co.partyId, f.co.partyId]])
    await expect(
      reviseProposal(t.db, f.staff.session, {
        ...f.command,
        additionalPartyIds,
        operationId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "validation_failed" });
  await t.db
    .update(caseParticipants)
    .set({ role: "collaborator" })
    .where(eq(caseParticipants.partyId, f.co.partyId));
  await expect(
    reviseProposal(t.db, f.staff.session, { ...f.command, operationId: randomUUID() }),
  ).rejects.toMatchObject({ code: "validation_failed" });
});
it("does not allow a client counterproposal to remove another required party", async () => {
  const f = await revised(await fixture());
  await submit(f);
  const command = {
    ...f.command,
    revisionId: f.revision.id,
    expectedVersion: 4,
    operationId: randomUUID(),
    additionalPartyIds: [],
    reason: "Attempt to exclude a required participant",
  };
  await expect(reviseProposal(t.db, f.client.session, command)).rejects.toMatchObject({
    code: "forbidden",
  });
  const result = await reviseProposal(t.db, f.client.session, {
    ...command,
    operationId: randomUUID(),
    additionalPartyIds: [f.co.partyId],
    reason: "Preserve the parties while changing terms",
  });
  const [next] = await t.db
    .select()
    .from(proposalRevisions)
    .where(
      and(
        eq(proposalRevisions.proposalId, result.outcome.id),
        eq(proposalRevisions.revisionNumber, 3),
      ),
    );
  expect(next?.parties).toEqual(f.revision.parties);
  expect(next?.approvalId).toBeNull();
  expect(next?.state).toBe("draft");
});
it("invalidates source eligibility when an additional buyer loses their Case participation", async () => {
  const f = await revised(await fixture());
  await t.db
    .update(caseParticipants)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(caseParticipants.caseId, f.record.id), eq(caseParticipants.partyId, f.co.partyId)),
    );
  await expect(submit(f)).rejects.toBeDefined();
  expect(
    (await t.db.select().from(proposalRevisions).where(eq(proposalRevisions.id, f.revision.id)))[0]
      ?.approvalId,
  ).toBeNull();
});
