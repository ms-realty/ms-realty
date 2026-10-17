// Local asset evidence only: this command neither uploads nor approves a release.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const manifestName = "release-manifest.json";
const fonts = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"];
const required = [
  "basemap.pmtiles",
  "sprites/light.json",
  "sprites/light.png",
  "sprites/light@2x.json",
  "sprites/light@2x.png",
  "licenses/fonts-OFL.txt",
  "licenses/assets-README.md",
  ...fonts.flatMap((font) => [0, 768, 1024, 1280].map((n) => `fonts/${font}/${n}-${n + 255}.pbf`)),
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function digest(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
async function inventory(root, prefix = "") {
  const files = [];
  for (const name of (await readdir(join(root, prefix))).sort()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (path === manifestName) continue;
    const stat = await lstat(join(root, path));
    if (stat.isSymbolicLink()) throw new Error(`Symlinks are not release assets: ${path}`);
    if (stat.isDirectory()) files.push(...(await inventory(root, path)));
    else if (stat.isFile())
      files.push({ path, bytes: stat.size, sha256: await digest(join(root, path)) });
    else throw new Error(`Unsupported asset: ${path}`);
  }
  for (const name of prefix ? [] : required)
    if (!files.some((file) => file.path === name && file.bytes > 0))
      throw new Error(`Required map asset missing: ${name}`);
  return files;
}
export async function createMapRelease(root, source) {
  if (!source?.archive?.url || !source?.assets?.commit || !source?.coverage?.bounds)
    throw new Error("Record archive source, pinned asset commit and coverage before sealing.");
  const manifest = {
    schema: 1,
    status: "LOCAL_CANDIDATE_NOT_APPROVED",
    source,
    files: await inventory(root),
  };
  const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
  // Existing manifests cannot be silently replaced after an asset change.
  await writeFile(join(root, manifestName), bytes, { flag: "wx" });
  return sha256(bytes);
}
export async function verifyMapRelease(root) {
  const stat = await lstat(join(root, manifestName));
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Manifest must be a regular file.");
  const bytes = await readFile(join(root, manifestName));
  const manifest = JSON.parse(bytes.toString());
  if (manifest.schema !== 1 || manifest.status !== "LOCAL_CANDIDATE_NOT_APPROVED")
    throw new Error("Unsupported map manifest.");
  const actual = await inventory(root);
  if (JSON.stringify(actual) !== JSON.stringify(manifest.files))
    throw new Error("Map files differ from the sealed manifest.");
  return { release: sha256(bytes), manifest };
}
export async function installMapRelease(root, publicMaps) {
  const { release, manifest } = await verifyMapRelease(root);
  const target = join(publicMaps, release);
  for (const file of manifest.files) {
    const dest = join(target, file.path);
    await mkdir(dirname(dest), { recursive: true });
    await cp(join(root, file.path), dest);
    if ((await digest(dest)) !== file.sha256) throw new Error(`Copy changed: ${file.path}`);
  }
  return release;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, root, sourcePath] = process.argv.slice(2);
  if (command === "seal" && root && sourcePath)
    console.log(await createMapRelease(root, JSON.parse(await readFile(sourcePath, "utf8"))));
  else if (command === "verify" && root) console.log((await verifyMapRelease(root)).release);
  else throw new Error("Usage: node scripts/map-release.mjs seal DIR SOURCE.json | verify DIR");
}
