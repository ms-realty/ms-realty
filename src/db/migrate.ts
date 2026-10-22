// Programmatic migrator: `npm run db:migrate` applies db/migrations to DATABASE_URL, and the
// integration tests call runMigrations() on their disposable databases.
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { databaseTransport } from "./transport";

export const migrationsFolder =
  process.env.MIGRATIONS_FOLDER ?? fileURLToPath(new URL("../../db/migrations", import.meta.url));

export async function runMigrations(url: string): Promise<void> {
  // A single connection: the migrator applies pending migrations in one transaction.
  const client = postgres(url, {
    max: 1,
    onnotice: () => {},
    ...databaseTransport(url).postgresOptions,
  });
  try {
    // One migrator per database, including concurrently restarted deployment jobs. This
    // session lock spans the migration transaction and is released if the process dies.
    await client`select pg_advisory_lock(1297306181)`;
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client`select pg_advisory_unlock(1297306181)`.catch(() => {});
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }
  await runMigrations(url);
  console.log("Migrations applied.");
}
