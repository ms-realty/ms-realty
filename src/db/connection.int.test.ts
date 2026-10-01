import postgres from "postgres";
import { afterAll, expect, it } from "vitest";

// Provider readback on 2026-10-01: existing MS Realty PostgreSQL is 16.14 (ADR 0004).
const sql = postgres(process.env.TEST_DATABASE_URL ?? "", { max: 1 });

afterAll(async () => {
  await sql.end();
});

it("connects to the verified provider's PostgreSQL 16", async () => {
  const [row] = await sql<
    { version: string }[]
  >`select current_setting('server_version') as version`;
  expect(row?.version).toMatch(/^16\./);
});
