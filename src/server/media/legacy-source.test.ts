// ADR 0016: the carry-over reads each photo by the key the legacy manifest gives it, from a
// read-only source, and never anything outside that key space.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import manifest from "../../../data/legacy/media-manifest.json" with { type: "json" };
import { buildMediaItems } from "../../db/import/mapping";
import { loadLegacySources } from "../../db/import/sources";
import {
  DirectoryLegacyMediaSource,
  isLegacyMediaKey,
  legacyMediaSource,
  R2LegacyMediaSource,
} from "./legacy-source";

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "msr-legacy-source-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("legacy media manifest mapping", () => {
  it("addresses every manifest object by a key the source accepts", () => {
    expect(manifest.key_shape).toBe(
      "<legacy host>/wp-content/uploads/<original WordPress upload path>",
    );
    for (const object of manifest.objects) {
      expect(isLegacyMediaKey(object.r2_key)).toBe(true);
      expect(object.original_url).toBe(`https://${object.r2_key}`);
    }
  });

  it("keeps the import's asset key as the source key, so the carry-over finds each photo", async () => {
    const sources = await loadLegacySources();
    const listings = new Map(sources.listings.listings.map((l) => [l.reference.id, l]));
    const items = buildMediaItems(sources, listings);
    expect(items).toHaveLength(manifest.objects.length);
    for (const item of items) {
      expect(isLegacyMediaKey(item.asset.r2Key)).toBe(true);
      expect(item.asset.legacyReference).toBe(`https://${item.asset.r2Key}`);
    }
    // Gallery order is the legacy order: each listing's positions are its manifest order.
    const shown = items.flatMap((item) =>
      item.shownIn.map((s) => ({ ...s, key: item.asset.r2Key })),
    );
    // Every listing-referenced object is placed somewhere (1,712 objects, often on several).
    expect(new Set(shown.map((s) => s.key)).size).toBe(
      manifest.objects.filter((o) => o.listing_references.length > 0).length,
    );
    for (const [reference, listing] of listings) {
      const keys = [...new Set(listing.media.flatMap((m) => m.r2_key ?? []))];
      const placed = shown
        .filter((s) => s.reference === reference)
        .sort((a, b) => a.position - b.position)
        .map((s) => s.key);
      expect(placed).toEqual(keys.filter((key) => placed.includes(key)));
    }
  });

  it("refuses keys outside the legacy upload space", () => {
    for (const key of [
      "",
      "sealed/abc/def",
      "makler-realty.com/wp-content/themes/Avenue/images/logo.png",
      "makler-realty.com/wp-content/uploads/../../etc/passwd",
      "makler-realty.com/wp-content/uploads//x.jpg",
      "example.com/wp-content/uploads/2020/01/x.jpg",
      "/makler-realty.com/wp-content/uploads/2020/01/x.jpg",
    ])
      expect(isLegacyMediaKey(key)).toBe(false);
    expect(
      isLegacyMediaKey("makler-realty.ru/wp-content/uploads/2013/11/312-10-Сандански.jpg"),
    ).toBe(true);
  });
});

describe("directory source", () => {
  const key = "makler-realty.com/wp-content/uploads/2020/01/photo.jpg";

  it("reads a present object, reports a missing one and an oversized one", async () => {
    await mkdir(dirname(join(root, key)), { recursive: true });
    await writeFile(join(root, key), Buffer.from("bytes"));
    const source = new DirectoryLegacyMediaSource(root);
    expect(await source.read(key)).toEqual({ state: "found", bytes: Buffer.from("bytes") });
    expect(await source.read(key.replace("photo", "absent"))).toEqual({ state: "missing" });
    expect(await source.read("makler-realty.com/wp-content/uploads/../../../x")).toEqual({
      state: "missing",
    });
    expect(await new DirectoryLegacyMediaSource(root, 3).read(key)).toEqual({
      state: "too_large",
      byteSize: 5,
    });
  });

  it("is configured from the environment, and only read", () => {
    expect(legacyMediaSource({})).toBeNull();
    expect(
      legacyMediaSource({ LEGACY_MEDIA_SOURCE: "directory", LEGACY_MEDIA_DIR: root }),
    ).toBeInstanceOf(DirectoryLegacyMediaSource);
    expect(() =>
      legacyMediaSource({ LEGACY_MEDIA_SOURCE: "directory", LEGACY_MEDIA_DIR: "relative/dir" }),
    ).toThrow();
    const r2 = {
      LEGACY_MEDIA_SOURCE: "r2",
      R2_ACCOUNT_ID: "account",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET: "msr-app-media",
    };
    expect(legacyMediaSource(r2)).toBeInstanceOf(R2LegacyMediaSource);
    // Never the application's own bucket.
    expect(() => legacyMediaSource({ ...r2, LEGACY_MEDIA_BUCKET: "msr-app-media" })).toThrow();
    expect(() => legacyMediaSource({ ...r2, LEGACY_MEDIA_R2_JURISDICTION: "us" })).toThrow();
    expect(() => legacyMediaSource({ LEGACY_MEDIA_SOURCE: "http" })).toThrow();
    for (const source of [new DirectoryLegacyMediaSource(root)])
      expect(Object.getOwnPropertyNames(Object.getPrototypeOf(source)).sort()).toEqual([
        "constructor",
        "read",
      ]);
  });
});
