import type { RuntimeEnv, RuntimeRole } from "./runtime-env";

const hex = (size: number, value: string) => new RegExp(`^[a-f0-9]{${size}}$`).test(value);
const value = (env: RuntimeEnv, name: string) =>
  typeof env[name] === "string" ? (env[name] as string) : "";
const requireInput = (condition: unknown) => {
  if (!condition) throw new Error("Explicit reviewed production runtime inputs are required");
};
export const productionOrigins = {
  public: "https://makler-realty.com",
  client: "https://my.makler-realty.com",
  staff: "https://app.makler-realty.com",
};

export function productionContext(env: RuntimeEnv): void {
  requireInput(
    env.STAGING === "false" &&
      env.RELEASE_ENVIRONMENT === "production" &&
      hex(40, value(env, "BUILD_SHA")) &&
      /^sha256:[a-f0-9]{64}$/.test(value(env, "IMAGE_DIGEST")) &&
      [
        "PRODUCTION_INPUTS_SHA256",
        "PRODUCTION_SCHEMA_SHA256",
        "PRODUCTION_ACCEPTED_REPORT_SHA256",
        "PRODUCTION_OWNERSHIP_SHA256",
      ].every((name) => hex(64, value(env, name))) &&
      env.PUBLIC_ORIGIN === productionOrigins.public &&
      env.CLIENT_ORIGIN === productionOrigins.client &&
      env.STAFF_ORIGIN === productionOrigins.staff &&
      env.PRODUCTION_WORKER_NAME === `ms-realty-production-${value(env, "BUILD_SHA").slice(0, 12)}`,
  );
}

