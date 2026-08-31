// Object storage for uploaded photo bytes.
//
// Two drivers behind one small interface, so moving from a laptop to Cloudflare
// is configuration and not a rewrite:
//
//   local (default) — bytes on machine-local disk under
//     MS_REALTY_MEDIA_UPLOAD_DIR, laid out exactly like the media mirror
//     (`<root>/<host>/<path>`, see production/scripts/run-media-mirror.mjs) and
//     ignored by git for the same reason: uploaded bytes are never committed.
//
//   r2 — bytes PUT through the Worker's `/__media/` ingest route into the
//     `ms-realty-media` R2 bucket. That is the same code path the site reads
//     from, which is why production/DEPLOYMENT.md §6 forbids `wrangler r2
//     object put` for bulk writes: it reports success on a throttled write.
//     The route echoes the stored length, and this driver refuses to record a
//     write whose echoed size does not match the bytes we sent.
//
// Key space, and why it is split:
//   <host>/wp-content/uploads/<YYYY>/<MM>/ms-<hash>.<ext>   public
//   <host>/wp-content/private/enquiries/<id>/ms-<hash>.<ext> private
// The Worker only serves `/wp-content/uploads/*` from R2 (workers/index.js,
// MEDIA_PREFIX), so a key under `wp-content/private/` is storable through the
// ingest route but unreachable from the edge. A member of the public sending
// photos of their own home must not get a public URL out of it, and this is the
// mechanism that makes that true rather than merely intended.

import { createHash } from "node:crypto";
import fs from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fromRoot } from "./paths.mjs";
import { mediaIngestCredential } from "../../workers/media-ingest-auth.mjs";

export const DEFAULT_MEDIA_UPLOAD_DIR = fromRoot("production", "data", "media-uploads");
export const DEFAULT_MEDIA_UPLOAD_HOST = "ms-realty.ms-realty-bg.workers.dev";
export const MEDIA_UPLOAD_SCOPES = Object.freeze(["listing", "enquiry"]);

const PUBLIC_PREFIX = "wp-content/uploads";
const PRIVATE_PREFIX = "wp-content/private/enquiries";
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const SUBJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export class MediaUploadStorageError extends Error {
  constructor(message, code = "media_storage_unavailable") {
    super(message);
    this.name = "MediaUploadStorageError";
    this.code = code;
  }
}

export function mediaUploadContentHash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

// The stored name is derived from the bytes, never from anything the caller
// typed. Two uploads of the same photo collapse onto one object, and a
// filename can neither escape the directory nor choose the extension.
export function mediaUploadKey({ scope, subjectId, hash, ext, host = DEFAULT_MEDIA_UPLOAD_HOST, at = new Date() }) {
  if (!MEDIA_UPLOAD_SCOPES.includes(scope)) throw new MediaUploadStorageError("Upload scope must be listing or enquiry", "bad_request");
  if (!HOST.test(String(host))) throw new MediaUploadStorageError("Media upload host must be a hostname", "bad_request");
  if (!/^[a-f0-9]{64}$/.test(String(hash))) throw new MediaUploadStorageError("Upload key requires a sha256 content hash", "bad_request");
  if (!/^[a-z0-9]{3,4}$/.test(String(ext))) throw new MediaUploadStorageError("Upload key requires a sniffed extension", "bad_request");
  const name = `ms-${String(hash).slice(0, 32)}.${ext}`;
  if (scope === "listing") {
    const stamp = at instanceof Date && !Number.isNaN(at.valueOf()) ? at : new Date();
    const year = String(stamp.getUTCFullYear());
    const month = String(stamp.getUTCMonth() + 1).padStart(2, "0");
    return `${host}/${PUBLIC_PREFIX}/${year}/${month}/${name}`;
  }
  const id = String(subjectId || "");
  if (!SUBJECT_ID.test(id)) throw new MediaUploadStorageError("Enquiry upload requires a known enquiry id", "bad_request");
  return `${host}/${PRIVATE_PREFIX}/${id}/${name}`;
}

// A rendition sits beside the object it was derived from, in the same prefix,
// under the same content hash: `ms-<hash>.jpg` gains `ms-<hash>-thumb.webp`.
//
// Staying in the prefix is the point, not a convenience. The public/private
// split is expressed entirely by the prefix (the Worker serves only
// `wp-content/uploads/*`), so a thumbnail of a seller's photo is unreachable
// from the edge for exactly the same structural reason the photo is. There is
// no branch here that could get that wrong.
export function mediaUploadRenditionKey(key, { label = "thumb", ext } = {}) {
  const value = assertSafeKey(key);
  if (!/^[a-z0-9]{2,16}$/.test(String(label))) {
    throw new MediaUploadStorageError("Rendition label must be a short slug", "bad_request");
  }
  if (!/^[a-z0-9]{3,4}$/.test(String(ext))) {
    throw new MediaUploadStorageError("Rendition key requires a sniffed extension", "bad_request");
  }
  const slash = value.lastIndexOf("/");
  const name = value.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  if (dot < 1) throw new MediaUploadStorageError("Rendition key requires a named object", "bad_request");
  return `${value.slice(0, slash + 1)}${name.slice(0, dot)}-${label}.${ext}`;
}

export function mediaUploadPublicUrl(key) {
  const value = String(key || "");
  const slash = value.indexOf("/");
  if (slash < 1) return null;
  const host = value.slice(0, slash);
  const objectPath = value.slice(slash);
  if (!HOST.test(host) || !objectPath.startsWith(`/${PUBLIC_PREFIX}/`)) return null;
  return `https://${host}${objectPath}`;
}

