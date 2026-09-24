import postgres from "postgres";
import { afterAll, expect, it } from "vitest";

// Proves the integration harness reaches a real Postgres 17 (plan AD15).
const sql = postgres(process.env.TEST_DATABASE_URL ?? "", { max: 1 });

afterAll(async () => {
  await sql.end();
});

it("connects to PostgreSQL 17", async () => {
  const [row] = await sql<
    { version: string }[]
  >`select current_setting('server_version') as version`;
  expect(row?.version).toMatch(/^17\./);
});
