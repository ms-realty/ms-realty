import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, grants, mediaAssets, mediaRelations, sessions } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import type { MediaDetailsDraft } from "@/domain/media";
import { staffFixture } from "../cases/testing";
import { publicMediaDownload } from "../files/download";
import type { FileStorage } from "../files/storage";
import { activateManifest, prepareManifest } from "../publication/commands";
import { loadPublishedListings } from "../publication/presentation";
import {
  createListingFixture,
  listingVersion,
  publicationFixtureStorage,
  publishForTest,
} from "../publication/testing";
import { mediaReceipt, reorderMedia, reviewMedia, saveMediaDetails } from "./commands";

let t: TestDatabase;
let staff: Awaited<ReturnType<typeof staffFixture>>;
const draft: MediaDetailsDraft = {
  caption: "A new private caption",
  altText: "Living room with windows facing the garden",
  modification: "retouched",
  modificationDisclosure: "Brightness adjusted",
};
beforeAll(async () => {
  t = await createTestDatabase();
  staff = await staffFixture(t.db);
});
afterAll(async () => t?.drop());
const fixture = (photos = 1) => createListingFixture(t.db, { reviewerId: staff.id, photos });
async function asset(id: string) {
  const [row] = await t.db.select().from(mediaAssets).where(eq(mediaAssets.id, id));
  if (!row) throw new Error("Missing fixture photo");
  return row;
}
const save = async (id: string, input: unknown = draft) =>
  saveMediaDetails(t.db, {
    session: staff.session,
    id,
    operationId: randomUUID(),
    expectedRevision: (await asset(id)).version,
    input,
  });
const prepare = async (
  f: Awaited<ReturnType<typeof fixture>>,
  storage: FileStorage = publicationFixtureStorage,
) =>
  prepareManifest(
    t.db,
    {
      actor: staff.actor,
      operationId: randomUUID(),
      expectedRevision: (await listingVersion(t.db, f.listingId)).generation,
      reference: f.reference,
      locale: "bg",
    },
    { storage },
  );
const activate = async (
  f: Awaited<ReturnType<typeof fixture>>,
  manifestId: string,
  storage: FileStorage = publicationFixtureStorage,
) =>
  activateManifest(
    t.db,
    {
      actor: staff.actor,
      operationId: randomUUID(),
      expectedRevision: (await listingVersion(t.db, f.listingId)).generation,
      manifestId,
    },
    { storage },
  );
const publicListing = async (listingId: string) =>
  (await loadPublishedListings(t.db, { ids: [listingId] }, "bg"))[0];

