import { randomBytes, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { openChatGptDatabaseStore } from "./runtime";

function configuration() {
  const url = new URL(
    "postgres://pg.production.example.test/ms_realty_payload?sslmode=verify-full",
  );
  url.username = "butler_runtime";
  url.password = randomUUID();
  return {
    STAGING: "false",
    RELEASE_ENVIRONMENT: "production",
    DATABASE_TRANSPORT: "direct",
    PRODUCTION_DATABASE_HOST: url.hostname,
    PRODUCTION_DATABASE_NAME: "ms_realty_payload",
    PRODUCTION_DATABASE_ROLE: "application_runtime",
    BUTLER_CHATGPT_DATABASE_URL: url.toString(),
    BUTLER_CHATGPT_DATABASE_ROLE: url.username,
    BUTLER_CHATGPT_HOST_KEY: randomUUID(),
    BUTLER_CHATGPT_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  };
}

it("uses the explicit credential role and supplied production transport configuration", async () => {
  // Creating and closing a lazy pool performs no TCP connection or inference.
  const handle = openChatGptDatabaseStore(configuration());
  await handle.close();
});

it("never infers an absent credential role from its URL or the application role", () => {
  const env: Record<string, string | undefined> = configuration();
  delete env.BUTLER_CHATGPT_DATABASE_ROLE;
  expect(() => openChatGptDatabaseStore(env)).toThrow("chatgpt_store_role_configuration");
  env.BUTLER_CHATGPT_DATABASE_ROLE = "wrong_reviewed_role";
  expect(() => openChatGptDatabaseStore(env)).toThrow(
    "Explicit reviewed production database TLS identity",
  );
});

it("requires the separate operator role and URL for operator custody", async () => {
  const env: Record<string, string | undefined> = configuration();
  const url = new URL(env.BUTLER_CHATGPT_DATABASE_URL ?? "");
  url.username = "butler_operator";
  env.BUTLER_CHATGPT_OPERATOR_DATABASE_URL = url.toString();
  expect(() => openChatGptDatabaseStore(env, "operator")).toThrow(
    "chatgpt_store_role_configuration",
  );
  env.BUTLER_CHATGPT_OPERATOR_DATABASE_ROLE = url.username;
  const handle = openChatGptDatabaseStore(env, "operator");
  await handle.close();
});
