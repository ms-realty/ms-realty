// Offline UX23 rehearsal only. No live database, provider credentials, egress or reopening.
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { reapplySyntheticPrivacyTail } from "../src/server/recovery/privacy-tail";
import { quarantineRestoredDatabase } from "../src/server/recovery/quarantine";

const flags = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) {
  const flag = process.argv[index],
    value = process.argv[index + 1];
  if (
    !flag ||
    !value ||
    ![
      "--tail",
      "--signature",
      "--trusted-key",
      "--restore-id",
      "--snapshot-digest",
      "--checkpoint",
      "--checkpoint-signature",
    ].includes(flag) ||
    flags.has(flag)
  )
    throw new Error(
      "Expected tail, detached signature, independent trusted-key path and restore binding.",
    );
  flags.set(flag, value);
}
for (const key of [
  "--tail",
  "--signature",
  "--trusted-key",
  "--restore-id",
  "--snapshot-digest",
  "--checkpoint",
  "--checkpoint-signature",
])
  if (!flags.has(key)) throw new Error(`Missing ${key}`);
const rawUrl = process.env.TEST_DATABASE_URL;
if (!rawUrl) throw new Error("TEST_DATABASE_URL must identify the owned synthetic destination.");
const url = new URL(rawUrl);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
  !/^\/test_[a-f0-9]{32}$/.test(url.pathname) ||
  url.search ||
  url.hash
)
  throw new Error("Only a generated disposable test database on loopback is supported.");
const readBounded = async (flag: string, limit: number) => {
  const data = await readFile(flags.get(flag) as string);
  if (data.byteLength > limit) throw new Error("Synthetic input exceeds its limit.");
  return data.toString("utf8").trim();
};
const client = postgres(rawUrl, { max: 1, onnotice: () => {} });
try {
  const db = drizzle(client, { schema });
  await quarantineRestoredDatabase(db, {
    restoreId: flags.get("--restore-id") as string,
    snapshotDigest: flags.get("--snapshot-digest") as string,
  });
  const result = await reapplySyntheticPrivacyTail(db, {
    restoreId: flags.get("--restore-id") as string,
    snapshotDigest: flags.get("--snapshot-digest") as string,
    manifest: JSON.parse(await readBounded("--tail", 1024 * 1024)),
    signature: await readBounded("--signature", 4096),
    trustedPublicKey: await readBounded("--trusted-key", 8192),
    checkpoint: JSON.parse(await readBounded("--checkpoint", 8192)),
    checkpointSignature: await readBounded("--checkpoint-signature", 4096),
  });
  console.log(JSON.stringify(result));
} finally {
  await client.end();
}
