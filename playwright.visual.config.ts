// Visual regression over the built Storybook (e2e/visual.spec.ts). Baselines are Linux
// Chromium renders made in the Playwright image that matches @playwright/test, so run it
// there: `npm run test:visual:update` writes baselines, scripts/visual-docker.sh checks them.
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.STORYBOOK_PORT ?? 6106);
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "e2e",
  testMatch: "visual.spec.ts",
  // No platform suffix: the only valid baseline is the Linux one from the pinned image.
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: isCI,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  expect: {
    toHaveScreenshot: { animations: "disabled", caret: "hide", scale: "css" },
  },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${port}`,
    deviceScaleFactor: 1,
  },
  projects: [
    { name: "390", use: { viewport: { width: 390, height: 844 } } },
    { name: "1440", use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: "node scripts/serve-storybook.mjs",
    url: `http://127.0.0.1:${port}/index.json`,
    reuseExistingServer: !isCI,
    env: { STORYBOOK_PORT: String(port) },
  },
});
