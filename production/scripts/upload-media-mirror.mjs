import fs from "node:fs";
import {
  DEFAULT_MEDIA_MIRROR_DIR,
  DEFAULT_MEDIA_MIRROR_MANIFEST,
  DEFAULT_MEDIA_UPLOAD_MANIFEST,
  mirrorPathFor,
  readMediaMirrorManifest,
  readMediaUploadManifest,
  sha256,
  writeMediaUploadManifest,
} from "../lib/media-migration.mjs";

// Uploads the locally verified mirror through the Worker endpoint that writes
// directly to R2. It resumes from successful Worker acknowledgements.
//
// Usage:
// MS_REALTY_MEDIA_INGEST_URL=https://<worker-or-domain> \
// MS_REALTY_MEDIA_INGEST_SECRET=... npm run media:upload

const args = process.argv.slice(2);

function numericFlag(name, fallback) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(args[index + 1]);
  if (!Number.isFinite(value) || value < 1) throw new Error(`--${name} must be a positive number`);
  return value;
}

function ingestEndpoint() {
  const value = process.env.MS_REALTY_MEDIA_INGEST_URL;
  if (!value) throw new Error("MS_REALTY_MEDIA_INGEST_URL is required (for example https://ms-realty.<account>.workers.dev)");
  const url = new URL(value);
  const local = ["127.0.0.1", "::1", "localhost"].includes(url.hostname);
  const insecureLocal = process.env.MS_REALTY_ALLOW_INSECURE_LOCAL_MEDIA_INGEST === "1" && local;
  if (url.protocol !== "https:" && !(url.protocol === "http:" && insecureLocal)) {
    throw new Error("MS_REALTY_MEDIA_INGEST_URL must use HTTPS (or explicit local test mode)");
  }
  if (url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) {
    throw new Error("MS_REALTY_MEDIA_INGEST_URL must be a bare Worker origin without credentials, path, query, or fragment");
  }
  return url;
}

function uploadUrl(origin, key) {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return new URL(`/__media/${encodedKey}`, origin);
}

function retryable(status) {
  return status === 408 || status === 429 || status >= 500;
}

const limit = numericFlag("limit", Infinity);
const concurrency = Math.min(8, numericFlag("concurrency", 4));
const mirrorDir = process.env.MS_REALTY_MEDIA_MIRROR_DIR || DEFAULT_MEDIA_MIRROR_DIR;
const mirrorManifestPath = process.env.MS_REALTY_MEDIA_MIRROR_MANIFEST || DEFAULT_MEDIA_MIRROR_MANIFEST;
const uploadManifestPath = process.env.MS_REALTY_MEDIA_UPLOAD_MANIFEST || DEFAULT_MEDIA_UPLOAD_MANIFEST;
const secret = process.env.MS_REALTY_MEDIA_INGEST_SECRET;
if (!secret) throw new Error("MS_REALTY_MEDIA_INGEST_SECRET is required");

const origin = ingestEndpoint();
const sourceManifest = readMediaMirrorManifest(mirrorManifestPath);
if (sourceManifest?.kind !== "media_mirror_manifest" || !Array.isArray(sourceManifest.assets) || !sourceManifest.assets.length) {
  throw new Error(`Expected a non-empty media mirror manifest at ${mirrorManifestPath}`);
}

const completed = new Map((readMediaUploadManifest(uploadManifestPath)?.assets || []).map((asset) => [asset.key, asset]));
const failures = [];
const pending = [];

for (const asset of sourceManifest.assets) {
  const filePath = mirrorPathFor(asset.key, { mirrorDir });
  if (!filePath || !fs.existsSync(filePath)) {
    failures.push({ key: asset.key, error: "missing mirrored file" });
    continue;
  }
  const prior = completed.get(asset.key);
  if (prior?.status === "uploaded" && prior.bytes === asset.bytes && prior.sha256 === asset.sha256) continue;
  pending.push({ ...asset, filePath });
}

const selected = pending.slice(0, Number.isFinite(limit) ? limit : undefined);
console.log(`Media upload: ${sourceManifest.assets.length} mirrored assets, ${completed.size} previously acknowledged, ${selected.length} to upload.`);

async function uploadOne(asset) {
  const body = fs.readFileSync(asset.filePath);
  if (body.byteLength !== asset.bytes || sha256(body) !== asset.sha256) {
    throw new Error("mirrored file no longer matches its verified manifest entry");
  }

  let lastError = "unknown upload failure";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(uploadUrl(origin, asset.key), {
        method: "PUT",
        headers: {
          authorization: `Bearer ${secret}`,
          "content-type": asset.content_type || "application/octet-stream",
          "content-length": String(body.byteLength),
        },
        body,
      });
      const responseBody = await response.text();
      if (!response.ok) {
        lastError = `HTTP ${response.status}${responseBody ? `: ${responseBody.slice(0, 200)}` : ""}`;
        if (retryable(response.status) && attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 250));
          continue;
        }
        throw new Error(lastError);
      }
      const acknowledged = JSON.parse(responseBody);
      if (acknowledged.key !== asset.key || acknowledged.size !== body.byteLength) {
        throw new Error("Worker acknowledgement did not match the uploaded key and size");
      }
      completed.set(asset.key, {
        key: asset.key,
        bytes: body.byteLength,
        sha256: asset.sha256,
        content_type: asset.content_type || null,
        status: "uploaded",
        uploaded_at: new Date().toISOString(),
      });
      return;
    } catch (error) {
      lastError = error.message;
      if (attempt === 3 || lastError.startsWith("HTTP 4")) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  throw new Error(lastError);
}

const queue = [...selected];
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    for (;;) {
      const asset = queue.shift();
      if (!asset) return;
      try {
        await uploadOne(asset);
      } catch (error) {
        failures.push({ key: asset.key, error: error.message });
      }
    }
  }),
);

writeMediaUploadManifest(
  {
    kind: "media_upload_manifest",
    generated_at: new Date().toISOString(),
    ingest_origin: origin.origin,
    required_assets: sourceManifest.assets.length,
    failures,
    assets: [...completed.values()].sort((left, right) => left.key.localeCompare(right.key)),
  },
  uploadManifestPath,
);

console.log(`Uploaded ${completed.size}/${sourceManifest.assets.length} assets. Failures: ${failures.length}.`);
if (failures.length || selected.length !== pending.length) process.exitCode = 1;
