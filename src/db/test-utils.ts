// Integration-test harness: each test file gets its own freshly migrated database on the
// disposable server named by TEST_DATABASE_URL, and drops it afterwards.
import { randomUUID } from "node:crypto";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { runMigrations } from "./migrate";
import * as schema from "./schema";

export interface TestDatabase {
  readonly url: string;
  readonly sql: postgres.Sql;
  readonly db: PostgresJsDatabase<typeof schema>;
  drop(): Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const baseUrl = process.env.TEST_DATABASE_URL;
  if (!baseUrl) throw new Error("TEST_DATABASE_URL is required for integration tests.");
  const name = `test_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(baseUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database "${name}"`);

  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  await runMigrations(url.toString());

  const sql = postgres(url.toString(), { max: 4, onnotice: () => {} });
  return {
    url: url.toString(),
    sql,
    db: drizzle(sql, { schema }),
    async drop() {
      await sql.end();
      await admin.unsafe(`drop database if exists "${name}" with (force)`);
      await admin.end();
    },
  };
}
