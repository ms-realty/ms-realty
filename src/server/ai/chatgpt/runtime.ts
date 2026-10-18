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
  const key = decodeEncryptionKey(env.BUTLER_CHATGPT_ENCRYPTION_KEY);
  const pool = postgres(url, {
    max: 2,
    connect_timeout: 10,
    idle_timeout: 20,
    onnotice: () => {},
    ...databaseTransport(url).postgresOptions,
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
