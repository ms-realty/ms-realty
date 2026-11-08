// Bounded local files only. Paths, parents, descriptors and copied bytes are checked separately.
import {
  type BigIntStats,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  opendirSync,
  openSync,
  readSync,
  realpathSync,
  rmSync,
  writeSync,
} from "node:fs";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { BundleError, bundleLimits, requireBundle, validateBundlePath } from "./bundle";

const identity = (stat: BigIntStats) => `${stat.dev}:${stat.ino}`;
const unchanged = (a: BigIntStats, b: BigIntStats) =>
  identity(a) === identity(b) &&
  a.size === b.size &&
  a.mtimeNs === b.mtimeNs &&
  a.ctimeNs === b.ctimeNs &&
  a.nlink === b.nlink;
export const insideBundleTree = (root: string, path: string) => {
  const part = relative(root, path);
  return part === "" || (part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part));
};

/** No root or ancestor symlink is accepted, even if realpath would reach an allowed target. */
function ancestors(path: string) {
  requireBundle(
    isAbsolute(path) && !path.includes("\0") && path === resolve(path),
    "absolute_path_required",
  );
  const root = parse(path).root;
  let cursor = root;
  const result: { path: string; stat: BigIntStats }[] = [];
  for (const part of path.slice(root.length).split(sep).filter(Boolean)) {
    cursor = join(cursor, part);
    const stat = lstatSync(cursor, { bigint: true });
    requireBundle(stat.isDirectory() && !stat.isSymbolicLink(), "unsafe_directory");
    result.push({ path: cursor, stat });
  }
  return result;
}
export function bundleRoot(path: string): string {
  const resolved = resolve(path);
  ancestors(resolved);
  requireBundle(realpathSync(resolved) === resolved, "unsafe_directory_alias");
  return resolved;
}
function checkAncestors(before: ReturnType<typeof ancestors>) {
  for (const item of before) {
    const after = lstatSync(item.path, { bigint: true });
    requireBundle(
      after.isDirectory() && !after.isSymbolicLink() && identity(after) === identity(item.stat),
      "directory_changed",
    );
  }
}

/** nlink=1 closes hard-link aliases; O_NONBLOCK prevents a swapped FIFO from hanging a read. */
export function readBundleFile(
  root: string,
  path: string,
  maximum = bundleLimits.fileBytes,
): Buffer {
  validateBundlePath(path);
  const absolute = join(root, path);
  const parents = ancestors(dirname(absolute));
  const before = lstatSync(absolute, { bigint: true });
  requireBundle(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n, "unsafe_file");
  requireBundle(before.size <= BigInt(maximum), "file_size");
  const fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    requireBundle(unchanged(before, fstatSync(fd, { bigint: true })), "file_changed");
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maximum - total + 1));
      const length = readSync(fd, chunk, 0, chunk.length, null);
      if (length === 0) break;
      total += length;
      requireBundle(total <= maximum && BigInt(total) <= before.size, "file_size_or_change");
      chunks.push(chunk.subarray(0, length));
    }
    const after = fstatSync(fd, { bigint: true });
    requireBundle(
      unchanged(before, after) &&
        BigInt(total) === before.size &&
        unchanged(after, lstatSync(absolute, { bigint: true })),
      "file_changed",
    );
    checkAncestors(parents);
    return Buffer.concat(chunks, total);
  } finally {
    closeSync(fd);
  }
}

export function readBundleAbsolute(path: string, maximum = bundleLimits.jsonBytes): Buffer {
  const absolute = resolve(path);
  return readBundleFile(bundleRoot(dirname(absolute)), parse(absolute).base, maximum);
}

