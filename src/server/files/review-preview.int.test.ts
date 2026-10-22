import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { auditEvents, grants, mediaAssets, mediaRelations, passkeys, sessions } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "../auth/sessions";
import { can } from "../authz";
import { createListingFixture, publicationFixtureStorage } from "../publication/testing";
import { createClient, createStaff } from "../testing";
import type { MediaReviewPreviewScope } from "./access";
import { privateDownload } from "./download";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

async function fixture() {
  const publisher = await createStaff(t.db, { roles: ["content_editor", "publishing_approver"] });
  const listing = await createListingFixture(t.db, { reviewerId: publisher.id });
  const other = await createListingFixture(t.db, { reviewerId: publisher.id });
  const scope: MediaReviewPreviewScope = { listingId: listing.listingId, locale: "bg" };
  const reviewer = await createStaff(t.db, {
    grants: [
      {
        role: "translation_reviewer",
        recordType: "listing",
        recordId: listing.listingId,
        locales: ["bg"],
      },
    ],
  });
  await t.db.insert(passkeys).values(
    [0, 1].map(() => ({
      principalId: reviewer.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice" as const,
      backedUp: false,
    })),
  );
  const session = (await createSession(t.db, { kind: "staff", id: reviewer.id })).session;
  const id = listing.assetIds[0];
  if (!id) throw new Error("Missing synthetic review photo");
  const preview = (selectedScope = scope) =>
    privateDownload(t.db, publicationFixtureStorage, session, "media", id, true, selectedScope);
  return { listing, other, reviewer, session, id, scope, preview };
}

