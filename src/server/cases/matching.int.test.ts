import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createListingFixture, defaultFacts, publishForTest } from "../publication/testing";
import { caseMatchCriteriaInput } from "../search/search";
import { reviseBrief } from "./commands";
import { readCaseMatches } from "./matching";
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
    expect(
      [...matches.confirmed, ...matches.needsConfirmation].map((item) => item.reference),
    ).not.toContain(wrongType.reference);
    expect(
      [...matches.confirmed, ...matches.needsConfirmation].map((item) => item.reference),
    ).not.toContain(unpublished.reference);

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
      expectedVersion: 2,
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
  });
});
