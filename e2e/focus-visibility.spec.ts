// M-017 (WCAG 2.2 SC 2.4.11, ux-spec §05.2) and M-107: a focused element is never hidden under
// the sticky public header, and every host's root document declares the shared viewport.
import { expect, type Locator, type Page, test } from "@playwright/test";
import { hostUrl } from "./hosts";

async function expectBelowHeader(page: Page, target: Locator) {
  const header = page.locator("header[data-public-header]");
  await expect(header).toBeVisible();
  // Let the browser finish any focus or fragment scrolling before measuring.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  const [headerBox, box, viewportHeight] = await Promise.all([
    header.evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect),
    target.evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect),
    page.evaluate(() => window.innerHeight),
  ]);
  expect(box.top, "focused element starts below the sticky header").toBeGreaterThanOrEqual(
    headerBox.bottom,
  );
  expect(box.bottom, "focused element ends inside the viewport").toBeLessThanOrEqual(
    viewportHeight,
  );
}

test("M-017 the skip link leaves the page heading in view below the sticky header", async ({
  page,
  browserName,
}, info) => {
  await page.goto("/en/inquire?purpose=question");
  // macOS WebKit tabs to fields only by default; Option-Tab is the native all-items key.
  await page.keyboard.press(
    browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab",
  );
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await expectBelowHeader(page, page.getByRole("heading", { level: 1 }));
  const offset = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingBlockStart),
  );
  const headerHeight = await page
    .locator("header[data-public-header]")
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(offset).toBeGreaterThanOrEqual(headerHeight);
  await page.screenshot({ path: info.outputPath("after-skip-link.png") });
});

test("M-017 a field focused just under the sticky header is scrolled into view", async ({
  page,
}, info) => {
  await page.goto("/en/inquire?purpose=question");
  const field = page.getByRole("main").getByRole("textbox").first();
  await expect(field).toBeVisible();
  // As when tabbing back up the page: the field sits under the header before it takes focus.
  await field.evaluate((el) =>
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 20),
  );
  const hiddenTop = await field.evaluate((el) => el.getBoundingClientRect().top);
  const headerBottom = await page
    .locator("header[data-public-header]")
    .evaluate((el) => el.getBoundingClientRect().bottom);
  expect(hiddenTop, "precondition: the field starts under the header").toBeLessThan(headerBottom);
  await field.focus();
  await expect(field).toBeFocused();
  await expectBelowHeader(page, field);
  await page.screenshot({ path: info.outputPath("after-field-focus.png") });
});

test("M-107 every host's root document declares the shared viewport", async ({ page }) => {
  for (const url of [
    "/en",
    "/en/no-such-page",
    hostUrl("client", "/en/access"),
    hostUrl("staff", "/en/access"),
  ]) {
    await page.goto(url);
    const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(viewport, url).toContain("width=device-width");
    expect(viewport, url).toContain("initial-scale=1");
    expect(viewport, url).toContain("viewport-fit=cover");
    // Keep native keyboard behavior: Linux WebKit rejects interactive-widget.
    expect(viewport, url).not.toContain("interactive-widget");
    expect(viewport, url).not.toMatch(/maximum-scale|user-scalable/);
    await expect(page.locator('meta[name="theme-color"]'), url).toHaveAttribute(
      "content",
      "#f8f7f3",
    );
    await expect(page.locator('meta[name="color-scheme"]'), url).toHaveAttribute(
      "content",
      "light",
    );
  }
});
