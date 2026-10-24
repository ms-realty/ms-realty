import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { operationsCopy } from "../src/features/operations/copy";
import { hostUrl, origins } from "./hosts";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/u.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1 }),
  db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());

for (const javascript of [true, false])
  test(`W14 required reports and impact are read-only ${javascript ? "enhanced" : "native"}`, async ({
    browser,
  }, testInfo) => {
    const f = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "src/server/ops/readiness-browser-seed.ts",
        ],
        {
          env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
          encoding: "utf8",
        },
      ),
    ) as { token: string; deniedToken: string; viewerId: string };
    const context = await browser.newContext({
      ...testInfo.project.use,
      javaScriptEnabled: javascript,
    });
    try {
      await context.addCookies([
        {
          name: "msr_staff_session",
          value: f.token,
          url: origins.staff,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const page = await context.newPage(),
        copy = operationsCopy("en");
      const writes: string[] = [];
      page.on("request", (request) => {
        if (request.method() !== "GET") writes.push(request.method());
      });
      await page.goto(hostUrl("staff", "/en/operations/readiness"));
      await expect(page.getByRole("heading", { name: copy.title, exact: true })).toBeVisible();
      await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toHaveCount(13);
      await expect(page.getByText(copy.unconfirmed, { exact: true })).toBeVisible();
      await expect(page.getByText(copy.recordedPass, { exact: true })).toHaveCount(0);
      const runtimeCheck = page.getByRole("link", {
        name: `${copy.openRequirement}: ${copy.gates.R01.title}`,
        exact: true,
      });
      await expect(runtimeCheck).toBeInViewport({ ratio: 1 });
      await runtimeCheck.click();
      await expect(page.getByRole("link", { name: copy.seeImpact, exact: true })).toBeInViewport({
        ratio: 1,
      });
      const runtimeReport = page.locator('[data-release-report="deployed_check"]');
      const runtimeReportControl = runtimeReport.locator("summary").first();
      await expect(runtimeReportControl).toHaveAccessibleName(
        `${copy.requirements.deployed_check} ${copy.results.not_confirmed} ${copy.showReport}:`,
      );
      await runtimeReportControl.click();
      await expect(runtimeReport).toHaveAttribute("open", "");
      const reportStatus = runtimeReport.getByRole("region", {
        name: `Report status: ${copy.requirements.deployed_check}`,
        exact: true,
      });
      await expect(reportStatus).toBeVisible();
      await expect(
        reportStatus.getByRole("heading", {
          name: `${copy.reportStatus}: ${copy.requirements.deployed_check}`,
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        reportStatus.getByText(copy.results.not_confirmed, { exact: true }),
      ).toBeVisible();
      await expect(reportStatus.getByText(copy.missingReportHelp, { exact: true })).toBeVisible();
      if (javascript) expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.goto(hostUrl("staff", "/en/operations/readiness"));
      await page
        .getByRole("link", {
          name: `${copy.openRequirement}: ${copy.gates.R07.title}`,
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("heading", { name: copy.requiredReports, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(copy.requirements.migration_rehearsal_report, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(copy.results.not_confirmed, { exact: true }).first(),
      ).toBeVisible();
      await page
        .locator("main")
        .screenshot({ path: testInfo.outputPath(`w14-required-reports-${javascript}.png`) });
      await page.getByRole("link", { name: copy.seeImpact, exact: true }).click();
      await expect(page.getByRole("heading", { name: copy.affected, exact: true })).toBeVisible();
      await page
        .getByRole("heading", { name: copy.affected, exact: true })
        .scrollIntoViewIfNeeded();
      await expect(page.getByRole("link", { name: copy.checkAgain, exact: true })).toBeInViewport({
        ratio: 1,
      });
      await expect(page.getByText(copy.checkOnly, { exact: true })).toBeVisible();
      await expect(
        page.getByRole("link", { name: copy.openExceptions, exact: true }),
      ).toHaveAttribute("href", "/en/operations/jobs?view=exceptions");
      const expectedRead = new URL(page.url());
      expectedRead.searchParams.set("read", "saved");
      expectedRead.hash = "release-R07-impact";
      await page.getByRole("link", { name: copy.checkAgain, exact: true }).click();
      await expect(
        page.getByRole("status").getByText("Saved results read. Nothing was sent again.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(page).toHaveURL(expectedRead.href);
      await expect(
        page.getByRole("heading", { name: copy.gates.R07.title, exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      if (javascript)
        expect(
          (
            await new AxeBuilder({ page })
              .include("main")
              .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
      expect(writes).toEqual([]);
      await page
        .locator("main")
        .screenshot({ path: testInfo.outputPath(`w14-impact-${javascript}.png`) });
      if (javascript)
        for (const locale of ["bg", "en", "ru"]) {
          const localized = operationsCopy(locale);
          await page.goto(hostUrl("staff", `/${locale}/operations/readiness`));
          await expect(
            page.getByRole("link", {
              name: `${localized.openRequirement}: ${localized.gates.R01.title}`,
              exact: true,
            }),
          ).toBeInViewport({ ratio: 1 });
          for (const gate of ["R01", "R02", "R06"] as const) {
            await page.goto(hostUrl("staff", `/${locale}/operations/readiness/${gate}`));
            await expect(
              page.getByRole("heading", { name: localized.gates[gate].title, exact: true }),
            ).toBeVisible();
            await expect(
              page.getByRole("heading", { name: localized.requiredReports, exact: true }),
            ).toBeVisible();
            const report =
              gate === "R01"
                ? "first_party_runtime_report"
                : gate === "R02"
                  ? "listing_review_report"
                  : "ai_evaluation_report";
            await expect(
              page.getByText(localized.requirements[report], { exact: true }),
            ).toBeVisible();
            await page
              .locator("main")
              .screenshot({ path: testInfo.outputPath(`w14-${gate}-${locale}.png`) });
          }
        }
      await db
        .delete(schema.grants)
        .where(
          and(
            eq(schema.grants.principalId, f.viewerId),
            eq(schema.grants.capability, "report.read"),
          ),
        );
      await page.reload();
      await expect(page.locator("[data-permission-state]")).toBeVisible();
      await expect(
        page.getByRole("heading", { name: copy.requiredReports, exact: true }),
      ).toHaveCount(0);
      await context.addCookies([
        {
          name: "msr_staff_session",
          value: f.deniedToken,
          url: origins.staff,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      await page.goto(hostUrl("staff", "/en/operations/readiness/R01"));
      await expect(page.locator("[data-permission-state]")).toBeVisible();
      const invalid = await page.goto(hostUrl("staff", "/en/operations/readiness/R99"));
      // Streamed Next pages may deliver the native not-found body after HTTP 200.
      expect([200, 404]).toContain(invalid?.status());
      await expect(
        page.getByRole("heading", { name: copy.requiredReports, exact: true }),
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
