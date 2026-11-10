// ADR 0015 · terms agreed by one recorded decision, under this brand's deal policy
// (staff attestation). A buyer's Deal goes from a broker's pick, through a proposal on a held
// listing that is not published, to both acceptances recorded by the broker, the path's duty
// steps and a completion that marks the home sold.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agencyTimeZone, dealPolicy } from "@/config/tenant";
import {
  auditEvents,
  casePathSteps,
  cases,
  interests,
  listings,
  propertyRelationships,
  proposalResponses,
  proposalRevisions,
  tasks,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { calendarDate } from "@/domain/deal-path";
import { addInterest } from "../cases/commands";
import { casePath, completeDealFromPath, recordPathStep } from "../cases/path";
import { readCase } from "../cases/queries";
import { caseFixture } from "../cases/testing";
import { loadPublishedListings, presentationOf } from "../publication/presentation";
import { createListingFixture, publishForTest } from "../publication/testing";
import { searchListings } from "../search/search";
import { readProposal } from "./queries";
import {
  createProposal,
  recordAgreement,
  recordProposalDecision,
  reviseProposal,
  transitionProposal,
} from "./service";
import { deadlineInput } from "./terms";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

const today = () => calendarDate(new Date(), agencyTimeZone);
const caseVersion = async (id: string) =>
  (await t.db.select({ version: cases.version }).from(cases).where(eq(cases.id, id)))[0]?.version ??
  0;
const terms = () => ({
  amountMinor: 9_500_000,
  currency: "EUR" as const,
  period: "total" as const,
  paymentBasis: "Deposit at the preliminary contract, balance at the deed",
  conditions: ["Subject to the property checks"],
  inclusions: ["Kitchen as seen"],
  deadline: deadlineInput(new Date(Date.now() + 7 * 86400000)),
});
const both = (givenOn = today()) => ({
  buyerSide: { channel: "in_person" as const, givenOn },
  sellerSide: { channel: "phone" as const, givenOn },
  note: "",
  evidenceVersionId: "",
});

/** A buyer's Deal with a broker's pick on a held, unpublished listing and a proposal on it. */
async function heldDeal(options: { publish?: boolean } = {}) {
  const f = await caseFixture(t.db);
  const listing = await createListingFixture(t.db, {
    reviewerId: f.staff.id,
    // Publishing needs a seller instruction; a held listing may have none.
    ...(options.publish ? {} : { sellerInstruction: false }),
  });
  if (options.publish) await publishForTest(t.db, f.staff.actor, listing);
  const pick = await addInterest(t.db, f.staff.session, {
    id: f.record.id,
    operationId: randomUUID(),
    expectedVersion: await caseVersion(f.record.id),
    reference: listing.reference,
    explanation: "Two bedrooms near the school, as the client asked",
  });
  const created = await createProposal(t.db, f.staff.session, {
    id: f.record.id,
    operationId: randomUUID(),
    expectedVersion: await caseVersion(f.record.id),
    interestId: pick.outcome.interestId,
    clientPartyId: f.client.partyId,
    ...(options.publish ? {} : { sellerName: "Synthetic Seller Name" }),
    ...terms(),
  });
  const [revision] = await t.db
    .select()
    .from(proposalRevisions)
    .where(eq(proposalRevisions.proposalId, created.outcome.id));
  if (!revision) throw new Error("Missing proposal revision");
  return {
    ...f,
    listing,
    interestId: pick.outcome.interestId,
    proposal: created.outcome,
    revision,
  };
}

const step = async (
  caseId: string,
  stepKey: string,
  action: "done" | "skip",
  extra: Record<string, string> = {},
) =>
  recordPathStep(t.db, (await staffOf(caseId)).session, {
    id: caseId,
    expectedVersion: await caseVersion(caseId),
    operationId: randomUUID(),
    stepKey,
    action,
    date: action === "done" ? today() : "",
    clientNote: "",
    internalNote: "",
    reason: action === "skip" ? "Synthetic reason" : "",
    evidenceVersionId: "",
    ...extra,
  });
const staffSessions = new Map<string, Awaited<ReturnType<typeof caseFixture>>["staff"]>();
const staffOf = async (caseId: string) => {
  const staff = staffSessions.get(caseId);
  if (!staff) throw new Error("Unknown fixture case");
  return staff;
};

describe("ADR 0015: one recorded decision agrees the terms", () => {
  it("runs this brand on the staff attestation policy", () => {
    expect(dealPolicy.agreementBasis).toBe("staff_attestation");
  });

  it("takes a buyer's Deal from a broker's pick on a held listing to completion and a sold home", async () => {
    const f = await heldDeal();
    staffSessions.set(f.record.id, f.staff);
    // Broker's pick: no structured Brief criteria and no match review, straight to the shortlist.
    const [interest] = await t.db.select().from(interests).where(eq(interests.id, f.interestId));
    expect(interest).toMatchObject({ state: "shortlisted" });
    expect(interest?.fitExplanation).toEqual(["Two bedrooms near the school, as the client asked"]);
    // The proposal was made on a listing that is not published; the seller the broker named is
    // recorded on the property, never as reviewed authority.
    expect(await loadPublishedListings(t.db, { ids: [f.listing.listingId] }, "bg")).toEqual([]);
    expect(f.revision.state).toBe("draft");
    const [named] = await t.db
      .select()
      .from(propertyRelationships)
      .where(
        and(
          eq(propertyRelationships.propertyId, f.listing.propertyId),
          eq(propertyRelationships.role, "seller"),
        ),
      );
    expect(named).toMatchObject({ authority: "not_claimed", scope: { source: "broker_named" } });

    const agreed = await recordAgreement(t.db, f.staff.session, {
      id: f.proposal.id,
      operationId: randomUUID(),
      expectedVersion: f.proposal.version,
      revisionId: f.revision.id,
      ...both(),
      note: "Both said yes at the viewing",
    });
    const [revision] = await t.db
      .select()
      .from(proposalRevisions)
      .where(eq(proposalRevisions.id, f.revision.id));
    expect(revision).toMatchObject({ state: "agreed_for_next_step" });
    expect(revision?.approvalId).toBeTruthy();
    expect(revision?.submittedAt).toBeTruthy();
    const responses = await t.db
      .select()
      .from(proposalResponses)
      .where(eq(proposalResponses.revisionId, f.revision.id));
    expect(responses.map((r) => [r.actorKind, r.decision, r.channel, r.givenOn]).sort()).toEqual(
      [
        ["staff", "agree", "in_person", today()],
        ["staff", "agree", "phone", today()],
      ].sort(),
    );
    expect(responses.every((r) => r.termsHash === f.revision.termsHash)).toBe(true);
    const [audit] = await t.db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, "proposal.agreement_recorded"),
          eq(auditEvents.recordId, f.revision.id),
        ),
      );
    expect(audit).toMatchObject({ actorKind: "staff", actorId: f.staff.id });
    expect(audit?.payload).toMatchObject({
      basis: "staff_attestation",
      termsHash: f.revision.termsHash,
      fromState: "draft",
    });
    expect(agreed.outcome.id).toBe(f.proposal.id);

    // The client sees the agreed terms and that the broker recorded the answers.
    const seen = await readProposal(t.db, f.client.session, f.proposal.id);
    expect(seen.revision.state).toBe("agreed_for_next_step");
    expect(seen.responses.every((r) => r.byBroker)).toBe(true);

    // The path exists now. Duties are steps: identity checks cannot be skipped on a sale, and
    // money, signatures and the property wait for them.
    const path = await casePath(t.db, f.staff.session, f.record.id);
    expect(path?.steps.find((s) => s.key === "terms_agreed")?.status).toBe("done");
    expect(path?.steps.find((s) => s.key === "identity_checks")).toMatchObject({
      canSkip: false,
      duty: "customer_due_diligence",
    });
    await expect(step(f.record.id, "identity_checks", "skip")).rejects.toMatchObject({
      code: "transition_denied",
      fieldErrors: { form: ["duty_in_scope"] },
    });
    await expect(step(f.record.id, "brokerage_agreement", "skip")).rejects.toMatchObject({
      fieldErrors: { form: ["duty_in_scope"] },
    });
    await expect(step(f.record.id, "deposit_preliminary_contract", "done")).rejects.toMatchObject({
      code: "transition_denied",
      fieldErrors: { form: ["identity_checks_first"] },
    });
    await expect(step(f.record.id, "brokerage_agreement", "done")).rejects.toMatchObject({
      code: "validation_failed",
      fieldErrors: { away: ["required"] },
    });
    await expect(
      step(f.record.id, "brokerage_agreement", "done", { away: "yes" }),
    ).rejects.toMatchObject({
      code: "validation_failed",
      fieldErrors: { earlyStart: ["required"] },
    });
    await step(f.record.id, "brokerage_agreement", "done", { away: "yes", earlyStart: "yes" });
    const [brokerage] = await t.db
      .select()
      .from(casePathSteps)
      .where(
        and(
          eq(casePathSteps.caseId, f.record.id),
          eq(casePathSteps.stepKey, "brokerage_agreement"),
        ),
      );
    expect(brokerage?.details).toEqual({ away: true, earlyStart: true });
    const recorded = await casePath(t.db, f.staff.session, f.record.id);
    expect(recorded?.steps.find((s) => s.key === "brokerage_agreement")?.brokerage).toMatchObject({
      away: true,
      earlyStart: true,
    });
    // The client's view carries no internal answers.
    const client = await casePath(t.db, f.client.session, f.record.id);
    expect(client?.steps.find((s) => s.key === "brokerage_agreement")).not.toHaveProperty(
      "brokerage",
    );
    await step(f.record.id, "identity_checks", "done");
    for (const key of [
      "deposit_preliminary_contract",
      "property_checks",
      "funds_ready",
      "notary_deed",
      "registration",
      "keys_handed_over",
    ])
      await step(f.record.id, key, "done");
    await t.db
      .update(tasks)
      .set({ state: "cancelled", cancelReason: "Synthetic intake follow-up no longer needed" })
      .where(eq(tasks.caseId, f.record.id));
    const done = await completeDealFromPath(t.db, f.staff.session, {
      id: f.record.id,
      expectedVersion: await caseVersion(f.record.id),
      operationId: randomUUID(),
      completedOn: today(),
      registryReference: "",
      evidenceVersionId: "",
      reviewed: true,
    });
    expect(done.outcome.listingOutcome).toBe("changed");
    const [home] = await t.db.select().from(listings).where(eq(listings.id, f.listing.listingId));
    expect(home?.commercialState).toBe("sold");
    const [row] = await t.db.select().from(cases).where(eq(cases.id, f.record.id));
    expect(row).toMatchObject({ disposition: "closed", closureOutcome: "deal_completed" });
    const sold = await t.db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, "listing.commercial.sold"),
          eq(auditEvents.recordId, f.listing.listingId),
        ),
      );
    expect(sold).toHaveLength(1);
  });

  it("is idempotent per operation and refuses a second agreement on the same terms", async () => {
    const f = await heldDeal();
    const input = {
      id: f.proposal.id,
      operationId: randomUUID(),
      expectedVersion: f.proposal.version,
      revisionId: f.revision.id,
      ...both(),
    };
    const first = await recordAgreement(t.db, f.staff.session, input);
    const replay = await recordAgreement(t.db, f.staff.session, input);
    expect(replay.replayed).toBe(true);
    expect(replay.outcome).toEqual(first.outcome);
    const responses = await t.db
      .select()
      .from(proposalResponses)
      .where(eq(proposalResponses.revisionId, f.revision.id));
    expect(responses).toHaveLength(2);
    await expect(
      recordAgreement(t.db, f.staff.session, {
        ...input,
        operationId: randomUUID(),
        expectedVersion: f.proposal.version + 1,
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    // A future date and a missing side are refused before anything is written.
    const g = await heldDeal();
    await expect(
      recordAgreement(t.db, g.staff.session, {
        id: g.proposal.id,
        operationId: randomUUID(),
        expectedVersion: g.proposal.version,
        revisionId: g.revision.id,
        ...both("2999-01-01"),
      }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    await expect(
      recordAgreement(t.db, g.staff.session, {
        id: g.proposal.id,
        operationId: randomUUID(),
        expectedVersion: g.proposal.version,
        revisionId: g.revision.id,
        ...both(),
        sellerSide: undefined,
      }),
    ).rejects.toMatchObject({
      code: "validation_failed",
      fieldErrors: { sellerChannel: ["required"] },
    });
  });

  it("binds acceptances to the exact revision: changed terms need new acceptances", async () => {
    const f = await heldDeal();
    // The proposal goes to the client area and the buyer accepts there.
    for (const [action, expectedVersion] of [
      ["review", 1],
      ["submit", 2],
    ] as const)
      await transitionProposal(t.db, f.staff.session, {
        id: f.proposal.id,
        revisionId: f.revision.id,
        operationId: randomUUID(),
        expectedVersion,
        action,
        reviewed: true,
        reason: "Synthetic review",
      });
    await recordProposalDecision(t.db, f.client.session, {
      id: f.proposal.id,
      revisionId: f.revision.id,
      operationId: randomUUID(),
      expectedVersion: 3,
      state: "agreed_for_next_step",
      reason: "I accept these terms",
    });
    const [waiting] = await t.db
      .select()
      .from(proposalRevisions)
      .where(eq(proposalRevisions.id, f.revision.id));
    // Without an account the seller has not answered; nothing waits on a gate.
    expect(waiting?.state).toBe("awaiting_response");
    // The seller asks for a higher price: a new revision.
    await reviseProposal(t.db, f.staff.session, {
      id: f.proposal.id,
      operationId: randomUUID(),
      expectedVersion: 4,
      revisionId: f.revision.id,
      clientPartyId: f.client.partyId,
      reason: "The seller asked for a higher price",
      ...terms(),
      amountMinor: 9_800_000,
    });
    const revisions = await t.db
      .select()
      .from(proposalRevisions)
      .where(eq(proposalRevisions.proposalId, f.proposal.id));
    const next = revisions.find((r) => r.revisionNumber === 2);
    if (!next) throw new Error("Missing revised terms");
    // The old revision is history: recording on it is a conflict.
    await expect(
      recordAgreement(t.db, f.staff.session, {
        id: f.proposal.id,
        operationId: randomUUID(),
        expectedVersion: 5,
        revisionId: f.revision.id,
        ...both(),
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    // The buyer's earlier yes does not carry over: the buyer side is needed again.
    await expect(
      recordAgreement(t.db, f.staff.session, {
        id: f.proposal.id,
        operationId: randomUUID(),
        expectedVersion: 5,
        revisionId: next.id,
        ...both(),
        buyerSide: undefined,
      }),
    ).rejects.toMatchObject({ fieldErrors: { buyerChannel: ["required"] } });
    await recordAgreement(t.db, f.staff.session, {
      id: f.proposal.id,
      operationId: randomUUID(),
      expectedVersion: 5,
      revisionId: next.id,
      ...both(),
    });
    const [agreed] = await t.db
      .select()
      .from(proposalRevisions)
      .where(eq(proposalRevisions.id, next.id));
    expect(agreed?.state).toBe("agreed_for_next_step");
  });

  it("covers a party who answered in the client area and records only the rest", async () => {
    const f = await heldDeal();
    for (const [action, expectedVersion] of [
      ["review", 1],
      ["submit", 2],
    ] as const)
      await transitionProposal(t.db, f.staff.session, {
        id: f.proposal.id,
        revisionId: f.revision.id,
        operationId: randomUUID(),
        expectedVersion,
        action,
        reviewed: true,
        reason: "Synthetic review",
      });
    await recordProposalDecision(t.db, f.client.session, {
      id: f.proposal.id,
      revisionId: f.revision.id,
      operationId: randomUUID(),
      expectedVersion: 3,
      state: "agreed_for_next_step",
      reason: "I accept these terms",
    });
    await recordAgreement(t.db, f.staff.session, {
      id: f.proposal.id,
      operationId: randomUUID(),
      expectedVersion: 4,
      revisionId: f.revision.id,
      ...both(),
      buyerSide: undefined,
    });
    const responses = await t.db
      .select()
      .from(proposalResponses)
      .where(eq(proposalResponses.revisionId, f.revision.id));
    expect(responses.map((r) => r.actorKind).sort()).toEqual(["client", "staff"]);
  });

  it("keeps access rules for clients and other buyers' privacy", async () => {
    const f = await heldDeal({ publish: true });
    staffSessions.set(f.record.id, f.staff);
    // A client cannot record an agreement or add a home.
    await expect(
      recordAgreement(t.db, f.client.session, {
        id: f.proposal.id,
        operationId: randomUUID(),
        expectedVersion: f.proposal.version,
        revisionId: f.revision.id,
        ...both(),
      }),
    ).rejects.toMatchObject({ code: expect.stringMatching(/not_found|forbidden/) });
    await expect(
      addInterest(t.db, f.client.session, {
        id: f.record.id,
        operationId: randomUUID(),
        expectedVersion: await caseVersion(f.record.id),
        reference: f.listing.reference,
        explanation: "Client trying to add",
      }),
    ).rejects.toMatchObject({ code: expect.stringMatching(/not_found|forbidden/) });
    const searchFor = () =>
      searchListings(t.db, { locale: "bg", purpose: "sale", q: f.listing.reference });
    expect((await searchFor()).items).toHaveLength(1);
    // Another buyer interested in the same home.
    const other = await caseFixture(t.db, f.staff);
    await addInterest(t.db, other.staff.session, {
      id: other.record.id,
      operationId: randomUUID(),
      expectedVersion: await caseVersion(other.record.id),
      reference: f.listing.reference,
      explanation: "Also fits this buyer",
    });
    await recordAgreement(t.db, f.staff.session, {
      id: f.proposal.id,
      operationId: randomUUID(),
      expectedVersion: f.proposal.version,
      revisionId: f.revision.id,
      ...both(),
    });
    for (const key of [
      "brokerage_agreement",
      "identity_checks",
      "deposit_preliminary_contract",
      "property_checks",
      "funds_ready",
      "notary_deed",
      "registration",
      "keys_handed_over",
    ])
      await step(f.record.id, key, "done", key === "brokerage_agreement" ? { away: "no" } : {});
    await t.db
      .update(tasks)
      .set({ state: "cancelled", cancelReason: "Synthetic intake follow-up no longer needed" })
      .where(eq(tasks.caseId, f.record.id));
    await completeDealFromPath(t.db, f.staff.session, {
      id: f.record.id,
      expectedVersion: await caseVersion(f.record.id),
      operationId: randomUUID(),
      completedOn: today(),
      registryReference: "",
      evidenceVersionId: "",
      reviewed: true,
    });
    // The sold home is no longer offered on the public site: search drops it and its page
    // reads "sold" with similar homes instead of a viewing request.
    const [published] = await loadPublishedListings(t.db, { ids: [f.listing.listingId] }, "bg");
    if (!published) throw new Error("The fixture listing was published");
    expect(presentationOf(published, new Date())).toMatchObject({
      availability: "sold",
      primaryAction: "view_similar",
    });
    expect((await searchFor()).items).toHaveLength(0);
    // The other buyer sees only that the home is sold, never who bought it or on what terms.
    const view = await readCase(t.db, other.client.session, other.record.id);
    expect(view.interests[0]?.commercialState).toBe("sold");
    const text = JSON.stringify(view);
    expect(text).not.toContain(f.client.partyId);
    expect(text).not.toContain(f.proposal.id);
    expect(text).not.toContain("Synthetic Seller Name");
    await expect(readProposal(t.db, other.client.session, f.proposal.id)).rejects.toMatchObject({
      code: "not_found",
    });
    // And a sold home cannot be picked or offered again.
    const third = await caseFixture(t.db, f.staff);
    await expect(
      addInterest(t.db, third.staff.session, {
        id: third.record.id,
        operationId: randomUUID(),
        expectedVersion: await caseVersion(third.record.id),
        reference: f.listing.reference,
        explanation: "Too late",
      }),
    ).rejects.toMatchObject({ code: "listing_unavailable" });
  });
});
