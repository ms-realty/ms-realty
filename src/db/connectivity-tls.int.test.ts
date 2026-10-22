import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { probeStagingDatabase } from "./connectivity";
import {
  createPrivateTlsPostgres,
  fixtureHost,
  fixtureName,
  fixtureRole,
} from "./transport-testing";

describe.skipIf(process.env.TEST_PRIVATE_TLS_FIXTURE !== "true")(
  "read-only staged connection receipt",
  () => {
    let fixture: Awaited<ReturnType<typeof createPrivateTlsPostgres>>;
    beforeAll(async () => {
      fixture = await createPrivateTlsPostgres();
    }, 30_000);
    afterAll(async () => {
      await fixture?.close();
    }, 15_000);
    it("measures PG16.14, TLS and identity through both deployed drivers without app startup", async () => {
      const proof = await probeStagingDatabase({ ...fixture.env, DATABASE_URL: fixture.url });
      expect(proof).toMatchObject({
        schemaVersion: 1,
        status: "PASS",
        transport: "cloudflared-access-tcp",
        tlsVerification: "verify-full",
      });
      for (const driver of ["postgres-js", "pg"] as const)
        expect(proof.drivers[driver]).toMatchObject({
          database: fixtureName,
          role: fixtureRole,
          engineVersion: "16.14",
          ssl: true,
        });
    });
    it("cannot mint a receipt after TLS or staging identity fails", async () => {
      await expect(
        probeStagingDatabase({
          ...fixture.env,
          DATABASE_URL: fixture.url,
          DATABASE_TLS_CA_PEM: fixture.untrustedCa,
        }),
      ).rejects.toThrow();
      const wrong = new URL(fixture.url);
      wrong.hostname = `wrong.${fixtureHost}`;
      await expect(
        probeStagingDatabase({
          ...fixture.env,
          DATABASE_URL: wrong.toString(),
          STAGING_DATABASE_HOST: wrong.hostname,
          TUNNEL_SERVICE_HOSTNAME: wrong.hostname,
        }),
      ).rejects.toThrow();
      await expect(
        probeStagingDatabase({ ...fixture.env, DATABASE_URL: fixture.url, STAGING: "false" }),
      ).rejects.toThrow();
    });
  },
);
