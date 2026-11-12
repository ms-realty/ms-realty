// ADR 0015 · one Deal path for both sides: a seller's Deal reads "terms agreed" and the shared
// steps from the buyer's Deal whose proposal on its home is agreed, records them once from either
// page, keeps its own brokerage contract and closes together with the buyer's Deal.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agencyTimeZone } from "@/config/tenant";
import {
  caseCompletions,
  casePathSteps,
  cases,
  externalActions,
  proposalRevisions,
  tasks,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { calendarDate } from "@/domain/deal-path";
import { createProposal, recordAgreement } from "../proposals/service";
import { deadlineInput } from "../proposals/terms";
import { createListingFixture } from "../publication/testing";
import { addInterest } from "./commands";
import { casePath, completeDealFromPath, recordPathStep } from "./path";
import { caseFixture } from "./testing";

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

/** A buyer's Deal with agreed terms on a home, and the seller's Deal for the same home. */
async function linkedDeals() {
  const buyer = await caseFixture(t.db);
  const listing = await createListingFixture(t.db, {
    reviewerId: buyer.staff.id,
    sellerInstruction: false,
  });
  // The seller's Deal: same broker, its own client, about the same property.
  const seller = await caseFixture(t.db, buyer.staff);
  await t.db
    .update(cases)
    .set({ kind: "seller", stage: "marketing", propertyId: listing.propertyId })
    .where(eq(cases.id, seller.record.id));
  const pick = await addInterest(t.db, buyer.staff.session, {
    id: buyer.record.id,
    operationId: randomUUID(),
    expectedVersion: await caseVersion(buyer.record.id),
    reference: listing.reference,
    explanation: "Fits the buyer's brief",
  });
  const created = await createProposal(t.db, buyer.staff.session, {
    id: buyer.record.id,
    operationId: randomUUID(),
    expectedVersion: await caseVersion(buyer.record.id),
    interestId: pick.outcome.interestId,
    clientPartyId: buyer.client.partyId,
    sellerName: "Synthetic Owner",
    amountMinor: 8_000_000,
    currency: "EUR",
    period: "total",
    paymentBasis: "Deposit, then the balance at the deed",
    conditions: [],
    inclusions: [],
    deadline: deadlineInput(new Date(Date.now() + 7 * 86400000)),
  });
  const [revision] = await t.db
    .select()
    .from(proposalRevisions)
    .where(eq(proposalRevisions.proposalId, created.outcome.id));
  if (!revision) throw new Error("Missing revision");
  return { buyer, seller, listing, proposal: created.outcome, revision };
}

const step = async (
  session: Parameters<typeof recordPathStep>[1],
  caseId: string,
  stepKey: string,
  extra: Record<string, string> = {},
) =>
  recordPathStep(t.db, session, {
    id: caseId,
    expectedVersion: await caseVersion(caseId),
    operationId: randomUUID(),
    stepKey,
    action: "done",
    date: today(),
    clientNote: "",
    internalNote: "",
    reason: "",
    evidenceVersionId: "",
    ...extra,
  });

describe("ADR 0015: the seller's Deal shares the buyer's path", () => {
  it("reads terms agreed and the shared steps once the buyer's proposal is agreed", async () => {
    const f = await linkedDeals();
    const before = await casePath(t.db, f.seller.staff.session, f.seller.record.id);
    expect(before?.steps.find((s) => s.key === "terms_agreed")?.status).not.toBe("done");
    expect(before?.sharedWith).toBeNull();
    await recordAgreement(t.db, f.buyer.staff.session, {
      id: f.proposal.id,
      operationId: randomUUID(),
      expectedVersion: f.proposal.version,
      revisionId: f.revision.id,
      buyerSide: { channel: "in_person", givenOn: today() },
      sellerSide: { channel: "phone", givenOn: today() },
      note: "",
      evidenceVersionId: "",
    });
    const staff = await casePath(t.db, f.seller.staff.session, f.seller.record.id);
    expect(staff?.steps.find((s) => s.key === "terms_agreed")?.status).toBe("done");
    expect(staff?.sharedWith).toEqual({
      id: f.buyer.record.id,
      reference: f.buyer.record.reference,
    });
    expect(staff?.template).toBe("BG.sale");
    // The seller's client sees their own Deal: no buyer case reference, no buyer note.
    const client = await casePath(t.db, f.seller.client.session, f.seller.record.id);
    expect(client?.sharedWith).toBeNull();
    expect(client?.steps.find((s) => s.key === "terms_agreed")?.status).toBe("done");

    // A shared step is recorded once, from the seller's page, on the buyer's Deal's record.
    await expect(
      step(f.seller.staff.session, f.seller.record.id, "identity_checks", {
        clientNote: "Seen at the office",
      }),
    ).rejects.toMatchObject({ fieldErrors: { clientNote: ["shared_step"] } });
    await step(f.seller.staff.session, f.seller.record.id, "identity_checks", {
      internalNote: "Both parties identified",
    });
    const rows = await t.db
      .select()
      .from(casePathSteps)
      .where(eq(casePathSteps.stepKey, "identity_checks"));
    const buyerRow = rows.find((r) => r.caseId === f.buyer.record.id);
    expect(buyerRow?.state).toBe("done");
    expect(rows.find((r) => r.caseId === f.seller.record.id)).toBeUndefined();
    const buyerView = await casePath(t.db, f.buyer.client.session, f.buyer.record.id);
    expect(buyerView?.steps.find((s) => s.key === "identity_checks")?.status).toBe("done");
    // Each side's clients hear about the shared step once, on their own Deal.
    const notices = await t.db
      .select({ subjectId: externalActions.subjectId })
      .from(externalActions)
      .where(eq(externalActions.subjectType, "deal_notice"));
    const ids = notices.map((n) => n.subjectId);
    expect(ids).toContain(f.seller.record.id);
    expect(ids).toContain(f.buyer.record.id);

    // A note the broker writes for the buyer stays on the buyer's side.
    await step(f.buyer.staff.session, f.buyer.record.id, "deposit_preliminary_contract", {
      clientNote: "Synthetic note for the buyer only",
    });
    const sellerView = await casePath(t.db, f.seller.client.session, f.seller.record.id);
    expect(JSON.stringify(sellerView)).not.toContain("Synthetic note for the buyer only");
    expect(sellerView?.steps.find((s) => s.key === "deposit_preliminary_contract")?.status).toBe(
      "done",
    );
  });

  it("keeps each side's brokerage contract and closes both Deals together", async () => {
    const f = await linkedDeals();
    await recordAgreement(t.db, f.buyer.staff.session, {
      id: f.proposal.id,
      operationId: randomUUID(),
      expectedVersion: f.proposal.version,
      revisionId: f.revision.id,
      buyerSide: { channel: "in_person", givenOn: today() },
      sellerSide: { channel: "phone", givenOn: today() },
      note: "",
      evidenceVersionId: "",
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
      await step(f.buyer.staff.session, f.buyer.record.id, key, { away: "no" });
    for (const deal of [f.buyer, f.seller])
      await t.db
        .update(tasks)
        .set({ state: "cancelled", cancelReason: "Synthetic intake follow-up no longer needed" })
        .where(eq(tasks.caseId, deal.record.id));
    // The seller's own brokerage contract is still open: neither Deal completes yet.
    const blocked = await casePath(t.db, f.buyer.staff.session, f.buyer.record.id);
    expect(blocked).toMatchObject({ canComplete: false, completionBlocked: "duty_open" });
    const sellerPath = await casePath(t.db, f.seller.staff.session, f.seller.record.id);
    expect(sellerPath?.steps.find((s) => s.key === "brokerage_agreement")?.status).toBe("current");
    await step(f.seller.staff.session, f.seller.record.id, "brokerage_agreement", {
      away: "yes",
      earlyStart: "no",
    });
    const own = await t.db
      .select()
      .from(casePathSteps)
      .where(
        and(
          eq(casePathSteps.caseId, f.seller.record.id),
          eq(casePathSteps.stepKey, "brokerage_agreement"),
        ),
      );
    expect(own[0]).toMatchObject({ state: "done", details: { away: true, earlyStart: false } });
    // The buyer's client never sees the seller's contract answers.
    const buyerClient = await casePath(t.db, f.buyer.client.session, f.buyer.record.id);
    expect(buyerClient?.steps.find((s) => s.key === "brokerage_agreement")?.brokerage).toEqual({
      away: false,
      earlyStart: null,
      withdrawalEndsOn: null,
    });
    // Completing from the seller's page completes both, once.
    const done = await completeDealFromPath(t.db, f.seller.staff.session, {
      id: f.seller.record.id,
      expectedVersion: await caseVersion(f.seller.record.id),
      operationId: randomUUID(),
      completedOn: today(),
      registryReference: "Synthetic deed 7",
      evidenceVersionId: "",
      reviewed: true,
    });
    expect(done.outcome.listingOutcome).toBe("changed");
    for (const [deal, stage] of [
      [f.buyer, "completed"],
      [f.seller, "completion_handover"],
    ] as const) {
      const [row] = await t.db.select().from(cases).where(eq(cases.id, deal.record.id));
      expect(row).toMatchObject({ disposition: "closed", closureOutcome: "deal_completed", stage });
      const completions = await t.db
        .select()
        .from(caseCompletions)
        .where(eq(caseCompletions.caseId, deal.record.id));
      expect(completions).toHaveLength(1);
      expect(completions[0]).toMatchObject({
        completedOn: today(),
        registryReference: "Synthetic deed 7",
      });
    }
    const sellerClient = await casePath(t.db, f.seller.client.session, f.seller.record.id);
    expect(sellerClient?.completion).toMatchObject({ completedOn: today() });
  });
});
