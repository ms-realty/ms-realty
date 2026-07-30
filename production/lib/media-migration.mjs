import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

// Media migration.
//
// Every listing image is still hotlinked from the legacy WordPress origins
// (makler-realty.com / .ru /wp-content/uploads/...). The moment DNS points at
// the new app those hosts stop serving files and every gallery 404s, because
// the new app has no /wp-content/uploads route.
//
// This module plans the mirror, records what was copied, and lets the launch
// gate verify coverage. `run-media-mirror.mjs` performs the download; the app
// serves the mirrored bytes at the original paths so legacy image URLs — and
// their 13 years of image-search equity — keep resolving.

export const LEGACY_MEDIA_HOSTS = new Set(["makler-realty.com", "makler-realty.ru"]);
export const DEFAULT_MEDIA_MIRROR_DIR = fromRoot("production", "data", "media-mirror");
export const DEFAULT_MEDIA_MIRROR_MANIFEST = fromRoot("production", "data", "media-mirror-manifest.json");
export const UPLOADS_PREFIX = "/wp-content/uploads/";

function normalizedHost(value) {
  return String(value || "").toLowerCase().replace(/^www\./, "");
}

// Legacy uploads live under /wp-content/uploads/YYYY/MM/file.ext. The mirror
// keeps the host in the key so the two domains cannot collide on a shared path.
export function mirrorKeyFor(assetUrl) {
  let url;
  try {
    url = new URL(assetUrl);
  } catch {
    return null;
  }
  const host = normalizedHost(url.host);
  if (!LEGACY_MEDIA_HOSTS.has(host)) return null;
  const pathname = decodeURIComponent(url.pathname);
  if (!pathname.startsWith(UPLOADS_PREFIX)) return null;
  // Reject traversal before the value is ever joined onto a filesystem path.
  if (pathname.includes("..") || pathname.includes("\0")) return null;
  return `${host}${pathname}`;
}

export function mirrorPathFor(key, { mirrorDir = DEFAULT_MEDIA_MIRROR_DIR } = {}) {
  const resolved = path.resolve(mirrorDir, key);
  const root = path.resolve(mirrorDir);
  // Defence in depth: never escape the mirror root even if a key slips through.
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return null;
  return resolved;
}

export function mediaAssetUrls(seed) {
  const urls = new Set();
  for (const record of seed.records || []) {
    for (const item of record.media || []) {
      const url = item.asset_url || item.url;
      if (url) urls.add(url);
    }
    const thumbnail = record.facts?.thumbnail_url;
    if (thumbnail) urls.add(thumbnail);
  }
  return [...urls];
}

export function planMediaMirror(seed) {
  const byKey = new Map();
  const external = [];
  for (const url of mediaAssetUrls(seed)) {
    const key = mirrorKeyFor(url);
    if (!key) {
      external.push(url);
      continue;
    }
    if (!byKey.has(key)) byKey.set(key, url);
  }
  return {
    total_assets: byKey.size + external.length,
    mirrorable: [...byKey].map(([key, url]) => ({ key, url })),
    external,
  };
}

export function readMediaMirrorManifest(filePath = DEFAULT_MEDIA_MIRROR_MANIFEST) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeMediaMirrorManifest(manifest, filePath = DEFAULT_MEDIA_MIRROR_MANIFEST) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`);
  return filePath;
}

export function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// Launch gate input: how much of the required media is actually mirrored and
// verifiable on disk right now.
export function mediaMirrorState(seed, { manifestPath = DEFAULT_MEDIA_MIRROR_MANIFEST, mirrorDir = DEFAULT_MEDIA_MIRROR_DIR } = {}) {
  const plan = planMediaMirror(seed);
  const manifest = readMediaMirrorManifest(manifestPath);
  if (!manifest) {
    return {
      status: "missing_manifest",
      ready: false,
      required_assets: plan.mirrorable.length,
      mirrored_assets: 0,
      missing_assets: plan.mirrorable.length,
      external_assets: plan.external.length,
    };
  }
  const mirrored = new Map((manifest.assets || []).map((asset) => [asset.key, asset]));
  const missing = [];
  let present = 0;
  for (const { key } of plan.mirrorable) {
    const asset = mirrored.get(key);
    const filePath = asset ? mirrorPathFor(key, { mirrorDir }) : null;
    if (asset && filePath && fs.existsSync(filePath)) present += 1;
    else missing.push(key);
  }
  return {
    status: missing.length ? "incomplete" : "ready",
    ready: missing.length === 0 && plan.mirrorable.length > 0,
    required_assets: plan.mirrorable.length,
    mirrored_assets: present,
    missing_assets: missing.length,
    external_assets: plan.external.length,
    generated_at: manifest.generated_at || null,
    sample_missing: missing.slice(0, 10),
  };
}
