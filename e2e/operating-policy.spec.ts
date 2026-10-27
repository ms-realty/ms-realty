// O24/F30/AT14: real native/enhanced policy commands with synthetic scoped staff only.
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { policyWeekdays } from "../src/domain/operating-policy";
import { operatingPolicyCopy } from "../src/features/operating-policy/copy";
import { formFields } from "../src/ui/form/contract";
import { hostUrl, origins } from "./hosts";
import { test } from "./support/policy-test";

// Keep each project's native/enhanced journey in sequence; the lock also spans projects.
test.describe.configure({ mode: "serial" });
for (const javascript of [false, true])
  test(`O24 policy edit, stale approval, receipt and history ${javascript ? "enhanced" : "native"}`, async ({
    browser,
  }, testInfo) => {
    const fixture = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "src/server/operating-policy/browser-seed.ts",
          "--owner-directory",
        ],
        { env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET }, encoding: "utf8" },
      ),
    ) as {
      operator: { id: string; token: string; displayName: string };
      other: { token: string };
      denied: { token: string };
    };
    const context = await browser.newContext({
      ...testInfo.project.use,
      javaScriptEnabled: javascript,
    });
    try {
      await context.addCookies([
        {
          name: "msr_staff_session",
          value: fixture.operator.token,
          url: origins.staff,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const page = await context.newPage(),
        c = operatingPolicyCopy("en"),
        path = "/en/settings/operating-policy",
        marker = `Synthetic browser policy ${testInfo.project.name} ${javascript}`;
      await page.goto(hostUrl("staff", "/en/settings?section=agency"));
      await page.getByRole("link", { name: c.title, exact: true }).click();
      await expect(page.getByRole("heading", { name: c.title, exact: true })).toBeVisible();
      const year = new Date().getUTCFullYear();
      await page.getByLabel(c.fields.calendarState, { exact: true }).selectOption("reviewed");
      await page.getByLabel(c.fields.validFrom, { exact: true }).fill(`${year}-01-01`);
      await page.getByLabel(c.fields.validUntil, { exact: true }).fill(`${year}-12-31`);
      await page.getByLabel(c.fields.calendarSource, { exact: true }).fill(marker);
      for (const day of policyWeekdays)
        await page
          .getByLabel(c.weekdays[day], { exact: true })
          .selectOption(day === "mon" ? "open" : "closed");
      await page
        .getByLabel(`${c.weekdays.mon} · ${c.ranges}`, { exact: true })
        .fill("09:00-12:00,13:00-17:00");
      await page.getByText(c.coverageGroup, { exact: true }).click();
      await page.getByLabel(c.fields.coverage, { exact: true }).fill(marker);
      const policyForm = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: c.save, exact: true }) });
      const key = await policyForm.locator(`input[name="${formFields.operationId}"]`).inputValue();
      const revision = await policyForm
        .locator(`input[name="${formFields.expectedRevision}"]`)
        .inputValue();
      const owner = page.getByLabel(c.fields.ownerService, { exact: true });
      await expect(owner.locator(`option[value="${fixture.operator.id}"]`)).toHaveCount(0);
      // The seed has more than 100 earlier active staff. Use the actual native directory,
      // keeping the unsaved calendar, sources, revision and issued operation in the same form.
      await page.getByRole("button", { name: c.ownerNext, exact: true }).click();
      await expect(policyForm.locator('input[name="_ownerCurrentPage"]')).toHaveValue("2");
      await page.getByLabel(c.ownerSearch, { exact: true }).fill(fixture.operator.displayName);
      await page.getByRole("button", { name: c.ownerSearchSubmit, exact: true }).click();
      await expect(owner.locator(`option[value="${fixture.operator.id}"]`)).toHaveCount(1);
      await expect(page.getByLabel(c.fields.calendarSource, { exact: true })).toHaveValue(marker);
      await expect(page.getByLabel(c.fields.coverage, { exact: true })).toHaveValue(marker);
      await expect(policyForm.locator(`input[name="${formFields.operationId}"]`)).toHaveValue(key);
      await expect(policyForm.locator(`input[name="${formFields.expectedRevision}"]`)).toHaveValue(
        revision,
      );
      expect(new URL(page.url()).search).toBe("");
      await owner.selectOption(fixture.operator.id);
      await page.getByLabel(c.ownerSearch, { exact: true }).fill("no synthetic staff match %_");
      await page.getByRole("button", { name: c.ownerSearchSubmit, exact: true }).click();
      await expect(page.getByText(c.ownerNone, { exact: false })).toBeVisible();
      await expect(owner).toHaveValue(fixture.operator.id);
      await expect(owner.locator(`option[value="${fixture.operator.id}"]`)).toHaveText(
        fixture.operator.displayName,
      );
      await expect(policyForm.locator(`input[name="${formFields.operationId}"]`)).toHaveValue(key);
      await page.getByText(c.controlsGroup, { exact: true }).click();
      await page.getByLabel(c.fields.daysSales, { exact: true }).fill("3");
      await page.getByLabel(c.fields.daysRent, { exact: true }).fill("2");
      await page.getByRole("button", { name: c.save, exact: true }).click();
      await expect(page.getByRole("heading", { name: c.saved, exact: true })).toBeVisible();
      await page.goto(hostUrl("staff", path));
      const stale = await context.newPage();
      await stale.goto(hostUrl("staff", path));
      await page.getByText(c.coverageGroup, { exact: true }).click();
      await page.getByLabel(c.fields.coverage, { exact: true }).fill(`${marker} revised`);
      await page.getByRole("button", { name: c.save, exact: true }).click();
      await expect(page.getByRole("heading", { name: c.saved, exact: true })).toBeVisible();
      await stale.getByLabel(c.note, { exact: true }).fill(`${marker} stale review`);
      await stale.getByLabel(c.reviewed, { exact: true }).check();
      await stale.getByRole("button", { name: c.approve, exact: true }).click();
      await expect(stale.getByText(c.conflict, { exact: true })).toBeVisible();
      await stale.close();
      await page.goto(hostUrl("staff", path));
      const approval = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: c.approve, exact: true }) });
      const operation = await approval
        .locator(`input[name="${formFields.operationId}"]`)
        .inputValue();
      await page.getByLabel(c.note, { exact: true }).fill(`${marker} explicit synthetic review`);
      await page.getByLabel(c.reviewed, { exact: true }).check();
      await page.getByRole("button", { name: c.approve, exact: true }).click();
      await expect(page.getByRole("heading", { name: c.approved, exact: true })).toBeVisible();
      const receiptPath = `${path}/operations/approve/${encodeURIComponent(operation)}`;
      await page.goto(hostUrl("staff", receiptPath));
      await expect(page.getByRole("heading", { name: c.approved, exact: true })).toBeVisible();
      await page.goto(hostUrl("staff", path));
      const versionLink = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: c.history, exact: true }) })
        .getByRole("link", { name: new RegExp(`^${c.version} [0-9]+$`), includeHidden: true })
        .first();
      await versionLink.locator("xpath=ancestor::details").locator("summary").click();
      // Native users open the disclosure through its summary, not through a hydration dependency.
      await versionLink.click();
      await expect(page.getByText(`${marker} revised`, { exact: true })).toBeVisible();
      await expect(
        page.getByText(`${marker} explicit synthetic review`, { exact: true }),
      ).toBeVisible();
      await page.setViewportSize({ width: 320, height: 740 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
      // Axe requires page timers; native semantics and layout are exercised above with scripts off.
      if (javascript)
        expect(
          (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
            .violations,
        ).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath("operating-policy-version.png"),
        fullPage: true,
      });
      const isolated = await browser.newContext({
        ...testInfo.project.use,
        javaScriptEnabled: javascript,
      });
      try {
        await isolated.addCookies([
          {
            name: "msr_staff_session",
            value: fixture.other.token,
            url: origins.staff,
            httpOnly: true,
            sameSite: "Lax",
          },
        ]);
        const other = await isolated.newPage();
        await other.goto(hostUrl("staff", receiptPath));
        await expect(other.getByText(c.noReceipt, { exact: true })).toBeVisible();
        await isolated.clearCookies();
        await isolated.addCookies([
          {
            name: "msr_staff_session",
            value: fixture.denied.token,
            url: origins.staff,
            httpOnly: true,
            sameSite: "Lax",
          },
        ]);
        const denied = await other.goto(hostUrl("staff", path));
        expect(denied?.status()).toBe(404);
        await expect(other.getByText(`${marker} revised`, { exact: true })).toHaveCount(0);
      } finally {
        await isolated.close();
      }
    } finally {
      await context.close();
    }
  });
