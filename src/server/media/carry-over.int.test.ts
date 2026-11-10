// ADR 0016: the old website's photos are carried over once, admitted by decode and re-encode under
// this brand's media policy (or left for the scanner under scanner-first), keep their order,
// cover and captions, and go public with the listing's one publish decision.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { and, asc, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mediaPolicy, scanFirstMediaPolicy } from "@/config/tenant";
import { auditEvents, listings, mediaAssets, mediaRelations } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { staffFixture } from "../cases/testing";
import type { FileServices } from "../files/config";
import { publicMediaDownload } from "../files/download";
import { processFileWorker } from "../files/process";
import type { MalwareScanner } from "../files/scan";
import { digestOf } from "../files/storage";
import { publishListingByAttestation, publishView } from "../publication/attested";
import { loadPublishedListings, toCard } from "../publication/presentation";
import {
  createListingFixture,
  createPlaces,
  type PlaceFixture,
  publicationFixtureStorage,
} from "../publication/testing";
import { createStaff } from "../testing";
import { carryOverLegacyPhotos } from "./carry-over";
import { mediaAssetEligible } from "./eligibility";
import { DirectoryLegacyMediaSource } from "./legacy-source";

let t: TestDatabase;
let broker: Awaited<ReturnType<typeof staffFixture>>;
let author: { id: string };
let places: PlaceFixture;
let mirror: string;
let source: DirectoryLegacyMediaSource;
// The publication fixtures read derivatives from their own local storage; the carry-over writes
// there too, so a published photo is served by the unchanged public route.
const services: FileServices = {
  storage: publicationFixtureStorage,
  scanner: null,
  mediaPolicy,
};

beforeAll(async () => {
  t = await createTestDatabase();
  broker = await staffFixture(t.db);
  author = await createStaff(t.db, { roles: ["content_editor"] });
  places = await createPlaces(t.db);
  mirror = await mkdtemp(join(tmpdir(), "msr-legacy-mirror-"));
  source = new DirectoryLegacyMediaSource(mirror);
});
afterAll(async () => {
  await t?.drop();
  if (mirror) await rm(mirror, { recursive: true, force: true });
});

const jpeg = (width: number, height: number, background = "#5b7f95") =>
  sharp({ create: { width, height, channels: 3, background } })
    .jpeg({ quality: 80 })
    .toBuffer();

/** An imported listing whose photos exist only as legacy keys, as the import leaves them. */
async function legacyListing(photos: number) {
  const fixture = await createListingFixture(t.db, {
    reviewerId: author.id,
    placeId: places.settlementId,
    editorialState: "needs_facts",
    commercialState: "confirmation_required",
    availabilityConfirmedAt: null,
    sellerInstruction: false,
    photos,
    photoState: "legacy",
    description:
      "Светъл двустаен апартамент в центъра на Сандански, близо до парка и минералните извори. Южно изложение, обзаведен, с тераса и изглед към планината.",
    facts: {
      bedrooms: { state: "known", value: 2, reviewed: false, sourceClass: "legacy_import" },
      location: {
        state: "known",
        value: { country: "BG" },
        reviewed: false,
        sourceClass: "legacy_import",
      },
    },
  });
  const assets = await t.db
    .select({ asset: mediaAssets, position: mediaRelations.position })
    .from(mediaRelations)
    .innerJoin(mediaAssets, eq(mediaAssets.id, mediaRelations.mediaAssetId))
    .innerJoin(listings, eq(listings.id, mediaRelations.listingId))
    .where(eq(listings.reference, fixture.reference))
    .orderBy(asc(mediaRelations.position));
  return { ...fixture, assets: assets.map((row) => row.asset) };
}

