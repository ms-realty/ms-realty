// AT62: opt-in closed-loop synthetic workload. This does not certify field Web Vitals,
// cloud capacity, queue starvation, real approval, or a frozen launch inventory.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { cpus, platform, totalmem } from "node:os";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { hostUrl, origins } from "../e2e/hosts";
import { databaseMetrics } from "./database-metrics";

const exec = promisify(execFile);
test("AT62: catalogue reads and staff commands under 50 public and 10 staff sessions", async ({
  browser,
  playwright,
}, testInfo) => {
  const seconds = Number(process.env.LOAD_SECONDS ?? 60);
  assert(Number.isInteger(seconds) && seconds >= 10 && seconds <= 600);
  const seeding = exec(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "scripts/load-seed.ts"],
    {
      env: {
        ...process.env,
        AUTH_SECRET: process.env.E2E_AUTH_SECRET,
        DATABASE_URL: process.env.E2E_DATABASE_URL,
      },
      timeout: 1_500_000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  seeding.child.stderr?.on("data", (chunk) => process.stdout.write(chunk));
  const result = await seeding;
  // Tokens stay in memory; never attach fixture stdout to the qualification report.
  const fixture = JSON.parse(result.stdout) as {
    listings: number;
    documents: number;
    largeMediaBytes: number;
    seedMs: number;
    diagnostics: { eligibilityPlan: unknown; searchMs: number };
    samples: { reference: string; media: string; locale: string }[];
    staff: { token: string; taskId: string }[];
  };
  console.log(`Seeded ${fixture.listings} listings in ${Math.round(fixture.seedMs / 1000)}s`);
  const seedEvidence = {
    listings: fixture.listings,
    documents: fixture.documents,
    diagnostics: fixture.diagnostics,
  };
  await writeFile(
    testInfo.outputPath("load-seed-report.json"),
    JSON.stringify(seedEvidence, null, 2),
  );
  await testInfo.attach("load-seed-report.json", {
    body: JSON.stringify(seedEvidence),
    contentType: "application/json",
  });
  const publicContexts = await Promise.all(
    Array.from({ length: 50 }, () =>
      playwright.request.newContext({ baseURL: origins.public, timeout: 15000 }),
    ),
  );
  const staffContexts = await Promise.all(
    fixture.staff.map(async (person) => {
      const context = await browser.newContext({ javaScriptEnabled: false });
      await context.addCookies([
        {
          name: "msr_staff_session",
          value: person.token,
          url: origins.staff,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      return { context, page: await context.newPage(), taskId: person.taskId };
    }),
  );
  const timings: Record<string, number[]> = {},
    failures: { lane: string; message: string }[] = [];
  const cycles = { public: Array(50).fill(0) as number[], staff: Array(10).fill(0) as number[] };
  let active = 0,
    peak = 0,
    stopped = false;
  function timing(kind: string, duration: number) {
    timings[kind] ??= [];
    timings[kind].push(duration);
  }
  async function measure(kind: string, action: () => Promise<void>) {
    const start = performance.now();
    active++;
    peak = Math.max(peak, active);
    try {
      await action();
    } finally {
      active--;
      timing(kind, performance.now() - start);
    }
  }
  const queries = [
    ["bg", "апартамент"],
    ["en", "apartment"],
    ["ru", "квартира"],
    ["de", "Wohnung"],
    ["nl", "appartement"],
    ["el", "διαμέρισμα"],
    ["he", "דירה"],
  ];
  const lane = async (name: string, action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      stopped = true;
      failures.push({
        lane: name,
        message: error instanceof Error ? error.message.slice(0, 700) : "Unknown failure",
      });
    }
  };
  const warmup: { route: string; durationMs: number }[] = [];
  const databaseProfile = process.env.MSR_LOAD_PROFILE === "1" ? databaseMetrics() : undefined;
  const warmer = publicContexts[0];
  assert(warmer);
  await lane("warmup", async () => {
    for (const [locale, q] of queries) {
      const route = `/${locale}/properties?${new URLSearchParams({ purpose: "sale", q: q ?? "" })}`;
      const at = performance.now();
      const response = await warmer.get(route);
      try {
        expect(response.status()).toBe(200);
        expect(await response.text()).toContain('id="results-heading"');
      } finally {
        await response.dispose();
      }
      warmup.push({ route, durationMs: performance.now() - at });
    }
  });
  const workloadStartedAt = new Date().toISOString();
  const started = performance.now(),
    end = started + seconds * 1000;
  try {
    await Promise.all([
      ...publicContexts.map((request, index) =>
        lane(`public-${index}`, async () => {
          let cycle = 0;
          while (!stopped && performance.now() < end) {
            const query = queries[(index + cycle) % queries.length],
              sample = fixture.samples[(index + cycle) % fixture.samples.length];
            assert(query && sample);
            const [locale, q] = query;
            const search = new URLSearchParams({
              purpose: "sale",
              q: cycle % 3 === 0 ? "" : (q ?? ""),
              sort: cycle % 2 ? "price_asc" : "relevance",
            });
            await measure("public-search-html", async () => {
              const response = await request.get(`/${locale}/properties?${search}`);
              try {
                expect(response.status()).toBe(200);
                expect(await response.text()).toContain('id="results-heading"');
              } finally {
                await response.dispose();
              }
            });
            await measure("public-detail-html", async () => {
              const response = await request.get(
                `/bg/properties/${sample.reference}/${sample.reference.toLowerCase()}`,
              );
              try {
                expect(response.status()).toBe(200);
                expect(await response.text()).toContain(sample.reference);
              } finally {
                await response.dispose();
              }
            });
            await measure("public-media", async () => {
              const response = await request.get(sample.media);
              try {
                expect(response.status()).toBe(200);
                expect(response.headers()["content-type"]).toContain("image/webp");
                expect((await response.body()).length).toBe(fixture.largeMediaBytes);
              } finally {
                await response.dispose();
              }
            });
            cycles.public[index] = ++cycle;
          }
        }),
      ),
      ...staffContexts.map(({ page, taskId }, index) =>
        lane(`staff-${index}`, async () => {
          let cycle = 0;
          while (!stopped && performance.now() < end) {
            await measure("staff-today-html", async () => {
              const response = await page.goto(hostUrl("staff", "/en/today"));
              expect(response?.status()).toBe(200);
              expect(new URL(page.url()).pathname).toBe("/en/today");
            });
            await measure("staff-task-html", async () => {
              const response = await page.goto(hostUrl("staff", `/en/tasks/${taskId}`));
              expect(response?.status()).toBe(200);
              await expect(
                page.getByRole("heading", { name: `Synthetic load task ${index}`, exact: true }),
              ).toBeVisible();
            });
            await page
              .getByLabel("Status", { exact: true })
              .selectOption(cycle % 2 ? "waiting" : "in_progress");
            await page
              .getByLabel("Outcome, dependency or cancellation reason", { exact: true })
              .fill("Synthetic load transition; no customer commitment.");
            await page
              .getByLabel("Dependency review time (UTC)", { exact: true })
              .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
            const sent = page.waitForResponse(
              (response) =>
                response.request().method() === "POST" &&
                new URL(response.url()).pathname === `/en/tasks/${taskId}`,
            );
            await page.getByRole("button", { name: "Update task", exact: true }).click();
            const response = await sent;
            await response.finished();
            expect(response.status()).toBeLessThan(400);
            const network = response.request().timing();
            assert(network.responseEnd >= network.requestStart && network.requestStart >= 0);
            timing("staff-command-post", network.responseEnd - network.requestStart);
            await expect(
              page.getByRole("heading", { name: "Change recorded", exact: true }),
            ).toBeVisible();
            cycles.staff[index] = ++cycle;
          }
        }),
      ),
    ]);
  } finally {
    await databaseProfile?.stop();
    await Promise.all(publicContexts.map((context) => context.dispose()));
    await Promise.all(staffContexts.map(({ context }) => context.close()));
  }
  const quantile = (values: number[], q: number) => {
    const sorted = [...values].sort((a, b) => a - b);
    return Math.round((sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)] ?? 0) * 100) / 100;
  };
  const measurements = Object.fromEntries(
    Object.entries(timings).map(([name, values]) => [
      name,
      {
        count: values.length,
        p50: quantile(values, 0.5),
        p95: quantile(values, 0.95),
        p99: quantile(values, 0.99),
        max: quantile(values, 1),
        budgetMs: name === "staff-command-post" ? 800 : name === "public-media" ? null : 500,
      },
    ]),
  );
  const source = await (async () => {
    try {
      return {
        revision: (await exec("git", ["rev-parse", "HEAD"])).stdout.trim(),
        dirty: Boolean((await exec("git", ["status", "--porcelain"])).stdout.trim()),
        provenance: "local-git",
      };
    } catch {
      return { revision: null, dirty: null, provenance: "git-unavailable-in-runner" };
    }
  })();
  const report = {
    schema: 1,
    scope: "local-synthetic-closed-loop",
    recordedAt: new Date().toISOString(),
    source,
    profiling: {
      enabled: Boolean(databaseProfile),
      workloadStartedAt,
      database: databaseProfile
        ? { samples: databaseProfile.samples, errors: databaseProfile.errors }
        : null,
      runtime: databaseProfile
        ? "../runtime-metrics.jsonl and CPU profile in this run directory"
        : null,
    },
    environment: {
      platform: platform(),
      cpus: cpus().length,
      memoryBytes: totalmem(),
      node: process.version,
      nextDist: process.env.NEXT_DIST_DIR ?? ".next",
      webReplicas: Number(process.env.LOAD_REPLICAS ?? 1),
    },
    dataset: {
      listings: fixture.listings,
      projections: fixture.documents,
      largeMediaBytes: fixture.largeMediaBytes,
      largeMediaSamples: fixture.samples.length,
      scanEvidence: "synthetic fixture, not real ClamAV",
    },
    workload: {
      publicSessions: publicContexts.length,
      staffSessions: staffContexts.length,
      intendedSeconds: seconds,
      elapsedMs: performance.now() - started,
      peakMeasuredRequests: peak,
      completedCycles: cycles,
    },
    measurements,
    warmup,
    databaseDiagnostics: fixture.diagnostics,
    failures,
    qualification: {
      performanceBudgetsPassed:
        Object.keys(measurements).length === 6 &&
        Object.values(measurements).every(
          (metric) => metric.budgetMs === null || metric.p95 <= metric.budgetMs,
        ),
      minimumInventory: fixture.listings >= 10000,
      minimumDuration: seconds >= 60,
      everySessionCompleted: [...cycles.public, ...cycles.staff].every((n) => n > 0),
      frozenLaunchInventory: false,
      queueStarvation: false,
      liveInfrastructure: false,
      fieldWebVitals: false,
      releaseGatePass: false,
    },
  };
  await testInfo.attach("load-report.json", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });
  await import("node:fs/promises").then((fs) =>
    fs.writeFile(testInfo.outputPath("load-report.json"), JSON.stringify(report, null, 2)),
  );
  expect(failures).toEqual([]);
  expect(report.qualification.everySessionCompleted).toBe(true);
  for (const metric of Object.values(measurements))
    if (metric.budgetMs !== null)
      expect.soft(metric.p95, JSON.stringify(metric)).toBeLessThanOrEqual(metric.budgetMs);
});
