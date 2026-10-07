// O01: a list whose read really failed is drawn apart from a ready empty list, and recovers.
// Like the integration test, the failure is a renamed table on real PostgreSQL. Every Today
// read touches appointment_resources (the viewing coverage subquery), and so do the coverage
// and appointment pages: a page loaded in parallel would fail too. The case therefore runs
// only in a separate single-worker run (the parallel suite skips it), in one project:
//   E2E_TODAY_UNAVAILABLE=1 npx playwright test e2e/today-unavailable.spec.ts --workers=1 --project chromium-desktop
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { hostUrl } from "./hosts";
import { noOverflow, staffSession, todayDatabase } from "./today-helpers";

const { connection, db } = todayDatabase();
test.afterAll(async () => {
  await connection.end();
});

for (const javaScriptEnabled of [false, true])
  test(`O01 a list that did not load is never a clear day, JavaScript ${javaScriptEnabled}`, async ({
    browser,
  }, testInfo) => {
    test.skip(
      process.env.E2E_TODAY_UNAVAILABLE !== "1" ||
        testInfo.config.workers !== 1 ||
        testInfo.project.name !== "chromium-desktop",
      "Renames a shared table: use the isolated single-worker run after the parallel suite.",
    );
    const context = await browser.newContext({
      javaScriptEnabled,
      viewport: { width: 1440, height: 900 },
    });
    try {
      const page = await context.newPage();
      await staffSession(db, context);
      await page.goto(hostUrl("staff", "/en/today"));
      // Without grants every list loads empty: a day without work.
      await expect(page.locator("[data-today-state=empty]")).toBeVisible();

      await connection.unsafe(
        "alter table appointment_resources rename to appointment_resources_o01_unavailable",
      );
      try {
        await page.reload();
      } finally {
        await connection.unsafe(
          "alter table appointment_resources_o01_unavailable rename to appointment_resources",
        );
      }
      const viewings = page.locator('[data-today-group="viewings"]');
      await expect(viewings).toHaveAttribute("data-today-status", "unavailable");
      await expect(viewings.getByRole("heading", { level: 3 })).toHaveText("ViewingsNot loaded");
      await expect(
        viewings.getByText("This list could not load. Work may be waiting in it."),
      ).toBeVisible();
      await expect(viewings.getByRole("list")).toHaveCount(0);
      // Never "all caught up": no empty state, and the headline says lists are missing.
      await expect(page.locator("[data-today-state=empty]")).toHaveCount(0);
      await expect(
        page.getByText(
          "Some lists could not load, so this is not all of today's work. Reload the page.",
        ),
      ).toBeVisible();
      // The lists that did load stay named as holding nothing; the failed one is not among them.
      const quiet = page.locator('[data-today-quiet="attention"]');
      await expect(quiet).toContainText("Nothing waiting: Unassigned requests · My overdue tasks");
      await expect(quiet).not.toContainText("Viewings");
      expect(await noOverflow(page)).toBe(true);
      if (javaScriptEnabled)
        expect(
          (
            await new AxeBuilder({ page })
              .include("main")
              .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`today-unavailable-1440-${javaScriptEnabled}.png`),
        fullPage: true,
      });
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        expect(await noOverflow(page)).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`today-unavailable-${width}-${javaScriptEnabled}.png`),
          fullPage: true,
        });
      }

      await viewings.getByRole("link", { name: "Reload the page" }).click();
      await expect(page.locator("[data-today-state=empty]")).toBeVisible();
      await expect(page.locator('[data-today-group="viewings"]')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
