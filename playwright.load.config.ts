// Opt-in synthetic load qualification; ordinary browser CI does not seed 10,000 listings.
import assert from "node:assert/strict";
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

assert(
  ["localhost", "127.0.0.1", "[::1]", "host.docker.internal"].includes(
    new URL(process.env.TEST_DATABASE_URL ?? "invalid:").hostname,
  ),
  "Load runs require a local disposable PostgreSQL server",
);
// The server wrapper admits replica mode only for this explicitly local, disposable workload.
process.env.MSR_LOAD_SCOPE = "local-synthetic";

export default defineConfig({
  ...base,
  testDir: "load",
  testMatch: "**/agency-load.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 1_800_000,
  projects: [
    { name: "synthetic-load", use: { browserName: "chromium", javaScriptEnabled: false } },
  ],
  use: { ...base.use, trace: "off", actionTimeout: 15_000, navigationTimeout: 15_000 },
});