async function put(key: string, bytes: Buffer | string) {
  const path = join(mirror, key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

const assetById = async (id: string) =>
  (await t.db.select().from(mediaAssets).where(eq(mediaAssets.id, id)))[0];

const publish = async (reference: string) =>
  publishListingByAttestation(
    t.db,
    broker.session,
    {
      reference,
      operationId: `op-${crypto.randomUUID()}`,
      expectedVersion: (
        await t.db.select().from(listings).where(eq(listings.reference, reference))
      )[0]?.version as number,
      attested: true,
      locale: "en",
    },
    { storage: publicationFixtureStorage },
  );

describe("legacy photo carry-over (ADR 0016)", () => {
  it("admits by re-encoding, idempotently and resumably, keeping order, cover and captions", async () => {
    const f = await legacyListing(3);
    // A wide original yields every public width; small ones only the sizes below them.
    await put(f.assets[0]?.originalKey ?? "", await jpeg(2000, 1500));
    await put(f.assets[1]?.originalKey ?? "", await jpeg(800, 600, "#a1887f"));
    await put(f.assets[2]?.originalKey ?? "", await jpeg(640, 960, "#8d6e63"));

    const before = await publishView(t.db, broker.actor, f.reference);
    expect(before.photos.map((p) => p.readiness)).toEqual([
      "not_copied",
      "not_copied",
      "not_copied",
    ]);
    expect(before.checks.warnings).toContain("photos_not_copied");

    const first = await carryOverLegacyPhotos(t.db, services, source, {
      reference: f.reference,
      limit: 1,
    });
    expect(first).toMatchObject({ legacyPhotos: 3, candidates: 1, remaining: 2 });
    expect(first.outcomes.admitted).toBe(1);

    const second = await carryOverLegacyPhotos(t.db, services, source, { reference: f.reference });
    expect(second.outcomes).toMatchObject({ admitted: 2, already_done: 1 });
    const third = await carryOverLegacyPhotos(t.db, services, source, { reference: f.reference });
    expect(third).toMatchObject({ candidates: 0, remaining: 0 });
    expect(third.outcomes.already_done).toBe(3);
    expect(third.listingsWithoutPhotos).toEqual([]);
    expect(third.listingsWithPhotos).toBe(1);

    const wide = await assetById(f.assets[0]?.id ?? "");
    expect(wide).toMatchObject({
      admission: "reencode",
      scan: "clean",
      processing: "ready",
      review: "pending",
      rights: "unknown",
      contentType: "image/jpeg",
      width: 2000,
      height: 1500,
      caption: "Legacy caption 1",
    });
    expect(wide?.sealedKey).toBe(`sealed/${wide?.id}/${wide?.sha256}`);
    expect(wide?.scannerVersion).toMatch(/^reencode sharp\//);
    expect(wide?.scannedSha256).toBe(wide?.sha256);
    expect(wide?.derivativeRenditions.map((r) => r.width)).toEqual([480, 960, 1600, 2000]);
    // The original is stored exactly as read; renditions are WebP and carry no metadata.
    const original = await publicationFixtureStorage.read(wide?.sealedKey ?? "");
    expect(digestOf(original)).toBe(wide?.sha256);
    const largest = await publicationFixtureStorage.read(wide?.derivativeKey ?? "");
    const meta = await sharp(largest).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 2000, height: 1500 });
    expect(meta.exif).toBeUndefined();
    const portrait = await assetById(f.assets[2]?.id ?? "");
    expect(portrait?.derivativeRenditions.map((r) => [r.width, r.height])).toEqual([
      [480, 720],
      [640, 960],
    ]);

    // The gallery order is untouched and each run left one receipt per photo.
    const order = await t.db
      .select({ id: mediaRelations.mediaAssetId, position: mediaRelations.position })
      .from(mediaRelations)
      .innerJoin(listings, eq(listings.id, mediaRelations.listingId))
      .where(eq(listings.reference, f.reference))
      .orderBy(asc(mediaRelations.position));
    expect(order.map((row) => row.id)).toEqual(f.assets.map((a) => a.id));
    const receipts = await t.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.action, "media.carried_over")));
    for (const asset of f.assets)
      expect(receipts.filter((r) => r.recordId === asset.id)).toHaveLength(1);
    expect(receipts.find((r) => r.recordId === wide?.id)?.payload).toMatchObject({
      basis: "carried over from the agency's public site",
      admission: "reencode",
    });

    // Processed and waiting for the person who publishes; not public by itself.
    expect(mediaAssetEligible(wide as NonNullable<typeof wide>)).toBe(false);
    const view = await publishView(t.db, broker.actor, f.reference);
    expect(view.photos.map((p) => p.readiness)).toEqual(["clearable", "clearable", "clearable"]);
    expect(view.checks.warnings).not.toContain("photos_not_copied");
    expect(view.checks.warnings).not.toContain("no_photos");

    // One decision publishes the listing with its photos, in order, cover first.
    expect(await publish(f.reference)).toMatchObject({ status: "published" });
    const [shown] = await loadPublishedListings(t.db, { references: [f.reference] }, "bg");
    expect(shown?.media.map((m) => m.assetId)).toEqual(f.assets.map((a) => a.id));
    expect(shown?.media[0]?.renditions?.map((r) => r.width)).toEqual([480, 960, 1600, 2000]);
    expect(shown?.media[0]?.caption).toBe("Legacy caption 1");
    expect(shown?.media.every((m) => Boolean(m.alt?.trim()))).toBe(true);
    if (!shown) throw new Error("not published");
    expect(toCard(shown, new Date()).cover?.assetId).toBe(f.assets[0]?.id);
    // The unchanged public route serves each published rendition.
    for (const rendition of shown.media[0]?.renditions ?? []) {
      const file = await publicMediaDownload(
        t.db,
        publicationFixtureStorage,
        shown.media[0]?.assetId ?? "",
        rendition.digest,
      );
      expect(file.contentType).toBe("image/webp");
      expect((await sharp(file.bytes).metadata()).width).toBe(rendition.width);
    }
  });

  it("leaves a corrupt file, a non-image and a missing file out, and reports them", async () => {
    const f = await legacyListing(4);
    const [good, corrupt, text, missing] = f.assets;
    await put(good?.originalKey ?? "", await jpeg(600, 400));
    const valid = await jpeg(600, 400);
    await put(
      corrupt?.originalKey ?? "",
      Buffer.concat([valid.subarray(0, 200), Buffer.alloc(300)]),
    );
    await put(text?.originalKey ?? "", "<html>not a photo</html>");

    const dry = await carryOverLegacyPhotos(t.db, services, source, {
      reference: f.reference,
      dryRun: true,
    });
    expect(dry.outcomes).toMatchObject({
      admitted: 1,
      decode_failed: 1,
      not_an_image: 1,
      missing_at_source: 1,
    });
    expect((await assetById(good?.id ?? ""))?.sealedKey).toBeNull();

    const report = await carryOverLegacyPhotos(t.db, services, source, { reference: f.reference });
    expect(report.outcomes).toMatchObject({
      admitted: 1,
      decode_failed: 1,
      not_an_image: 1,
      missing_at_source: 1,
    });
    expect(report.leftOut.map((l) => [l.key, l.reason]).sort()).toEqual(
      [
        [corrupt?.originalKey, "decode_failed"],
        [text?.originalKey, "not_an_image"],
        [missing?.originalKey, "missing_at_source"],
      ].sort(),
    );
    expect(report.leftOut.every((l) => l.listings.includes(f.reference))).toBe(true);
    for (const asset of [corrupt, text, missing]) {
      const row = await assetById(asset?.id ?? "");
      expect(row).toMatchObject({ sealedKey: null, processing: "failed", scan: "pending" });
    }
    const view = await publishView(t.db, broker.actor, f.reference);
    expect(view.photos.map((p) => p.readiness)).toEqual([
      "clearable",
      "left_out",
      "left_out",
      "left_out",
    ]);
    expect(view.checks.blockers).toEqual([]);
    expect(view.checks.warnings).not.toContain("photos_not_copied");
    expect(view.checks.warnings).not.toContain("photos_not_ready");
    // The listing is never blocked by them: it publishes with the one usable photo.
    expect(await publish(f.reference)).toMatchObject({ status: "published" });
    const [shown] = await loadPublishedListings(t.db, { references: [f.reference] }, "bg");
    expect(shown?.media.map((m) => m.assetId)).toEqual([good?.id]);
  });

  it("adds photos copied after a listing went live when it is published again", async () => {
    const f = await legacyListing(2);
    expect(await publish(f.reference)).toMatchObject({ status: "published" });
    let [shown] = await loadPublishedListings(t.db, { references: [f.reference] }, "bg");
    expect(shown?.media).toEqual([]);
    for (const asset of f.assets) await put(asset.originalKey, await jpeg(500, 375));
    await carryOverLegacyPhotos(t.db, services, source, { reference: f.reference });
    const view = await publishView(t.db, broker.actor, f.reference);
    expect(view.photos.map((p) => p.readiness)).toEqual(["clearable", "clearable"]);
    expect(await publish(f.reference)).toMatchObject({ status: "published", unchanged: false });
    [shown] = await loadPublishedListings(t.db, { references: [f.reference] }, "bg");
    expect(shown?.media.map((m) => m.assetId)).toEqual(f.assets.map((a) => a.id));
  });

  it("under a scanner-first policy admits nothing without a scan", async () => {
    const f = await legacyListing(2);
    for (const asset of f.assets) await put(asset.originalKey, await jpeg(500, 375));
    const scanFirst: FileServices = { ...services, mediaPolicy: scanFirstMediaPolicy };
    const report = await carryOverLegacyPhotos(t.db, scanFirst, source, {
      reference: f.reference,
    });
    expect(report.policy).toBe("virus_scan");
    expect(report.outcomes.sealed_awaiting_scan).toBe(2);
    expect(report.outcomes.admitted).toBe(0);
    expect(report.listingsWithoutPhotos).toEqual([f.reference]);
    for (const asset of f.assets) {
      const row = await assetById(asset.id);
      expect(row).toMatchObject({
        admission: "virus_scan",
        scan: "pending",
        processing: "pending",
        derivativeKey: null,
      });
      expect(row?.sealedKey).toBe(`sealed/${row?.id}/${row?.sha256}`);
      // Without a scanner the worker keeps it quarantined: no renditions, no admission.
      expect(
        await processFileWorker(
          t.db,
          scanFirst,
          { kind: "system", id: "file-scanner" },
          "media",
          asset.id,
        ),
      ).toMatchObject({ state: "unverified" });
      expect((await assetById(asset.id))?.processing).toBe("pending");
    }
    const view = await publishView(t.db, broker.actor, f.reference);
    expect(view.photos.map((p) => p.readiness)).toEqual(["not_ready", "not_ready"]);
    // A re-run does not re-admit them by re-encoding; they wait for the scanner.
    const again = await carryOverLegacyPhotos(t.db, scanFirst, source, {
      reference: f.reference,
    });
    expect(again.outcomes.already_done).toBe(2);

    // A clean scan admits them exactly as an upload: renditions, admission by the scanner.
    const scanner: MalwareScanner = {
      scan: async (bytes) => ({
        state: "clean",
        sha256: digestOf(bytes),
        scannedAt: new Date(),
        scannerVersion: "synthetic-test-scanner",
      }),
    };
    for (const asset of f.assets)
      await processFileWorker(
        t.db,
        { ...scanFirst, scanner },
        { kind: "system", id: "file-scanner" },
        "media",
        asset.id,
      );
    const scanned = await assetById(f.assets[0]?.id ?? "");
    expect(scanned).toMatchObject({
      admission: "virus_scan",
      scan: "clean",
      processing: "ready",
      scannerVersion: "synthetic-test-scanner",
    });
  });

  it("stops counting a re-encode admission when the brand moves to scanner-first", async () => {
    const f = await legacyListing(1);
    await put(f.assets[0]?.originalKey ?? "", await jpeg(500, 375));
    await carryOverLegacyPhotos(t.db, services, source, { reference: f.reference });
    expect(await publish(f.reference)).toMatchObject({ status: "published" });
    const row = await assetById(f.assets[0]?.id ?? "");
    if (!row) throw new Error("missing asset");
    expect(mediaAssetEligible(row)).toBe(true);
    expect(mediaAssetEligible(row, scanFirstMediaPolicy)).toBe(false);
    // Under scanner-first the worker scans it again instead of trusting the re-encode.
    const result = await processFileWorker(
      t.db,
      { ...services, mediaPolicy: scanFirstMediaPolicy },
      { kind: "system", id: "file-scanner" },
      "media",
      row.id,
    );
    expect(result.state).toBe("unverified");
  });

  it("admits a new image upload by re-encoding under this brand's policy, without a scanner", async () => {
    const f = await legacyListing(1);
    const bytes = await jpeg(1200, 900);
    const asset = f.assets[0];
    if (!asset) throw new Error("missing asset");
    // As the upload pipeline leaves a sealed photo before processing.
    const sealedKey = `sealed/${asset.id}/${digestOf(bytes)}`;
    await publicationFixtureStorage.writeImmutable(sealedKey, bytes);
    await t.db
      .update(mediaAssets)
      .set({ sealedKey, sha256: digestOf(bytes), byteSize: bytes.length, legacyReference: null })
      .where(eq(mediaAssets.id, asset.id));
    const result = await processFileWorker(
      t.db,
      services,
      { kind: "system", id: "file-scanner" },
      "media",
      asset.id,
    );
    expect(result.state).toBe("clean");
    expect(await assetById(asset.id)).toMatchObject({
      admission: "reencode",
      scan: "clean",
      processing: "ready",
      width: 1200,
    });
  });
});
