import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MISSING_R2_MEDIA = Object.freeze([
  ["makler-realty.com/wp-content/uploads/2018/01/441-new-2-300x225.jpg", 19_235, "b34d50f8aebd30a90af0c525d9c43ea673da05fa72639139de5ad80f9d16e670"],
  ["makler-realty.com/wp-content/uploads/2018/01/441-new-4-680x510.jpg", 72_125, "27b8a4d25d9c48a82ab4a78d16ed2d2ef34887bb2ae5c1f6980a226f816fc6fd"],
  ["makler-realty.com/wp-content/uploads/2019/07/1-038-300x225.jpg", 17_795, "7f671fb60d1d290a72cce26007535931fac2872078e1245333e63d5c6e2a2a37"],
  ["makler-realty.com/wp-content/uploads/2019/07/1-040-300x225.jpg", 17_516, "5a1b128cadedda8e4f4ba23ed34228ea25b2c7c46e438ec2ba08523ac65601bd"],
  ["makler-realty.com/wp-content/uploads/2019/07/gorod-sandanski-300x225.jpg", 13_979, "398e119e2dc8c1e31d0d1b77504f78768164644a70473c887e378b695d7fe10b"],
  ["makler-realty.ru/wp-content/uploads/2012/11/auto01-300x203.jpg", 13_203, "4c9b8ba66743431e95ca668cb84ecacbe8a3680b2cc08d5e6b5b07df05cbd4fe"],
  ["makler-realty.ru/wp-content/uploads/2012/11/letishte-sofia.jpg", 57_241, "5fa2074b71c91513b6c0f3572e2c8a32f752660787456c18eaac5abe75bff4ad"],
  ["makler-realty.ru/wp-content/uploads/2013/08/ofis-300x225.jpg", 18_821, "8cd4f0923eb1949ace9d4aa1e657d9d3249f8237895ccb0d0a9cdea040050905"],
  ["makler-realty.ru/wp-content/uploads/2013/11/191-сандански-парк-отель-пирин-300x192.jpg", 26_782, "9903b00a24381d4aefc7b8dcca536d6f28c2206bda32f780c6d8bba580598566"],
  ["makler-realty.ru/wp-content/uploads/2013/11/312-10-Сандански.jpg", 144_519, "b8bb4f403045785e4a15c7832638033d28d317f352790e165e06611e98aec63d"],
  ["makler-realty.ru/wp-content/uploads/2013/11/581166_602707569784911_1492335775_n1-300x194.jpg", 19_825, "46a20a98035aa3ddc486d3cb725aa296f4b02bb5803d222c7c8e1d4ea3fc8689"],
  ["makler-realty.ru/wp-content/uploads/2013/11/gorod-sandanski-300x225.jpg", 16_463, "868ccbff6d179ecff09f9085273768971f456d4d92e8189b383a5a9e9ec1701c"],
  ["makler-realty.ru/wp-content/uploads/2013/11/sandanski-2.jpg", 156_591, "76d6dfdcfdaf04e741f8d2bafabaeaebccf7de885a0760a5d49bbd9e4c8882ee"],
].map(([key, size, sha256]) => Object.freeze({ key, size, sha256 })));

const ALLOWED_HOSTS = new Set(["makler-realty.com", "makler-realty.ru"]);
const BUCKET = "ms-realty-media";

function option(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1] || fallback;
}

function sourceUrl(key) {
  const url = new URL(`https://${key}`);
  if (!ALLOWED_HOSTS.has(url.hostname) || !url.pathname.startsWith("/wp-content/uploads/")) {
    throw new Error(`Unsafe recovery key: ${key}`);
  }
  return url.href;
}

function assertJpeg(bytes, key) {
  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new Error(`${key}: source body is not a JPEG`);
  }
}

