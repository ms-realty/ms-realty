import { X509Certificate } from "node:crypto";
import { isIP } from "node:net";
import type { DatabaseTransportConfig, DatabaseTransportEnv } from "./transport";

const fail = () => {
  throw new Error(
    "Explicit reviewed production database TLS identity is required: PRODUCTION_DATABASE_HOST/NAME/ROLE and verify-full; separate credential stores need their own explicit role binding.",
  );
};
const identifier = /^[a-z][a-z0-9_]*$/;
const dnsName =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

export function productionDatabaseIdentity(
  canonicalRoleUrl: string,
  env: DatabaseTransportEnv,
): URL {
  let url: URL;
  try {
    url = new URL(canonicalRoleUrl);
  } catch {
    return fail();
  }
  const host = env.PRODUCTION_DATABASE_HOST ?? "",
    port = env.PRODUCTION_DATABASE_PORT ?? "5432";
  if (
    env.STAGING !== "false" ||
    env.RELEASE_ENVIRONMENT !== "production" ||
    !dnsName.test(host) ||
    isIP(host) !== 0 ||
    host.endsWith(".localhost") ||
    /(?:^|[.-])(?:stage|staging|localhost)(?:[.-]|$)/.test(host) ||
    env.PRODUCTION_DATABASE_NAME !== "ms_realty_payload" ||
    !identifier.test(env.PRODUCTION_DATABASE_ROLE ?? "") ||
    !/^[1-9][0-9]{0,4}$/.test(port) ||
    Number(port) > 65535 ||
    !/^postgres(?:ql)?:$/.test(url.protocol) ||
    url.hostname !== host ||
    (url.port || "5432") !== port ||
    url.pathname !== "/ms_realty_payload" ||
    url.username !== env.PRODUCTION_DATABASE_ROLE ||
    !url.password ||
    url.hash ||
    url.searchParams.getAll("sslmode").length !== 1 ||
    url.searchParams.get("sslmode") !== "verify-full" ||
    [...url.searchParams.keys()].some((key) => key !== "sslmode")
  )
    return fail();
  return url;
}

function reviewedCa(value: string | undefined): string | undefined {
  if (value === undefined || value === "") return undefined;
  const pem = value.trim();
  if (
    !/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END CERTIFICATE-----$/.test(pem)
  )
    return fail();
  try {
    const certificate = new X509Certificate(pem);
    if (
      !certificate.ca ||
      Date.parse(certificate.validFrom) > Date.now() ||
      Date.parse(certificate.validTo) <= Date.now()
    )
      return fail();
  } catch {
    return fail();
  }
  return pem;
}

/** Separate production contract; it never converts production inputs into staging identities. */
export function productionDatabaseTransport(
  canonicalRoleUrl: string,
  env: DatabaseTransportEnv = process.env,
): DatabaseTransportConfig {
  const url = productionDatabaseIdentity(canonicalRoleUrl, env),
    mode = env.DATABASE_TRANSPORT;
  if (mode !== "direct" && mode !== "cloudflared-access-tcp") return fail();
  const ca = reviewedCa(env.DATABASE_TLS_CA_PEM);
  const ssl = {
    ...(ca ? { ca } : {}),
    servername: url.hostname,
    rejectUnauthorized: true,
    minVersion: "TLSv1.2" as const,
  };
  const pgUrl = new URL(url);
  pgUrl.searchParams.delete("sslmode");
  if (mode === "direct")
    return {
      mode,
      postgresOptions: { ssl },
      pgOptions: { connectionString: pgUrl.toString(), ssl },
    };
  if (
    !ca ||
    env.TUNNEL_SERVICE_HOSTNAME !== url.hostname ||
    env.TUNNEL_SERVICE_URL !== "127.0.0.1:15432"
  )
    return fail();
  pgUrl.hostname = "127.0.0.1";
  pgUrl.port = "15432";
  return {
    mode,
    postgresOptions: { host: "127.0.0.1", port: 15432, ssl },
    pgOptions: { connectionString: pgUrl.toString(), ssl },
  };
}
