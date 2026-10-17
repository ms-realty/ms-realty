import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  approvals,
  contentPages,
  contentPageVersions,
  geographyPlaces,
  listings,
  passkeys,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { loadAreaInventory } from "@/features/discovery/area-data";
import { createSession } from "@/server/auth/sessions";
import { hashRequest } from "@/server/crypto";
import { restrictPublication } from "@/server/publication/commands";
import { createListingFixture, createPlaces, publishForTest } from "@/server/publication/testing";
import { createStaff } from "@/server/testing";
import {
  createContent,
  decideContent,
  readContentPlaces,
  readContentWorkbench,
  saveContent,
} from "./commands";
import { readApprovedAreas, readApprovedContent } from "./public";

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
    placeId: placeId ?? null,
  };
  const { outcome } = await createContent(t.db, actor.session, input);
  if (publish) await review(outcome.id);
  return { input, id: outcome.id };
}

async function review(
  id: string,
  decisions: readonly ("claims" | "editorial" | "publish")[] = ["claims", "editorial", "publish"],
) {
  for (const decision of decisions) {
    const { page } = await readContentWorkbench(t.db, actor.session, id);
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
}

describe("P15 approved areas and current inventory", () => {
  it("P15B binds scope to the approved hash; saving, replaying and mutating a legacy pointer cannot move the public guide", async () => {
    const oldPlace = await createPlaces(t.db, {
      settlement: ["Старо тестово място", "Old test location"],
      municipality: ["Стара тестова община", "Old test municipality"],
    });
    const nextPlace = await createPlaces(t.db, {
      settlement: ["Ново тестово място", "New test location"],
      municipality: ["Нова тестова община", "New test municipality"],
    });
    const bound = await guide(true, oldPlace.settlementId);
    const published = await readApprovedContent(t.db, "area", bound.input.slug, "bg");
    expect(published?.placeId).toBe(oldPlace.settlementId);
    const workbench = await readContentWorkbench(t.db, actor.session, bound.id);
    const save = {
      ...bound.input,
      id: bound.id,
      expectedVersion: workbench.page.version,
      operationId: randomUUID(),
      placeId: nextPlace.settlementId,
    };
    const saved = await saveContent(t.db, actor.session, save);
    expect((await saveContent(t.db, actor.session, save)).outcome).toEqual(saved.outcome);
    await expect(
      saveContent(t.db, actor.session, { ...save, placeId: oldPlace.settlementId }),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
    const draft = await readContentWorkbench(t.db, actor.session, bound.id);
    expect(draft.current.body).toMatchObject({ placeId: nextPlace.settlementId });
    expect(draft.current.contentHash).not.toBe(published?.version.contentHash);
    expect(draft.publishedPlaceId).toBe(oldPlace.settlementId);
    expect(draft.decisions).toEqual([]);
    expect(draft.current.reviewedAt).toBeNull();
    await t.db
      .update(contentPages)
      .set({ placeId: nextPlace.settlementId })
      .where(eq(contentPages.id, bound.id));
    expect((await readApprovedContent(t.db, "area", bound.input.slug, "bg"))?.placeId).toBe(
      oldPlace.settlementId,
    );
    expect(
      (await readApprovedAreas(t.db, "bg")).find((area) => area.slug === bound.input.slug)
        ?.geography[0]?.id,
    ).toBe(oldPlace.settlementId);
    await expect(review(bound.id, ["publish"])).rejects.toMatchObject({ code: "approval_stale" });
    await review(bound.id, ["claims"]);
    await expect(review(bound.id, ["publish"])).rejects.toMatchObject({
      code: "publication_ineligible",
    });
    expect((await readApprovedContent(t.db, "area", bound.input.slug, "bg"))?.version).toEqual(
      published?.version,
    );
    await review(bound.id, ["editorial", "publish"]);
    const replacement = await readApprovedContent(t.db, "area", bound.input.slug, "bg");
    expect(replacement?.placeId).toBe(nextPlace.settlementId);
    expect(replacement?.version.contentHash).not.toBe(published?.version.contentHash);
    const current = await readContentWorkbench(t.db, actor.session, bound.id);
    await saveContent(t.db, actor.session, {
      ...save,
      expectedVersion: current.page.version,
      operationId: randomUUID(),
      placeId: null,
    });
    expect((await readApprovedContent(t.db, "area", bound.input.slug, "bg"))?.placeId).toBe(
      nextPlace.settlementId,
    );
    await review(bound.id);
    expect((await readApprovedContent(t.db, "area", bound.input.slug, "bg"))?.placeId).toBeNull();
    expect(
      (await readApprovedAreas(t.db, "bg")).find((area) => area.slug === bound.input.slug)
        ?.geography,
    ).toEqual([]);
    // The existing database trigger protects the complete body, including the chosen place.
    await expect(
      t.db
        .update(contentPageVersions)
        .set({ body: { ...(current.current.body as object), placeId: oldPlace.settlementId } })
        .where(eq(contentPageVersions.id, current.current.id)),
    ).rejects.toThrow();
  });

  it("P15B leaves legacy approved editions unbound despite mutable page.placeId and prose that names a place", async () => {
    const place = await createPlaces(t.db);
    const slug = `synthetic-legacy-${randomUUID()}`;
    const [page] = await t.db
      .insert(contentPages)
      .values({ kind: "area", slug, placeId: place.settlementId, currentVersionNumber: 1 })
      .returning();
    if (!page) throw new Error("Missing legacy test guide");
    const body = {
      title: "Сандански",
      paragraphs: ["Synthetic legacy content names Sandanski but grants no geographic authority."],
    };
    await t.db.insert(contentPageVersions).values({
      contentPageId: page.id,
      versionNumber: 1,
      body,
      contentHash: hashRequest(body),
      jurisdiction: "Synthetic scope",
      reviewScope: "Synthetic review only",
      createdById: actor.id,
    });
    await review(page.id);
    const before = await readApprovedContent(t.db, "area", slug, "bg");
    expect(before?.placeId).toBeNull();
    await t.db
      .update(contentPages)
      .set({ placeId: place.municipalityId })
      .where(eq(contentPages.id, page.id));
    expect(await readApprovedContent(t.db, "area", slug, "bg")).toEqual(before);
    expect(
      (await readApprovedAreas(t.db, "bg")).find((area) => area.slug === slug)?.geography,
    ).toEqual([]);
    const workbench = await readContentWorkbench(t.db, actor.session, page.id);
    expect(workbench.current.body).not.toHaveProperty("placeId");
    expect(workbench.publishedPlaceId).toBeNull();
    await saveContent(t.db, actor.session, {
      id: page.id,
      operationId: randomUUID(),
      expectedVersion: workbench.page.version,
      title: body.title,
      text: body.paragraphs.join("\n\n"),
      jurisdiction: "Synthetic scope",
      reviewScope: "Synthetic review only",
      placeId: place.settlementId,
    });
    expect((await readApprovedContent(t.db, "area", slug, "bg"))?.placeId).toBeNull();
    await review(page.id);
    expect((await readApprovedContent(t.db, "area", slug, "bg"))?.placeId).toBe(place.settlementId);
  });

  it("P15B validates exact place identity and supported levels on authorized create/save and exposes only recorded choices", async () => {
    const draft = await guide(false);
    const [country] = await t.db
      .insert(geographyPlaces)
      .values({
        level: "country",
        countryCode: "BG",
        slug: `synthetic-country-${randomUUID()}`,
        nameNative: "Тестова държава",
        nameLatin: "Test country",
      })
      .returning();
    if (!country) throw new Error("Missing synthetic country");
    for (const placeId of [randomUUID(), "not-a-place", country.id]) {
      await expect(
        createContent(t.db, actor.session, {
          ...draft.input,
          operationId: randomUUID(),
          slug: `synthetic-invalid-${randomUUID()}`,
          placeId,
        }),
      ).rejects.toMatchObject({ code: "validation_failed" });
      await expect(
        saveContent(t.db, actor.session, {
          ...draft.input,
          operationId: randomUUID(),
          id: draft.id,
          expectedVersion: 1,
          placeId,
        }),
      ).rejects.toMatchObject({ code: "validation_failed" });
    }
    expect(
      (await readContentWorkbench(t.db, actor.session, draft.id)).page.currentVersionNumber,
    ).toBe(1);
    const { places: options, placesAvailable } = await readContentPlaces(t.db, actor.session);
    expect(placesAvailable).toBe(true);
    expect(options.some((option) => option.id === country.id)).toBe(false);
    expect(options.some((option) => option.context.length > 0)).toBe(true);
    const unrelated = await createStaff(t.db, { roles: [], grants: [] });
    const unauthorised = await createSession(t.db, { kind: "staff", id: unrelated.id });
    await expect(readContentPlaces(t.db, unauthorised.session)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      saveContent(t.db, unauthorised.session, {
        ...draft.input,
        id: draft.id,
        expectedVersion: 1,
        operationId: randomUUID(),
        placeId: options[0]?.id,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("P15B reports register outages for areas without blocking service/help workbenches", async () => {
    const area = await guide(false);
    const service = await createContent(t.db, actor.session, {
      ...area.input,
      slug: `synthetic-service-${randomUUID()}`,
      operationId: randomUUID(),
      kind: "service",
    });
    const help = await createContent(t.db, actor.session, {
      ...area.input,
      slug: `synthetic-help-${randomUUID()}`,
      operationId: randomUUID(),
      kind: "help",
    });
    await t.sql`alter table geography_places rename to geography_places_unavailable`;
    try {
      for (const id of [service.outcome.id, help.outcome.id]) {
        const content = await readContentWorkbench(t.db, actor.session, id);
        expect(content.places).toEqual([]);
        expect(content.placesAvailable).toBe(true);
      }
      const content = await readContentWorkbench(t.db, actor.session, area.id);
      expect(content.places).toEqual([]);
      expect(content.placesAvailable).toBe(false);
      expect(await readContentPlaces(t.db, actor.session)).toEqual({
        places: [],
        placesAvailable: false,
      });
    } finally {
      await t.sql`alter table geography_places_unavailable rename to geography_places`;
    }
  });

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
