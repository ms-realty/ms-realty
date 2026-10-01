export type RuntimeRole = "web" | "worker" | "migrator";
export interface RuntimeEnv {
  [name: string]: unknown;
}
const plain = [
  "PUBLIC_ORIGIN",
  "CLIENT_ORIGIN",
  "STAFF_ORIGIN",
  "APP_ORIGIN",
  "CANONICAL_ORIGIN",
  "AUTH_SECRET",
  "WEBAUTHN_RP_NAME",
  "FILE_STORAGE",
  "CLAMAV_HOST",
  "CLAMAV_PORT",
  "CLAMAV_MAX_SIGNATURE_AGE_HOURS",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "MEDIA_PUBLIC_BASE_URL",
  "MAP_RELEASE_ID",
  "BUILD_SHA",
  "WORKER_HEARTBEAT_URL",
  "GTM_CONTAINER_ID",
  "SITE_GOOGLE_VERIFICATION",
];
const value = (env: RuntimeEnv, key: string): string =>
  typeof env[key] === "string" ? (env[key] as string) : "";
export function runtimeEnvironment(env: RuntimeEnv, role: RuntimeRole): Record<string, string> {
  if (env.STAGING !== "true") throw new Error("Staging adapter cannot start production");
  const database = value(env, `${role.toUpperCase()}_DATABASE_URL`);
  const url = new URL(database);
  if (
    !/^postgres(?:ql)?:$/.test(url.protocol) ||
    !url.hostname ||
    !url.pathname.slice(1) ||
    url.pathname.slice(1) !== value(env, "STAGING_DATABASE_NAME") ||
    url.hostname !== value(env, "STAGING_DATABASE_HOST") ||
    url.username !== value(env, `STAGING_${role.toUpperCase()}_DATABASE_ROLE`) ||
    !url.password ||
    url.searchParams.get("sslmode") !== "verify-full"
  )
    throw new Error("Verified isolated TLS database role is required");
  const output = Object.fromEntries(plain.map((key) => [key, value(env, key)]));
  Object.assign(output, {
    NODE_ENV: "production",
    STAGING: "true",
    HOSTNAME: "0.0.0.0",
    PORT: "3000",
    DATABASE_URL: database,
  });
  if (role === "migrator")
    return {
      NODE_ENV: "production",
      STAGING: "true",
      DATABASE_URL: database,
      MIGRATIONS_FOLDER: "/app/db/migrations",
    };
  if (role === "web") output.ORIGIN_VERIFY_SECRET = value(env, "ORIGIN_VERIFY_SECRET");
  if (role === "worker")
    Object.assign(output, {
      EMAIL_PROVIDER: "cloudflare",
      EMAIL_FROM: value(env, "EMAIL_FROM"),
      EMAIL_RELAY_URL: `${value(env, "PUBLIC_ORIGIN")}/__staging/email`,
      EMAIL_RELAY_SECRET: value(env, "EMAIL_RELAY_SECRET"),
      EMAIL_ACCESS_CLIENT_ID: value(env, "ACCESS_SERVICE_CLIENT_ID"),
      EMAIL_ACCESS_CLIENT_SECRET: value(env, "ACCESS_SERVICE_CLIENT_SECRET"),
      CASE_EMAIL_ENABLED: "0",
      CASE_INBOUND_ENABLED: "0",
      HERMES_ENABLED: "0",
    });
  return output;
}
