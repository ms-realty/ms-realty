import { createRequire } from "node:module";
import postgres from "postgres";
import { productionDatabaseIdentity, productionDatabaseTransport } from "./production-transport";
import type { DatabaseTransportEnv } from "./transport";

interface ProbeClient {
  connect(): Promise<void>;
  query(statement: string): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}
const pg = createRequire(import.meta.url)("pg") as { Client: new (options: object) => ProbeClient };
const statement = `select current_database() as database, current_user as role,
  current_setting('server_version_num')::int as server_version_num,
  ssl, version as tls_version, cipher
  from pg_stat_ssl where pid = pg_backend_pid()`;

export function productionSession(
  row: Record<string, unknown> | undefined,
  env: DatabaseTransportEnv,
) {
  if (
    row?.database !== "ms_realty_payload" ||
    row.role !== env.PRODUCTION_DATABASE_ROLE ||
    row.server_version_num !== 160014 ||
    row.ssl !== true ||
    !["TLSv1.2", "TLSv1.3"].includes(String(row.tls_version)) ||
    typeof row.cipher !== "string" ||
    !row.cipher
  )
    throw new Error("Actual production SQL TLS session identity mismatch");
  return {
    database: row.database as string,
    role: row.role as string,
    engineVersion: "16.14",
    ssl: true,
    tlsVersion: row.tls_version as string,
    cipher: row.cipher,
  };
}

/** Two actual read-only sessions. Nothing migrates, starts a queue or grants release acceptance. */
export async function probeProductionDatabase(env: DatabaseTransportEnv = process.env) {
  const url = productionDatabaseIdentity(env.DATABASE_URL ?? "", env);
  const transport = productionDatabaseTransport(url.toString(), env);
  const sql = postgres(url.toString(), {
    ...transport.postgresOptions,
    max: 1,
    connect_timeout: 5,
  });
  const client = new pg.Client({
    ...transport.pgOptions,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 5_000,
    query_timeout: 5_000,
  });
  try {
    const first = await sql.begin("read only", async (transaction) => {
      await transaction`set local statement_timeout = '5s'`;
      return productionSession((await transaction.unsafe(statement))[0], env);
    });
    await client.connect();
    await client.query("begin read only");
    const second = productionSession((await client.query(statement)).rows[0], env);
    await client.query("rollback");
    return {
      schemaVersion: 1,
      status: "PASS",
      environment: "production",
      measuredAt: new Date().toISOString(),
      transport: transport.mode,
      tlsVerification: "verify-full",
      drivers: { "postgres-js": first, pg: second },
    };
  } catch {
    throw new Error("Actual read-only production TLS connectivity could not be verified");
  } finally {
    await Promise.allSettled([sql.end({ timeout: 1 }), client.end()]);
  }
}
