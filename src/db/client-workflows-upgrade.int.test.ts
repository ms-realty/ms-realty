import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { expect, it } from "vitest";
import { migrationsFolder, runMigrations } from "./migrate";

it("R00/C05/C06 canonical37 upgrades the original prefix and remains idempotent with the same schema as a fresh database", async () => {
  const base = process.env.TEST_DATABASE_URL;
  if (!base) throw new Error("Disposable TEST_DATABASE_URL required");
  const admin = postgres(base, { max: 1, onnotice: () => {} }),
    directory = await mkdtemp(join(tmpdir(), "msr-client-prefix-"));
  const journal = JSON.parse(await readFile(join(migrationsFolder, "meta/_journal.json"), "utf8"));
  expect(journal.entries.at(-1).idx).toBe(37);
  expect(journal.entries.at(-1).tag).toBe("0037_client_workflows");
  const prefix = {
    ...journal,
    entries: journal.entries.filter((entry: { idx: number }) => entry.idx < 37),
  };
  await mkdir(join(directory, "meta"));
  await writeFile(join(directory, "meta/_journal.json"), JSON.stringify(prefix));
  for (const entry of prefix.entries)
    await cp(join(migrationsFolder, `${entry.tag}.sql`), join(directory, `${entry.tag}.sql`));
  const names = [
      `test_client_upgrade_${randomUUID().replaceAll("-", "")}`,
      `test_client_fresh_${randomUUID().replaceAll("-", "")}`,
    ],
    urls = names.map((name) => {
      const url = new URL(base);
      url.pathname = `/${name}`;
      return url.toString();
    });
  const clients: postgres.Sql[] = [];
  try {
    for (const name of names) await admin.unsafe(`create database "${name}"`);
    const upgrade = postgres(urls[0] as string, { max: 1, onnotice: () => {} });
    clients.push(upgrade);
    await migrate(drizzle(upgrade), { migrationsFolder: directory });
    expect(
      Number(
        (
          await upgrade`select count(*) as n from information_schema.tables where table_schema='public'`
        )[0]?.n,
      ),
    ).toBe(110);
    await runMigrations(urls[0] as string);
    await runMigrations(urls[1] as string);
    await runMigrations(urls[0] as string);
    const fresh = postgres(urls[1] as string, { max: 1, onnotice: () => {} });
    clients.push(fresh);
    const shape = async (db: postgres.Sql) => ({
      tables:
        await db`select table_name from information_schema.tables where table_schema='public' order by table_name`,
      columns:
        await db`select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position`,
      migrations: Number((await db`select count(*) as n from drizzle.__drizzle_migrations`)[0]?.n),
    });
    const actual = await shape(upgrade);
    expect(actual.tables).toHaveLength(114);
    expect(actual.migrations).toBe(38);
    expect(actual).toEqual(await shape(fresh));
  } finally {
    for (const client of clients) await client.end();
    for (const name of names) await admin.unsafe(`drop database if exists "${name}" with (force)`);
    await admin.end();
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);
