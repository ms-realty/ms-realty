// ADR 0012: one recorded human decision publishes an imported listing through the unchanged
// public read path, under this agency's policy (staff attestation, no second person).
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publicationPolicy } from "@/config/tenant";
import {
  auditEvents,
  currentPublications,
  listingRevisions,
  listings,
  localizedRevisions,
  mediaAssets,
  propertyFacts,
  publicationManifests,
  sellerInstructions,
  staffMemberships,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { publishCopy } from "@/features/inventory/publish-copy";
import type { Session } from "../auth/sessions";
import { createSession } from "../auth/sessions";
import { staffFixture } from "../cases/testing";
import { searchListings } from "../search/search";
import { createStaff } from "../testing";
import { readToday } from "../work/queries";
import { publishListingByAttestation, publishView, readyToPublish } from "./attested";
import { currentEligibility, withdrawPublication } from "./commands";
import { loadPublishedListings } from "./presentation";
import {
  createListingFixture,
  createPlaces,
  type ListingFixtureOptions,
  listingVersion,
  newOperationId,
  type PlaceFixture,
  publicationFixtureStorage,
} from "./testing";

let t: TestDatabase;
let broker: Awaited<ReturnType<typeof staffFixture>>;
let author: { id: string };
let places: PlaceFixture;

beforeAll(async () => {
  t = await createTestDatabase();
  broker = await staffFixture(t.db);
  author = await createStaff(t.db, { roles: ["content_editor"] });
  places = await createPlaces(t.db);
});
afterAll(async () => {
  await t?.drop();
});

const unreviewed = (fact: ListingFixtureOptions["facts"]) =>
  Object.fromEntries(
    Object.entries(fact ?? {}).map(([key, value]) => [
      key,
      { ...value, reviewed: false, sourceClass: "legacy_import" as const },
    ]),
  );

/** As the legacy import leaves an active listing: nothing reviewed, confirmed or cleared. */
const imported = (options: Partial<ListingFixtureOptions> = {}) =>
  createListingFixture(t.db, {
    reviewerId: author.id,
    placeId: places.settlementId,
    editorialState: "needs_facts",
    commercialState: "confirmation_required",
    availabilityConfirmedAt: null,
    sellerInstruction: false,
    photos: 2,
    photoState: "pending",
    description:
      "Светъл двустаен апартамент в центъра на Сандански, близо до парка и минералните извори. Южно изложение, обзаведен, с тераса и изглед към планината.",
    facts: unreviewed({
      bedrooms: { state: "known", value: 2 },
      "area.living": {
        state: "known",
        value: { value: 68, unit: "m2", basis: "living" },
        unit: "m2",
      },
      location: { state: "known", value: { country: "BG" } },
    }),
    ...options,
  });

const publish = async (
  reference: string,
  overrides: Partial<Parameters<typeof publishListingByAttestation>[2]> = {},
  session: Session = broker.session,
) =>
  publishListingByAttestation(
    t.db,
    session,
    {
      reference,
      operationId: newOperationId(),
      expectedVersion: (
        await t.db.select().from(listings).where(eq(listings.reference, reference))
      )[0]?.version as number,
      attested: true,
      locale: "en",
      ...overrides,
    },
    { storage: publicationFixtureStorage },
  );

const searchFor = async (reference: string, locale: "bg" | "en" | "de" = "bg") =>
  (await searchListings(t.db, { locale, purpose: "sale", q: reference })).items.map(
    (row) => row.reference,
  );

describe("one-decision publishing (ADR 0012)", () => {
  it("ships with the agency's policy: staff attestation, no second person", () => {
    expect(publicationPolicy.sellerEvidence).toBe("staff_attestation");
    expect(publicationPolicy.independentReview).toBe(false);
  });

  it("publishes an imported listing on one attestation and shows it in search and detail", async () => {
    const f = await imported();
    const before = await publishView(t.db, broker.actor, f.reference);
    expect(before.checks.blockers).toEqual([]);
    expect(before.live).toEqual([]);
    expect(await searchFor(f.reference)).toEqual([]);

    const result = await publish(f.reference, { note: "Checked with the owner by phone." });
    expect(result).toMatchObject({ status: "published", locales: ["bg"], unchanged: false });
    if (result.status !== "published") throw new Error("not published");

    expect(await searchFor(f.reference)).toEqual([f.reference]);
    const [shown] = await loadPublishedListings(t.db, { references: [f.reference] }, "bg");
    expect(shown?.reference).toBe(f.reference);
    // Facts are preserved exactly: the price, area and bedrooms the import recorded.
    const [revision] = await t.db
      .select()
      .from(listingRevisions)
      .where(eq(listingRevisions.id, shown?.listingRevisionId ?? ""));
    expect(revision?.terms).toMatchObject({
      facts: { price: { state: "known", value: { amountMinor: 9_500_000, currency: "EUR" } } },
    });
    const facts = await t.db
      .select()
      .from(propertyFacts)
      .where(eq(propertyFacts.factRevisionId, revision?.factRevisionId ?? ""));
    expect(Object.fromEntries(facts.map((fact) => [fact.fieldKey, fact.value]))).toMatchObject({
      bedrooms: 2,
      "area.living": { value: 68, unit: "m2", basis: "living" },
    });
    // The imported values are now reviewed by the person who attested.
    expect(facts.every((fact) => fact.reviewedById === broker.id)).toBe(true);
    expect(facts.every((fact) => fact.sourceClass === "legacy_import")).toBe(true);

    // The attestation, its actor and time are in the trail; approvals cite it.
    const [attested] = await t.db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, "listing.publication.attested"),
          eq(auditEvents.recordId, f.listingId),
        ),
      );
    expect(attested).toMatchObject({ actorKind: "staff", actorId: broker.id });
    expect(attested?.payload).toMatchObject({
      basis: "staff_attestation",
      attestation: publishCopy("en").attestation,
      note: "Checked with the owner by phone.",
    });
    expect(attested?.occurredAt).toBeInstanceOf(Date);
    const [instruction] = await t.db
      .select()
      .from(sellerInstructions)
      .where(eq(sellerInstructions.listingId, f.listingId));
    expect(instruction).toMatchObject({
      state: "agreed",
      recordedById: broker.id,
      publicationPermission: true,
      evidenceDocumentIds: [],
    });
    expect(instruction?.commercialTerms).toMatchObject({
      basis: "staff_attestation",
      attestationOperationId: result.attestationId,
    });
    // Both processed photos were cleared by the same person and are shown.
    const photos = await t.db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.propertyId, f.propertyId));
    expect(photos.map((photo) => [photo.review, photo.rights, photo.reviewedById])).toEqual([
      ["approved", "cleared", broker.id],
      ["approved", "cleared", broker.id],
    ]);
    expect(shown?.media).toHaveLength(2);
    const [listing] = await t.db.select().from(listings).where(eq(listings.id, f.listingId));
    expect(listing).toMatchObject({
      commercialState: "available",
      availabilityConfirmedById: broker.id,
      editorialState: "approved_revision",
    });
  });

  it("is a no-op on a second call, with the same or a new decision", async () => {
    const f = await imported();
    const operationId = newOperationId();
    const expectedVersion = (await listingVersion(t.db, f.listingId)).version;
    const input = {
      reference: f.reference,
      operationId,
      expectedVersion,
      attested: true,
      locale: "bg" as const,
    };
    const deps = { storage: publicationFixtureStorage };
    expect((await publishListingByAttestation(t.db, broker.session, input, deps)).status).toBe(
      "published",
    );
    const manifests = async () =>
      (
        await t.db
          .select()
          .from(publicationManifests)
          .where(eq(publicationManifests.listingId, f.listingId))
      ).length;
    const attestations = async () =>
      (
        await t.db
          .select()
          .from(auditEvents)
          .where(
            and(
              eq(auditEvents.action, "listing.publication.attested"),
              eq(auditEvents.recordId, f.listingId),
            ),
          )
      ).length;
    const [count, recorded] = [await manifests(), await attestations()];
    expect(await publishListingByAttestation(t.db, broker.session, input, deps)).toMatchObject({
      status: "published",
      unchanged: true,
    });
    expect([await manifests(), await attestations()]).toEqual([count, recorded]);
    expect(await publish(f.reference)).toMatchObject({ status: "published", unchanged: true });
    expect(await manifests()).toBe(count);
  });

  it("unpublishes through the existing withdrawal and can publish again", async () => {
    const f = await imported();
    expect((await publish(f.reference)).status).toBe("published");
    await withdrawPublication(t.db, {
      actor: broker.actor,
      operationId: newOperationId(),
      expectedRevision: (await listingVersion(t.db, f.listingId)).generation,
      reference: f.reference,
      reason: "Unpublished from the listing page.",
    });
    expect(await searchFor(f.reference)).toEqual([]);
    expect(await loadPublishedListings(t.db, { references: [f.reference] }, "bg")).toEqual([]);
    expect((await publishView(t.db, broker.actor, f.reference)).live).toEqual([]);
    expect(await publish(f.reference)).toMatchObject({ status: "published", unchanged: false });
    expect(await searchFor(f.reference)).toEqual([f.reference]);
  });

  it("publishes a human-approved translation and keeps an unapproved one off the site", async () => {
    const f = await createListingFixture(t.db, {
      reviewerId: author.id,
      placeId: places.settlementId,
      editorialState: "in_review",
      sellerInstruction: false,
      translations: { en: { title: "Two-room flat", description: "A bright flat in town." } },
    });
    await t.db.insert(localizedRevisions).values({
      listingId: f.listingId,
      sourceRevisionId: f.revisionId,
      locale: "de",
      state: "reviewing",
      title: "Zweizimmerwohnung",
      body: { description: "Maschinell entworfen, nicht geprüft." },
      draftedByAi: true,
    });
    expect(await publish(f.reference)).toMatchObject({
      status: "published",
      locales: ["bg", "en"],
    });
    expect(await searchFor(f.reference, "en")).toEqual([f.reference]);
    expect(await searchFor(f.reference, "de")).toEqual([]);
    const pointers = await t.db
      .select({ locale: currentPublications.locale })
      .from(currentPublications)
      .where(eq(currentPublications.listingId, f.listingId));
    expect(pointers.map((p) => p.locale).sort()).toEqual(["bg", "en"]);
  });

  it("goes live without photos that are not processed yet, and says so", async () => {
    const f = await imported({ photoState: "unprocessed" });
    const view = await publishView(t.db, broker.actor, f.reference);
    expect(view.checks.warnings).toContain("photos_not_ready");
    // One photo line: photos exist but are not ready, which is not the same as having none.
    expect(view.checks.warnings).not.toContain("no_photos");
    const result = await publish(f.reference);
    expect(result).toMatchObject({ status: "published" });
    const [shown] = await loadPublishedListings(t.db, { references: [f.reference] }, "bg");
    expect(shown?.media).toEqual([]);
  });

  it("stops at the first real blocker without recording a decision", async () => {
    const noPrice = await imported({ price: { state: "unknown" } });
    expect(await publish(noPrice.reference)).toEqual({
      status: "blocked",
      reference: noPrice.reference,
      reason: "price_undecided",
    });
    const sold = await imported({ commercialState: "sold" });
    expect(await publish(sold.reference)).toMatchObject({ reason: "not_available" });
    const unticked = await imported();
    expect(await publish(unticked.reference, { attested: false })).toMatchObject({
      reason: "not_attested",
    });
    const stale = await imported();
    expect(await publish(stale.reference, { expectedVersion: 0 })).toMatchObject({
      reason: "changed_since_opened",
    });
    for (const f of [noPrice, sold, unticked, stale]) {
      expect(await searchFor(f.reference)).toEqual([]);
      const [listing] = await t.db.select().from(listings).where(eq(listings.id, f.listingId));
      expect(listing?.approvedRevisionId).toBeNull();
    }
    const recorded = await t.db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, "listing.publication.attested"),
          eq(auditEvents.recordId, noPrice.listingId),
        ),
      );
    expect(recorded).toEqual([]);
  });

  it("refuses a person without publishing rights and any non-human actor", async () => {
    const f = await imported();
    const editor = await createStaff(t.db, {
      roles: ["content_editor"],
      email: `editor-${randomUUID()}@example.test`,
    });
    const { session } = await createSession(t.db, { kind: "staff", id: editor.id });
    expect(await publish(f.reference, {}, session)).toMatchObject({ reason: "no_permission" });
    await expect(
      publish(f.reference, {}, { ...session, actor: { kind: "ai_service", id: "hermes" } }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(await searchFor(f.reference)).toEqual([]);
  });

  it("lists imported active listings as ready and leaves archived and blocked ones out", async () => {
    const ready = await imported();
    const archived = await imported({ commercialState: "withdrawn" });
    const blocked = await imported({ price: { state: "unknown" } });
    // Pasted references, separated by spaces and commas, narrow the view.
    const pasted = [ready, archived, blocked].map((row) => row.reference).join(", ");
    const references = (await readyToPublish(t.db, broker.actor, { query: pasted })).rows.map(
      (row) => row.reference,
    );
    expect(references).toContain(ready.reference);
    expect(references).not.toContain(archived.reference);
    expect(references).not.toContain(blocked.reference);
    await publish(ready.reference);
    expect(
      (await readyToPublish(t.db, broker.actor, { query: ready.reference })).rows.map(
        (row) => row.reference,
      ),
    ).not.toContain(ready.reference);
  });

  it("keeps a listing public after the attesting broker leaves; a lapsing policy fails closed", async () => {
    const leaver = await staffFixture(t.db);
    const f = await imported();
    expect((await publish(f.reference, {}, leaver.session)).status).toBe("published");
    await t.db
      .update(staffMemberships)
      .set({ state: "ended" })
      .where(eq(staffMemberships.principalId, leaver.id));
    expect(await searchFor(f.reference)).toEqual([f.reference]);
    const [listing] = await t.db.select().from(listings).where(eq(listings.id, f.listingId));
    if (!listing) throw new Error("listing missing");
    const at = (policy: typeof publicationPolicy) =>
      currentEligibility(
        t.db,
        listing,
        "bg",
        listing.publicationGeneration,
        new Date(),
        false,
        policy,
      );
    expect((await at(publicationPolicy)).input.sellerInstructionValid).toBe(true);
    expect(
      (await at({ ...publicationPolicy, attestationOutlivesAuthor: false })).input
        .sellerInstructionValid,
    ).toBe(false);
  });

  it("accepts an active staff session without a recent sign-in", async () => {
    const f = await imported();
    const { session } = await createSession(
      t.db,
      { kind: "staff", id: broker.id },
      new Date(Date.now() - 20 * 60_000),
    );
    expect((await publish(f.reference, {}, session)).status).toBe("published");
  });

  it("publishes an imported rent once the broker confirms the period, keeping the amount", async () => {
    const f = await imported({
      purpose: "long_term_rent",
      price: { state: "unknown" },
      rentWithoutPeriod: { amountMinor: 45_000, currency: "EUR" },
    });
    expect((await publishView(t.db, broker.actor, f.reference)).checks.blockers).toEqual([
      "rent_period_unconfirmed",
    ]);
    expect(await publish(f.reference)).toMatchObject({ reason: "rent_period_unconfirmed" });
    expect(await publish(f.reference, { rentPeriod: "month" })).toMatchObject({
      status: "published",
    });
    const [shown] = await loadPublishedListings(t.db, { references: [f.reference] }, "bg");
    const [revision] = await t.db
      .select()
      .from(listingRevisions)
      .where(eq(listingRevisions.id, shown?.listingRevisionId ?? ""));
    expect(revision?.terms).toMatchObject({
      facts: {
        price: {
          state: "known",
          value: { amountMinor: 45_000, currency: "EUR", period: "month", basis: "asking" },
        },
      },
    });
    expect(
      (await searchListings(t.db, { locale: "bg", purpose: "long_term_rent", q: f.reference }))
        .items.length,
    ).toBe(1);
  });

  it("keeps a region-level location precision, also when a saved draft is published", async () => {
    const f = await imported({ precision: "region" });
    await t.db
      .update(listings)
      .set({
        draft: {
          title: "Двустаен апартамент, ново заглавие",
          description:
            "Светъл двустаен апартамент близо до парка и минералните извори. Южно изложение, обзаведен, с тераса и изглед към планината.",
          brokerNote: "",
          priceState: "known",
          price: "95000",
          areaState: "known",
          area: "68",
          areaBasis: "living",
          bedroomsState: "known",
          bedrooms: "2",
          sourceReference: "synthetic-source-record",
          sourceClass: "agency_observed",
          sourceLanguage: "bg",
        },
      })
      .where(eq(listings.id, f.listingId));
    expect((await publishView(t.db, broker.actor, f.reference)).content.pendingDraft).toBe(true);
    expect((await publish(f.reference)).status).toBe("published");
    const [shown] = await loadPublishedListings(t.db, { references: [f.reference] }, "bg");
    expect(shown?.title).toBe("Двустаен апартамент, ново заглавие");
    expect(shown?.disclosure.precision).toBe("region");
    const [revision] = await t.db
      .select()
      .from(listingRevisions)
      .where(eq(listingRevisions.id, shown?.listingRevisionId ?? ""));
    expect(revision?.disclosure).toMatchObject({ publicPrecision: "region" });
  });

  it("publishes a second listing of the same property on the facts already reviewed", async () => {
    // As the import leaves two active adverts of one property: both bind its fact revision 1.
    const first = await imported();
    const [source] = await t.db
      .select()
      .from(listingRevisions)
      .where(eq(listingRevisions.id, first.revisionId));
    if (!source) throw new Error("revision missing");
    const reference = `MS-${String(Date.now()).slice(-9)}`;
    const [sibling] = await t.db
      .insert(listings)
      .values({
        reference,
        propertyId: first.propertyId,
        purpose: "sale",
        commercialState: "confirmation_required",
        editorialState: "needs_facts",
        latestRevisionNumber: 1,
      })
      .returning();
    if (!sibling) throw new Error("sibling missing");
    await t.db.insert(listingRevisions).values({
      listingId: sibling.id,
      revisionNumber: 1,
      factRevisionId: source.factRevisionId,
      terms: source.terms,
      sourceCopy: source.sourceCopy,
      disclosure: source.disclosure,
      contentDigest: `${source.contentDigest}-sibling`,
      createdByKind: "staff",
      createdById: author.id,
    });
    expect((await publish(first.reference)).status).toBe("published");
    expect(await publish(reference)).toMatchObject({ status: "published" });
    expect(await searchFor(first.reference)).toEqual([first.reference]);
    expect(await searchFor(reference)).toEqual([reference]);
  });

  it("shows ready listings as one Today line and a listing to fix as its own line", async () => {
    const ready = await imported();
    const rent = await imported({
      purpose: "long_term_rent",
      price: { state: "unknown" },
      rentWithoutPeriod: { amountMinor: 45_000, currency: "EUR" },
    });
    const archived = await imported({ commercialState: "withdrawn" });
    const today = await readToday(t.db, broker.session);
    const rows = today.listingReviews.rows;
    const summary = rows.find((row) => row.readyCount);
    expect(summary?.readyCount).toBeGreaterThan(0);
    expect(rows.map((row) => row.id)).not.toContain(ready.listingId);
    expect(rows.map((row) => row.id)).not.toContain(archived.listingId);
    expect(rows.find((row) => row.id === rent.listingId)?.fix).toBe("rent_period_unconfirmed");
  });
});