export async function repairMissingR2Media({ storage, fetchImpl = fetch, entries = MISSING_R2_MEDIA } = {}) {
  if (!storage?.put) throw new Error("R2 repair requires a media upload storage driver");
  const repaired = [];
  for (const entry of entries) {
    const response = await fetchImpl(sourceUrl(entry.key), {
      redirect: "error",
      headers: { "user-agent": "MS-Realty-R2-Recovery/1.0" },
    });
    if (!response.ok || response.status !== 200) throw new Error(`${entry.key}: source returned ${response.status}`);
    if (String(response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase() !== "image/jpeg") {
      throw new Error(`${entry.key}: source did not return image/jpeg`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== entry.size) throw new Error(`${entry.key}: expected ${entry.size} bytes, received ${bytes.length}`);
    assertJpeg(bytes, entry.key);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== entry.sha256) throw new Error(`${entry.key}: source SHA-256 does not match the approved recovery bytes`);
    const stored = await storage.put({ key: entry.key, bytes, contentType: "image/jpeg" });
    if (stored?.key !== entry.key || Number(stored?.bytes) !== entry.size) {
      throw new Error(`${entry.key}: storage did not confirm the exact key and byte count`);
    }
    repaired.push({ key: entry.key, size: entry.size, sha256 });
  }
  return repaired;
}

function objectApiUrl({ accountId, bucket, key = "" }) {
  const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucket)}/objects`;
  return key ? `${base}/${encodeURIComponent(key).replaceAll("%2F", "/")}` : base;
}

export function createCloudflareR2Storage({ accountId, apiToken, bucket = BUCKET, fetchImpl = fetch } = {}) {
  if (!accountId || !apiToken) throw new Error("R2 upload requires a Cloudflare account ID and API token");
  return {
    async put({ key, bytes, contentType }) {
      const response = await fetchImpl(objectApiUrl({ accountId, bucket, key }), {
        method: "PUT",
        headers: { authorization: `Bearer ${apiToken}`, "content-type": contentType || "application/octet-stream" },
        body: bytes,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.success !== true) throw new Error(`Cloudflare R2 upload failed (${response.status})`);
      if (body.result?.key !== key || Number(body.result?.size) !== bytes.length) {
        throw new Error(`${key}: Cloudflare did not confirm the exact key and byte count`);
      }
      return { key, bytes: bytes.length };
    },
  };
}

export async function listR2Objects({ accountId, apiToken, bucket = BUCKET, fetchImpl = fetch } = {}) {
  if (!accountId || !apiToken) throw new Error("R2 listing requires a Cloudflare account ID and API token");
  const objects = [];
  let cursor = "";
  do {
    const url = new URL(objectApiUrl({ accountId, bucket }));
    url.searchParams.set("per_page", "1000");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetchImpl(url, { headers: { authorization: `Bearer ${apiToken}` } });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.success !== true || !Array.isArray(body.result)) {
      throw new Error(`Cloudflare R2 listing failed (${response.status})`);
    }
    for (const item of body.result) {
      const key = String(item?.key || "");
      const size = Number(item?.size);
      if (!key || !Number.isSafeInteger(size) || size < 0) throw new Error("Cloudflare R2 listing returned an invalid object");
      objects.push({ key, size });
    }
    cursor = body.result_info?.is_truncated === true ? String(body.result_info.cursor || "") : "";
    if (body.result_info?.is_truncated === true && !cursor) throw new Error("Cloudflare R2 listing omitted its next cursor");
  } while (cursor);
  objects.sort((left, right) => left.key.localeCompare(right.key));
  return objects;
}

export function assertRecoveredObjects(objects, entries = MISSING_R2_MEDIA) {
  const listed = new Map(objects.map((item) => [item.key, Number(item.size)]));
  for (const entry of entries) {
    if (listed.get(entry.key) !== entry.size) throw new Error(`${entry.key}: post-repair R2 listing has the wrong byte count`);
  }
}

async function main() {
  const execute = process.argv.includes("--execute");
  const listOnly = process.argv.includes("--list-only");
  if (execute && listOnly) throw new Error("Choose either --execute or --list-only");
  if (!execute && !listOnly) {
    console.log(JSON.stringify({ execute, objects: MISSING_R2_MEDIA.length, bytes: MISSING_R2_MEDIA.reduce((n, item) => n + item.size, 0) }));
    return;
  }
  const cloudflare = {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
  };
  const repaired = execute ? await repairMissingR2Media({ storage: createCloudflareR2Storage(cloudflare) }) : [];
  const listingOutput = option("listing-output");
  if (!listingOutput) throw new Error("--listing-output is required for R2 listing capture");
  let listed = null;
  const objects = await listR2Objects({ ...cloudflare });
  assertRecoveredObjects(objects);
  fs.mkdirSync(path.dirname(path.resolve(listingOutput)), { recursive: true });
  fs.writeFileSync(listingOutput, `${JSON.stringify(objects, null, 2)}\n`, "utf8");
  listed = objects.length;
  console.log(JSON.stringify({ repaired: repaired.length, bytes: repaired.reduce((n, item) => n + item.size, 0), listed, objects: repaired }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`R2 MEDIA REPAIR FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
