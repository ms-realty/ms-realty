// O22 / F25 / AT40: native reporting on scoped synthetic work, including private export.
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { hostUrl, origins } from "./hosts";

for (const javaScriptEnabled of [true, false])
  test.describe(`O22 reports with JavaScript ${javaScriptEnabled}`, () => {
    test.use({ javaScriptEnabled });
    test("scope, unknown data, native filters and private totals survive reload", async ({
      page,
      context,
    }, testInfo) => {
      const fixture = JSON.parse(
        execFileSync(
          process.execPath,
          ["--conditions=react-server", "--import", "tsx", "src/server/reports/browser-seed.ts"],
          {
            encoding: "utf8",
            env: {
              ...process.env,
              AUTH_SECRET: process.env.E2E_AUTH_SECRET,
              DATABASE_URL: process.env.E2E_DATABASE_URL,
            },
          },
        ).trim(),
      ) as { token: string; visibleReference: string; hiddenReference: string };
      await context.addCookies([
        {
          name: "msr_staff_session",
          value: fixture.token,
          url: origins.staff,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ]);
      await page.goto(hostUrl("staff", "/en/reports?days=7&scope=all"));
      await expect(
        page.getByRole("heading", { name: "Business reports", exact: true }),
      ).toBeVisible();
      const unowned = page.getByRole("region", { name: "Requests awaiting a named owner" });
      await expect(unowned.getByRole("link", { name: fixture.visibleReference })).toBeVisible();
      await expect(page.getByText(fixture.hiddenReference)).toHaveCount(0);
      await expect(page.getByText(/Response time within staffed hours is unknown/)).toBeVisible();
      await expect(
        page
          .getByRole("region", { name: "Deals with a due next step or review" })
          .getByText("Unknown", { exact: true }),
      ).toBeVisible();
      await page.getByLabel("Observation period", { exact: true }).selectOption("90");
      await page.getByLabel("Responsibility", { exact: true }).selectOption("mine");
      await page.getByRole("button", { name: "Show report", exact: true }).click();
      await expect(page).toHaveURL(/\/en\/reports\?days=90&scope=mine/);
      await page.reload();
      await expect(page.getByLabel("Responsibility", { exact: true })).toHaveValue("mine");
      await expect(
        page.getByRole("link", { name: "Synthetic report promise", exact: true }),
      ).toBeVisible();
      await expect(page.getByText(fixture.visibleReference)).toHaveCount(0);
      const downloadEvent = page.waitForEvent("download");
      await page.getByRole("link", { name: "Download these totals", exact: true }).click();
      const download = await downloadEvent,
        path = await download.path();
      expect(path).not.toBeNull();
      if (!path) throw new Error("Missing private report download");
      const csv = await readFile(path, "utf8");
      expect(csv).toContain("scope,mine");
      expect(csv).toContain("promises,1");
      expect(csv).toContain("staffed_response_minutes,unknown");
      expect(csv).not.toContain(fixture.visibleReference);
      expect(csv).not.toContain(fixture.hiddenReference);
      await page.screenshot({ path: testInfo.outputPath("scoped-reports.png"), fullPage: true });
      if (testInfo.project.name.includes("mobile")) {
        await page.setViewportSize({ width: 320, height: 700 });
        await expect(page.getByRole("button", { name: "Show report", exact: true })).toBeVisible();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
      }
    });
  });
