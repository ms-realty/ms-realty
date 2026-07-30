import fs from "node:fs";
import path from "node:path";
import { loadCmsSeed } from "../lib/runtime.mjs";
import {
  DEFAULT_MEDIA_MIRROR_DIR,
  DEFAULT_MEDIA_MIRROR_MANIFEST,
  mirrorPathFor,
  planMediaMirror,
  readMediaMirrorManifest,
  sha256,
  writeMediaMirrorManifest,
} from "../lib/media-migration.mjs";

// Copies every legacy /wp-content/uploads asset onto owned storage so the site
// stops depending on the old WordPress origins staying online after cutover.
// Resumable: assets already recorded in the manifest and present on disk are
// skipped, so an interrupted run continues where it stopped.
//
// Usage: node production/scripts/run-media-mirror.mjs [--limit N] [--concurrency N]

const args = process.argv.slice(2);
function flag(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : Number(args[index + 1]);
}

const limit = flag("limit", Infinity);
const concurrency = Math.max(1, Math.min(8, flag("concurrency", 4)));
const mirrorDir = process.env.MS_REALTY_MEDIA_MIRROR_DIR || DEFAULT_MEDIA_MIRROR_DIR;
const manifestPath = process.env.MS_REALTY_MEDIA_MIRROR_MANIFEST || DEFAULT_MEDIA_MIRROR_MANIFEST;

const plan = planMediaMirror(loadCmsSeed());
const existing = new Map((readMediaMirrorManifest(manifestPath)?.assets || []).map((asset) => [asset.key, asset]));

const pending = plan.mirrorable
  .filter(({ key }) => {
    const asset = existing.get(key);
    const filePath = mirrorPathFor(key, { mirrorDir });
    return !(asset && filePath && fs.existsSync(filePath));
  })
  .slice(0, Number.isFinite(limit) ? limit : undefined);

console.log(
  `Media mirror: ${plan.mirrorable.length} legacy assets, ${existing.size} already mirrored, ${pending.length} to fetch (${plan.external.length} external assets skipped).`,
);

const failures = [];
let completed = 0;

async function fetchOne({ key, url }) {
  const filePath = mirrorPathFor(key, { mirrorDir });
  if (!filePath) {
    failures.push({ key, url, error: "unsafe mirror key" });
    return;
  }
  try {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    // Write + rename so an interrupted run never leaves a truncated asset.
    const temporaryPath = `${filePath}.part`;
    fs.writeFileSync(temporaryPath, buffer);
    fs.renameSync(temporaryPath, filePath);
    existing.set(key, {
      key,
      source_url: url,
      bytes: buffer.byteLength,
      sha256: sha256(buffer),
      content_type: response.headers.get("content-type") || null,
    });
  } catch (error) {
    failures.push({ key, url, error: error.message });
  } finally {
    completed += 1;
    if (completed % 100 === 0) console.log(`  ${completed}/${pending.length}`);
  }
}

const queue = [...pending];
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      await fetchOne(next);
    }
  }),
);

writeMediaMirrorManifest(
  {
    kind: "media_mirror_manifest",
    generated_at: new Date().toISOString(),
    mirror_dir: path.relative(process.cwd(), mirrorDir),
    required_assets: plan.mirrorable.length,
    external_assets: plan.external.length,
    failures,
    assets: [...existing.values()].sort((left, right) => left.key.localeCompare(right.key)),
  },
  manifestPath,
);

console.log(`Mirrored ${existing.size}/${plan.mirrorable.length} assets. Failures: ${failures.length}.`);
if (failures.length) {
  for (const failure of failures.slice(0, 10)) console.error(`  ${failure.key}: ${failure.error}`);
  process.exitCode = 1;
}
