// ADR 0012 round 4: the decision is bound to what the person saw, a recorded refusal stays a
// refusal, photo text under edit is never approved, precision is never widened, languages that
// still show an older version go offline, and a live version is never taken down for a step the
// person cannot finish. One listing per test; the database is disposable.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type PublicationPolicy,
  publicationPolicy,
  strictPublicationPolicy,
} from "@/config/tenant";
import {
  auditEvents,
  currentPublications,
  listingRevisions,
  listings,
  localizedRevisions,
  mediaAssets,
  passkeys,
  properties,
  sellerInstructions,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession, type Session } from "../auth/sessions";
import { staffFixture } from "../cases/testing";
import { searchListings } from "../search/search";
import { createStaff } from "../testing";
import {
  type BulkPublishItem,
  publishListingByAttestation,
  publishSelection,
  publishView,
} from "./attested";
import { withdrawPublication } from "./commands";
import { approveListingLanguages } from "./languages";
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

const description =
  "Светъл двустаен апартамент в центъра на Сандански, близо до парка и минералните извори. Южно изложение, обзаведен, с тераса и изглед към планината.";

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
    description,
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

const draftOf = (overrides: Record<string, unknown> = {}) => ({
  title: "Двустаен апартамент, ново заглавие",
  description,
  brokerNote: "",
  priceState: "known",
  price: "95000.00",
  areaState: "known",
  area: "68",
  areaBasis: "living",
  bedroomsState: "known",
  bedrooms: "2",
  sourceReference: "synthetic-source-record",
  sourceClass: "agency_observed",
  sourceLanguage: "bg",
  ...overrides,
});

const saveDraft = (listingId: string, draft: Record<string, unknown>) =>
  t.db.update(listings).set({ draft }).where(eq(listings.id, listingId));

const versionOf = async (reference: string) =>
  (await t.db.select().from(listings).where(eq(listings.reference, reference)))[0]
    ?.version as number;

const publish = async (
  reference: string,
  overrides: Partial<Parameters<typeof publishListingByAttestation>[2]> = {},
  session: Session = broker.session,
  policy: PublicationPolicy = publicationPolicy,
) =>
  publishListingByAttestation(
    t.db,
    session,
    {
      reference,
      operationId: newOperationId(),
      expectedVersion: await versionOf(reference),
      attested: true,
      locale: "en",
      ...overrides,
    },
    { storage: publicationFixtureStorage, policy },
  );

const searchFor = async (reference: string, locale: "bg" | "en" | "de" = "bg") =>
  (await searchListings(t.db, { locale, purpose: "sale", q: reference })).items.map(
    (row) => row.reference,
  );

const activeLocales = async (listingId: string) =>
  (
    await t.db
      .select({ locale: currentPublications.locale })
      .from(currentPublications)
      .where(
        and(eq(currentPublications.listingId, listingId), eq(currentPublications.state, "active")),
      )
  )
    .map((row) => row.locale)
    .sort();

const unpublish = async (f: { reference: string; listingId: string }) =>
  withdrawPublication(t.db, {
    actor: broker.actor,
    operationId: newOperationId(),
    expectedRevision: (await listingVersion(t.db, f.listingId)).generation,
    reference: f.reference,
    reason: "Unpublished from the listing page.",
  });

