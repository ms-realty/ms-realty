import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  if (process.env.CI) {
    throw new Error("TEST_DATABASE_URL must be set in CI: integration tests may not be skipped.");
  }
  // Vitest evaluates this file once per project; warn only once per process.
  const warned = globalThis as { __msRealtyDbWarned?: boolean };
  if (!warned.__msRealtyDbWarned) {
    warned.__msRealtyDbWarned = true;
    console.warn(
      "[vitest] TEST_DATABASE_URL is not set: skipping the integration project. " +
        "Start a disposable Postgres and pass TEST_DATABASE_URL to run it (see README).",
    );
  }
}

const shared = {
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
};

export default defineConfig({
  ...shared,
  test: {
    passWithNoTests: true,
    projects: [
      // "unit" is split by environment: pure code runs in node, components in jsdom.
      {
        ...shared,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.int.test.ts"],
        },
      },
      {
        ...shared,
        test: {
          name: "unit-dom",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["src/test/setup-dom.ts"],
        },
      },
      {
        ...shared,
        test: {
          name: "integration",
          environment: "node",
          include: databaseUrl ? ["src/**/*.int.test.ts"] : [],
        },
      },
    ],
  },
});