/** A closed inventory includes every file and rejects empty/unlisted directories as aliases. */
export function inventoryBundleTree(
  root: string,
  maximumEntries: number = bundleLimits.entries,
  prefixDepth = 0,
) {
  bundleRoot(root);
  const files = new Map<string, { bytes: number; identity: string }>();
  const inodeSet = new Set<string>();
  const names = new Set<string>();
  let total = 0;
  let nodes = 0;
  const walk = (current: string, prefix: string) => {
    const directory = opendirSync(current);
    let children = 0;
    try {
      for (let entry = directory.readSync(); entry !== null; entry = directory.readSync()) {
        children++;
        nodes++;
        requireBundle(
          nodes <= maximumEntries * (bundleLimits.components + prefixDepth),
          "entry_count",
        );
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        // Package controls add exactly one payload component; payload paths keep the v1 bounds.
        const checked = prefixDepth && path.startsWith("payload/") ? path.slice(8) : path;
        validateBundlePath(checked);
        requireBundle(!names.has(path.toLowerCase()), "portable_path_collision");
        names.add(path.toLowerCase());
        const stat = lstatSync(join(root, path), { bigint: true });
        requireBundle(!stat.isSymbolicLink(), "unsafe_file");
        if (stat.isDirectory()) walk(join(root, path), path);
        else {
          requireBundle(
            stat.isFile() && stat.nlink === 1n && !inodeSet.has(identity(stat)),
            "unsafe_file",
          );
          requireBundle(stat.size <= BigInt(bundleLimits.fileBytes), "file_size");
          inodeSet.add(identity(stat));
          total += Number(stat.size);
          requireBundle(
            total <= bundleLimits.payloadBytes + (prefixDepth ? 12 * bundleLimits.jsonBytes : 0),
            "payload_size",
          );
          files.set(path, { bytes: Number(stat.size), identity: identity(stat) });
          requireBundle(files.size <= maximumEntries, "entry_count");
        }
      }
      requireBundle(children > 0 || prefix === "", "empty_directory");
    } finally {
      directory.closeSync();
    }
  };
  walk(root, "");
  return files;
}

export function assertSeparateBundleTrees(a: string, b: string) {
  requireBundle(!insideBundleTree(a, b) && !insideBundleTree(b, a), "overlapping_trees");
}

/** Exclusive creation; permissions are private even under a permissive caller umask. */
export function writeBundleFile(root: string, path: string, bytes: string | Uint8Array): void {
  validateBundlePath(path);
  const absolute = join(root, path);
  const components = path.split("/").slice(0, -1);
  let parent = root;
  for (const component of components) {
    parent = join(parent, component);
    try {
      mkdirSync(parent, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  const parents = ancestors(dirname(absolute));
  const raw = typeof bytes === "string" ? Buffer.from(bytes, "utf8") : Buffer.from(bytes);
  const fd = openSync(
    absolute,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    let offset = 0;
    while (offset < raw.length) {
      const written = writeSync(fd, raw, offset);
      requireBundle(written > 0, "write_failed");
      offset += written;
    }
    const stat = fstatSync(fd, { bigint: true });
    requireBundle(
      stat.isFile() &&
        stat.nlink === 1n &&
        stat.size === BigInt(raw.length) &&
        unchanged(stat, lstatSync(absolute, { bigint: true })),
      "output_changed",
    );
    checkAncestors(parents);
  } finally {
    closeSync(fd);
  }
  requireBundle(readBundleFile(root, path, raw.length).equals(raw), "written_bytes_changed");
}

/** The exclusive result.json commit marker is published last; partial attempts are unusable. */
export function createBundleOutput(path: string, inputRoots: readonly string[]) {
  const absolute = resolve(path);
  validateBundlePath(parse(absolute).base);
  bundleRoot(dirname(absolute));
  for (const input of inputRoots) assertSeparateBundleTrees(input, absolute);
  mkdirSync(absolute, { mode: 0o700 });
  const created = lstatSync(absolute, { bigint: true });
  return {
    root: absolute,
    cleanup() {
      const current = lstatSync(absolute, { bigint: true });
      if (current.isDirectory() && identity(created) === identity(current))
        rmSync(absolute, { recursive: true });
      else throw new BundleError("output_changed");
    },
  };
}