describe("the decision is bound to what the person saw (A)", () => {
  it("stores a digest of the content shown and the publication generation", async () => {
    const f = await imported();
    await saveDraft(f.listingId, draftOf());
    const result = await publish(f.reference);
    expect(result.status).toBe("published");
    const [event] = await t.db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, "listing.publication.attested"),
          eq(auditEvents.recordId, f.listingId),
        ),
      );
    const [first] = await t.db
      .select()
      .from(listingRevisions)
      .where(eq(listingRevisions.id, f.revisionId));
    expect(event?.payload).toMatchObject({
      shown: {
        revisionId: f.revisionId,
        revisionDigest: first?.contentDigest,
        generation: 0,
      },
    });
    expect(event?.payload).toMatchObject({
      shown: { draftDigest: expect.stringMatching(/^[0-9a-f]{64}$/) },
    });
  });

  it("refuses a replay of the same decision after the saved text changed", async () => {
    const f = await imported();
    await saveDraft(f.listingId, draftOf());
    const operationId = newOperationId();
    const expectedVersion = await versionOf(f.reference);
    expect(await publish(f.reference, { operationId, expectedVersion })).toMatchObject({
      status: "published",
    });
    await unpublish(f);
    await saveDraft(f.listingId, draftOf({ title: "Заглавие, променено след решението" }));
    // The same decision, with the version the person saw, must not publish the new text.
    expect(await publish(f.reference, { operationId, expectedVersion })).toMatchObject({
      status: "blocked",
      reason: "changed_since_opened",
    });
    expect(await searchFor(f.reference)).toEqual([]);
  });

  it("refuses a replay after the listing was unpublished since, and publishes on a new look", async () => {
    const f = await imported();
    const operationId = newOperationId();
    const expectedVersion = await versionOf(f.reference);
    expect(await publish(f.reference, { operationId, expectedVersion })).toMatchObject({
      status: "published",
    });
    await unpublish(f);
    expect(await publish(f.reference, { operationId, expectedVersion })).toMatchObject({
      status: "blocked",
      reason: "changed_since_opened",
    });
    expect(await searchFor(f.reference)).toEqual([]);
    // A fresh decision on the current version is a new look and publishes.
    expect(await publish(f.reference)).toMatchObject({ status: "published" });
    expect(await searchFor(f.reference)).toEqual([f.reference]);
  });

  it("refuses a version someone else wrote after the person opened the listing", async () => {
    const f = await imported();
    await saveDraft(f.listingId, draftOf());
    const operationId = newOperationId();
    const expectedVersion = await versionOf(f.reference);
    expect(await publish(f.reference, { operationId, expectedVersion })).toMatchObject({
      status: "published",
    });
    // A colleague saves a new version after the decision; the replay may not carry it along.
    await t.db.insert(listingRevisions).values({
      listingId: f.listingId,
      revisionNumber: 99,
      factRevisionId: f.factRevisionId,
      terms: {},
      sourceCopy: {},
      disclosure: { publicPrecision: "settlement" },
      contentDigest: "colleague-edit",
      createdByKind: "staff",
      createdById: author.id,
    });
    expect(await publish(f.reference, { operationId, expectedVersion })).toMatchObject({
      status: "blocked",
      reason: "changed_since_opened",
    });
  });

  it("passes the version the person saw to the first freeze: an edit since is a conflict", async () => {
    const f = await imported();
    await saveDraft(f.listingId, draftOf());
    const stale = await versionOf(f.reference);
    // The listing is edited again after the person opened it.
    await t.db
      .update(listings)
      .set({ version: stale + 1 })
      .where(eq(listings.id, f.listingId));
    expect(await publish(f.reference, { expectedVersion: stale })).toMatchObject({
      status: "blocked",
      reason: "changed_since_opened",
    });
    expect(await searchFor(f.reference)).toEqual([]);
  });
});

describe("a recorded refusal stays a refusal (B)", () => {
  const record = async (
    f: { listingId: string; propertyId: string },
    values: Partial<typeof sellerInstructions.$inferInsert>,
  ) =>
    t.db.insert(sellerInstructions).values({
      reference: `SI-2026-${String(Math.floor(Math.random() * 900_000) + 100_000)}`,
      propertyId: f.propertyId,
      listingId: f.listingId,
      revisionNumber: 1,
      state: "agreed",
      commercialTerms: { basis: "staff_attestation", attestationOperationId: "earlier" },
      disclosure: {},
      mediaUsageRights: { granted: false },
      representationScope: "sale",
      commissionTerms: "Recorded by the agency.",
      publicationPermission: false,
      contentDigest: `refusal-${randomUUID()}`,
      evidenceDocumentIds: [],
      agreedAt: new Date("2026-09-01T09:00:00Z"),
      recordedById: author.id,
      ...values,
    });

  it("blocks with a reason that says the owner withdrew permission, and records nothing", async () => {
    const f = await imported();
    await record(f, {});
    const view = await publishView(t.db, broker.actor, f.reference);
    expect(view.checks.blockers).toContain("owner_refused");
    expect(await publish(f.reference)).toEqual({
      status: "blocked",
      reference: f.reference,
      reason: "owner_refused",
    });
    const instructions = await t.db
      .select()
      .from(sellerInstructions)
      .where(eq(sellerInstructions.listingId, f.listingId));
    expect(instructions).toHaveLength(1);
    expect(instructions[0]?.publicationPermission).toBe(false);
    expect(await searchFor(f.reference)).toEqual([]);
  });

  it("lets a new recorded agreement lift the refusal, but never the attestation", async () => {
    const f = await imported();
    await record(f, {});
    await record(f, {
      revisionNumber: 2,
      publicationPermission: true,
      mediaUsageRights: { granted: true },
    });
    expect((await publishView(t.db, broker.actor, f.reference)).checks.blockers).toEqual([]);
    expect((await publish(f.reference)).status).toBe("published");
  });

  it("keeps an expired agreement attestable", async () => {
    const f = await imported();
    await record(f, {
      publicationPermission: true,
      mediaUsageRights: { granted: true },
      expiresAt: new Date("2026-09-02T09:00:00Z"),
    });
    expect((await publishView(t.db, broker.actor, f.reference)).checks.blockers).toEqual([]);
    expect((await publish(f.reference)).status).toBe("published");
  });
});

