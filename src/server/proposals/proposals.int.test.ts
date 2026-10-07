import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  approvals,
  caseParticipants,
  listings,
  proposalResponses,
  proposalRevisions,
  proposals,
  sessions,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "../auth/sessions";
import { withdrawPublication } from "../publication/commands";
import { createClient } from "../testing";
import { listProposals, readProposal } from "./queries";
import {
  createProposal,
  recordProposalDecision,
  reviseProposal,
  transitionProposal,
} from "./service";
import { termsDigest } from "./shared";
import {
  prepareProposalAgreement,
  proposalCounterparty,
  proposalFixture,
  publishProposalForTest,
} from "./testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

describe("exact proposal revisions and party authority", () => {
  it("records each required party independently and coordinates only after real exact-revision evidence and both agreements", async () => {
    const f = await proposalFixture(t.db);
    const seller = await proposalCounterparty(t.db, f);
    await publishProposalForTest(t.db, f);
    await prepareProposalAgreement(t.db, f);
    const decision = {
      id: f.proposal.id,
      revisionId: f.revision.id,
      expectedVersion: 3,
      state: "agreed_for_next_step" as const,
      reason: "Synthetic exact-terms agreement",
    };
    await recordProposalDecision(t.db, f.client.session, {
      ...decision,
      operationId: randomUUID(),
    });
    expect((await readProposal(t.db, seller.session, f.proposal.id)).revision.state).toBe(
      "awaiting_response",
    );
    await expect(
      recordProposalDecision(t.db, seller.session, { ...decision, operationId: randomUUID() }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    await recordProposalDecision(t.db, seller.session, {
      ...decision,
      expectedVersion: 4,
      operationId: randomUUID(),
    });
    expect((await readProposal(t.db, seller.session, f.proposal.id)).revision.state).toBe(
      "agreed_for_next_step",
    );
    const responses = await t.db
      .select()
      .from(proposalResponses)
      .where(eq(proposalResponses.revisionId, f.revision.id));
    expect(responses).toHaveLength(2);
    expect(
      responses.every((r) => r.decision === "agree" && r.termsHash === f.revision.termsHash),
    ).toBe(true);
  });
  it("keeps drafts private and excludes a case participant not named in the released terms", async () => {
    const f = await proposalFixture(t.db);
    expect((await createProposal(t.db, f.staff.session, f.input)).outcome.id).toBe(f.proposal.id);
    await expect(readProposal(t.db, f.client.session, f.proposal.id)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(await listProposals(t.db, f.client.session, f.record.id)).toEqual([]);
    await publishProposalForTest(t.db, f);
    expect(
      (await readProposal(t.db, f.client.session, f.proposal.id)).revision.parties,
    ).toHaveLength(2);
    const other = await createClient(t.db),
      issued = await createSession(t.db, { kind: "client", id: other.id });
    await t.db
      .insert(caseParticipants)
      .values({ caseId: f.record.id, partyId: other.partyId, role: "co_buyer" });
    await expect(readProposal(t.db, issued.session, f.proposal.id)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(await listProposals(t.db, issued.session, f.record.id)).toEqual([]);
    await expect(
      recordProposalDecision(t.db, issued.session, {
        id: f.proposal.id,
        revisionId: f.revision.id,
        operationId: randomUUID(),
        expectedVersion: 3,
        state: "declined",
        reason: "Another party cannot decide",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
  it("every revision keeps prior exact terms and invalidates approval, including changed payment basis and inclusions", async () => {
    const f = await proposalFixture(t.db);
    await publishProposalForTest(t.db, f);
    const before = await readProposal(t.db, f.staff.session, f.proposal.id);
    const saved = await reviseProposal(t.db, f.staff.session, {
      id: f.proposal.id,
      revisionId: f.revision.id,
      operationId: randomUUID(),
      expectedVersion: 3,
      clientPartyId: f.client.partyId,
      ...f.terms,
      paymentBasis: "A new negotiated payment basis",
      inclusions: ["Different included item"],
      reason: "Human change requires new review",
    });
    expect(saved.outcome.version).toBe(4);
    const after = await readProposal(t.db, f.staff.session, f.proposal.id);
    expect(after.revision).toMatchObject({
      number: 2,
      state: "draft",
      paymentBasis: "A new negotiated payment basis",
    });
    expect(after.history[0]).toMatchObject({
      number: 1,
      paymentBasis: before.revision.paymentBasis,
      amountMinor: before.revision.amountMinor,
      state: "withdrawn",
    });
    const [approval] = await t.db
      .select()
      .from(approvals)
      .where(eq(approvals.subjectId, f.revision.id));
    expect(approval?.state).toBe("invalidated");
    const client = await readProposal(t.db, f.client.session, f.proposal.id);
    expect(client.revision.number).toBe(1);
    expect(client.current).toBe(false);
    expect(client.canRespond).toBe(false);
    await expect(
      recordProposalDecision(t.db, f.client.session, {
        id: f.proposal.id,
        revisionId: f.revision.id,
        operationId: randomUUID(),
        expectedVersion: 3,
        state: "declined",
        reason: "Stale screen",
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
  });
  it("a client counter is a separate draft, replayable by its author until current access is revoked", async () => {
    const f = await proposalFixture(t.db);
    await publishProposalForTest(t.db, f);
    const input = {
      id: f.proposal.id,
      revisionId: f.revision.id,
      operationId: randomUUID(),
      expectedVersion: 3,
      clientPartyId: f.client.partyId,
      ...f.terms,
      amountMinor: 11900000,
      reason: "My exact counterproposal",
    };
    const saved = await reviseProposal(t.db, f.client.session, input);
    expect((await reviseProposal(t.db, f.client.session, input)).outcome).toEqual(saved.outcome);
    const rows = await t.db
      .select()
      .from(proposalResponses)
      .where(eq(proposalResponses.revisionId, f.revision.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      partyId: f.client.partyId,
      actorId: f.client.id,
      decision: "counter",
      termsHash: f.revision.termsHash,
    });
    const current = await readProposal(t.db, f.staff.session, f.proposal.id);
    expect(current.revision.amountMinor).toBe(11900000);
    expect(current.history[0]?.amountMinor).toBe(12000000);
    expect(current.history[0]?.state).toBe("countered");
    await t.db
      .update(caseParticipants)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(caseParticipants.caseId, f.record.id),
          eq(caseParticipants.partyId, f.client.partyId),
        ),
      );
    await expect(reviseProposal(t.db, f.client.session, input)).rejects.toMatchObject({
      code: "not_found",
    });
  });
  it("missing current process/service-agreement review denies agreement without any response or state mutation", async () => {
    const f = await proposalFixture(t.db);
    await publishProposalForTest(t.db, f);
    await expect(
      recordProposalDecision(t.db, f.client.session, {
        id: f.proposal.id,
        revisionId: f.revision.id,
        operationId: randomUUID(),
        expectedVersion: 3,
        state: "agreed_for_next_step",
        reason: "I wish to continue subject to the required review",
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    expect(
      await t.db
        .select()
        .from(proposalResponses)
        .where(eq(proposalResponses.revisionId, f.revision.id)),
    ).toHaveLength(0);
    expect((await readProposal(t.db, f.staff.session, f.proposal.id)).revision.state).toBe(
      "awaiting_response",
    );
    expect(
      (await t.db.select().from(proposals).where(eq(proposals.id, f.proposal.id)))[0]?.version,
    ).toBe(3);
  });
  it("decline records the authenticated party once; fresh auth is required before sensitive response", async () => {
    const f = await proposalFixture(t.db);
    await publishProposalForTest(t.db, f);
    const input = {
      id: f.proposal.id,
      revisionId: f.revision.id,
      operationId: randomUUID(),
      expectedVersion: 3,
      state: "declined" as const,
      reason: "These terms do not meet my requirements",
    };
    await t.db
      .update(sessions)
      .set({ reverifiedAt: new Date(Date.now() - 3600000) })
      .where(eq(sessions.id, f.client.session.id));
    await expect(recordProposalDecision(t.db, f.client.session, input)).rejects.toMatchObject({
      code: "step_up_required",
    });
    await t.db
      .update(sessions)
      .set({ reverifiedAt: new Date() })
      .where(eq(sessions.id, f.client.session.id));
    const result = await recordProposalDecision(t.db, f.client.session, input);
    expect((await recordProposalDecision(t.db, f.client.session, input)).outcome).toEqual(
      result.outcome,
    );
    expect(
      (
        await t.db
          .select()
          .from(proposalResponses)
          .where(eq(proposalResponses.revisionId, f.revision.id))
      )[0],
    ).toMatchObject({ partyId: f.client.partyId, decision: "decline" });
    expect((await readProposal(t.db, f.client.session, f.proposal.id)).canRespond).toBe(false);
  });
  it("tampered terms cannot reuse approval and a withdrawn source cannot be submitted", async () => {
    const f = await proposalFixture(t.db);
    await transitionProposal(t.db, f.staff.session, {
      id: f.proposal.id,
      revisionId: f.revision.id,
      operationId: randomUUID(),
      expectedVersion: 1,
      action: "review",
      reviewed: true,
      reason: "Reviewed",
    });
    await t.db
      .update(proposalRevisions)
      .set({ paymentBasis: "Changed outside the guarded revision command" })
      .where(eq(proposalRevisions.id, f.revision.id));
    await expect(
      transitionProposal(t.db, f.staff.session, {
        id: f.proposal.id,
        revisionId: f.revision.id,
        operationId: randomUUID(),
        expectedVersion: 2,
        action: "submit",
        reviewed: true,
        reason: "Must fail",
      }),
    ).rejects.toMatchObject({ code: "approval_stale" });
    await t.db
      .update(proposalRevisions)
      .set({ paymentBasis: f.revision.paymentBasis })
      .where(eq(proposalRevisions.id, f.revision.id));
    const [currentListing] = await t.db
      .select()
      .from(listings)
      .where(eq(listings.id, f.listing.listingId));
    await withdrawPublication(t.db, {
      actor: f.staff.actor,
      operationId: randomUUID(),
      expectedRevision: currentListing?.publicationGeneration ?? -1,
      reference: f.listing.reference,
      reason: "Synthetic source withdrawn",
    });
    await expect(
      transitionProposal(t.db, f.staff.session, {
        id: f.proposal.id,
        revisionId: f.revision.id,
        operationId: randomUUID(),
        expectedVersion: 2,
        action: "submit",
        reviewed: true,
        reason: "Must remain blocked",
      }),
    ).rejects.toMatchObject({ code: "listing_unavailable" });
  });
  it("an expired exact revision cannot receive a new decision", async () => {
    const f = await proposalFixture(t.db);
    await publishProposalForTest(t.db, f);
    const expired = { ...f.revision, deadlineAt: new Date(Date.now() - 60000) };
    // Reconstruct an internally consistent historical approved fixture, not a mismatched hash.
    await t.db
      .update(proposalRevisions)
      .set({ deadlineAt: expired.deadlineAt, termsHash: termsDigest(expired) })
      .where(eq(proposalRevisions.id, f.revision.id));
    await t.db
      .update(approvals)
      .set({ subjectHash: termsDigest(expired), expiresAt: expired.deadlineAt })
      .where(eq(approvals.subjectId, f.revision.id));
    expect((await readProposal(t.db, f.client.session, f.proposal.id)).canRespond).toBe(false);
    await expect(
      recordProposalDecision(t.db, f.client.session, {
        id: f.proposal.id,
        revisionId: f.revision.id,
        operationId: randomUUID(),
        expectedVersion: 3,
        state: "agreed_for_next_step",
        reason: "Too late",
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
  });
});
