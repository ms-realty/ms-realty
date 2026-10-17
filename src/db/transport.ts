import { X509Certificate } from "node:crypto";
import { isIP } from "node:net";
import type { ConnectionOptions } from "node:tls";

export type DatabaseTransportEnv = Readonly<Record<string, string | undefined>>;

export interface DatabaseTransportConfig {
  readonly mode: "direct" | "cloudflared-access-tcp";
  readonly postgresOptions: {
    readonly host?: string;
    readonly port?: number;
    readonly ssl?: ConnectionOptions;
  };
  readonly pgOptions: {
    readonly connectionString: string;
    readonly ssl?: ConnectionOptions;
  };
}

const identifier = /^[a-z][a-z0-9_]*$/;
const dnsName =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const stagingLabel = /(?:^|[.-])(?:stage|staging)(?:[.-]|$)/;

function required(env: DatabaseTransportEnv, name: string): string {
  const value = env[name];
  if (!value || value !== value.trim()) throw new Error(`${name} is required for private TLS.`);
  return value;
}

function stagingCa(env: DatabaseTransportEnv): string {
  const pem = env.DATABASE_TLS_CA_PEM?.trim();
  if (!pem) throw new Error("DATABASE_TLS_CA_PEM is required for private TLS.");
  if (
    !/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END CERTIFICATE-----$/.test(pem)
  )
    throw new Error("DATABASE_TLS_CA_PEM must contain exactly one public CA certificate.");
  try {
    const certificate = new X509Certificate(pem);
    if (
      !certificate.ca ||
      Date.parse(certificate.validFrom) > Date.now() ||
      Date.parse(certificate.validTo) <= Date.now()
    )
      throw new Error("Invalid CA.");
  } catch {
    throw new Error("DATABASE_TLS_CA_PEM must contain a currently valid CA certificate.");
  }
  return pem;
}

/** The approved role URL always retains the remote hostname and verify-full requirement.
 * Only the driver's dial address changes. Access tokens belong to the companion process. */
export function databaseTransport(
  canonicalRoleUrl: string,
  env: DatabaseTransportEnv = process.env,
): DatabaseTransportConfig {
  const mode = env.DATABASE_TRANSPORT;
  if (mode === undefined || mode === "direct")
    return {
      mode: "direct",
      postgresOptions: {},
      pgOptions: { connectionString: canonicalRoleUrl },
    };
  if (mode !== "cloudflared-access-tcp") throw new Error("Unsupported DATABASE_TRANSPORT.");
  if (env.STAGING !== "true" || (env.RELEASE_ENVIRONMENT && env.RELEASE_ENVIRONMENT !== "staging"))
    throw new Error("Private database transport is restricted to explicit staging mode.");

  const host = required(env, "STAGING_DATABASE_HOST");
  const name = required(env, "STAGING_DATABASE_NAME");
  const role = required(env, "STAGING_DATABASE_ROLE");
  if (
    !dnsName.test(host) ||
    isIP(host) !== 0 ||
    host.endsWith(".localhost") ||
    !stagingLabel.test(host) ||
    !identifier.test(name) ||
    name === "ms_realty_payload" ||
    !identifier.test(role)
  )
    throw new Error("Reviewed staging database host, name, and role are required.");
  if (required(env, "TUNNEL_SERVICE_HOSTNAME") !== host)
    throw new Error("Access TCP hostname must equal the reviewed staging database hostname.");
  const listener = required(env, "TUNNEL_SERVICE_URL");
  const portMatch = /^127\.0\.0\.1:([1-9][0-9]{3,4})$/.exec(listener);
  const port = Number(portMatch?.[1]);
  if (!portMatch || port < 1024 || port > 65535)
    throw new Error("Access TCP listener must use numeric loopback and a nonprivileged port.");

  let url: URL;
  try {
    url = new URL(canonicalRoleUrl);
  } catch {
    // URL errors can include their input; do not expose credentials in diagnostics.
    throw new Error("A canonical reviewed staging database role URL is required.");
  }
  if (
    !/^postgres(?:ql)?:$/.test(url.protocol) ||
    url.hostname !== host ||
    url.pathname !== `/${name}` ||
    url.username !== role ||
    !url.password ||
    url.hash ||
    url.searchParams.getAll("sslmode").length !== 1 ||
    url.searchParams.get("sslmode") !== "verify-full" ||
    [...url.searchParams.keys()].some((key) => key !== "sslmode")
  )
    throw new Error(
      "Canonical staging role URL must match reviewed inputs and only use sslmode=verify-full.",
    );

  const ssl: ConnectionOptions = {
    ca: stagingCa(env),
    servername: host,
    rejectUnauthorized: true,
    minVersion: "TLSv1.2",
  };
  // postgres-js gives explicit options precedence over URL settings. pg does the opposite,
  // so its internal URL must have the local dial address and no URL TLS overrides.
  const pgUrl = new URL(url);
  pgUrl.hostname = "127.0.0.1";
  pgUrl.port = String(port);
  pgUrl.searchParams.delete("sslmode");
  return {
    mode,
    postgresOptions: { host: "127.0.0.1", port, ssl },
    pgOptions: { connectionString: pgUrl.toString(), ssl },
  };
}
