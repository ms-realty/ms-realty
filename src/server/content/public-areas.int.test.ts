import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approvals, contentPages, listings, passkeys } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { loadAreaInventory } from "@/features/discovery/area-data";
import { createSession } from "@/server/auth/sessions";
import { restrictPublication } from "@/server/publication/commands";
import { createListingFixture, createPlaces, publishForTest } from "@/server/publication/testing";
import { createStaff } from "@/server/testing";
import { createContent, decideContent, readContentWorkbench, saveContent } from "./commands";
import { readApprovedAreas } from "./public";

let t: TestDatabase;
let actor: Awaited<ReturnType<typeof createStaff>> & Awaited<ReturnType<typeof createSession>>;
beforeAll(async () => {
  t = await createTestDatabase();
  const staff = await createStaff(t.db, {
    grants: [
      { capability: "content.edit" },
      { capability: "listing.review_facts" },
      { capability: "claim.approve" },
      { capability: "publication.release" },
    ],
  });
  await t.db.insert(passkeys).values(
    [0, 1].map(() => ({
      principalId: staff.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice" as const,
      backedUp: false,
    })),
  );
  actor = { ...staff, ...(await createSession(t.db, { kind: "staff", id: staff.id })) };
});
afterAll(async () => {
  await t?.drop();
});

async function guide(publish = true, placeId?: string) {
  const input = {
    operationId: randomUUID(),
    kind: "area" as const,
    slug: `synthetic-${randomUUID()}`,
    title: "Одобрен синтетичен район",
    text: "Синтетична информация. Не е реален район или съвет.",
    jurisdiction: "Synthetic scope",
    reviewScope: "Synthetic tests only",
  };
  const { outcome } = await createContent(t.db, actor.session, input);
  if (placeId)
    await t.db.update(contentPages).set({ placeId }).where(eq(contentPages.id, outcome.id));
  if (publish)
    for (const decision of ["claims", "editorial", "publish"] as const) {
      const { page } = await readContentWorkbench(t.db, actor.session, outcome.id);
      await decideContent(t.db, actor.session, {
        id: page.id,
        expectedVersion: page.version,
        operationId: randomUUID(),
        decision,
        reviewed: true,
        note: "Explicit synthetic human review",
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
    }
  return { input, id: outcome.id };
}

describe("P15 approved areas and current inventory", () => {
  it("returns only exact active approved editions and their recorded geography; unbound guides stay unbound", async () => {
    const places = await createPlaces(t.db, {
      settlement: ["Тестово село", "Test village"],
      municipality: ["Тестова община", "Test municipality"],
    });
    const bound = await guide(true, places.settlementId),
      unbound = await guide(),
      draft = await guide(false);
    let areas = await readApprovedAreas(t.db, "bg");
    const row = areas.find((area) => area.slug === bound.input.slug);
    expect(row?.geography.map((place) => place.level)).toEqual([
      "settlement",
      "municipality",
      "district",
    ]);
    expect(row?.geography[0]?.id).toBe(places.settlementId);
    expect(areas.find((area) => area.slug === unbound.input.slug)?.geography).toEqual([]);
    expect(areas.some((area) => area.slug === draft.input.slug)).toBe(false);
    const workbench = await readContentWorkbench(t.db, actor.session, bound.id);
    await saveContent(t.db, actor.session, {
      ...bound.input,
      id: bound.id,
      expectedVersion: workbench.page.version,
      operationId: randomUUID(),
      title: "Unpublished replacement",
      text: "Draft must not replace the public edition.",
    });
    areas = await readApprovedAreas(t.db, "bg");
    expect(areas.find((area) => area.slug === bound.input.slug)?.title).toBe(bound.input.title);
    expect(await readApprovedAreas(t.db, "en")).toEqual([]);
  });

  it("removes expired approval, withdrawn content and unsafe guide paths from the public index", async () => {
    const expired = await guide(),
      withdrawn = await guide(),
      unsafe = await guide();
    const areas = await readApprovedAreas(t.db, "bg");
    const version = areas.find((area) => area.slug === expired.input.slug)?.version;
    if (!version) throw new Error("Missing approved test edition");
    await t.db
      .update(approvals)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(approvals.subjectId, version.id));
    const { page } = await readContentWorkbench(t.db, actor.session, withdrawn.id);
    await decideContent(t.db, actor.session, {
      id: page.id,
      expectedVersion: page.version,
      operationId: randomUUID(),
      decision: "withdraw",
      reviewed: true,
      note: "Synthetic withdrawal",
    });
    await t.db
      .update(contentPages)
      .set({ slug: "../unsafe" })
      .where(eq(contentPages.id, unsafe.id));
    const visible = await readApprovedAreas(t.db, "bg");
    expect(
      visible.some((area) =>
        [expired.input.slug, withdrawn.input.slug, "../unsafe"].includes(area.slug),
      ),
    ).toBe(false);
  });

  it("shows no inventory for an unbound guide and removes a restricted listing from area inventory", async () => {
    expect(await loadAreaInventory(t.db, "bg", null)).toBeNull();
    const places = await createPlaces(t.db, {
      settlement: ["Тестово място", "Second test place"],
      municipality: ["Тестова община", "Second test municipality"],
    });
    const publisher = await createStaff(t.db, { roles: ["content_editor", "publishing_approver"] });
    const listing = await createListingFixture(t.db, {
      reviewerId: publisher.id,
      placeId: places.settlementId,
      title: "Synthetic eligible listing",
      description: "Synthetic property; not a real offer.",
    });
    await publishForTest(t.db, publisher.actor, listing, ["bg"]);
    const inventory = await loadAreaInventory(t.db, "bg", places.settlementId);
    expect(inventory?.items.map((item) => item.reference)).toEqual([listing.reference]);
    expect(inventory?.saleCount).toBe(1);
    expect((await loadAreaInventory(t.db, "en", places.settlementId))?.items).toEqual([]);
    const [current] = await t.db.select().from(listings).where(eq(listings.id, listing.listingId));
    if (!current) throw new Error("Missing synthetic listing");
    await restrictPublication(t.db, {
      actor: publisher.actor,
      operationId: randomUUID(),
      expectedRevision: current.publicationGeneration,
      reference: listing.reference,
      reason: "Synthetic restriction",
    });
    expect((await loadAreaInventory(t.db, "bg", places.settlementId))?.items).toEqual([]);
  });
});
