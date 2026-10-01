import postgres from "postgres";
import { afterAll, expect, it } from "vitest";

// Proves the integration harness reaches a real PostgreSQL 16.14, the existing provider engine (2026-10-01 launch gate).
const sql = postgres(process.env.TEST_DATABASE_URL ?? "", { max: 1 });

afterAll(async () => {
  await sql.end();
});

it("connects to provider-pinned PostgreSQL 16.14", async () => {
  const [row] = await sql<
    { version: string }[]
  >`select current_setting('server_version') as version`;
  expect(row?.version).toMatch(/^16\.14(?:\s|$)/);
});
