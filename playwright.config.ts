import { defineConfig, devices } from "@playwright/test";
import { origins, e2ePort as port } from "./e2e/hosts";

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "e2e",
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
  ],
  webServer: {
    // CI builds in its own step; locally the server always starts from a fresh build. Bound to
    // `localhost`, not 127.0.0.1: see proxy.ts on loopback IPs and rewrites.
    command: `${isCI ? "" : "npm run build && "}npm run start -- --hostname localhost --port ${port}`,
    // Health is host-neutral; every page answers only on the three configured hosts.
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: !isCI,
    // Serves the design-system specimen (e2e/design-system.spec.ts); off everywhere else.
    env: {
      ENABLE_DESIGN_SPECIMEN: "1",
      PUBLIC_ORIGIN: origins.public,
      CLIENT_ORIGIN: origins.client,
      STAFF_ORIGIN: origins.staff,
    },
    timeout: 300_000,
  },
});