/** Secrets are isolated by role; production never reuses a staging DB or operator credential. */
export function productionRuntimeEnvironment(
  env: RuntimeEnv,
  role: RuntimeRole,
): Record<string, string> {
  productionContext(env);
  let url: URL;
  try {
    url = new URL(value(env, `${role.toUpperCase()}_DATABASE_URL`));
  } catch {
    throw new Error("Reviewed production role URL is required");
  }
  const host = value(env, "PRODUCTION_DATABASE_HOST"),
    port = value(env, "PRODUCTION_DATABASE_PORT") || "5432";
  const roles = ["WEB", "WORKER", "MIGRATOR"].map((name) =>
    value(env, `PRODUCTION_${name}_DATABASE_ROLE`),
  );
  requireInput(
    /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) &&
      host.includes(".") &&
      !/^(?:\d+\.){3}\d+$/.test(host) &&
      !/(?:^|[.-])(?:stage|staging|localhost)(?:[.-]|$)/.test(host) &&
      roles.every((name) => /^[a-z][a-z0-9_]+$/.test(name)) &&
      new Set(roles).size === 3 &&
      env.PRODUCTION_DATABASE_NAME === "ms_realty_payload" &&
      /^postgres(?:ql)?:$/.test(url.protocol) &&
      url.hostname === host &&
      (url.port || "5432") === port &&
      url.pathname === "/ms_realty_payload" &&
      url.username === value(env, `PRODUCTION_${role.toUpperCase()}_DATABASE_ROLE`) &&
      url.password &&
      !url.hash &&
      url.searchParams.getAll("sslmode").length === 1 &&
      url.searchParams.get("sslmode") === "verify-full" &&
      [...url.searchParams.keys()].every((name) => name === "sslmode"),
  );
  const transport = value(env, "DATABASE_TRANSPORT");
  requireInput(transport === "direct" || transport === "cloudflared-access-tcp");
  const common: Record<string, string> = {
    NODE_ENV: "production",
    STAGING: "false",
    RELEASE_ENVIRONMENT: "production",
    DATABASE_URL: url.toString(),
    DATABASE_TRANSPORT: transport,
    PRODUCTION_DATABASE_HOST: host,
    PRODUCTION_DATABASE_PORT: port,
    PRODUCTION_DATABASE_NAME: "ms_realty_payload",
    PRODUCTION_DATABASE_ROLE: url.username,
    EXPECTED_SOURCE_COMMIT: value(env, "BUILD_SHA"),
    EXPECTED_IMAGE_DIGEST: value(env, "IMAGE_DIGEST"),
    PRODUCTION_INPUTS_SHA256: value(env, "PRODUCTION_INPUTS_SHA256"),
    PRODUCTION_SCHEMA_SHA256: value(env, "PRODUCTION_SCHEMA_SHA256"),
    ...(value(env, "DATABASE_TLS_CA_PEM")
      ? { DATABASE_TLS_CA_PEM: value(env, "DATABASE_TLS_CA_PEM") }
      : {}),
  };
  if (transport === "cloudflared-access-tcp") {
    requireInput(
      env.TUNNEL_SERVICE_HOSTNAME === host &&
        env.TUNNEL_SERVICE_URL === "127.0.0.1:15432" &&
        value(env, "DATABASE_TLS_CA_PEM").trim() &&
        value(env, "TUNNEL_SERVICE_TOKEN_ID").trim() &&
        value(env, "TUNNEL_SERVICE_TOKEN_SECRET").length >= 32,
    );
    for (const name of [
      "TUNNEL_SERVICE_HOSTNAME",
      "TUNNEL_SERVICE_URL",
      "TUNNEL_SERVICE_TOKEN_ID",
      "TUNNEL_SERVICE_TOKEN_SECRET",
    ])
      common[name] = value(env, name);
  }
  if (role === "migrator") return { ...common, MIGRATIONS_FOLDER: "/app/db/migrations" };
  requireInput(
    env.FILE_STORAGE === "r2" &&
      env.R2_BUCKET === "ms-realty-media" &&
      env.FILE_SCAN_MODE === "clamav",
  );
  const output: Record<string, string> = {
    ...common,
    HOSTNAME: "0.0.0.0",
    PORT: "3000",
    RUNTIME_DEFER_WEB_START: "true",
    APP_ORIGIN: productionOrigins.public,
    CANONICAL_ORIGIN: productionOrigins.public,
    PUBLIC_ORIGIN: productionOrigins.public,
    CLIENT_ORIGIN: productionOrigins.client,
    STAFF_ORIGIN: productionOrigins.staff,
  };
  for (const name of [
    "AUTH_SECRET",
    "WEBAUTHN_RP_NAME",
    "FILE_STORAGE",
    "FILE_SCAN_MODE",
    "CLAMAV_HOST",
    "CLAMAV_PORT",
    "CLAMAV_MAX_SIGNATURE_AGE_HOURS",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
    "R2_JURISDICTION",
    "MEDIA_PUBLIC_BASE_URL",
    "MAP_RELEASE_ID",
    "GTM_CONTAINER_ID",
    "SITE_GOOGLE_VERIFICATION",
  ])
    output[name] = value(env, name);
  requireInput(
    (output.AUTH_SECRET ?? "").length >= 32 &&
      output.CLAMAV_HOST &&
      !/(?:^|[.-])staging(?:[.-]|$)/.test(output.CLAMAV_HOST),
  );
  for (const name of ["CASE_EMAIL_ENABLED", "CASE_INBOUND_ENABLED", "BUTLER_ENABLED"]) {
    const enabled = value(env, name) || "0";
    requireInput(enabled === "0" || enabled === "1");
    if (enabled === "1") requireInput(hex(64, value(env, "PRODUCTION_FEATURE_POLICY_SHA256")));
    output[name] = enabled;
  }
  if (output.BUTLER_ENABLED === "1") {
    for (const name of [
      "BUTLER_CHATGPT_DATABASE_URL",
      "BUTLER_CHATGPT_HOST_KEY",
      "BUTLER_CHATGPT_ENCRYPTION_KEY",
      "BUTLER_CHATGPT_DATABASE_ROLE",
    ]) {
      requireInput(value(env, name).trim());
      output[name] = value(env, name);
    }
    let reviewed: Record<string, unknown>;
    try {
      reviewed = JSON.parse(value(env, "PRODUCTION_BUTLER_VARS_JSON"));
    } catch {
      throw new Error("Reviewed production Butler route and budget inputs are required");
    }
    requireInput(
      reviewed &&
        typeof reviewed === "object" &&
        !Array.isArray(reviewed) &&
        Object.keys(reviewed).length > 0,
    );
    for (const [name, content] of Object.entries(reviewed)) {
      requireInput(
        /^BUTLER_[A-Z0-9_]+$/.test(name) &&
          !/(?:^|_)(?:DATABASE|ENCRYPTION|KEY|SECRET|OPERATOR|ACCESS|REFRESH|TOKEN)(?:_|$)/.test(
            name,
          ) &&
          typeof content === "string" &&
          content.length <= 5 * 1024,
      );
      output[name] = content as string;
    }
  }
  if (role === "web") {
    requireInput(value(env, "ORIGIN_VERIFY_SECRET").length >= 32);
    output.ORIGIN_VERIFY_SECRET = value(env, "ORIGIN_VERIFY_SECRET");
  } else {
    requireInput(
      value(env, "EMAIL_RELAY_SECRET").length >= 32 &&
        value(env, "ACCESS_SERVICE_CLIENT_SECRET").length >= 32,
    );
    Object.assign(output, {
      EMAIL_PROVIDER: "cloudflare",
      EMAIL_FROM: value(env, "EMAIL_FROM"),
      EMAIL_RELAY_URL: `${productionOrigins.staff}/__release/email`,
      EMAIL_RELAY_SECRET: value(env, "EMAIL_RELAY_SECRET"),
      EMAIL_ACCESS_CLIENT_ID: value(env, "ACCESS_SERVICE_CLIENT_ID"),
      EMAIL_ACCESS_CLIENT_SECRET: value(env, "ACCESS_SERVICE_CLIENT_SECRET"),
    });
  }
  return output;
}