describe("O16 scoped derivative review preview", () => {
  it("reads the exact listing and locale derivative without management or publication authority", async () => {
    const f = await fixture();
    const resource = { type: "listing", id: f.listing.listingId, locale: "bg" as const };
    expect(await can(t.db, f.reviewer.actor, "listing.read", resource)).toBe(true);
    expect(await can(t.db, f.reviewer.actor, "media.manage", resource)).toBe(false);
    expect(await can(t.db, f.reviewer.actor, "publication.release", resource)).toBe(false);
    const preview = await f.preview();
    expect(preview).toMatchObject({
      inline: true,
      contentType: "image/webp",
      fileName: "preview.webp",
    });
    expect(preview.bytes.length).toBeGreaterThan(0);
    const audit = await t.db.select().from(auditEvents).where(eq(auditEvents.recordId, f.id));
    expect(audit.find((row) => row.action === "file.downloaded")?.payload).toEqual({
      rendition: "safe_preview",
      listingId: f.scope.listingId,
      locale: f.scope.locale,
    });
  });

  it("does not grant originals, generic previews, or document downloads", async () => {
    const f = await fixture();
    for (const [kind, preview, scope] of [
      ["media", false, undefined],
      ["media", true, undefined],
      ["media", false, f.scope],
      ["document", true, f.scope],
    ] as const)
      await expect(
        privateDownload(t.db, publicationFixtureStorage, f.session, kind, f.id, preview, scope),
      ).rejects.toMatchObject({ code: "not_found" });
  });

  it("denies a different locale, unrelated listing, and a mismatched asset placement before reading bytes", async () => {
    const f = await fixture();
    const forged = { ...f.scope, locale: "en" } as unknown as MediaReviewPreviewScope;
    const read = vi.spyOn(publicationFixtureStorage, "read");
    try {
      await expect(f.preview(forged)).rejects.toMatchObject({
        code: "not_found",
      });
      await expect(f.preview({ ...f.scope, listingId: f.other.listingId })).rejects.toMatchObject({
        code: "not_found",
      });
      await expect(
        privateDownload(
          t.db,
          publicationFixtureStorage,
          f.session,
          "media",
          f.other.assetIds[0] ?? "",
          true,
          { ...f.scope, listingId: f.other.listingId },
        ),
      ).rejects.toMatchObject({ code: "not_found" });
      // An EN-only review grant does not imply access to the BG source preview.
      await t.db
        .update(grants)
        .set({ locales: ["en"] })
        .where(eq(grants.principalId, f.reviewer.id));
      expect(
        await can(t.db, f.reviewer.actor, "listing.read", {
          type: "listing",
          id: f.scope.listingId,
          locale: "en",
        }),
      ).toBe(true);
      await expect(f.preview()).rejects.toMatchObject({ code: "not_found" });
      // Runtime callers cannot retarget the BG source by forging an allowed grant locale.
      await expect(f.preview(forged)).rejects.toMatchObject({ code: "not_found" });
      expect(read).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
    }
  });

  it("denies one passkey before inspecting the scoped asset or reading bytes", async () => {
    const f = await fixture();
    const [key] = await t.db.select().from(passkeys).where(eq(passkeys.principalId, f.reviewer.id));
    if (!key) throw new Error("Missing synthetic review passkey");
    await t.db.update(passkeys).set({ revokedAt: new Date() }).where(eq(passkeys.id, key.id));
    const read = vi.spyOn(publicationFixtureStorage, "read");
    try {
      await expect(f.preview()).rejects.toMatchObject({ code: "forbidden" });
      await expect(f.preview({ ...f.scope, listingId: randomUUID() })).rejects.toMatchObject({
        code: "forbidden",
      });
      expect(read).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
    }
  });

  it.each(["non-WebP", "non-gallery", "cross-property"] as const)(
    "denies a %s asset before reading bytes",
    async (boundary) => {
      const f = await fixture();
      const change = {
        "non-WebP": { derivativeContentType: "image/jpeg" },
        "non-gallery": { purpose: "private_evidence" as const },
        "cross-property": { propertyId: f.other.propertyId },
      }[boundary];
      await t.db.update(mediaAssets).set(change).where(eq(mediaAssets.id, f.id));
      const read = vi.spyOn(publicationFixtureStorage, "read");
      try {
        await expect(f.preview()).rejects.toMatchObject({ code: "not_found" });
        expect(read).not.toHaveBeenCalled();
      } finally {
        read.mockRestore();
      }
    },
  );

  it("denies unrelated staff and client identities even with a listing grant", async () => {
    const f = await fixture();
    const stranger = await createStaff(t.db, { roles: ["external_specialist"] });
    await t.db.insert(passkeys).values(
      [0, 1].map(() => ({
        principalId: stranger.id,
        credentialId: randomUUID(),
        publicKey: Buffer.from([1]),
        deviceType: "singleDevice" as const,
        backedUp: false,
      })),
    );
    const client = await createClient(t.db);
    await t.db.insert(grants).values({
      principalId: client.id,
      capability: "listing.read",
      recordType: "listing",
      recordId: f.listing.listingId,
      locales: ["bg"],
      reason: "synthetic denial check",
    });
    for (const [kind, id] of [
      ["staff", stranger.id],
      ["client", client.id],
    ] as const) {
      const session = (await createSession(t.db, { kind, id })).session;
      await expect(
        privateDownload(t.db, publicationFixtureStorage, session, "media", f.id, true, f.scope),
      ).rejects.toMatchObject({ code: "not_found" });
    }
  });

  it("denies hidden, removed, and non-candidate placements", async () => {
    const f = await fixture();
    await t.db
      .update(mediaRelations)
      .set({ hidden: true })
      .where(eq(mediaRelations.listingId, f.listing.listingId));
    await expect(f.preview()).rejects.toMatchObject({ code: "not_found" });
    await t.db
      .update(mediaRelations)
      .set({ hidden: false, removedAt: new Date() })
      .where(eq(mediaRelations.listingId, f.listing.listingId));
    await expect(f.preview()).rejects.toMatchObject({ code: "not_found" });
    await t.db
      .update(mediaRelations)
      .set({ removedAt: null })
      .where(eq(mediaRelations.listingId, f.listing.listingId));
    await t.db.update(mediaAssets).set({ audience: "private" }).where(eq(mediaAssets.id, f.id));
    await expect(f.preview()).rejects.toMatchObject({ code: "not_found" });
  });

  it("rechecks revoked record grants and the current session on every preview", async () => {
    const f = await fixture();
    await f.preview();
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(eq(grants.principalId, f.reviewer.id));
    await expect(f.preview()).rejects.toMatchObject({ code: "not_found" });
    await t.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, f.session.id));
    await expect(f.preview()).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("retains the scan, ready derivative, and stored-byte integrity checks", async () => {
    const f = await fixture();
    await t.db
      .update(mediaAssets)
      .set({ scan: "pending", review: "pending" })
      .where(eq(mediaAssets.id, f.id));
    await expect(f.preview()).rejects.toMatchObject({ code: "not_found" });
    await t.db
      .update(mediaAssets)
      .set({ scan: "clean", processing: "pending" })
      .where(eq(mediaAssets.id, f.id));
    await expect(f.preview()).rejects.toMatchObject({ code: "not_found" });
    await t.db
      .update(mediaAssets)
      .set({ processing: "ready", derivativeSha256: "0".repeat(64) })
      .where(eq(mediaAssets.id, f.id));
    await expect(f.preview()).rejects.toMatchObject({ code: "not_found" });
  });
});
