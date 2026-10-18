import { createRequire } from "node:module";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { productionDatabaseTransport } from "./production-transport";
import { databaseTransport } from "./transport";
import { createTlsCertificates } from "./transport-testing";

// Disposable CA and driver construction only; not production connectivity evidence.
let certificates: ReturnType<typeof createTlsCertificates>;
beforeAll(() => {
  certificates = createTlsCertificates();
});
afterAll(() => certificates?.close());
const url =
  "postgres://msr_web:fixture@db.production.msr.invalid/ms_realty_payload?sslmode=verify-full";
const env = () => ({
  STAGING: "false",
  RELEASE_ENVIRONMENT: "production",
  DATABASE_TRANSPORT: "cloudflared-access-tcp",
  PRODUCTION_DATABASE_HOST: "db.production.msr.invalid",
  PRODUCTION_DATABASE_NAME: "ms_realty_payload",
  PRODUCTION_DATABASE_ROLE: "msr_web",
  DATABASE_TLS_CA_PEM: certificates.ca,
  TUNNEL_SERVICE_HOSTNAME: "db.production.msr.invalid",
  TUNNEL_SERVICE_URL: "127.0.0.1:15432",
});

it("both actual driver configurations dial loopback while verifying the reviewed production hostname", async () => {
  const options = databaseTransport(url, env()),
    sql = postgres(url, options.postgresOptions);
  const pg = createRequire(import.meta.url)("pg");
  try {
    const client = new pg.Client(options.pgOptions);
    expect(sql.options.host).toEqual(["127.0.0.1"]);
    expect(sql.options.port).toEqual([15432]);
    expect(client.connectionParameters.host).toBe("127.0.0.1");
    expect(client.connectionParameters.port).toBe(15432);
    expect(client.connectionParameters.ssl).toMatchObject({
      ca: certificates.ca.trim(),
      servername: "db.production.msr.invalid",
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
    });
    expect(sql.options.ssl).toMatchObject({
      servername: "db.production.msr.invalid",
      rejectUnauthorized: true,
    });
    expect(new URL(options.pgOptions.connectionString).search).toBe("");
  } finally {
    await sql.end();
  }
});
it("direct production mode always supplies verified TLS to both drivers", () => {
  const options = productionDatabaseTransport(url, {
    ...env(),
    DATABASE_TRANSPORT: "direct",
    DATABASE_TLS_CA_PEM: undefined,
  });
  expect(options.postgresOptions.ssl).toMatchObject({
    servername: "db.production.msr.invalid",
    rejectUnauthorized: true,
    minVersion: "TLSv1.2",
  });
  expect(options.pgOptions.ssl).toEqual(options.postgresOptions.ssl);
  expect(new URL(options.pgOptions.connectionString).hostname).toBe("db.production.msr.invalid");
});
describe("production remains separate from staging and other least-privilege roles", () => {
  it.each([
    { STAGING: "true" },
    { STAGING: undefined },
    { RELEASE_ENVIRONMENT: "staging" },
    { RELEASE_ENVIRONMENT: undefined },
    { DATABASE_TRANSPORT: undefined },
    { DATABASE_TRANSPORT: "unknown" },
    { PRODUCTION_DATABASE_NAME: "msr_stage" },
    { PRODUCTION_DATABASE_HOST: "db.staging.msr.invalid" },
    { PRODUCTION_DATABASE_HOST: "127.0.0.1" },
    { PRODUCTION_DATABASE_ROLE: "msr_worker" },
    { PRODUCTION_DATABASE_PORT: "5433" },
    { TUNNEL_SERVICE_HOSTNAME: "foreign.invalid" },
    { TUNNEL_SERVICE_URL: "0.0.0.0:15432" },
    { DATABASE_TLS_CA_PEM: "invalid-sensitive-value" },
    { DATABASE_TLS_CA_PEM: undefined },
  ])("rejects incomplete or mismatched production identity %#", (changed) =>
    expect(() => productionDatabaseTransport(url, { ...env(), ...changed })).toThrow(),
  );
  it.each([
    "&ssl=false",
    "&sslmode=verify-full",
    "&host=another.invalid",
    "&sslrootcert=system",
    "&uselibpqcompat=true",
    "#fragment",
  ])("rejects URL overrides %s", (suffix) =>
    expect(() => databaseTransport(url + suffix, env())).toThrow(),
  );
  it("requires an explicit separate credential-store role and does not infer it from the URL", () => {
    const credentialUrl = url.replace("msr_web:", "msr_chatgpt:");
    expect(() => databaseTransport(credentialUrl, env())).toThrow(/separate credential stores/);
    expect(
      databaseTransport(credentialUrl, { ...env(), PRODUCTION_DATABASE_ROLE: "msr_chatgpt" }).mode,
    ).toBe("cloudflared-access-tcp");
  });
  it("rejects wrong production markers through the common dispatch, including direct mode", () => {
    for (const STAGING of [undefined, "true", "0", "FALSE"])
      expect(() =>
        databaseTransport(url, { ...env(), DATABASE_TRANSPORT: "direct", STAGING }),
      ).toThrow();
  });
  it("never prints a malformed role URL or accepts a leaf trust certificate", () => {
    expect(() => databaseTransport("private-invalid-value", env())).toThrow(
      /PRODUCTION_DATABASE_HOST\/NAME\/ROLE/,
    );
    expect(() =>
      databaseTransport(url, { ...env(), DATABASE_TLS_CA_PEM: certificates.serverCertificate }),
    ).toThrow();
    expect(() =>
      databaseTransport(url, { ...env(), DATABASE_TLS_CA_PEM: certificates.ca + certificates.ca }),
    ).toThrow();
  });
});
