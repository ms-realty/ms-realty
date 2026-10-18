// M-047 / architecture §7.5: the public media route lets caches keep only a currently eligible
// derivative, for at most 5 minutes in a browser and 1 hour in a shared cache; every refusal,
// including after withdrawal, is unstored.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { withRequestDatabase } from "@/db/request-scope";
import { listings, mediaAssets } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { GET } from "../../../app/api/media/[id]/[digest]/route";
import { getEnv } from "../config/env";
import { withdrawPublication } from "../publication/commands";
import {
  createListingFixture,
  type ListingFixture,
  publicationFixtureStorage,
  publishForTest,
} from "../publication/testing";
import { createStaff } from "../testing";

let t: TestDatabase;
let staff: Awaited<ReturnType<typeof createStaff>>;
let fixture: ListingFixture;
let path: { id: string; digest: string };
beforeAll(async () => {
  t = await createTestDatabase();
  staff = await createStaff(t.db, { roles: ["content_editor", "publishing_approver"] });
  fixture = await createListingFixture(t.db, { reviewerId: staff.id });
  await publishForTest(t.db, staff.actor, fixture);
  const [asset] = await t.db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, fixture.assetIds[0] ?? ""));
  if (!asset?.derivativeSha256) throw new Error("Missing published derivative fixture");
  path = { id: asset.id, digest: asset.derivativeSha256 };
});
afterEach(() => {
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await t?.drop();
});

function read(
  { id, digest } = path,
  headers: Record<string, string> = {},
  host = new URL(getEnv().hosts.public).host,
) {
  vi.stubEnv("FILE_STORAGE", "local");
  vi.stubEnv("FILE_STORAGE_ROOT", publicationFixtureStorage.root);
  return withRequestDatabase(t.db, () =>
    GET(
      new Request(`http://${host}/api/media/${id}/${digest}`, { headers: { host, ...headers } }),
      {
        params: Promise.resolve({ id, digest }),
      },
    ),
  );
}

it("serves an eligible derivative with bounded public freshness, also for ranges", async () => {
  const full = await read();
  expect(full.status).toBe(200);
  expect(full.headers.get("content-type")).toBe("image/webp");
  expect(full.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=3600");
  expect(full.headers.has("set-cookie")).toBe(false);
  const part = await read(path, { range: "bytes=0-9" });
  expect(part.status).toBe(206);
  expect(part.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=3600");
  const unsatisfiable = await read(path, { range: "bytes=999999-" });
  expect(unsatisfiable.status).toBe(416);
  expect(unsatisfiable.headers.get("cache-control")).toBe("private, no-store");
});

it("refuses other hosts and digests without anything a cache may keep", async () => {
  for (const response of [
    await read(path, {}, new URL(getEnv().hosts.client).host),
    await read({ ...path, digest: "0".repeat(64) }),
    await read({ ...path, id: "not-a-uuid" }),
  ]) {
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
});

it("withdrawal makes the next origin read a no-store 404 at once", async () => {
  expect((await read()).status).toBe(200);
  const [listing] = await t.db.select().from(listings).where(eq(listings.id, fixture.listingId));
  await withdrawPublication(t.db, {
    actor: staff.actor,
    operationId: randomUUID(),
    expectedRevision: listing?.publicationGeneration ?? 0,
    reference: fixture.reference,
    reason: "Synthetic withdrawal for the cache bound",
  });
  const after = await read();
  expect(after.status).toBe(404);
  expect(after.headers.get("cache-control")).toBe("no-store");
});
