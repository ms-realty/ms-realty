import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/db/migrate";
import { databaseTransport } from "@/db/transport";
import { createPrivateTlsPostgres } from "@/db/transport-testing";
import { verifyRecoveryStartup } from "./startup";

// Explicit local fixture only: does not consume the integration harness's database URL.
describe.skipIf(process.env.TEST_PRIVATE_TLS_FIXTURE !== "true")(
  "startup probe over private PostgreSQL TLS",
  () => {
    let fixture: Awaited<ReturnType<typeof createPrivateTlsPostgres>>;
    beforeAll(async () => {
      fixture = await createPrivateTlsPostgres();
      for (const [key, value] of Object.entries(fixture.env)) vi.stubEnv(key, value);
      await runMigrations(fixture.url);
    }, 30_000);
    afterAll(async () => {
      vi.unstubAllEnvs();
      await fixture?.close();
    }, 15_000);

    it("opens its startup connection using the canonical stage URL and verified loopback TLS", async () => {
      await expect(verifyRecoveryStartup(fixture.url)).resolves.toBeUndefined();
    }, 15_000);

    it("still fails closed when the persistent recovery control is unavailable", async () => {
      const client = postgres(fixture.url, {
        ...databaseTransport(fixture.url, fixture.env).postgresOptions,
        max: 1,
      });
      try {
        await client`delete from recovery_control where key = 'runtime'`;
        await expect(verifyRecoveryStartup(fixture.url)).rejects.toThrow("Recovery quarantine");
      } finally {
        await client.end();
      }
    }, 15_000);
  },
);
