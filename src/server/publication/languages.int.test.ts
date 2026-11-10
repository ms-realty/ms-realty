// ADR 0012: languages in one decision. A translation goes public only after a person approves
// that translation for the published version; the system checks it against the source first.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { strictPublicationPolicy } from "@/config/tenant";
import {
  approvals,
  currentPublications,
  listings,
  localizedRevisions,
  passkeys,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import type { PublicLocale } from "@/domain/ids";
import { createSession, type Session } from "../auth/sessions";
import { searchListings } from "../search/search";
import { createStaff } from "../testing";
import { publishListingByAttestation } from "./attested";
import { approveListingLanguages, languageView, readyLanguages } from "./languages";
import { loadPublishedListings } from "./presentation";
import {
  createListingFixture,
  createPlaces,
  newOperationId,
  type PlaceFixture,
  publicationFixtureStorage,
} from "./testing";

let t: TestDatabase;
let places: PlaceFixture;
let author: { id: string };

async function staff(roles: NonNullable<Parameters<typeof createStaff>[1]>["roles"]) {
  const person = await createStaff(t.db, { roles, email: `lang-${randomUUID()}@example.test` });
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
}
let broker: Awaited<ReturnType<typeof staff>>;

beforeAll(async () => {
  t = await createTestDatabase();
  places = await createPlaces(t.db);
  author = await createStaff(t.db, { roles: ["content_editor"] });
  broker = await staff([
    "assigned_broker",
    "publishing_approver",
    "content_editor",
    "translation_reviewer",
  ]);
});
afterAll(async () => {
  await t?.drop();
});

const bgDescription =
  "Светъл двустаен апартамент в центъра на Сандански, близо до парка и минералните извори. Южно изложение, обзаведен, с тераса и изглед към планината.";
const enDescription =
  "A bright two-room flat in the centre of Sandanski, close to the park and the mineral springs. South facing, furnished, with a terrace and a view of the mountain.";

/** An imported listing with draft translations bound to its first version, as the import does. */
async function imported(drafts: Partial<Record<PublicLocale, { title: string; text: string }>>) {
  const f = await createListingFixture(t.db, {
    reviewerId: author.id,
    placeId: places.settlementId,
    editorialState: "needs_facts",
    commercialState: "confirmation_required",
    availabilityConfirmedAt: null,
    sellerInstruction: false,
    photos: 1,
    photoState: "pending",
    title: "Двустаен апартамент в Сандански",
    description: bgDescription,
  });
  for (const [locale, draft] of Object.entries(drafts)) {
    await t.db.insert(localizedRevisions).values({
      listingId: f.listingId,
      sourceRevisionId: f.revisionId,
      locale: locale as PublicLocale,
      state: "draft",
      title: draft.title,
      body: {
        description: draft.text,
        legacy: {
          humanApproved: locale === "ru",
          recordedState: locale === "ru" ? "published" : "human_edited",
          contentOrigin: locale === "ru" ? "legacy_source_import" : "manual_translation",
        },
      },
    });
  }
  return f;
}

const publishSource = async (reference: string) => {
  const [row] = await t.db.select().from(listings).where(eq(listings.reference, reference));
  return publishListingByAttestation(
    t.db,
    broker.session,
    {
      reference,
      operationId: newOperationId(),
      expectedVersion: row?.version ?? 0,
      attested: true,
      locale: "en",
    },
    { storage: publicationFixtureStorage },
  );
};
const approve = (reference: string, locales: PublicLocale[], session: Session = broker.session) =>
  approveListingLanguages(
    t.db,
    session,
    {
      reference,
      operationId: randomUUID(),
      locales,
      locale: "en",
      attestation: (locale) => `I read the ${locale} text and it says the same as the Bulgarian.`,
    },
    { storage: publicationFixtureStorage },
  );
const searchIn = async (locale: PublicLocale, reference: string) =>
  (await searchListings(t.db, { locale, purpose: "sale", q: reference })).items.map(
    (row) => row.reference,
  );

describe("languages in one decision (ADR 0012)", () => {
  it("publishes a language only by a person's decision, after the source language", async () => {
    const f = await imported({
      en: {
        title: "Two-room flat in Sandanski - Real estate in Bulgaria. Agency in Sandanski",
        text: enDescription,
      },
    });
    // Not before the source is live.
    expect(await approve(f.reference, ["en"])).toEqual([
      { locale: "en", status: "blocked", reason: "source_not_published" },
    ]);
    expect((await publishSource(f.reference)).status).toBe("published");
    // Publishing the source never publishes a draft translation.
    expect(await searchIn("bg", f.reference)).toEqual([f.reference]);
    expect(await searchIn("en", f.reference)).toEqual([]);

    const view = await languageView(t.db, broker.actor, f.reference);
    expect(view.languages).toMatchObject([
      {
        locale: "en",
        title: "Two-room flat in Sandanski",
        checks: { blockers: [], warnings: [] },
        legacyApproved: false,
        live: false,
        mayApprove: true,
      },
    ]);
    expect(
      (await readyLanguages(t.db, broker.actor)).byLanguage.get("en")?.map((r) => r.reference),
    ).toContain(f.reference);

    expect(await approve(f.reference, ["en"])).toEqual([{ locale: "en", status: "published" }]);
    expect(await searchIn("en", f.reference)).toEqual([f.reference]);
    const [shown] = await loadPublishedListings(t.db, { references: [f.reference] }, "en");
    expect(shown?.title).toBe("Two-room flat in Sandanski");
    expect(shown?.description).toBe(enDescription);

    // Who approved which language on what basis.
    const [row] = await t.db
      .select()
      .from(localizedRevisions)
      .where(
        and(
          eq(localizedRevisions.listingId, f.listingId),
          eq(localizedRevisions.state, "approved_for_source"),
        ),
      );
    expect(row?.reviewedById).toBe(broker.id);
    const [approval] = await t.db
      .select()
      .from(approvals)
      .where(eq(approvals.id, row?.approvalId ?? ""));
    expect(approval).toMatchObject({ kind: "language", decidedById: broker.id });
    expect(approval?.scope).toMatchObject({
      locale: "en",
      basis: "staff_attestation",
      attestation: "I read the en text and it says the same as the Bulgarian.",
      titleWithoutSiteEnding: true,
    });
    // A second decision changes nothing.
    expect(await approve(f.reference, ["en"])).toEqual([{ locale: "en", status: "live" }]);
  });

  it("blocks a language whose figures disagree with the listing, with the reason", async () => {
    const f = await imported({
      en: { title: "Two-room flat in Sandanski", text: `${enDescription} Price 59,000 euro.` },
    });
    await publishSource(f.reference);
    const [result] = await approve(f.reference, ["en"]);
    expect(result).toMatchObject({
      locale: "en",
      status: "blocked",
      reason: "checks_failed",
      checks: { blockers: ["numbers_differ"], unexpectedNumbers: [59_000] },
    });
    expect(await searchIn("en", f.reference)).toEqual([]);
    const pointers = await t.db
      .select()
      .from(currentPublications)
      .where(
        and(eq(currentPublications.listingId, f.listingId), eq(currentPublications.locale, "en")),
      );
    expect(pointers).toEqual([]);
  });

  it("marks the old site's human-approved translation and still needs the decision", async () => {
    const f = await imported({
      ru: {
        title: "Двухкомнатная квартира в Сандански",
        text: "Светлая двухкомнатная квартира в центре Сандански, рядом с парком и минеральными источниками. Южная сторона, с мебелью, террасой и видом на горы.",
      },
    });
    await publishSource(f.reference);
    const view = await languageView(t.db, broker.actor, f.reference);
    expect(view.languages[0]).toMatchObject({ locale: "ru", legacyApproved: true, live: false });
    expect(await searchIn("ru", f.reference)).toEqual([]);
    expect(await approve(f.reference, ["ru"])).toEqual([{ locale: "ru", status: "published" }]);
    expect(await searchIn("ru", f.reference)).toEqual([f.reference]);
    const [approval] = await t.db
      .select()
      .from(approvals)
      .where(and(eq(approvals.kind, "language"), eq(approvals.decidedById, broker.id)))
      .orderBy(approvals.decidedAt);
    expect(approval).toBeDefined();
  });

  it("lets whoever may publish approve a ticked language under this agency's policy", async () => {
    const f = await imported({ en: { title: "Two-room flat in Sandanski", text: enDescription } });
    await publishSource(f.reference);
    const publisher = await staff(["assigned_broker", "publishing_approver", "content_editor"]);
    expect(await approve(f.reference, ["en"], publisher.session)).toEqual([
      { locale: "en", status: "published" },
    ]);
  });

  it("refuses a person who may not review translations under the strict policy", async () => {
    const f = await imported({ en: { title: "Two-room flat in Sandanski", text: enDescription } });
    await publishSource(f.reference);
    const publisher = await staff(["assigned_broker", "publishing_approver", "content_editor"]);
    expect(
      await approveListingLanguages(
        t.db,
        publisher.session,
        {
          reference: f.reference,
          operationId: randomUUID(),
          locales: ["en"],
          locale: "en",
          attestation: () => "I read the en text.",
        },
        { storage: publicationFixtureStorage, policy: strictPublicationPolicy },
      ),
    ).toEqual([{ locale: "en", status: "blocked", reason: "no_permission" }]);
    expect(await searchIn("en", f.reference)).toEqual([]);
  });
});
