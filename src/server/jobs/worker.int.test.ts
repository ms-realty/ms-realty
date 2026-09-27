import { spawn } from "node:child_process";
import { once } from "node:events";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { runMigrations } from "@/db/migrate";
import { workerProgress } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { recordWorkerProgress } from "./heartbeat";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
it("runs the real standalone queue worker against an isolated database and shuts it down gracefully", async () => {
  const worker = spawn(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "scripts/worker.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: t.url,
        BUILD_SHA: "worker-cli-test",
        ENABLE_TEST_OUTBOX: "1",
        APP_ORIGIN: "http://localhost:3195",
        PUBLIC_ORIGIN: "http://localhost:3195",
        CLIENT_ORIGIN: "http://my.localhost:3195",
        STAFF_ORIGIN: "http://app.localhost:3195",
        WORKER_HEARTBEAT_URL: "",
        HERMES_ENABLED: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  worker.stdout.on("data", (chunk) => {
    output += String(chunk);
  });
  worker.stderr.on("data", (chunk) => {
    output += String(chunk);
  });
  const exit = once(worker, "exit");
  try {
    await vi.waitFor(
      async () => {
        if (worker.exitCode !== null)
          throw new Error(`Worker exited before progress: ${output.slice(-1000)}`);
        const [row] = await t.db
          .select()
          .from(workerProgress)
          .where(eq(workerProgress.key, "queue-worker"));
        expect(row?.buildSha).toBe("worker-cli-test");
      },
      { timeout: 20000, interval: 200 },
    );
    worker.kill("SIGTERM");
    const [code, signal] = await exit;
    expect({ code, signal }).toEqual({ code: 0, signal: null });
  } finally {
    if (worker.exitCode === null) worker.kill("SIGKILL");
  }
}, 30000);
it("records completed queue work separately from independent monitor acknowledgment", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
  await recordWorkerProgress(
    t.db,
    {
      BUILD_SHA: "synthetic-heartbeat",
      WORKER_HEARTBEAT_URL: "https://uptime.betterstack.com/api/v1/heartbeat/synthetic",
    },
    fetcher,
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(
    (await t.db.select().from(workerProgress).where(eq(workerProgress.key, "queue-worker")))[0]
      ?.buildSha,
  ).toBe("synthetic-heartbeat");
  await expect(
    recordWorkerProgress(t.db, { WORKER_HEARTBEAT_URL: "http://169.254.169.254/token" }, fetcher),
  ).rejects.toThrow("configuration");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("serializes concurrent migrators and reapplies the same schema without duplication", async () => {
  await Promise.all([runMigrations(t.url), runMigrations(t.url)]);
  expect(await t.db.select().from(workerProgress)).toHaveLength(1);
});
