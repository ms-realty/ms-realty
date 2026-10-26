// O23/O24/F30: actual native/enhanced grant forms allocate/revoke one fixed settings resource.
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { settingsResources } from "../src/domain/settings-resources";
import { settingsScopeCopy } from "../src/features/identity/settings-scope-copy";
import { operatingPolicyCopy } from "../src/features/operating-policy/copy";
import { hostUrl, origins } from "./hosts";

for (const javaScriptEnabled of [false, true])
  test(`O23 fixed settings allocation ${javaScriptEnabled ? "enhanced" : "native"}`, async ({
    browser,
  }, testInfo) => {
    const seed = (id?: string) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          [
            "--conditions=react-server",
            "--import",
            "tsx",
            "src/server/auth/settings-scope-browser-seed.ts",
            ...(id ? [id] : []),
          ],
          {
            env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET },
            encoding: "utf8",
          },
        ),
      );
    const f = seed() as {
      manager: { id: string; token: string };
      target: { id: string; token: string };
    };
    const context = await browser.newContext({ ...testInfo.project.use, javaScriptEnabled });
    const db = postgres(process.env.E2E_DATABASE_URL as string, { max: 1 });
    const cookie = (value: string) => ({
      name: "msr_staff_session",
      value,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax" as const,
    });
    try {
      await context.addCookies([cookie(f.manager.token)]);
      const page = await context.newPage(),
        c = settingsScopeCopy("en");
      await page.goto(hostUrl("staff", "/en/access/manage"));
      const form = page
        .locator("form")
        .filter({
          has: page.getByRole("button", { name: "Record capability grant", exact: true }),
        });
      await form.locator('[name="principalId"]').selectOption(f.target.id);
      await form.locator('[name="capability"]').selectOption("settings.manage");
      await form.locator('[name="recordType"]').selectOption("settings");
      await form
        .getByLabel(c.resource, { exact: true })
        .selectOption(settingsResources.operatingPolicy);
      await form
        .locator('[name="reason"]')
        .fill("Synthetic browser assignment of one reviewed settings resource");
      await form.getByRole("checkbox").check();
      await form.getByRole("button", { name: "Record capability grant", exact: true }).click();
      await expect(page.getByText("Access change recorded:", { exact: false })).toBeVisible();
      const [grant] = await db<{ id: string; record_type: string; record_id: string }[]>`
      select id, record_type, record_id from grants where principal_id = ${f.target.id} and capability = 'settings.manage' and revoked_at is null`;
      expect(grant).toMatchObject({
        record_type: "settings",
        record_id: settingsResources.operatingPolicy,
      });
      if (!grant) throw new Error("Settings grant was not recorded");
      await page.setViewportSize({ width: 320, height: 844 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      expect(
        (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
          .violations,
      ).toEqual([]);
      const target = await browser.newContext({ ...testInfo.project.use, javaScriptEnabled });
      try {
        await target.addCookies([cookie(f.target.token)]);
        const targetPage = await target.newPage();
        await targetPage.goto(hostUrl("staff", "/en/settings/operating-policy"));
        await expect(targetPage).toHaveURL(/\/en\/access(?:\?|$)/);
        const renewed = seed(f.target.id) as { token: string };
        await target.addCookies([cookie(renewed.token)]);
        await targetPage.goto(hostUrl("staff", "/en/settings/operating-policy"));
        await expect(
          targetPage.getByRole("heading", { name: operatingPolicyCopy("en").title, exact: true }),
        ).toBeVisible();
        const [person] = await db<
          { email: string }[]
        >`select email from principals where id = ${f.target.id}`;
        await page
          .getByLabel("Search current grants by name or email", { exact: true })
          .fill(person?.email ?? "");
        await page.getByRole("button", { name: "Search", exact: true }).click();
        const revoke = page
          .locator("form")
          .filter({ has: page.locator(`input[name="grantId"][value="${grant.id}"]`) });
        await revoke
          .locator('[name="reason"]')
          .fill("Synthetic browser assignment revoked after explicit review");
        await revoke.getByRole("button").click();
        await expect(page.getByText("Access change recorded:", { exact: false })).toBeVisible();
        await targetPage.goto(hostUrl("staff", "/en/settings/operating-policy"));
        await expect(targetPage).toHaveURL(/\/en\/access(?:\?|$)/);
      } finally {
        await target.close();
      }
    } finally {
      await context.close();
      await db.end();
    }
  });
