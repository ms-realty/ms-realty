import "server-only";
import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { databaseTransport } from "@/db/transport";
import { decodeEncryptionKey, PostgresChatGptStore } from "./store";
import { ChatGptError } from "./types";

export function openChatGptDatabaseStore(
  env: Record<string, string | undefined>,
  role: "runtime" | "operator" = "runtime",
) {
  const url =
    role === "operator"
      ? env.BUTLER_CHATGPT_OPERATOR_DATABASE_URL
      : env.BUTLER_CHATGPT_DATABASE_URL;
  const hostKey = env.BUTLER_CHATGPT_HOST_KEY;
  if (!url || !hostKey) throw new ChatGptError("chatgpt_store_configuration", "configuration");
  const credentialRole =
    role === "operator"
      ? env.BUTLER_CHATGPT_OPERATOR_DATABASE_ROLE
      : env.BUTLER_CHATGPT_DATABASE_ROLE;
  const transportEnv = { ...env };
  if (env.RELEASE_ENVIRONMENT === "production") {
    if (!credentialRole)
      throw new ChatGptError("chatgpt_store_role_configuration", "configuration");
    transportEnv.PRODUCTION_DATABASE_ROLE = credentialRole;
  } else if (env.STAGING === "true" && env.DATABASE_TRANSPORT === "cloudflared-access-tcp") {
    if (!credentialRole)
      throw new ChatGptError("chatgpt_store_role_configuration", "configuration");
    transportEnv.STAGING_DATABASE_ROLE = credentialRole;
  }
  const key = decodeEncryptionKey(env.BUTLER_CHATGPT_ENCRYPTION_KEY);
  const pool = postgres(url, {
    max: 2,
    connect_timeout: 10,
    idle_timeout: 20,
    onnotice: () => {},
    ...databaseTransport(url, transportEnv).postgresOptions,
  });
  const store = new PostgresChatGptStore(drizzle(pool, { schema }), key, hostKey, role);
  return { store, close: () => pool.end() };
}
let cached: { digest: string; handle: ReturnType<typeof openChatGptDatabaseStore> } | undefined;
/** Caches connection/configuration only. Access/refresh tokens are read under the durable lock. */
export function runtimeChatGptStore(
  env: Record<string, string | undefined> = process.env,
): PostgresChatGptStore {
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        env.BUTLER_CHATGPT_DATABASE_URL,
        env.BUTLER_CHATGPT_HOST_KEY,
        env.BUTLER_CHATGPT_ENCRYPTION_KEY,
        env.BUTLER_CHATGPT_DATABASE_ROLE,
        env.STAGING,
        env.RELEASE_ENVIRONMENT,
        env.DATABASE_TRANSPORT,
        env.PRODUCTION_DATABASE_HOST,
        env.PRODUCTION_DATABASE_NAME,
        env.PRODUCTION_DATABASE_PORT,
        env.STAGING_DATABASE_HOST,
        env.STAGING_DATABASE_NAME,
        env.DATABASE_TLS_CA_PEM,
        env.TUNNEL_SERVICE_HOSTNAME,
        env.TUNNEL_SERVICE_URL,
      ]),
    )
    .digest("hex");
  if (!cached || cached.digest !== digest) {
    const previous = cached;
    cached = { digest, handle: openChatGptDatabaseStore(env) };
    if (previous) void previous.handle.close();
  }
  return cached.handle.store;
}
