import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createListingFixture, defaultFacts, publishForTest } from "../publication/testing";
import { caseMatchCriteriaInput } from "../search/search";
import { addInterest, reviseBrief } from "./commands";
import { readCaseCandidate, readCaseMatches } from "./matching";
import { caseFixture } from "./testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

describe("O07 Case matching", () => {
  it("rejects query controls and historical availability as saved Brief criteria", () => {
    expect(
      caseMatchCriteriaInput.safeParse({ purpose: "sale", availability: ["sold"] }).success,
    ).toBe(false);
    expect(caseMatchCriteriaInput.safeParse({ purpose: "sale", q: "sunny" }).success).toBe(false);
  });

  it("requires a current reviewed filter and returns only eligible confirmed or unknown facts", async () => {
    const f = await caseFixture(t.db);
    expect(await readCaseMatches(t.db, f.staff.session, { id: f.record.id })).toMatchObject({
      status: "criteria_required",
      reason: "missing_or_invalid",
    });
    await expect(
      readCaseMatches(t.db, f.client.session, { id: f.record.id }),
    ).rejects.toMatchObject({ code: "forbidden" });

    await expect(
      reviseBrief(t.db, f.staff.session, {
        id: f.record.id,
        operationId: randomUUID(),
        expectedVersion: 1,
        requirements: "A step-free apartment",
        preferences: "Near the centre",
        criteria: { purpose: "long_term_rent", mustHave: ["step_free_access"] },
      }),
    ).rejects.toMatchObject({
      code: "validation_failed",
      fieldErrors: { "criteria.purpose": ["case_kind_mismatch"] },
    });

    const exact = await createListingFixture(t.db, {
      reviewerId: f.staff.id,
      facts: { ...defaultFacts, "feature.step_free_access": { state: "known", value: true } },
    });
    const unknown = await createListingFixture(t.db, { reviewerId: f.staff.id });
    const wrongType = await createListingFixture(t.db, {
      reviewerId: f.staff.id,
      propertyType: "house",
      facts: { ...defaultFacts, "feature.step_free_access": { state: "known", value: true } },
    });
    const unpublished = await createListingFixture(t.db, {
      reviewerId: f.staff.id,
      facts: { ...defaultFacts, "feature.step_free_access": { state: "known", value: true } },
    });
    await publishForTest(t.db, f.staff.actor, exact);
    await publishForTest(t.db, f.staff.actor, unknown);
    await publishForTest(t.db, f.staff.actor, wrongType);

    await reviseBrief(t.db, f.staff.session, {
      id: f.record.id,
      operationId: randomUUID(),
      expectedVersion: 1,
      requirements: "A step-free apartment",
      preferences: "Near the centre",
      criteria: { purpose: "sale", propertyTypes: ["apartment"], mustHave: ["step_free_access"] },
    });
    const matches = await readCaseMatches(t.db, f.staff.session, { id: f.record.id });
    expect(matches.status).toBe("ready");
    if (matches.status !== "ready") throw new Error("Matching criteria were not retained");
    expect(matches.brief.revision).toBe(2);
    expect(matches.confirmed.map((item) => item.reference)).toEqual([exact.reference]);
    expect(matches.needsConfirmation.map((item) => item.reference)).toEqual([unknown.reference]);
    expect(matches.needsConfirmation[0]?.unconfirmed).toEqual(["feature.step_free_access"]);
    expect(matches.confirmed[0]?.confirmedCriteria).toEqual([
      "purpose",
      "propertyType",
      "availability",
      "feature.step_free_access",
    ]);
    expect(matches.needsConfirmation[0]?.confirmedCriteria).toEqual([
      "purpose",
      "propertyType",
      "availability",
    ]);
    expect(
      [...matches.confirmed, ...matches.needsConfirmation].map((item) => item.reference),
    ).not.toContain(wrongType.reference);
    expect(
      [...matches.confirmed, ...matches.needsConfirmation].map((item) => item.reference),
    ).not.toContain(unpublished.reference);
    expect(matches.confirmed[0]?.existingInterestId).toBeNull();

    const exactCandidate = await readCaseCandidate(t.db, f.staff.session, {
      id: f.record.id,
      briefRevision: 2,
      reference: exact.reference,
    });
    expect(exactCandidate).toMatchObject({
      match: "match",
      violated: [],
      existingInterestId: null,
    });
    const unknownCandidate = await readCaseCandidate(t.db, f.staff.session, {
      id: f.record.id,
      briefRevision: 2,
      reference: unknown.reference,
    });
    expect(unknownCandidate).toMatchObject({
      match: "needs_confirmation",
      violated: [],
      unconfirmed: ["feature.step_free_access"],
      confirmedCriteria: ["purpose", "propertyType", "availability"],
    });
    await expect(
      addInterest(t.db, f.staff.session, {
        id: f.record.id,
        expectedVersion: 2,
        operationId: randomUUID(),
        reference: unknown.reference,
        explanation: "The step-free access fact has not been confirmed.",
        matchReview: {
          briefRevision: 2,
          manifestId: unknownCandidate.candidate.manifestId,
          availability: unknownCandidate.candidate.availability.presented,
          violated: [...unknownCandidate.violated],
          unconfirmed: [...unknownCandidate.unconfirmed],
          reviewed: true,
        },
      }),
    ).rejects.toMatchObject({
      code: "validation_failed",
      fieldErrors: { matchReview: ["unconfirmed_facts"] },
    });
    expect(
      await readCaseCandidate(t.db, f.staff.session, {
        id: f.record.id,
        briefRevision: 2,
        reference: wrongType.reference,
      }),
    ).toMatchObject({ match: "no_match", violated: ["propertyType"] });
    await expect(
      readCaseCandidate(t.db, f.staff.session, {
        id: f.record.id,
        briefRevision: 2,
        reference: unpublished.reference,
      }),
    ).rejects.toMatchObject({ code: "listing_unavailable" });
    await expect(
      readCaseCandidate(t.db, f.client.session, {
        id: f.record.id,
        briefRevision: 2,
        reference: wrongType.reference,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });

    const exactInput = {
      id: f.record.id,
      operationId: randomUUID(),
      expectedVersion: 2,
      reference: exact.reference,
      explanation: "The reviewed listing matches the structured Brief.",
      matchReview: {
        briefRevision: 2,
        manifestId: exactCandidate.candidate.manifestId,
        availability: exactCandidate.candidate.availability.presented,
        violated: [],
        unconfirmed: [],
        reviewed: true as const,
      },
    };
    await expect(
      addInterest(t.db, f.staff.session, {
        ...exactInput,
        operationId: randomUUID(),
        matchReview: undefined,
      }),
    ).rejects.toMatchObject({
      code: "validation_failed",
      fieldErrors: { matchReview: ["required_for_structured_brief"] },
    });
    await expect(
      addInterest(t.db, f.staff.session, {
        ...exactInput,
        operationId: randomUUID(),
        alternativeDecision: "propose_despite_mismatch",
      }),
    ).rejects.toMatchObject({
      code: "validation_failed",
      fieldErrors: { alternativeDecision: ["no_hard_mismatch"] },
    });
    const saved = await addInterest(t.db, f.staff.session, exactInput);
    const withSavedInterest = await readCaseMatches(t.db, f.staff.session, { id: f.record.id });
    expect(withSavedInterest.status).toBe("ready");
    if (withSavedInterest.status !== "ready") throw new Error("Expected current Brief matches");
    expect(withSavedInterest.confirmed[0]?.existingInterestId).toBe(saved.outcome.interestId);
    expect(withSavedInterest.needsConfirmation[0]?.existingInterestId).toBeNull();
    expect(
      await readCaseCandidate(t.db, f.staff.session, {
        id: f.record.id,
        briefRevision: 2,
        reference: exact.reference,
      }),
    ).toMatchObject({ existingInterestId: saved.outcome.interestId });

    const alternative = await readCaseCandidate(t.db, f.staff.session, {
      id: f.record.id,
      briefRevision: 2,
      reference: wrongType.reference,
    });
    const alternativeInput = {
      id: f.record.id,
      operationId: randomUUID(),
      expectedVersion: 3,
      reference: wrongType.reference,
      explanation: "A house has more space but differs from the apartment requirement.",
      alternativeDecision: "propose_despite_mismatch" as const,
      matchReview: {
        briefRevision: 2,
        manifestId: alternative.candidate.manifestId,
        availability: alternative.candidate.availability.presented,
        violated: [...alternative.violated],
        unconfirmed: [...alternative.unconfirmed],
        reviewed: true as const,
      },
    };
    await expect(
      addInterest(t.db, f.staff.session, {
        ...alternativeInput,
        operationId: randomUUID(),
        matchReview: { ...alternativeInput.matchReview, briefRevision: 1 },
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    await expect(
      addInterest(t.db, f.staff.session, {
        ...alternativeInput,
        operationId: randomUUID(),
        matchReview: { ...alternativeInput.matchReview, availability: "negotiating" },
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    await expect(
      addInterest(t.db, f.staff.session, {
        ...alternativeInput,
        operationId: randomUUID(),
        matchReview: { ...alternativeInput.matchReview, violated: [] },
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    await expect(
      addInterest(t.db, f.staff.session, {
        ...alternativeInput,
        operationId: randomUUID(),
        alternativeDecision: undefined,
      }),
    ).rejects.toMatchObject({
      code: "validation_failed",
      fieldErrors: { alternativeDecision: ["required_for_hard_mismatch"] },
    });
    await expect(
      addInterest(t.db, f.staff.session, {
        ...alternativeInput,
        operationId: randomUUID(),
        explanation: "Too short",
      }),
    ).rejects.toMatchObject({
      code: "validation_failed",
      fieldErrors: { explanation: ["alternative_reason_required"] },
    });
    const alternativeInterest = await addInterest(t.db, f.staff.session, alternativeInput);
    expect((await addInterest(t.db, f.staff.session, alternativeInput)).outcome.interestId).toBe(
      alternativeInterest.outcome.interestId,
    );
    const [alternativeAudit] = await t.db
      .select({ payload: auditEvents.payload })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.operationId, alternativeInterest.operationId),
          eq(auditEvents.action, "case.interest_added"),
        ),
      );
    expect(alternativeAudit?.payload).toMatchObject({
      interestId: alternativeInterest.outcome.interestId,
      alternativeDecision: "propose_despite_mismatch",
      match: "no_match",
      violated: ["propertyType"],
    });

    const firstPage = await readCaseMatches(t.db, f.staff.session, {
      id: f.record.id,
      pageSize: 1,
    });
    if (firstPage.status !== "ready" || !firstPage.nextCursor)
      throw new Error("Expected a second match page");
    await expect(
      readCaseMatches(t.db, f.staff.session, { id: f.record.id, cursor: firstPage.nextCursor }),
    ).rejects.toMatchObject({
      code: "validation_failed",
      fieldErrors: { briefRevision: ["required_for_cursor"] },
    });
    await expect(
      readCaseMatches(t.db, f.staff.session, {
        id: f.record.id,
        cursor: firstPage.nextCursor,
        briefRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    expect(
      await readCaseMatches(t.db, f.staff.session, {
        id: f.record.id,
        pageSize: 1,
        cursor: firstPage.nextCursor,
        briefRevision: 2,
      }),
    ).toMatchObject({ status: "ready", brief: { revision: 2 } });

    await reviseBrief(t.db, f.staff.session, {
      id: f.record.id,
      operationId: randomUUID(),
      expectedVersion: 4,
      requirements: "The client revised their requirements",
      preferences: "Near the centre",
    });
    expect(await readCaseMatches(t.db, f.staff.session, { id: f.record.id })).toMatchObject({
      status: "criteria_required",
      brief: { revision: 3 },
    });
    await expect(
      readCaseMatches(t.db, f.staff.session, {
        id: f.record.id,
        pageSize: 1,
        cursor: firstPage.nextCursor,
        briefRevision: 2,
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    await expect(
      readCaseCandidate(t.db, f.staff.session, {
        id: f.record.id,
        briefRevision: 2,
        reference: wrongType.reference,
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
  });

  it("treats confirmation-required availability as unknown on list, check and add", async () => {
    const f = await caseFixture(t.db);
    const listing = await createListingFixture(t.db, {
      reviewerId: f.staff.id,
      commercialState: "confirmation_required",
    });
    await publishForTest(t.db, f.staff.actor, listing);
    await reviseBrief(t.db, f.staff.session, {
      id: f.record.id,
      expectedVersion: 1,
      operationId: randomUUID(),
      requirements: "A sale listing with current availability",
      preferences: "",
      criteria: { purpose: "sale" },
    });
    const page = await readCaseMatches(t.db, f.staff.session, { id: f.record.id });
    expect(page.status).toBe("ready");
    if (page.status !== "ready") throw new Error("Expected an active matching page");
    expect(page.confirmed.map((item) => item.reference)).not.toContain(listing.reference);
    const pending = page.needsConfirmation.find((item) => item.reference === listing.reference);
    expect(pending?.unconfirmed).toEqual(["availability"]);
    expect(pending?.confirmedCriteria).toEqual(["purpose"]);
    const candidate = await readCaseCandidate(t.db, f.staff.session, {
      id: f.record.id,
      briefRevision: page.brief.revision,
      reference: listing.reference,
    });
    expect(candidate).toMatchObject({
      match: "needs_confirmation",
      unconfirmed: ["availability"],
      confirmedCriteria: ["purpose"],
    });
    await expect(
      addInterest(t.db, f.staff.session, {
        id: f.record.id,
        expectedVersion: page.caseVersion,
        operationId: randomUUID(),
        reference: listing.reference,
        explanation: "The availability still needs confirmation.",
        matchReview: {
          briefRevision: candidate.briefRevision,
          manifestId: candidate.candidate.manifestId,
          availability: candidate.candidate.availability.presented,
          violated: [...candidate.violated],
          unconfirmed: [...candidate.unconfirmed],
          reviewed: true,
        },
      }),
    ).rejects.toMatchObject({
      code: "validation_failed",
      fieldErrors: { matchReview: ["unconfirmed_facts"] },
    });
  });

  it("does not create a buyer Interest for another purpose or a closed offer", async () => {
    const f = await caseFixture(t.db);
    const available = await createListingFixture(t.db, { reviewerId: f.staff.id });
    const rental = await createListingFixture(t.db, {
      reviewerId: f.staff.id,
      purpose: "long_term_rent",
    });
    const sold = await createListingFixture(t.db, {
      reviewerId: f.staff.id,
      commercialState: "sold",
    });
    await publishForTest(t.db, f.staff.actor, available);
    await publishForTest(t.db, f.staff.actor, rental);
    await publishForTest(t.db, f.staff.actor, sold);
    const input = {
      id: f.record.id,
      expectedVersion: 1,
      explanation: "The broker reviewed the currently published listing.",
    };
    await expect(
      addInterest(t.db, f.staff.session, {
        ...input,
        operationId: randomUUID(),
        reference: available.reference,
      }),
    ).rejects.toMatchObject({
      code: "validation_failed",
      fieldErrors: { matchReview: ["criteria_required"] },
    });
    await expect(
      addInterest(t.db, f.staff.session, {
        ...input,
        operationId: randomUUID(),
        reference: rental.reference,
      }),
    ).rejects.toMatchObject({
      code: "validation_failed",
      fieldErrors: { reference: ["case_kind_mismatch"] },
    });
    await expect(
      addInterest(t.db, f.staff.session, {
        ...input,
        operationId: randomUUID(),
        reference: sold.reference,
      }),
    ).rejects.toMatchObject({ code: "listing_unavailable" });
  });
});
