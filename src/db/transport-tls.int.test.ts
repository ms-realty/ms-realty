import { createRequire } from "node:module";
import { PgBoss } from "pg-boss";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DatabaseTransportEnv, databaseTransport } from "./transport";
import { createPrivateTlsPostgres, fixtureName, fixtureRole } from "./transport-testing";

const pg = createRequire(import.meta.url)("pg");

// Explicit opt-in: this test owns its PG16 container and never consumes TEST_DATABASE_URL.
describe.skipIf(process.env.TEST_PRIVATE_TLS_FIXTURE !== "true")(
  "owned PostgreSQL 16 private TLS",
  () => {
    let fixture: Awaited<ReturnType<typeof createPrivateTlsPostgres>>;
    beforeAll(async () => {
      fixture = await createPrivateTlsPostgres();
    }, 30_000);
    afterAll(async () => {
      await fixture?.close();
    }, 15_000);

    it("postgres-js reaches the staged database using verified TLS over the local dial address", async () => {
      const client = postgres(fixture.url, {
        ...databaseTransport(fixture.url, fixture.env).postgresOptions,
        max: 1,
      });
      try {
        const [row] = await client`
        select current_database() as database, current_user as role,
          current_setting('server_version') as version, ssl
        from pg_stat_ssl where pid = pg_backend_pid()
      `;
        expect(row).toMatchObject({ database: fixtureName, role: fixtureRole, ssl: true });
        expect(row?.version).toMatch(/^16\.14(?:\s|$)/);
      } finally {
        await client.end();
      }
    });

    it("pg and pg-boss establish TLS and complete an isolated queue round trip", async () => {
      const options = databaseTransport(fixture.url, fixture.env).pgOptions;
      const client = new pg.Client(options);
      const boss = new PgBoss({ ...options, max: 1, supervise: false, schedule: false });
      boss.on("error", () => {});
      try {
        await client.connect();
        const result = await client.query(
          "select ssl from pg_stat_ssl where pid = pg_backend_pid()",
        );
        expect(result.rows[0]?.ssl).toBe(true);
        await boss.start();
        await boss.createQueue("transport.qualification");
        const id = await boss.send("transport.qualification", { purpose: "local TLS fixture" });
        const [job] = await boss.fetch("transport.qualification");
        expect(job?.id).toBe(id);
        expect(job?.data).toEqual({ purpose: "local TLS fixture" });
        await boss.complete("transport.qualification", job?.id as string);
        const sessions = await client.query(
          "select s.ssl from pg_stat_activity a join pg_stat_ssl s using (pid) where a.application_name = 'pgboss'",
        );
        expect(sessions.rows.length).toBeGreaterThan(0);
        expect(sessions.rows.every((session: { ssl: boolean }) => session.ssl)).toBe(true);
      } finally {
        await boss.stop();
        await client.end();
      }
    }, 20_000);

    it.each(["postgres-js", "pg"])("%s rejects an untrusted CA", async (driver) => {
      await rejectsTls(
        driver,
        fixture.url,
        { ...fixture.env, DATABASE_TLS_CA_PEM: fixture.untrustedCa },
        /certificate|issuer|self.signed/i,
      );
    });
    it.each(["postgres-js", "pg"])("%s rejects a wrong certificate hostname", async (driver) => {
      const host = "wrong.staging.msr.invalid";
      const url = new URL(fixture.url);
      url.hostname = host;
      await rejectsTls(
        driver,
        url.toString(),
        {
          ...fixture.env,
          STAGING_DATABASE_HOST: host,
          TUNNEL_SERVICE_HOSTNAME: host,
        },
        /hostname|altnames|certificate.s.*name/i,
      );
    });

    async function rejectsTls(
      driver: string,
      url: string,
      env: DatabaseTransportEnv,
      message: RegExp,
    ) {
      const transport = databaseTransport(url, env);
      if (driver === "postgres-js") {
        const client = postgres(url, { ...transport.postgresOptions, max: 1, connect_timeout: 2 });
        try {
          await expect(client`select 1`).rejects.toThrow(message);
        } finally {
          await client.end({ timeout: 1 });
        }
      } else {
        const client = new pg.Client({ ...transport.pgOptions, connectionTimeoutMillis: 2_000 });
        try {
          await expect(client.connect()).rejects.toThrow(message);
        } finally {
          await client.end();
        }
      }
    }
  },
);
