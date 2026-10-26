// O22 / F25 / AT40: native task effort, same-operation recovery and compensating correction.
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { hostUrl, origins } from "./hosts";

for (const javaScriptEnabled of [true, false])
  test.describe(`O22 task effort with JavaScript ${javaScriptEnabled}`, () => {
    test.use({ javaScriptEnabled });
    test("retains a draft across access recovery, records once, drills from reports and preserves voided history", async ({
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
      ) as { token: string; taskId: string; visibleReference: string; hiddenReference: string };
      const cookie = {
        name: "msr_staff_session",
        value: fixture.token,
        url: origins.staff,
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
      };
      await context.addCookies([cookie]);
      await page.goto(hostUrl("staff", `/en/tasks/${fixture.taskId}/effort`));
      const original = page.url(),
        operation = new URL(original).searchParams.get("operation");
      expect(operation).toBeTruthy();
      await page.getByLabel("Minutes spent", { exact: true }).fill("12");
      await page.getByLabel("Kind of work", { exact: true }).selectOption("correction");
      await page.getByLabel("Reason for the work", { exact: true }).selectOption("facts");
      // Session loss must retain the logical operation and the non-sensitive draft.
      await context.clearCookies();
      await page.getByRole("button", { name: "Record time", exact: true }).click();
      await expect(page).toHaveURL(/\/en\/access\?returnTo=/);
      const returnTo = new URL(page.url()).searchParams.get("returnTo");
      expect(returnTo).toBeTruthy();
      if (!returnTo) throw new Error("Missing effort recovery path");
      const recovered = new URL(returnTo, origins.staff);
      expect(recovered.searchParams.get("operation")).toBe(operation);
      expect(recovered.searchParams.get("minutes")).toBe("12");
      await context.addCookies([cookie]);
      await page.goto(recovered.toString());
      await expect(page.getByLabel("Minutes spent", { exact: true })).toHaveValue("12");
      await page.getByRole("button", { name: "Record time", exact: true }).click();
      await expect(page.getByText("The entry is recorded.", { exact: true })).toBeVisible();
      expect(new URL(page.url()).searchParams.get("operation")).toBe(operation);
      const history = page.locator("section").filter({
        has: page.getByRole("heading", { name: "Recorded observations", exact: true }),
      });
      await expect(history.getByRole("listitem")).toHaveCount(1);
      await expect(history.locator('data[value="12"]')).toHaveCount(1);
      await page.reload();
      await expect(history.getByRole("listitem")).toHaveCount(1);
      await page.goto(original);
      await expect(page.getByText("The entry is recorded.", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Record time", exact: true })).toHaveCount(0);
      await expect(history.getByRole("listitem")).toHaveCount(1);

      await page.goto(hostUrl("staff", "/en/reports?days=7&scope=mine"));
      const effort = page.getByRole("region", { name: "Correction and reentry time", exact: true });
      await expect(effort.locator("dl dd")).toHaveText(["1", "12", "0"]);
      await expect(page.getByText(fixture.hiddenReference)).toHaveCount(0);
      await effort.getByRole("link", { name: "Synthetic report promise", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/en/tasks/${fixture.taskId}/effort\\?operation=`));
      await expect(history.getByRole("listitem")).toHaveCount(1);
      await page.getByRole("button", { name: "Exclude mistaken entry", exact: true }).click();
      await expect(
        page.getByText("The mistaken entry is excluded from totals. Its history is preserved.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(history.getByRole("listitem")).toHaveCount(1);
      await expect(history.locator('data[value="12"]')).toHaveCount(1);
      await expect(
        history.getByText("Excluded by a later correction", { exact: true }),
      ).toBeVisible();
      await expect(
        history.getByRole("button", { name: "Exclude mistaken entry", exact: true }),
      ).toHaveCount(0);
      await page.reload();
      await expect(
        history.getByText("Excluded by a later correction", { exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("effort-preserved-history.png"),
        fullPage: true,
      });

      await page.goto(hostUrl("staff", "/en/reports?days=7&scope=mine"));
      await expect(
        effort.getByText("No time has been recorded. This does not mean the work took no time.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(effort.locator("dl")).toHaveCount(0);
      await expect(
        effort.getByRole("link", { name: "Synthetic report promise", exact: true }),
      ).toHaveCount(0);
      await expect(page.getByText(fixture.hiddenReference)).toHaveCount(0);
    });
  });
