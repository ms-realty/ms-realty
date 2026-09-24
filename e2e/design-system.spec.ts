// Design-system specimen checks (spec §16, §17.2, §20.1; plan AD8, AD15).
// The chromium-mobile (390 px) and chromium-desktop (1440 px) projects run every test.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const wcag22aa = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const locales = [
  {
    locale: "bg",
    dir: "ltr",
    heading: "Образец на дизайн системата",
    primary: "Заявете оглед",
    skip: "Към образеца",
  },
  {
    locale: "en",
    dir: "ltr",
    heading: "Design system specimen",
    primary: "Request a viewing",
    skip: "Skip to the specimen",
  },
  {
    locale: "he",
    dir: "rtl",
    heading: "דוגמת מערכת העיצוב",
    primary: "בקשו סיור בנכס",
    skip: "דלגו לדוגמה",
  },
] as const;

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function openSpecimen(page: Page, locale: string) {
  const response = await page.goto(`/${locale}/design`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

for (const { locale, dir, heading, primary, skip } of locales) {
  test.describe(`design specimen · ${locale}`, () => {
    test(`renders every section in ${locale} (${dir}) without page-level horizontal scroll`, async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);
      await openSpecimen(page, locale);

      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute("dir", dir);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page.locator("main section[aria-labelledby] > h2")).toHaveCount(11);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);

      // Directional icons mirror in RTL; nothing else does.
      const chevron = page.locator("nav ol svg").first();
      const scale = await chevron.evaluate((element) => getComputedStyle(element).scale);
      if (dir === "rtl") expect(scale).toMatch(/^-1\b/);
      else expect(scale).toBe("none");

      expect(errors).toEqual([]);
    });

    test(`has no WCAG 2.2 AA violations in ${locale}`, async ({ page }) => {
      await openSpecimen(page, locale);
      const results = await new AxeBuilder({ page }).withTags(wcag22aa).analyze();
      const violations = results.violations.map((violation) => ({
        id: violation.id,
        targets: violation.nodes.map((node) => node.target.join(" ")),
      }));
      expect(violations).toEqual([]);
    });

    test(`shows keyboard focus and keeps primary controls at 44 px in ${locale}`, async ({
      page,
    }) => {
      await openSpecimen(page, locale);

      // The first Tab reaches the skip link, which becomes visible.
      await page.keyboard.press("Tab");
      const skipLink = page.getByRole("link", { name: skip, exact: true });
      await expect(skipLink).toBeFocused();
      await expect(skipLink).toBeInViewport();

      const primaryButton = page.getByRole("button", { name: primary, exact: true }).first();
      const focusTargets = [
        primaryButton,
        page.getByRole("textbox").first(),
        page.getByRole("combobox").first(),
        page.getByRole("tab").first(),
        page.locator("main a[href]").first(),
      ];
      for (const target of focusTargets) {
        await target.focus();
        await expect(target).toBeFocused();
        const outline = await target.evaluate((element) => {
          const style = getComputedStyle(element);
          return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
        });
        expect(outline.style).not.toBe("none");
        expect(outline.width).toBeGreaterThanOrEqual(2);
      }

      const controls = page.locator(
        [
          "main button:visible",
          "main input[type=text]:visible",
          "main input[type=email]:visible",
          "main [role=combobox]:visible",
          "main label:has(input[type=checkbox]):visible",
          "main label:has(input[type=radio]):visible",
          "main [role=tab]:visible",
          "main nav a:visible",
        ].join(", "),
      );
      const count = await controls.count();
      expect(count).toBeGreaterThan(30);
      const tooSmall: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const control = controls.nth(index);
        const box = await control.boundingBox();
        if (!box) continue;
        if (box.height < 43.5 || box.width < 43.5) {
          tooSmall.push(
            `${await control.evaluate((element) => element.outerHTML.slice(0, 120))} ${box.width}x${box.height}`,
          );
        }
      }
      expect(tooSmall).toEqual([]);
    });
  });
}

test("the filter sheet closes on browser Back without leaving the page", async ({ page }) => {
  await openSpecimen(page, "en");
  const url = page.url();

  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await expect(sheet).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include("[role=dialog]")
    .withTags(wcag22aa)
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);

  await page.goBack();
  await expect(sheet).toBeHidden();
  expect(page.url()).toBe(url);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("a modal dialog keeps focus inside and returns it to its trigger", async ({ page }) => {
  await openSpecimen(page, "en");
  const trigger = page.getByRole("button", { name: "Open dialog" });
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Share this shortlist" });
  await expect(dialog).toBeVisible();
  for (let step = 0; step < 4; step += 1) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("the error summary takes focus and links to the field (A17)", async ({ page }) => {
  await openSpecimen(page, "en");
  await page.getByRole("button", { name: "Send question to the team" }).click();

  const summary = page.getByRole("region", { name: "There is a problem" });
  await expect(summary).toBeFocused();
  await summary.getByRole("link", { name: "Enter an email address" }).click();
  await expect(page.getByRole("textbox", { name: "Email address" }).last()).toBeFocused();
});

test("status announcements stay audible while a modal dialog is open", async ({ page }) => {
  await openSpecimen(page, "en");
  await page.getByRole("button", { name: "Announce a status" }).click();
  const regions = page.locator("[data-announcer]");
  await expect(regions.first()).toBeAttached();

  await page.getByRole("button", { name: "Open dialog" }).click();
  await expect(page.getByRole("dialog", { name: "Share this shortlist" })).toBeVisible();
  // React Aria hides everything outside the modal; the live regions must be exempt.
  const hidden = await regions.evaluateAll(
    (elements) =>
      elements.filter((element) => element.closest("[inert], [aria-hidden=true]")).length,
  );
  expect(hidden).toBe(0);
});
