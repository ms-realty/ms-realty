import fs from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { fromRoot } from "../lib/paths.mjs";

const ALLOWED_HOSTS = new Set(["makler-realty.com", "makler-realty.ru"]);
const UPLOAD_PREFIX = "/wp-content/uploads/";

function option(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1] || fallback;
}

function positiveInteger(value, name) {
  if (!/^\d+$/.test(String(value)) || Number(value) < 1) throw new Error(`${name} must be a positive integer`);
  return Number(value);
}

export function planMediaMirror(seed, destination) {
  if (!path.isAbsolute(destination) || path.parse(destination).root === destination) {
    throw new Error("Media mirror destination must be a non-root absolute path");
  }

  const urls = new Set(
    (seed.records || []).flatMap((record) => (record.media || []).map((item) => item.asset_url).filter(Boolean)),
  );
  return [...urls].sort().map((assetUrl) => {
    const url = new URL(assetUrl);
    if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname) || !url.pathname.startsWith(UPLOAD_PREFIX)) {
      throw new Error(`Unsafe media URL: ${assetUrl}`);
    }
    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const target = path.join(destination, url.hostname, relativePath);
    const hostRoot = path.join(destination, url.hostname);
    if (!target.startsWith(`${hostRoot}${path.sep}`)) throw new Error(`Unsafe media path: ${assetUrl}`);
    return { assetUrl: url.href, target };
  });
}

async function existingNonempty(filePath) {
  try {
    return (await stat(filePath)).size > 0;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function download({ assetUrl, target }) {
  if (await existingNonempty(target)) return "skipped";
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.part-${process.pid}`;
  try {
    await rm(temporary, { force: true });
    const response = await fetch(assetUrl, {
      redirect: "follow",
      headers: { "user-agent": "MS-Realty-Media-Mirror/1.0" },
    });
    if (!response.ok || !response.body) throw new Error(`${response.status} ${response.statusText}`);
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temporary, { flags: "wx" }));
    if (!(await existingNonempty(temporary))) throw new Error("empty response body");
    await rename(temporary, target);
    return "downloaded";
  } catch (error) {
    await rm(temporary, { force: true });
    throw new Error(`${assetUrl}: ${error.message}`);
  }
}

async function main() {
  const destination = option("destination", process.env.MS_REALTY_MEDIA_MIRROR_DIR || "");
  if (!destination) throw new Error("Set MS_REALTY_MEDIA_MIRROR_DIR or pass --destination");
  const seed = JSON.parse(fs.readFileSync(fromRoot("production", "data", "cms-seed.json"), "utf8"));
  const plan = planMediaMirror(seed, destination);
  const limit = positiveInteger(option("limit", plan.length), "--limit");
  const entries = plan.slice(0, limit);

  if (!process.argv.includes("--execute")) {
    console.log(JSON.stringify({ execute: false, destination, assets: plan.length, selected: entries.length }));
    return;
  }

  const concurrency = positiveInteger(option("concurrency", "8"), "--concurrency");
  const summary = { downloaded: 0, skipped: 0, failed: [] };
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, entries.length) }, async () => {
      while (cursor < entries.length) {
        const entry = entries[cursor++];
        try {
          summary[await download(entry)] += 1;
        } catch (error) {
          summary.failed.push(error.message);
        }
      }
    }),
  );
  console.log(JSON.stringify({ ...summary, total: entries.length }));
  if (summary.failed.length) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`MEDIA MIRROR FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
