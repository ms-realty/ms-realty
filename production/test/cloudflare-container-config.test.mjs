import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fromRoot } from "../lib/paths.mjs";

const workerSource = fs.readFileSync(fromRoot("workers", "index.js"), "utf8");
const CONTAINER_RUNTIME_BINDINGS = [
  "MS_REALTY_SESSION_SECRET",
  "MS_REALTY_ADMIN_OPERATORS_JSON",
  "MS_REALTY_ADMIN_CREDENTIALS_JSON",
  "MS_REALTY_ADMIN_TOKEN",
  "MS_REALTY_LEAD_CONTACT_KEY",
  "MS_REALTY_PUBLIC_CONTACT_KEY",
  "MS_REALTY_ALLOW_PRIVATE_DATABASE_HOST",
  "PAYLOAD_SECRET",
  "DATABASE_URL",
  "TYPESENSE_URL",
  "TYPESENSE_API_KEY",
  "TYPESENSE_COLLECTION",
  "MEILI_URL",
  "MEILI_API_KEY",
  "MEILI_INDEX",
  "HERMES_CHAT_COMPLETIONS_URL",
  "HERMES_API_KEY",
  "HERMES_MODEL",
  "HERMES_PROVIDER_MODE",
  "MS_REALTY_RATE_LIMIT_WINDOW_MS",
  "MS_REALTY_RATE_LIMIT_MAX",
  "MS_REALTY_RATE_LIMIT_DISABLED",
  "MS_REALTY_TRUSTED_WRITE_ORIGINS",
  "MS_REALTY_MCP_ALLOWED_ORIGINS",
  "MS_REALTY_PUBLIC_ORIGIN",
  "MS_REALTY_ADDITIONAL_PUBLIC_ORIGINS",
  "MS_REALTY_MAX_BODY_BYTES",
];

test("Cloudflare Container forwards every production runtime binding", () => {
  assert.match(workerSource, /pingEndpoint = "localhost\/api\/health";/);

  for (const binding of CONTAINER_RUNTIME_BINDINGS) {
    assert.match(workerSource, new RegExp(`${binding}: this\\.env\\.${binding} \\?\\? ""`));
  }
});