describe("photos under edit are left out (C)", () => {
  it("does not approve a photo whose details are being edited", async () => {
    const f = await imported({ photos: 2 });
    const [editing, other] = f.assetIds;
    await t.db
      .update(mediaAssets)
      .set({
        detailsDraft: {
          caption: "Pending caption",
          altText: "Pending alt text",
          modification: "none",
          modificationDisclosure: "",
        },
      })
      .where(eq(mediaAssets.id, editing ?? ""));
    expect((await publish(f.reference)).status).toBe("published");
    const [before] = await t.db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, editing ?? ""));
    const [after] = await t.db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, other ?? ""));
    expect(before?.review).toBe("pending");
    expect(before?.detailsDraft).toMatchObject({ caption: "Pending caption" });
    expect(after?.review).toBe("approved");
    const [shown] = await loadPublishedListings(t.db, { references: [f.reference] }, "bg");
    expect(shown?.media).toHaveLength(1);
  });
});

describe("publishing never widens the public location precision (D)", () => {
  it("keeps a region-level listing region-level when a stopped publish resumes", async () => {
    const f = await imported({ precision: "region" });
    await saveDraft(f.listingId, draftOf());
    const operationId = newOperationId();
    const expectedVersion = await versionOf(f.reference);
    // First call stops at the owner's documents, after the draft was frozen and facts confirmed.
    const documents: PublicationPolicy = {
      ...publicationPolicy,
      sellerEvidence: "reviewed_documents",
    };
    expect(
      await publish(f.reference, { operationId, expectedVersion }, broker.session, documents),
    ).toMatchObject({ status: "blocked", reason: "seller_documents_required" });
    const [frozen] = await t.db
      .select()
      .from(listingRevisions)
      .where(eq(listingRevisions.listingId, f.listingId));
    expect(frozen).toBeDefined();
    const latest = (
      await t.db.select().from(listingRevisions).where(eq(listingRevisions.listingId, f.listingId))
    ).sort((a, b) => b.revisionNumber - a.revisionNumber)[0];
    expect(latest?.disclosure).toMatchObject({ publicPrecision: "region" });
    // The resume under this agency's policy finishes the job without widening anything.
    const resumed = await publish(f.reference, { operationId, expectedVersion });
    expect(resumed).toMatchObject({
      status: "published",
    });
    const [shown] = await loadPublishedListings(t.db, { references: [f.reference] }, "bg");
    expect(shown?.disclosure.precision).toBe("region");
    const [revision] = await t.db
      .select()
      .from(listingRevisions)
      .where(eq(listingRevisions.id, shown?.listingRevisionId ?? ""));
    expect(revision?.disclosure).toMatchObject({ publicPrecision: "region" });
  });
});

describe("another language goes offline with the version it was approved for (E)", () => {
  it("takes the English text offline when the Bulgarian is republished with new content", async () => {
    const f = await createListingFixture(t.db, {
      reviewerId: author.id,
      placeId: places.settlementId,
      editorialState: "in_review",
      sellerInstruction: false,
      translations: { en: { title: "Two-room flat", description: "A bright flat in town." } },
    });
    expect(await publish(f.reference)).toMatchObject({
      status: "published",
      locales: ["bg", "en"],
    });
    expect(await searchFor(f.reference, "en")).toEqual([f.reference]);
    await saveDraft(f.listingId, draftOf({ title: "Двустаен апартамент, обновен текст" }));
    expect(await publish(f.reference)).toMatchObject({ status: "published", locales: ["bg"] });
    expect(await searchFor(f.reference, "bg")).toEqual([f.reference]);
    // The English still points at the old version: offline until it is approved again.
    expect(await searchFor(f.reference, "en")).toEqual([]);
    expect(await activeLocales(f.listingId)).toEqual(["bg"]);
  });
});

