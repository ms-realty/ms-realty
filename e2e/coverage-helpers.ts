import { expect, type Page } from "@playwright/test";
import { hostUrl } from "./hosts";

/** Follow the user-visible pagination; fixture records need not be on the first page. */
export async function findCoverageRecord(page: Page, href: string) {
  await page.goto(hostUrl("staff", "/en/coverage"));
  for (let number = 1; number <= 100; number++) {
    if (await page.locator(`a[href="${href}"]`).count()) return true;
    const next = page.getByRole("link", { name: "Next page", exact: true });
    if (!(await next.count())) return false;
    await next.click();
    await expect(page).toHaveURL(new RegExp(`[?&]page=${number + 1}(?:&|$)`));
  }
  throw new Error("Coverage fixture exceeded 100 pages");
}
