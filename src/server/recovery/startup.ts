import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { databaseTransport } from "@/db/transport";
import { assertRecoveryOpen } from "./quarantine";

/** A startup probe owns its connection; a failed probe must not leave a pool keeping it alive. */
export async function verifyRecoveryStartup(url: string): Promise<void> {
  const client = postgres(url, {
    max: 1,
    connect_timeout: 10,
    onnotice: () => {},
    ...databaseTransport(url).postgresOptions,
  });
  try {
    await assertRecoveryOpen(drizzle(client, { schema }));
  } finally {
    await client.end({ timeout: 2 });
  }
}
