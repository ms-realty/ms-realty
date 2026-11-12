// ADR 0015 · the strict deal policy another brand may choose keeps today's gate: the reviewed
// process, a published listing with a seller instruction, the counterparty's own answer and
// the structured Brief match review.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { agencyTimeZone, dealPolicy } from "@/config/tenant";
import { cases, proposalResponses, proposalRevisions } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { calendarDate } from "@/domain/deal-path";
import { addInterest } from "../cases/commands";
import { caseFixture } from "../cases/testing";
import { createListingFixture } from "../publication/testing";
import { recordAgreement, recordProposalDecision } from "./service";
import {
  evidence,
  prepareProposalAgreement,
  proposalCounterparty,
  proposalFixture,
  publishProposalForTest,
} from "./testing";

vi.mock("@/config/tenant", async (importOriginal) => {
  const tenant = await importOriginal<typeof import("@/config/tenant")>();
  return { ...tenant, dealPolicy: tenant.strictDealPolicy };
});

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

describe("ADR 0015: the strict deal policy", () => {
  it("is the policy under test", () => {
    expect(dealPolicy.agreementBasis).toBe("reviewed_process");
  });

  it("refuses a broker's pick without a structured Brief and a home that is not published", async () => {
    const f = await caseFixture(t.db);
    const listing = await createListingFixture(t.db, { reviewerId: f.staff.id });
    await expect(
      addInterest(t.db, f.staff.session, {
        id: f.record.id,
        operationId: randomUUID(),
        expectedVersion: await caseVersion(f.record.id),
        reference: listing.reference,
        explanation: "A home the broker knows",
      }),
    ).rejects.toMatchObject({ code: "listing_unavailable" });
  });

  it("keeps the agreement gate, the evidence document and the counterparty's own answer", async () => {
    const f = await proposalFixture(t.db);
    await publishProposalForTest(t.db, f);
    const input = {
      id: f.proposal.id,
      expectedVersion: 3,
      revisionId: f.revision.id,
      buyerSide: { channel: "in_person" as const, givenOn: today() },
      note: "",
      evidenceVersionId: "",
    };
    await expect(
      recordAgreement(t.db, f.staff.session, { ...input, operationId: randomUUID() }),
    ).rejects.toMatchObject({
      code: "validation_failed",
      fieldErrors: { evidenceVersionId: ["required"] },
    });
    // With a document, the seller still has to answer in the client area.
    const offer = await evidence(t.db, f.record.id, f.staff.id, "signed_offer");
    await expect(
      recordAgreement(t.db, f.staff.session, {
        ...input,
        operationId: randomUUID(),
        sellerSide: { channel: "phone", givenOn: today() },
        evidenceVersionId: offer.id,
      }),
    ).rejects.toMatchObject({
      code: "transition_denied",
      fieldErrors: { form: ["counterparty_must_answer"] },
    });
    expect(
      await t.db
        .select()
        .from(proposalResponses)
        .where(eq(proposalResponses.revisionId, f.revision.id)),
    ).toEqual([]);
    // Once the reviewed process is complete and the seller answered in the client area, the
    // broker may record the buyer's side with its document.
    const seller = await proposalCounterparty(t.db, f);
    await prepareProposalAgreement(t.db, f);
    await recordProposalDecision(t.db, seller.session, {
      id: f.proposal.id,
      revisionId: f.revision.id,
      operationId: randomUUID(),
      expectedVersion: 3,
      state: "agreed_for_next_step",
      reason: "Synthetic seller agreement",
    });
    await recordAgreement(t.db, f.staff.session, {
      ...input,
      expectedVersion: 4,
      operationId: randomUUID(),
      evidenceVersionId: offer.id,
    });
    const [revision] = await t.db
      .select()
      .from(proposalRevisions)
      .where(eq(proposalRevisions.id, f.revision.id));
    expect(revision?.state).toBe("agreed_for_next_step");
  });
});
