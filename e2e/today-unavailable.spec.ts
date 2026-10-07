// O01: a list whose read failed is drawn apart from a ready empty list, and recovers.
// Waiting on Codex's server test seam: a way to fail one Today queue read for one request. The
// earlier version renamed appointment_resources, which every Today, coverage and appointment
// read shares, and that raced the other workers, so this case stays skipped (in CI too) until
// the seam lands; the two "Seam" lines below mark where it plugs in. Meanwhile the rendering
// is covered by src/features/work/today-screen.test.tsx and a real failed PostgreSQL read by
// src/server/work/today-read.int.test.ts.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { hostUrl } from "./hosts";
import { noOverflow, staffSession, todayDatabase } from "./today-helpers";

test.fixme("O01 a list that did not load is never a clear day, and recovers", async ({
  page,
  context,
}) => {
  const { connection, db } = todayDatabase();
  try {
    // Without grants every list loads empty: a day without work.
    await staffSession(db, context);
    // Seam: fail the viewings read for the next request only.
    await page.goto(hostUrl("staff", "/en/today"));
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
    const quiet = page.locator('[data-today-quiet="attention"]');
    await expect(quiet).toContainText("Nothing waiting: Unassigned requests · My overdue tasks");
    await expect(quiet).not.toContainText("Viewings");
    expect(await noOverflow(page)).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .include("main")
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    // Seam: let the next read succeed.
    await viewings.getByRole("link", { name: "Reload the page" }).click();
    await expect(page.locator("[data-today-state=empty]")).toBeVisible();
    await expect(page.locator('[data-today-group="viewings"]')).toHaveCount(0);
  } finally {
    await connection.end();
  }
});
