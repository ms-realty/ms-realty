// The application's database handle (server only). Created lazily on first use so builds
// and routes that never touch the database need no DATABASE_URL.
import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

// Survives dev-server module reloads so each reload does not open a new pool.
const cache = globalThis as { __msRealtyDb?: Database };

export function getDb(): Database {
  if (cache.__msRealtyDb) return cache.__msRealtyDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required.");
  const client = postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    // Recycle connections so a failover or DNS change is picked up within 30 minutes.
    max_lifetime: 60 * 30,
    onnotice: () => {},
  });
  cache.__msRealtyDb = drizzle(client, { schema });
  return cache.__msRealtyDb;
}