describe("Sandanski is never framed as a sea place (H)", () => {
  it("blocks the source text, in single publishing and for every language", async () => {
    const framed = await imported({
      title: "Апартамент до морето в Сандански",
      description: `${description} На няколко минути от плажа.`,
    });
    expect((await publishView(t.db, broker.actor, framed.reference)).checks.blockers).toEqual([
      "inland_framed_as_coast",
    ]);
    expect(await publish(framed.reference)).toMatchObject({
      status: "blocked",
      reason: "inland_framed_as_coast",
    });
    expect(await searchFor(framed.reference)).toEqual([]);

    // An approved translation that frames Sandanski as a beach place stops the decision.
    const f = await createListingFixture(t.db, {
      reviewerId: author.id,
      placeId: places.settlementId,
      editorialState: "in_review",
      sellerInstruction: false,
      translations: {
        de: { title: "Wohnung in Sandanski", description: "Helle Wohnung nahe am Strand." },
      },
    });
    expect(await publish(f.reference)).toMatchObject({
      status: "blocked",
      reason: "inland_framed_as_coast",
      detail: "de",
    });
    expect(await searchFor(f.reference)).toEqual([]);
  });
});

describe("order of effects when a live listing is updated (I)", () => {
  it("checks every permission before taking anything offline", async () => {
    const f = await imported();
    expect((await publish(f.reference)).status).toBe("published");
    await saveDraft(f.listingId, draftOf({ title: "Ново заглавие на публикувана обява" }));
    // A publishing approver may release and review facts, but may not edit the listing.
    const approver = await createStaff(t.db, {
      roles: ["publishing_approver"],
      email: `approver-${randomUUID()}@example.test`,
    });
    await t.db.insert(passkeys).values(
      [0, 1].map(() => ({
        principalId: approver.id,
        credentialId: randomUUID(),
        publicKey: Buffer.from([1]),
        deviceType: "singleDevice",
        backedUp: false,
      })),
    );
    const session = (await createSession(t.db, { kind: "staff", id: approver.id })).session;
    const result = await publish(f.reference, {}, session);
    expect(result).toMatchObject({ status: "blocked", reason: "no_permission" });
    expect(result).not.toHaveProperty("previousVersionOffline");
    // The live version never went down.
    expect(await searchFor(f.reference)).toEqual([f.reference]);
  });

  it("blocks before touching this listing when a sibling is live on the same facts", async () => {
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
    expect((await publish(reference)).status).toBe("published");
    // A fact change on one of them (the area) would replace the facts both are live on.
    await saveDraft(first.listingId, draftOf({ area: "70" }));
    const before = await versionOf(first.reference);
    const result = await publish(first.reference);
    expect(result).toMatchObject({ status: "blocked", reason: "shared_facts_published" });
    expect(result).not.toHaveProperty("previousVersionOffline");
    // Neither listing went offline, and the blocked one was not touched.
    expect(await searchFor(first.reference)).toEqual([first.reference]);
    expect(await searchFor(reference)).toEqual([reference]);
    const [property] = await t.db
      .select()
      .from(properties)
      .where(eq(properties.id, first.propertyId));
    expect(property).toBeDefined();
    expect(
      (await t.db.select().from(listings).where(eq(listings.id, first.listingId)))[0]?.version,
    ).toBeGreaterThanOrEqual(before);
  });

  it("says the previous version is offline when a later step blocks after it went down", async () => {
    const f = await imported();
    expect((await publish(f.reference)).status).toBe("published");
    await saveDraft(f.listingId, draftOf({ area: "70" }));
    // This policy asks for the owner's documents, which the attestation cannot replace: the
    // step that records the owner's permission blocks after the live version went offline.
    const documents: PublicationPolicy = {
      ...publicationPolicy,
      sellerEvidence: "reviewed_documents",
    };
    const result = await publish(f.reference, {}, broker.session, documents);
    expect(result).toMatchObject({
      status: "blocked",
      reason: "seller_documents_required",
      previousVersionOffline: true,
    });
    expect(await searchFor(f.reference)).toEqual([]);
    // Publishing again under this agency's policy brings it back.
    expect((await publish(f.reference)).status).toBe("published");
    expect(await searchFor(f.reference)).toEqual([f.reference]);
  });
});

