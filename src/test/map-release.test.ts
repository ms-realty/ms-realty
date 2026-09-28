import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  createMapRelease,
  installMapRelease,
  verifyMapRelease,
} from "../../scripts/map-release.mjs";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "msr-map-seal-"));
  roots.push(root);
  const source = join(root, "source");
  for (const path of [
    "basemap.pmtiles",
    "sprites/light.json",
    "sprites/light.png",
    "sprites/light@2x.json",
    "sprites/light@2x.png",
    "licenses/fonts-OFL.txt",
    "licenses/assets-README.md",
    ...["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"].flatMap((font) =>
      [0, 768, 1024, 1280].map((n) => `fonts/${font}/${n}-${n + 255}.pbf`),
    ),
  ]) {
    await mkdir(dirname(join(source, path)), { recursive: true });
    await writeFile(join(source, path), `Synthetic hash-check fixture: ${path}`);
  }
  const seal = () =>
    createMapRelease(source, {
      archive: { url: "https://example.test/synthetic.pmtiles" },
      assets: { commit: "synthetic" },
      coverage: { bounds: [18.5, 34, 30.5, 44.5] },
    });
  return { root, source, seal };
}
it("copies verified bytes under the manifest hash, and refuses changed bytes", async () => {
  const { root, source, seal } = await fixture();
  const release = await seal();
  expect((await verifyMapRelease(source)).release).toBe(release);
  expect(await installMapRelease(source, join(root, "public"))).toBe(release);
  expect(await readFile(join(root, "public", release, "basemap.pmtiles"))).toEqual(
    await readFile(join(source, "basemap.pmtiles")),
  );
  await writeFile(join(source, "basemap.pmtiles"), "tampered");
  await expect(installMapRelease(source, join(root, "other"))).rejects.toThrow("differ");
  await expect(seal()).rejects.toThrow();
});
it("refuses a missing Hebrew glyph range and symlinked assets", async () => {
  const { source, seal } = await fixture();
  const glyph = join(source, "fonts/Noto Sans Regular/1280-1535.pbf");
  await rm(glyph);
  await expect(seal()).rejects.toThrow("Required map asset missing");
  await symlink(join(source, "basemap.pmtiles"), glyph);
  await expect(seal()).rejects.toThrow("Symlinks");
});

it("refuses a manifest replaced by a symlink", async () => {
  const { root, source, seal } = await fixture();
  await seal();
  const manifest = join(source, "release-manifest.json");
  await writeFile(join(root, "external.json"), await readFile(manifest));
  await rm(manifest);
  await symlink(join(root, "external.json"), manifest);
  await expect(verifyMapRelease(source)).rejects.toThrow("Manifest must be a regular file");
});
