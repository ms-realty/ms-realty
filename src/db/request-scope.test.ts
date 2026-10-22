import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, expect, it, vi } from "vitest";
import { getDb } from "./client";
import { requestDatabase, withRequestDatabase } from "./request-scope";
import * as schema from "./schema";

const clients = [
  postgres("postgres://localhost/fixture_a"),
  postgres("postgres://localhost/fixture_b"),
];
afterAll(async () => {
  await Promise.all(clients.map((c) => c.end()));
  vi.unstubAllEnvs();
});

it("does not share a Cloudflare database across overlapping asynchronous requests", async () => {
  vi.stubEnv("DATABASE_RUNTIME", "cloudflare");
  const a = drizzle(clients[0] as NonNullable<(typeof clients)[0]>, { schema });
  const b = drizzle(clients[1] as NonNullable<(typeof clients)[1]>, { schema });
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await Promise.all([
    withRequestDatabase(a, async () => {
      expect(getDb()).toBe(a);
      await gate;
      expect(getDb()).toBe(a);
    }),
    withRequestDatabase(b, async () => {
      expect(getDb()).toBe(b);
      await Promise.resolve();
      expect(getDb()).toBe(b);
      release();
    }),
  ]);
  expect(requestDatabase()).toBeUndefined();
  expect(() => getDb()).toThrow("scoped Hyperdrive");
});