describe("a selection of listings on one attestation (G)", () => {
  const select = (...references: string[]) =>
    Promise.all(
      references.map(async (reference) => ({
        reference,
        expectedVersion: await versionOf(reference).catch(() => -1),
      })),
    );

  it("reports each listing truthfully and keeps going after one fails", async () => {
    const good = await imported();
    const noPrice = await imported({ price: { state: "unknown" } });
    const later = await imported();
    const shown = "I checked each selected listing. Exactly this sentence was on the screen.";
    const items = await publishSelection(
      t.db,
      broker.session,
      {
        selection: [
          ...(await select(good.reference)),
          { reference: "MS-NO-SUCH-LISTING", expectedVersion: 1 },
          ...(await select(noPrice.reference, later.reference)),
        ],
        operationId: randomUUID(),
        locale: "en",
        cleanTitle: false,
        attestationText: shown,
      },
      { storage: publicationFixtureStorage },
    );
    const summary = items.map((item: BulkPublishItem) => [
      item.reference,
      item.status,
      item.status === "blocked" ? item.reason : undefined,
    ]);
    expect(summary).toEqual([
      [good.reference, "published", undefined],
      ["MS-NO-SUCH-LISTING", "blocked", "other"],
      [noPrice.reference, "blocked", "price_undecided"],
      [later.reference, "published", undefined],
    ]);
    // The titles name the listings in the result.
    expect(items[0]?.title).toBeTruthy();
    // The sentence that was shown is the sentence recorded, not the single-listing one.
    const [attested] = await t.db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, "listing.publication.attested"),
          eq(auditEvents.recordId, good.listingId),
        ),
      );
    expect(attested?.payload).toMatchObject({ attestation: shown });
    expect(await searchFor(good.reference)).toEqual([good.reference]);
    expect(await searchFor(later.reference)).toEqual([later.reference]);
  });

  it("stops on a session error and marks every listing it did not reach as not attempted", async () => {
    const a = await imported();
    const b = await imported();
    const signedOut: Session = { ...broker.session, id: randomUUID() };
    const items = await publishSelection(
      t.db,
      signedOut,
      {
        selection: await select(a.reference, b.reference),
        operationId: randomUUID(),
        locale: "en",
        cleanTitle: false,
        attestationText: "Shown text.",
      },
      { storage: publicationFixtureStorage },
    );
    expect(items.map((item) => item.status)).toEqual(["not_attempted", "not_attempted"]);
    expect(await searchFor(a.reference)).toEqual([]);
    expect(await searchFor(b.reference)).toEqual([]);
  });
});

describe("whoever may publish may approve a language they tick (M)", () => {
  const sessionFor = async (roles: NonNullable<Parameters<typeof createStaff>[1]>["roles"]) => {
    const person = await createStaff(t.db, { roles, email: `m-${randomUUID()}@example.test` });
    await t.db.insert(passkeys).values(
      [0, 1].map(() => ({
        principalId: person.id,
        credentialId: randomUUID(),
        publicKey: Buffer.from([1]),
        deviceType: "singleDevice",
        backedUp: false,
      })),
    );
    return { ...person, ...(await createSession(t.db, { kind: "staff", id: person.id })) };
  };
  const english =
    "A bright two-room flat in the centre of Sandanski, close to the park and the mineral springs. South facing, furnished, with a terrace and a view of the mountain.";

  const withDraftEnglish = async () => {
    const f = await imported();
    await t.db.insert(localizedRevisions).values({
      listingId: f.listingId,
      sourceRevisionId: f.revisionId,
      locale: "en",
      state: "draft",
      title: "Two-room flat in Sandanski",
      body: { description: english },
    });
    return f;
  };
  const approve = (reference: string, session: Session, policy: PublicationPolicy) =>
    approveListingLanguages(
      t.db,
      session,
      {
        reference,
        operationId: randomUUID(),
        locales: ["en"],
        locale: "en",
        attestation: () => "I read the English text and it says the same as the Bulgarian.",
      },
      { storage: publicationFixtureStorage, policy },
    );

  it("approves under this agency's policy without the translation-reviewer role", async () => {
    const publisher = await sessionFor([
      "assigned_broker",
      "publishing_approver",
      "content_editor",
    ]);
    const f = await withDraftEnglish();
    expect((await publish(f.reference, {}, publisher.session)).status).toBe("published");
    expect(await approve(f.reference, publisher.session, publicationPolicy)).toEqual([
      { locale: "en", status: "published" },
    ]);
    expect(await searchFor(f.reference, "en")).toEqual([f.reference]);
  });

  it("still needs the translation-reviewer role under the strict policy", async () => {
    const publisher = await sessionFor([
      "assigned_broker",
      "publishing_approver",
      "content_editor",
    ]);
    const f = await withDraftEnglish();
    expect((await publish(f.reference, {}, publisher.session)).status).toBe("published");
    expect(await approve(f.reference, publisher.session, strictPublicationPolicy)).toEqual([
      { locale: "en", status: "blocked", reason: "no_permission" },
    ]);
    expect(await searchFor(f.reference, "en")).toEqual([]);
  });
});
