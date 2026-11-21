// ADR 0015 · the private page of a home on the client's own Deal: the facts and text the broker
// sees as "what the public will see", only for the Deal's participants, nothing internal.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { caseParticipants, cases, properties } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createListingFixture, publishForTest } from "../publication/testing";
import { addInterest } from "./commands";
import { dealHomeMedia, readDealHome } from "./deal-home";
import { caseFixture } from "./testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

const caseVersion = async (id: string) =>
  (await t.db.select({ version: cases.version }).from(cases).where(eq(cases.id, id)))[0]?.version ??
  0;

describe("ADR 0015: a home on the client's own Deal", () => {
  it("shows a participant a home that is not public, and nothing internal", async () => {
    const f = await caseFixture(t.db);
    const listing = await createListingFixture(t.db, {
      reviewerId: f.staff.id,
      sellerInstruction: false,
      title: "Двустаен апартамент",
    });
    await t.db
      .update(properties)
      .set({ exactAddress: "Synthetic Street 12", neighborhood: "Synthetic quarter" })
      .where(eq(properties.id, listing.propertyId));
    // Not on the Deal yet: not found.
    await expect(
      readDealHome(t.db, f.client.session, f.record.id, listing.reference, "bg"),
    ).rejects.toMatchObject({ code: "not_found" });
    await addInterest(t.db, f.staff.session, {
      id: f.record.id,
      operationId: randomUUID(),
      expectedVersion: await caseVersion(f.record.id),
      reference: listing.reference,
      explanation: "Near the school",
    });
    const home = await readDealHome(t.db, f.client.session, f.record.id, listing.reference, "bg");
    expect(home).toMatchObject({
      reference: listing.reference,
      title: "Двустаен апартамент",
      published: false,
      // Settlement precision: the neighbourhood and the address stay private.
      location: { neighborhood: null },
    });
    expect(home.price.state).toBe("known");
    const text = JSON.stringify(home);
    expect(text).not.toContain("Synthetic Street 12");
    expect(text).not.toContain("Synthetic quarter");
    expect(text).not.toMatch(/internal|seller|partyId/i);
    // Another client, and staff, cannot use the client page.
    const other = await caseFixture(t.db, f.staff);
    await expect(
      readDealHome(t.db, other.client.session, f.record.id, listing.reference, "bg"),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      readDealHome(t.db, f.staff.session, f.record.id, listing.reference, "bg"),
    ).rejects.toMatchObject({ code: "not_found" });
    // A photo that is not on the home cannot be fetched through it.
    await expect(
      dealHomeMedia(
        t.db,
        { read: async () => Buffer.from("") } as never,
        f.client.session,
        f.record.id,
        listing.reference,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "not_found" });
    // Participation ends: the page is gone.
    await t.db
      .update(caseParticipants)
      .set({ revokedAt: new Date() })
      .where(eq(caseParticipants.partyId, f.client.partyId));
    await expect(
      readDealHome(t.db, f.client.session, f.record.id, listing.reference, "bg"),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("links on to the public page only where the home is live in the reader's language", async () => {
    const f = await caseFixture(t.db);
    const listing = await createListingFixture(t.db, { reviewerId: f.staff.id });
    await publishForTest(t.db, f.staff.actor, listing, ["bg"]);
    await addInterest(t.db, f.staff.session, {
      id: f.record.id,
      operationId: randomUUID(),
      expectedVersion: await caseVersion(f.record.id),
      reference: listing.reference,
      explanation: "Live on the website",
    });
    const bg = await readDealHome(t.db, f.client.session, f.record.id, listing.reference, "bg");
    const en = await readDealHome(t.db, f.client.session, f.record.id, listing.reference, "en");
    expect(bg.published).toBe(true);
    expect(en.published).toBe(false);
    // Cleared photos of the published home are on the page.
    expect(bg.photos.length).toBeGreaterThan(0);
  });
});
