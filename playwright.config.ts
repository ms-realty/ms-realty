import { randomBytes, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { origins, e2ePort as port } from "./e2e/hosts";

const isCI = Boolean(process.env.CI);
if (!process.env.TEST_DATABASE_URL)
  throw new Error("Playwright requires a disposable TEST_DATABASE_URL.");
process.env.E2E_RUN_ID ??= randomUUID().replaceAll("-", "");
const database = new URL(process.env.TEST_DATABASE_URL);
database.pathname = `/msr_e2e_${process.env.E2E_RUN_ID}`;
process.env.E2E_DATABASE_URL = database.toString();
process.env.E2E_FILE_STORAGE_ROOT = join(tmpdir(), `msr-e2e-files-${process.env.E2E_RUN_ID}`);
process.env.E2E_AUTH_SECRET ??= randomBytes(32).toString("hex");

export default defineConfig({
  testDir: "e2e",
  outputDir: `test-results/${process.env.E2E_RUN_ID}`,
  testIgnore: "visual.spec.ts",
  workers: 2,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    // Tests address the public host unless they choose another (e2e/hosts.ts).
    baseURL: origins.public,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "webkit-mobile",
      use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    stdout: "pipe",
    // CI builds in its own step; locally the server always starts from a fresh build. Bound to
    // `localhost`, not 127.0.0.1: see proxy.ts on loopback IPs and rewrites.
    command: "npx tsx scripts/e2e-server.ts",
    // Health is host-neutral; every page answers only on the three configured hosts.
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: false,
    // Serves the design-system specimen (e2e/design-system.spec.ts); off everywhere else.
    env: {
      ENABLE_DESIGN_SPECIMEN: "1",
      ENABLE_TEST_OUTBOX: "1",
      FILE_STORAGE: "local",
      FILE_STORAGE_ROOT: process.env.E2E_FILE_STORAGE_ROOT,
      E2E_PORT: String(port),
      APP_ORIGIN: origins.public,
      CANONICAL_ORIGIN: "https://makler-realty.com",
      PUBLIC_ORIGIN: origins.public,
      CLIENT_ORIGIN: origins.client,
      STAFF_ORIGIN: origins.staff,
      AUTH_SECRET: process.env.E2E_AUTH_SECRET,
      // Synthetic sender only; browser tests do not run an email worker.
      CASE_EMAIL_ENABLED: "1",
      CASE_REPLY_DOMAIN: "reply.example.test",
      EMAIL_FROM: "MS Realty <service@example.test>",
      MEDIA_PUBLIC_BASE_URL: `${origins.public}/media`,
    },
    timeout: 300_000,
  },
});