export interface ProductionGrant {
  schemaVersion: 1;
  purpose: "production-runtime";
  operation: "migrate" | "activate" | "deactivate";
  operationId: string;
  sourceCommit: string;
  digest: string;
  inputsSha256: string;
  schemaSha256: string;
  acceptedReportSha256: string;
  ownershipSha256: string;
  featurePolicySha256?: string;
  emailPolicySha256?: string;
  issuedAt: string;
  expiresAt: string;
}
/** Verifies an external controller grant; it cannot create approval or checker evidence. */
export async function productionGrant(
  envelope: unknown,
  operation: ProductionGrant["operation"],
  env: RuntimeEnv,
  now = Date.now(),
): Promise<ProductionGrant> {
  productionContext(env);
  try {
    const wrapped = envelope as { payload?: string; signature?: string };
    requireInput(
      typeof wrapped?.payload === "string" &&
        wrapped.payload.length <= 8192 &&
        typeof wrapped.signature === "string",
    );
    const pem = value(env, "PRODUCTION_CONTROLLER_PUBLIC_KEY").trim();
    requireInput(/^-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----$/.test(pem));
    const bytes = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, "")), (c) =>
      c.charCodeAt(0),
    );
    const key = await crypto.subtle.importKey("spki", bytes, { name: "Ed25519" }, false, [
      "verify",
    ]);
    const signature = Uint8Array.from(atob(wrapped.signature as string), (c) => c.charCodeAt(0));
    requireInput(
      await crypto.subtle.verify(
        "Ed25519",
        key,
        signature,
        new TextEncoder().encode(wrapped.payload),
      ),
    );
    const grant = JSON.parse(wrapped.payload as string) as ProductionGrant;
    requireInput(
      grant.schemaVersion === 1 &&
        grant.purpose === "production-runtime" &&
        grant.operation === operation &&
        /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(grant.operationId) &&
        grant.sourceCommit === env.BUILD_SHA &&
        grant.digest === env.IMAGE_DIGEST &&
        grant.inputsSha256 === env.PRODUCTION_INPUTS_SHA256 &&
        grant.schemaSha256 === env.PRODUCTION_SCHEMA_SHA256 &&
        grant.acceptedReportSha256 === env.PRODUCTION_ACCEPTED_REPORT_SHA256 &&
        grant.ownershipSha256 === env.PRODUCTION_OWNERSHIP_SHA256 &&
        Date.parse(grant.issuedAt) <= now &&
        Date.parse(grant.expiresAt) > now &&
        Date.parse(grant.expiresAt) - Date.parse(grant.issuedAt) <=
          (operation === "deactivate" ? 900_000 : 600_000),
    );
    if (
      ["CASE_EMAIL_ENABLED", "CASE_INBOUND_ENABLED", "BUTLER_ENABLED"].some(
        (name) => env[name] === "1",
      )
    )
      requireInput(
        hex(64, value(env, "PRODUCTION_FEATURE_POLICY_SHA256")) &&
          grant.featurePolicySha256 === env.PRODUCTION_FEATURE_POLICY_SHA256,
      );
    if (value(env, "PRODUCTION_EMAIL_POLICY_SHA256"))
      requireInput(
        hex(64, value(env, "PRODUCTION_EMAIL_POLICY_SHA256")) &&
          grant.emailPolicySha256 === env.PRODUCTION_EMAIL_POLICY_SHA256,
      );
    return grant;
  } catch {
    throw new Error("Fresh controller-signed production operation grant is required");
  }
}
