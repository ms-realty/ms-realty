import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, expect, it } from "vitest";
import { runMigrations } from "@/db/migrate";
import * as schema from "@/db/schema";

const execute = promisify(execFile);
const name = `msr_e2e_${randomUUID().replaceAll("-", "")}`;
const authSecret = randomUUID() + randomUUID();
let admin: postgres.Sql;
let connection: postgres.Sql;
let db: ReturnType<typeof drizzle<typeof schema>>;
let targetUrl: string;
let storage: string;
let propertyId: string;
let created = false;

async function seed() {
  const result = await execute(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "src/features/ai/testing/workspace-seed.ts"],
    {
      env: {
        ...process.env,
        AUTH_SECRET: authSecret,
        DATABASE_URL: targetUrl,
        E2E_DATABASE_URL: targetUrl,
        E2E_FILE_STORAGE_ROOT: storage,
        STAGING: "true",
        APP_ORIGIN: "http://localhost:3168",
        PUBLIC_ORIGIN: "http://localhost:3168",
        CLIENT_ORIGIN: "http://my.localhost:3168",
        STAFF_ORIGIN: "http://app.localhost:3168",
        MEDIA_PUBLIC_BASE_URL: "http://localhost:3168/media",
        CANONICAL_ORIGIN: "https://makler-realty.com",
      },
      maxBuffer: 1024 * 1024,
    },
  );
  return JSON.parse(result.stdout.trim()) as {
    id: string;
    listingId: string;
    listingReference: string;
  };
}

beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL) throw new Error("Disposable TEST_DATABASE_URL required");
  const url = new URL(process.env.TEST_DATABASE_URL);
  admin = postgres(url.toString(), { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database "${name}"`);
  created = true;
  url.pathname = `/${name}`;
  targetUrl = url.toString();
  storage = await mkdtemp(join(tmpdir(), "msr-workspace-seed-regression-"));
  await runMigrations(targetUrl);
  connection = postgres(targetUrl, { max: 4, onnotice: () => {} });
  db = drizzle(connection, { schema });
  const initial = await seed();
  const [listing] = await db
    .select({ propertyId: schema.listings.propertyId })
    .from(schema.listings)
    .where(eq(schema.listings.id, initial.listingId));
  if (!listing) throw new Error("Missing isolated seed bootstrap");
  propertyId = listing.propertyId;
}, 20_000);

afterAll(async () => {
  await connection?.end();
  if (created) await admin.unsafe(`drop database "${name}" with (force)`);
  await admin?.end();
  if (storage) await rm(storage, { recursive: true, force: true });
});

it("seeds beside the exact large MS reference from the broader browser fixtures", async () => {
  await db
    .insert(schema.listings)
    .values({ reference: "MS-186849008066579", propertyId, purpose: "sale" });
  const next = await seed();
  expect(next.listingReference).toBe("MS-186849008066580");
  const [saved] = await db
    .select()
    .from(schema.listings)
    .where(eq(schema.listings.id, next.listingId));
  expect(saved?.reference).toBe(next.listingReference);
  expect(saved?.editorialState).toBe("approved_revision");
  const pointers = await db
    .select()
    .from(schema.currentPublications)
    .where(eq(schema.currentPublications.listingId, next.listingId));
  expect(pointers.some((pointer) => pointer.state === "active")).toBe(true);
}, 15_000);

it("keeps concurrent allocations distinct and exact beyond Number and int64 precision", async () => {
  const largest = 90071992547409931234567890n;
  await db.insert(schema.listings).values([
    { reference: `MS-${largest}`, propertyId, purpose: "sale" },
    { reference: "MS-PROPOSAL-mixed-fixture", propertyId, purpose: "sale" },
    { reference: "MS-00001", propertyId, purpose: "sale" },
  ]);
  const seeded = await Promise.all([seed(), seed(), seed()]);
  expect(new Set(seeded.map((item) => item.listingId)).size).toBe(3);
  expect(seeded.map((item) => item.listingReference).sort()).toEqual(
    [1n, 2n, 3n].map((offset) => `MS-${largest + offset}`),
  );
  for (const item of seeded) {
    const [saved] = await db
      .select()
      .from(schema.listings)
      .where(eq(schema.listings.id, item.listingId));
    expect(saved?.reference).toBe(item.listingReference);
    expect(saved?.editorialState).toBe("approved_revision");
    const pointers = await db
      .select()
      .from(schema.currentPublications)
      .where(eq(schema.currentPublications.listingId, item.listingId));
    expect(pointers.some((pointer) => pointer.state === "active")).toBe(true);
    const [workspace] = await db
      .select()
      .from(schema.generativeSessions)
      .where(eq(schema.generativeSessions.id, item.id));
    expect(workspace?.contextPins.some((pin) => pin.key === `listing:${item.listingId}`)).toBe(
      true,
    );
  }
}, 20_000);