function assertSafeKey(key) {
  const value = String(key || "");
  if (!value || value.length > 512) throw new MediaUploadStorageError("Upload key is out of range", "bad_request");
  if (value.includes("..") || value.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(value)) {
    throw new MediaUploadStorageError("Upload key is unsafe", "bad_request");
  }
  return value;
}

/* ------------------------------------------------------------------ local */

function localDriver({ root }) {
  const base = path.resolve(root);
  if (!path.isAbsolute(base) || path.parse(base).root === base) {
    throw new MediaUploadStorageError("MS_REALTY_MEDIA_UPLOAD_DIR must be a non-root absolute path", "bad_configuration");
  }
  const resolve = (key) => {
    const target = path.resolve(base, assertSafeKey(key));
    if (target !== base && !target.startsWith(`${base}${path.sep}`)) {
      throw new MediaUploadStorageError("Upload key escapes the media upload directory", "bad_request");
    }
    return target;
  };
  return {
    driver: "local",
    root: base,
    describe: () => ({ driver: "local", root: base }),
    supports: () => true,
    async put({ key, bytes }) {
      const target = resolve(key);
      await mkdir(path.dirname(target), { recursive: true });
      // A content-addressed object that already exists holds identical bytes.
      if (fs.existsSync(target) && fs.statSync(target).size === bytes.length) {
        return { key, driver: "local", bytes: bytes.length, stored: false };
      }
      const temporary = `${target}.part-${process.pid}-${Date.now()}`;
      try {
        await writeFile(temporary, bytes, { flag: "wx" });
        await rename(temporary, target);
      } catch (error) {
        await rm(temporary, { force: true });
        throw new MediaUploadStorageError(`Could not store the upload: ${error.message}`);
      }
      return { key, driver: "local", bytes: bytes.length, stored: true };
    },
    async read(key) {
      try {
        return await readFile(resolve(key));
      } catch (error) {
        if (error.code === "ENOENT") throw new MediaUploadStorageError("Stored upload is missing", "not_found");
        throw error;
      }
    },
  };
}

/* --------------------------------------------------------------------- r2 */

function r2Driver({ endpoint, secret, originToken, fetchImpl }) {
  if (!endpoint || (!secret && !originToken)) {
    throw new MediaUploadStorageError(
      "The r2 media upload driver requires its endpoint and a media or origin credential",
      "bad_configuration",
    );
  }
  const base = endpoint.endsWith("/") ? endpoint : `${endpoint}/`;
  const call = fetchImpl || globalThis.fetch;
  return {
    driver: "r2",
    root: base,
    describe: () => ({ driver: "r2", endpoint: base, bucket: "ms-realty-media" }),
    supports: () => true,
    async put({ key, bytes, contentType }) {
      const safeKey = assertSafeKey(key);
      const credential = secret || (await mediaIngestCredential(originToken));
      if (!credential) throw new MediaUploadStorageError("R2 media ingest credential is unavailable", "bad_configuration");
      const response = await call(`${base}${encodeURIComponent(safeKey)}`, {
        method: "PUT",
        headers: { authorization: `Bearer ${credential}`, "content-type": contentType || "application/octet-stream" },
        body: bytes,
      });
      if (!response.ok) {
        throw new MediaUploadStorageError(`R2 media ingest refused the upload (${response.status})`);
      }
      // DEPLOYMENT.md §6: verify the echoed length rather than trusting a 200.
      const echoed = await response.json().catch(() => ({}));
      if (Number(echoed.size) !== bytes.length) {
        throw new MediaUploadStorageError("R2 media ingest stored a different byte count than we sent");
      }
      return { key: safeKey, driver: "r2", bytes: bytes.length, stored: true };
    },
    async read() {
      // The ingest route is write-only and the edge serves only the public
      // prefix, so an unreviewed object cannot be read back through it. Say so
      // instead of pretending the byte preview works.
      throw new MediaUploadStorageError(
        "The r2 driver cannot read uploaded bytes back; review the object in the R2 dashboard or configure the local driver",
        "not_implemented",
      );
    },
  };
}

/* ------------------------------------------------------------------ config */

export function mediaUploadStorageConfigFromEnv(env = process.env) {
  const driver = String(env.MS_REALTY_MEDIA_UPLOAD_DRIVER || "local").trim().toLowerCase() || "local";
  return {
    driver,
    root: String(env.MS_REALTY_MEDIA_UPLOAD_DIR || "").trim() || DEFAULT_MEDIA_UPLOAD_DIR,
    host: String(env.MS_REALTY_MEDIA_UPLOAD_HOST || "").trim() || DEFAULT_MEDIA_UPLOAD_HOST,
    endpoint: String(env.MS_REALTY_MEDIA_UPLOAD_R2_ENDPOINT || "").trim(),
    secret: String(env.MS_REALTY_MEDIA_INGEST_SECRET || "").trim(),
    originToken: String(env.MS_REALTY_ORIGIN_TOKEN || "").trim(),
  };
}

export function createMediaUploadStorage(config = mediaUploadStorageConfigFromEnv(), { fetchImpl = null } = {}) {
  const settings = { ...mediaUploadStorageConfigFromEnv({}), ...(config || {}) };
  if (settings.driver === "local") return localDriver(settings);
  if (settings.driver === "r2") return r2Driver({ ...settings, fetchImpl });
  throw new MediaUploadStorageError(
    `MS_REALTY_MEDIA_UPLOAD_DRIVER must be "local" or "r2", not "${settings.driver}"`,
    "bad_configuration",
  );
}
