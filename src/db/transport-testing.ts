// Owned disposable TLS material for transport tests. No committed keys or provider access.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import postgres from "postgres";
import { type DatabaseTransportEnv, databaseTransport } from "./transport";

export const fixtureHost = "db.staging.msr.invalid";
export const fixtureName = "msr_transport_staging";
export const fixtureRole = "msr_staging_transport";
const fixturePassword = randomUUID();

export function createTlsCertificates() {
  const directory = mkdtempSync(join(tmpdir(), "msr-private-tls-"));
  const openssl = (args: string[]) =>
    execFileSync("openssl", args, { cwd: directory, stdio: "ignore" });
  try {
    for (const ca of ["ca", "untrusted-ca"]) {
      openssl([
        "req",
        "-x509",
        "-newkey",
        "ec",
        "-pkeyopt",
        "ec_paramgen_curve:prime256v1",
        "-nodes",
        "-keyout",
        `${ca}.key`,
        "-out",
        `${ca}.crt`,
        "-days",
        "2",
        "-subj",
        `/CN=MSR disposable ${ca}`,
        "-addext",
        "basicConstraints=critical,CA:TRUE",
      ]);
    }
    openssl([
      "req",
      "-new",
      "-newkey",
      "ec",
      "-pkeyopt",
      "ec_paramgen_curve:prime256v1",
      "-nodes",
      "-keyout",
      "server.key",
      "-out",
      "server.csr",
      "-subj",
      `/CN=${fixtureHost}`,
    ]);
    writeFileSync(
      join(directory, "server.ext"),
      `basicConstraints=critical,CA:FALSE\nsubjectAltName=DNS:${fixtureHost}\nextendedKeyUsage=serverAuth\n`,
    );
    openssl([
      "x509",
      "-req",
      "-in",
      "server.csr",
      "-CA",
      "ca.crt",
      "-CAkey",
      "ca.key",
      "-CAcreateserial",
      "-out",
      "server.crt",
      "-days",
      "2",
      "-extfile",
      "server.ext",
    ]);
    return {
      directory,
      ca: readFileSync(join(directory, "ca.crt"), "utf8"),
      untrustedCa: readFileSync(join(directory, "untrusted-ca.crt"), "utf8"),
      serverCertificate: readFileSync(join(directory, "server.crt"), "utf8"),
      close: () => rmSync(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

export function transportFixtureEnv(ca: string, port = 15432): DatabaseTransportEnv {
  return {
    DATABASE_TRANSPORT: "cloudflared-access-tcp",
    STAGING: "true",
    RELEASE_ENVIRONMENT: "staging",
    STAGING_DATABASE_HOST: fixtureHost,
    STAGING_DATABASE_NAME: fixtureName,
    STAGING_DATABASE_ROLE: fixtureRole,
    TUNNEL_SERVICE_HOSTNAME: fixtureHost,
    TUNNEL_SERVICE_URL: `127.0.0.1:${port}`,
    DATABASE_TLS_CA_PEM: ca,
  };
}

export function transportFixtureUrl(host = fixtureHost): string {
  return `postgres://${fixtureRole}:${fixturePassword}@${host}:5432/${fixtureName}?sslmode=verify-full`;
}

/** Starts/stops only its own labelled container and never pulls an image.
 * Proves driver TLS on a local forward address, not Access/Tunnel/provider connectivity. */
export async function createPrivateTlsPostgres() {
  const certificates = createTlsCertificates();
  const name = `msr-private-tls-${randomUUID()}`;
  let containerId: string | undefined;
  let bootstrap: postgres.Sql | undefined;
  const docker = (args: string[]) =>
    execFileSync("docker", args, { encoding: "utf8", timeout: 30_000 }).trim();
  try {
    containerId = docker([
      "run",
      "--detach",
      "--rm",
      "--pull",
      "never",
      "--name",
      name,
      "--label",
      "com.ms-realty.fixture=private-tls",
      "--label",
      "com.ms-realty.owner=transport-tests",
      "--env",
      `POSTGRES_USER=${fixtureRole}`,
      "--env",
      `POSTGRES_PASSWORD=${fixturePassword}`,
      "--env",
      `POSTGRES_DB=${fixtureName}`,
      "--publish",
      "127.0.0.1::5432",
      "--mount",
      `type=bind,src=${certificates.directory},dst=/fixture,readonly`,
      "--entrypoint",
      "sh",
      "postgres:16.14-alpine",
      "-c",
      "cp /fixture/server.crt /tmp/msr-server.crt && cp /fixture/server.key /tmp/msr-server.key && " +
        "chown postgres:postgres /tmp/msr-server.crt /tmp/msr-server.key && chmod 600 /tmp/msr-server.key && " +
        "exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/tmp/msr-server.crt -c ssl_key_file=/tmp/msr-server.key -c ssl_min_protocol_version=TLSv1.2",
    ]);
    const mapping = docker(["port", containerId, "5432/tcp"]);
    const port = Number(/^127\.0\.0\.1:([0-9]+)$/.exec(mapping)?.[1]);
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
      throw new Error("Owned TLS fixture did not receive a loopback-only port.");
    const env = transportFixtureEnv(certificates.ca, port);
    const url = transportFixtureUrl();
    bootstrap = postgres(url, {
      ...databaseTransport(url, env).postgresOptions,
      max: 1,
      connect_timeout: 1,
      onnotice: () => {},
    });
    const deadline = Date.now() + 15_000;
    while (true) {
      try {
        await bootstrap`select 1`;
        break;
      } catch (error) {
        if (Date.now() >= deadline) throw error;
        await setTimeout(100);
      }
    }
    await bootstrap.end();
    bootstrap = undefined;
    const ownedId = containerId;
    return {
      ...certificates,
      containerId: ownedId,
      env,
      url,
      port,
      async close() {
        try {
          docker(["stop", "--time", "3", ownedId]);
        } finally {
          certificates.close();
        }
      },
    };
  } catch (error) {
    await bootstrap?.end({ timeout: 1 });
    try {
      if (containerId) docker(["stop", "--time", "3", containerId]);
    } finally {
      certificates.close();
    }
    throw error;
  }
}
