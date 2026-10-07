import { createRequire } from "node:module";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DatabaseTransportEnv, databaseTransport } from "./transport";
import {
  createTlsCertificates,
  transportFixtureEnv,
  transportFixtureUrl,
} from "./transport-testing";

let certificates: ReturnType<typeof createTlsCertificates>;
let env: DatabaseTransportEnv;
const canonical = transportFixtureUrl();
// pg is pg-boss's installed driver; it has no declaration package in this workspace.
const pg = createRequire(import.meta.url)("pg");

beforeAll(() => {
  certificates = createTlsCertificates();
  env = transportFixtureEnv(certificates.ca);
});
afterAll(() => certificates?.close());

it("preserves direct connection behavior when transport is absent or direct", () => {
  for (const config of [{}, { DATABASE_TRANSPORT: "direct", STAGING: "false" }]) {
    expect(databaseTransport("unchanged-direct-url", config)).toEqual({
      mode: "direct",
      postgresOptions: {},
      pgOptions: { connectionString: "unchanged-direct-url" },
    });
  }
});

it("both real drivers dial numeric loopback and retain verified remote TLS identity", async () => {
  const result = databaseTransport(canonical, env);
  const js = postgres(canonical, result.postgresOptions);
  try {
    expect(js.options.host).toEqual(["127.0.0.1"]);
    expect(js.options.port).toEqual([15432]);
    expect(js.options.ssl).toMatchObject({
      ca: certificates.ca.trim(),
      servername: "db.staging.msr.invalid",
      rejectUnauthorized: true,
    });
    const client = new pg.Client(result.pgOptions);
    expect(client.connectionParameters.host).toBe("127.0.0.1");
    expect(client.connectionParameters.port).toBe(15432);
    expect(client.connectionParameters.ssl).toMatchObject({
      ca: certificates.ca.trim(),
      servername: "db.staging.msr.invalid",
      rejectUnauthorized: true,
    });
    expect(new URL(canonical).hostname).toBe("db.staging.msr.invalid");
    expect(new URL(canonical).searchParams.get("sslmode")).toBe("verify-full");
    expect(new URL(result.pgOptions.connectionString).search).toBe("");
  } finally {
    await js.end();
  }
});

describe("private transport fails closed", () => {
  it.each([
    "STAGING_DATABASE_HOST",
    "STAGING_DATABASE_NAME",
    "STAGING_DATABASE_ROLE",
    "TUNNEL_SERVICE_HOSTNAME",
    "TUNNEL_SERVICE_URL",
    "DATABASE_TLS_CA_PEM",
  ])("rejects missing %s", (name) => {
    expect(() => databaseTransport(canonical, { ...env, [name]: undefined })).toThrow();
  });
  it.each([
    { DATABASE_TRANSPORT: "" },
    { DATABASE_TRANSPORT: "other" },
    { STAGING: "false" },
    { STAGING: undefined },
    { RELEASE_ENVIRONMENT: "production" },
    { STAGING_DATABASE_HOST: "db.production.msr.invalid" },
    { STAGING_DATABASE_HOST: "127.0.0.1" },
    { STAGING_DATABASE_NAME: "ms_realty_payload" },
    { TUNNEL_SERVICE_HOSTNAME: "other.staging.msr.invalid" },
    { TUNNEL_SERVICE_URL: "localhost:15432" },
    { TUNNEL_SERVICE_URL: "0.0.0.0:15432" },
    { TUNNEL_SERVICE_URL: "127.0.0.1:543" },
    { TUNNEL_SERVICE_URL: "127.0.0.1:65536" },
    { TUNNEL_SERVICE_URL: "127.0.0.1:015432" },
    { DATABASE_TLS_CA_PEM: "not a certificate" },
  ])("rejects invalid reviewed configuration %#", (override) => {
    expect(() => databaseTransport(canonical, { ...env, ...override })).toThrow();
  });
  it("rejects a leaf certificate or certificate bundle as CA trust", () => {
    for (const pem of [certificates.serverCertificate, certificates.ca + certificates.ca])
      expect(() => databaseTransport(canonical, { ...env, DATABASE_TLS_CA_PEM: pem })).toThrow();
  });
  it.each([
    "&sslrootcert=system",
    "&sslcert=client.crt",
    "&sslkey=client.key",
    "&ssl=false",
    "&host=other.staging.msr.invalid",
    "&port=5433",
    "&servername=other.staging.msr.invalid",
    "&sslnegotiation=direct",
    "&uselibpqcompat=true",
    "&sslmode=verify-full",
    "&options=-cfoo=bar",
  ])("rejects URL/query overrides %s", (query) => {
    expect(() => databaseTransport(canonical + query, env)).toThrow();
  });
  it.each([
    canonical.replace("sslmode=verify-full", "sslmode=require"),
    canonical.replace("?sslmode=verify-full", ""),
    canonical.replace("db.staging.msr.invalid", "db.production.msr.invalid"),
    canonical.replace("msr_transport_staging", "ms_realty_payload"),
    canonical.replace("msr_staging_transport:", "postgres:"),
    canonical.replace("postgres:", "https:"),
    `${canonical}#fragment`,
  ])("rejects a URL outside approved staging identity %#", (url) => {
    expect(() => databaseTransport(url, env)).toThrow();
  });
  it("redacts malformed URL input from diagnostics", () => {
    expect(() => databaseTransport("invalid-sensitive-input", env)).toThrow(
      "A canonical reviewed staging database role URL is required.",
    );
  });
});