describe("O13 photo drafts, approval and gallery order", () => {
  it("keeps the live photo intact until a saved draft is reviewed and published", async () => {
    const f = await fixture();
    const id = f.assetIds[0];
    if (!id) throw new Error("Missing fixture photo");
    await publishForTest(t.db, staff.actor, f);
    const original = await asset(id);
    const digest = original.derivativeSha256;
    if (!digest) throw new Error("Missing fixture derivative");
    const live = await publicListing(f.listingId);
    const version = await listingVersion(t.db, f.listingId);
    const preparedBeforeEdit = await prepare(f);
    const bytes = await publicMediaDownload(t.db, publicationFixtureStorage, id, digest);

    const saved = await save(id);
    const edited = await asset(id);
    expect(edited).toMatchObject({
      ...original,
      updatedAt: edited.updatedAt,
      detailsDraft: draft,
      version: original.version + 1,
    });
    expect(await listingVersion(t.db, f.listingId)).toEqual(version);
    expect(await publicListing(f.listingId)).toEqual(live);
    expect((await publicMediaDownload(t.db, publicationFixtureStorage, id, digest)).bytes).toEqual(
      bytes.bytes,
    );
    expect(await mediaReceipt(t.db, staff.session, f.listingId, saved.operationId)).toMatchObject({
      action: "media.details.saved",
      details: { pendingReview: true, discarded: false },
    });
    await expect(prepare(f)).rejects.toMatchObject({ code: "publication_ineligible" });
    await expect(activate(f, preparedBeforeEdit.outcome.manifestId)).rejects.toMatchObject({
      code: "publication_ineligible",
    });

    await reviewMedia(t.db, {
      session: staff.session,
      operationId: randomUUID(),
      expectedRevision: edited.version,
      id,
      input: {
        ...draft,
        // Review must use the version-bound saved draft, not a replacement in the request.
        caption: "A different request caption",
        altText: "A different request description",
        decision: "approve",
        rightsHolder: "Fixture owner",
        rightsReference: original.rightsReference,
        privacyReviewed: true,
        rightsConfirmed: true,
      },
    });
    expect(await asset(id)).toMatchObject({ ...draft, detailsDraft: null, review: "approved" });
    expect(await publicListing(f.listingId)).toEqual(live);
    expect((await publicMediaDownload(t.db, publicationFixtureStorage, id, digest)).bytes).toEqual(
      bytes.bytes,
    );
    await expect(activate(f, preparedBeforeEdit.outcome.manifestId)).rejects.toMatchObject({
      code: "approval_stale",
    });
    const reviewed = await prepare(f);
    await activate(f, reviewed.outcome.manifestId);
    expect((await publicListing(f.listingId))?.media[0]).toMatchObject({
      caption: draft.caption,
      alt: draft.altText,
      modificationDisclosure: draft.modificationDisclosure,
    });
  });

  it("preserves newer drafts on stale edits, replays once, and discards without withdrawing", async () => {
    const f = await fixture();
    const id = f.assetIds[0];
    if (!id) throw new Error("Missing fixture photo");
    await publishForTest(t.db, staff.actor, f);
    const live = await publicListing(f.listingId);
    const command = {
      session: staff.session,
      id,
      operationId: randomUUID(),
      expectedRevision: (await asset(id)).version,
      input: draft,
    };
    const first = await saveMediaDetails(t.db, command);
    const replay = await saveMediaDetails(t.db, command);
    expect(replay.operationId).toBe(first.operationId);
    expect((await asset(id)).version).toBe(command.expectedRevision + 1);
    await expect(
      saveMediaDetails(t.db, { ...command, input: { ...draft, caption: "Other" } }),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
    await expect(
      saveMediaDetails(t.db, { ...command, operationId: randomUUID() }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    expect((await asset(id)).detailsDraft).toEqual(draft);
    const discarded = await save(id, { discard: true });
    expect(
      await mediaReceipt(t.db, staff.session, f.listingId, discarded.operationId),
    ).toMatchObject({
      details: { pendingReview: false, discarded: true },
    });
    // An older receipt describes its own outcome, even after a later discard.
    expect(await mediaReceipt(t.db, staff.session, f.listingId, first.operationId)).toMatchObject({
      details: { pendingReview: true, discarded: false },
    });
    expect(await asset(id)).toMatchObject({
      detailsDraft: null,
      review: "approved",
      rights: "cleared",
      audience: "public_candidate",
    });
    expect(await publicListing(f.listingId)).toEqual(live);

    const isolated = await staffFixture(t.db);
    const unauthorized = {
      ...command,
      operationId: randomUUID(),
      session: isolated.session,
      expectedRevision: (await asset(id)).version,
    };
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(eq(grants.principalId, isolated.id));
    await expect(saveMediaDetails(t.db, unauthorized)).rejects.toMatchObject({ code: "not_found" });
    await t.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, staff.session.id));
    await expect(saveMediaDetails(t.db, command)).rejects.toMatchObject({
      code: "unauthenticated",
    });
    // Continue subsequent tests with an independently verified fixture session.
    staff = await staffFixture(t.db);
  });

  it("saves a complete staged order once while preserving the current public order", async () => {
    const f = await fixture(3);
    await publishForTest(t.db, staff.actor, f);
    const live = await publicListing(f.listingId);
    const original = await t.db
      .select()
      .from(mediaRelations)
      .where(eq(mediaRelations.listingId, f.listingId))
      .orderBy(asc(mediaRelations.position));
    const ids = original.map((row) => row.id);
    const version = (await listingVersion(t.db, f.listingId)).version;
    const command = {
      session: staff.session,
      operationId: randomUUID(),
      expectedRevision: version,
      reference: f.reference,
      order: [...ids].reverse(),
    };
    const saved = await reorderMedia(t.db, command);
    expect((await reorderMedia(t.db, command)).operationId).toBe(saved.operationId);
    expect((await listingVersion(t.db, f.listingId)).version).toBe(version + 1);
    expect(
      (
        await t.db
          .select()
          .from(mediaRelations)
          .where(eq(mediaRelations.listingId, f.listingId))
          .orderBy(asc(mediaRelations.position))
      ).map((row) => row.id),
    ).toEqual(command.order);
    expect(await publicListing(f.listingId)).toEqual(live);
    expect(await mediaReceipt(t.db, staff.session, f.listingId, saved.operationId)).toMatchObject({
      move: true,
      order: { before: ids, after: command.order, version: version + 1 },
    });
    const events = await t.db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.operationId, saved.operationId),
          eq(auditEvents.action, "media.placement.changed"),
        ),
      );
    expect(events).toHaveLength(1);
    for (const order of [[ids[0]], [ids[0], ids[0], ids[1]], [ids[0], ids[1], randomUUID()]])
      await expect(
        reorderMedia(t.db, {
          ...command,
          operationId: randomUUID(),
          expectedRevision: version + 1,
          order,
        }),
      ).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("allows withdrawal without approving incomplete drafts or claiming rights review", async () => {
    const f = await fixture();
    const id = f.assetIds[0];
    if (!id) throw new Error("Missing fixture photo");
    await publishForTest(t.db, staff.actor, f);
    const original = await asset(id);
    const incomplete = { ...draft, altText: "" };
    await save(id, incomplete);
    const command = {
      session: staff.session,
      operationId: randomUUID(),
      expectedRevision: (await asset(id)).version,
      id,
      input: {
        ...incomplete,
        decision: "approve",
        rightsHolder: "Fixture owner",
        rightsReference: original.rightsReference,
        privacyReviewed: true,
        rightsConfirmed: true,
      },
    };
    await expect(reviewMedia(t.db, command)).rejects.toMatchObject({ code: "validation_failed" });
    await expect(
      reviewMedia(t.db, {
        ...command,
        input: { ...command.input, ...draft, privacyReviewed: false },
      }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    await reviewMedia(t.db, {
      ...command,
      operationId: randomUUID(),
      input: {
        ...command.input,
        decision: "reject",
        rightsHolder: "",
        rightsReference: "",
        privacyReviewed: false,
        rightsConfirmed: false,
      },
    });
    expect(await asset(id)).toMatchObject({
      caption: original.caption,
      altText: original.altText,
      rightsReference: original.rightsReference,
      detailsDraft: incomplete,
      rights: "rejected",
      audience: "private",
    });
    const digest = original.derivativeSha256;
    if (!digest) throw new Error("Missing fixture derivative");
    await expect(
      publicMediaDownload(t.db, publicationFixtureStorage, id, digest),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  for (const step of ["prepare", "activate"] as const) {
    it(`serializes photo draft saves with publication ${step}`, async () => {
      const f = await fixture();
      const id = f.assetIds[0];
      if (!id) throw new Error("Missing fixture photo");
      await publishForTest(t.db, staff.actor, f);
      const prepared = step === "activate" ? await prepare(f) : null;
      let entered!: () => void;
      let release!: () => void;
      const reading = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const storage: FileStorage = {
        writeStaging: (...args) => publicationFixtureStorage.writeStaging(...args),
        writeImmutable: (key, bytes) => publicationFixtureStorage.writeImmutable(key, bytes),
        read: async (...args) => {
          entered();
          await barrier;
          return publicationFixtureStorage.read(...args);
        },
      };
      const publishing = prepared
        ? activate(f, prepared.outcome.manifestId, storage)
        : prepare(f, storage);
      let saving: Promise<unknown> | undefined;
      try {
        await reading;
        saving = save(id);
        // Observe a real blocked UPDATE on this disposable DB, not a timing assumption.
        await expect
          .poll(async () => {
            const rows = await t.sql<{ waiting: boolean }[]>`
            select exists(select 1 from pg_stat_activity
              where datname = current_database() and wait_event_type = 'Lock'
              and query like '%media_assets%') as waiting`;
            return rows[0]?.waiting;
          })
          .toBe(true);
      } finally {
        release();
        await Promise.allSettled([publishing, ...(saving ? [saving] : [])]);
      }
      await publishing;
      await saving;
      expect((await asset(id)).detailsDraft).toEqual(draft);
      await expect(prepare(f)).rejects.toMatchObject({ code: "publication_ineligible" });
      expect(await publicListing(f.listingId)).toBeDefined();
    });
  }
});
