import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contactConsents } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createCase, createClient, createProperty, createStaff, relate } from "../testing";
import { getContactRecord } from "./contact";
import { createInquiry, createPerson } from "./testing";

// O06 contact record (read): verified channels, scoped relationships, restricted fields.
let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

async function contactWithHistory() {
  const owner = await createStaff(t.db, { roles: ["assigned_broker"] });
  const person = await createPerson(t.db, { name: "Mira Example", verification: "verified" });
  await t.db.insert(contactConsents).values([
    {
      contactMethodId: person.contactMethodId,
      purpose: "marketing",
      state: "granted",
      source: "inquiry form v1",
      recordedAt: new Date("2026-09-01T10:00:00Z"),
    },
    {
      contactMethodId: person.contactMethodId,
      purpose: "marketing",
      state: "withdrawn",
      source: "unsubscribe link",
      recordedAt: new Date("2026-09-10T10:00:00Z"),
    },
  ]);
  const buyerCase = await createCase(t.db, owner.id);
  const otherCase = await createCase(t.db, owner.id);
  const propertyId = await createProperty(t.db);
  await relate(t.db, { personId: person.personId, role: "buyer", caseId: buyerCase });
  await relate(t.db, { personId: person.personId, role: "co_buyer", caseId: otherCase });
  await relate(t.db, {
    personId: person.personId,
    role: "seller",
    propertyId,
    authority: "reviewed",
    reviewedBy: owner.id,
  });
  const inquiry = await createInquiry(t.db, {
    ownerStaffId: owner.id,
    personId: person.personId,
    contactMethodId: person.contactMethodId,
  });
  return { owner, person, buyerCase, otherCase, propertyId, inquiry };
}

describe("getContactRecord", () => {
  it("shows a broker channels, consents, relationships, inquiries and cases", async () => {
    const { owner, person, buyerCase, otherCase, propertyId, inquiry } = await contactWithHistory();
    const record = await getContactRecord(t.db, owner.actor, { personId: person.personId });
    expect(record).toMatchObject({
      person: { type: "person", id: person.personId },
      displayName: "Mira Example",
      mergedInto: null,
      restricted: [],
    });
    expect(record.channels).toEqual([
      expect.objectContaining({
        id: person.contactMethodId,
        value: person.email,
        verification: "verified",
        // The latest record per purpose is the current consent.
        consents: [{ purpose: "marketing", state: "withdrawn", recordedAt: expect.any(String) }],
      }),
    ]);
    expect(record.relationships.map((r) => r.role)).toEqual(["buyer", "co_buyer", "seller"]);
    expect(record.relationships[2]).toMatchObject({
      property: { id: propertyId },
      authority: "reviewed",
      authorityReviewedBy: { staffId: owner.id },
    });
    expect(record.cases.map((c) => c.case.id)).toEqual([buyerCase, otherCase]);
    expect(record.inquiries).toEqual([
      expect.objectContaining({
        inquiry: expect.objectContaining({ id: inquiry.id }),
        owner: { staffId: owner.id, name: "Test Staff" },
      }),
    ]);
  });

  it("omits restricted fields and cases the actor may not read", async () => {
    const { person, buyerCase, otherCase } = await contactWithHistory();
    // Record-scoped case access only, plus inquiry reading: no contact values, no consents.
    const scoped = await createStaff(t.db, {
      grants: [
        { capability: "inquiry.read" },
        { capability: "case.read", recordType: "case", recordId: buyerCase },
      ],
    });
    const record = await getContactRecord(t.db, scoped.actor, { personId: person.personId });
    expect(record.channels[0]).toMatchObject({ value: null, consents: null });
    expect(record.restricted).toEqual([
      "channels.value",
      "channels.consents",
      "relationships.authorityReviewedBy",
    ]);
    expect(record.cases.map((c) => c.case.id)).toEqual([buyerCase]);
    expect(record.relationships.some((r) => r.case?.id === otherCase)).toBe(false);
    expect(record.relationships.find((r) => r.role === "seller")?.authorityReviewedBy).toBeNull();
  });

  it("hides the record from actors without access", async () => {
    const { person } = await contactWithHistory();
    const editor = await createStaff(t.db, { roles: ["content_editor"] });
    await expect(
      getContactRecord(t.db, editor.actor, { personId: person.personId }),
    ).rejects.toMatchObject({ code: "not_found" });
    const client = await createClient(t.db);
    await expect(
      getContactRecord(t.db, client.actor, { personId: person.personId }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const broker = await createStaff(t.db, { roles: ["assigned_broker"] });
    await expect(
      getContactRecord(t.db, broker.actor, { personId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
