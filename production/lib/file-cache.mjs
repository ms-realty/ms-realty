import fs from "node:fs";

// Stat-validated in-process cache for the small JSON/JSONL state files that
// the runtime reads on hot request paths.
//
// Why this is safe here:
// - The same Node process owns every write (request handlers append to the
//   ledgers themselves), and each cached read re-stats the file, so any
//   change on disk — from this process or an external script — invalidates
//   the entry on the next request.
// - Cache values must be treated as read-only by callers. The fold helpers
//   (applyListingEdits, applyMediaReviews) already return new objects.
//
// Set MS_REALTY_DISABLE_FILE_CACHE=1 to bypass the cache entirely (debugging).

const cache = new Map();

function disabled() {
  return process.env.MS_REALTY_DISABLE_FILE_CACHE === "1";
}

export function fileSignature(filePath) {
  if (!filePath) return null;
  try {
    const stat = fs.statSync(filePath);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return null;
  }
}

export function readThroughCached(filePath, loader) {
  if (!filePath || disabled()) return loader();
  const signature = fileSignature(filePath);
  if (signature === null) {
    // Missing file: always defer to the loader so each module keeps its own
    // missing-file semantics (empty ledger, thrown error, defaults).
    cache.delete(filePath);
    return loader();
  }
  const hit = cache.get(filePath);
  if (hit && hit.signature === signature) return hit.value;
  const value = loader();
  cache.set(filePath, { signature, value });
  return value;
}

export function clearFileCache() {
  cache.clear();
}
