// R09/AT27: exercise production crawl policy only in the native disposable local harness.
// The regular browser suite retains STAGING=true and its existing access restrictions.
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

if (!base.webServer || Array.isArray(base.webServer))
  throw new Error("Indexability checks require the single native disposable browser server.");

export default defineConfig({
  ...base,
  testMatch: "indexability.production.ts",
  webServer: {
    ...base.webServer,
    env: { ...base.webServer.env, STAGING: "false" },
  },
});
