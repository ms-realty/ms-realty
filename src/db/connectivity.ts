import { createRequire } from "node:module";
import postgres from "postgres";
import { type DatabaseTransportEnv, databaseTransport } from "./transport";

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

/** Read-only identities from both deployed drivers. No migrations, queue or application imports. */
export async function probeStagingDatabase(env: DatabaseTransportEnv = process.env) {
  const url = new URL(env.DATABASE_URL ?? "");
  if (
    env.STAGING !== "true" ||
    (env.RELEASE_ENVIRONMENT && env.RELEASE_ENVIRONMENT !== "staging") ||
    !/^postgres(?:ql)?:$/.test(url.protocol) ||
    url.hostname !== env.STAGING_DATABASE_HOST ||
    url.pathname !== `/${env.STAGING_DATABASE_NAME}` ||
    env.STAGING_DATABASE_NAME === "ms_realty_payload" ||
    url.username !== env.STAGING_DATABASE_ROLE ||
    !url.password ||
    url.hash ||
    url.searchParams.getAll("sslmode").length !== 1 ||
    url.searchParams.get("sslmode") !== "verify-full" ||
    [...url.searchParams.keys()].some((key) => key !== "sslmode")
  )
    throw new Error("Reviewed isolated staging database identity is required");
  const transport = databaseTransport(url.toString(), env);
  const directSsl = {
    servername: url.hostname,
    rejectUnauthorized: true,
    minVersion: "TLSv1.2" as const,
  };
  const directPgUrl = new URL(url);
  directPgUrl.searchParams.delete("sslmode");
  const sql = postgres(url.toString(), {
    ...transport.postgresOptions,
    ssl: transport.postgresOptions.ssl ?? directSsl,
    max: 1,
    connect_timeout: 5,
  });
  const client = new pg.Client({
    ...(transport.mode === "direct"
      ? { connectionString: directPgUrl.toString(), ssl: directSsl }
      : transport.pgOptions),
    connectionTimeoutMillis: 5_000,
    statement_timeout: 5_000,
    query_timeout: 5_000,
  });
  const check = (row: Record<string, unknown> | undefined) => {
    if (
      !row ||
      row.database !== env.STAGING_DATABASE_NAME ||
      row.role !== env.STAGING_DATABASE_ROLE ||
      row.server_version_num !== 160014 ||
      row.ssl !== true ||
      !["TLSv1.2", "TLSv1.3"].includes(String(row.tls_version)) ||
      typeof row.cipher !== "string" ||
      !row.cipher
    )
      throw new Error("Staging TLS session identity mismatch");
    return {
      database: row.database as string,
      role: row.role as string,
      engineVersion: "16.14",
      ssl: true,
      tlsVersion: row.tls_version as string,
      cipher: row.cipher,
    };
  };
  try {
    const first = await sql.begin("read only", async (transaction) => {
      await transaction`set local statement_timeout = '5s'`;
      return check((await transaction.unsafe(statement))[0]);
    });
    await client.connect();
    await client.query("begin read only");
    const second = check((await client.query(statement)).rows[0]);
    await client.query("rollback");
    return {
      schemaVersion: 1,
      status: "PASS",
      measuredAt: new Date().toISOString(),
      transport: transport.mode,
      tlsVerification: "verify-full",
      drivers: { "postgres-js": first, pg: second },
    };
  } catch {
    // Driver errors can contain connection details. Return only a fixed, redacted failure.
    throw new Error("Actual read-only staging TLS connectivity could not be verified");
  } finally {
    await Promise.allSettled([sql.end({ timeout: 1 }), client.end()]);
  }
}
