// O01/X02: one coherent navigation system, with native destinations and real scoped guards.
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostUrl } from "./hosts";
import { enrolledStaff } from "./support/staff-session";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("Workspace navigation requires the disposable browser database");
const connection = postgres(databaseUrl, { max: 2 });
const db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());
const copy = {
  en: { menu: "Open navigation", tools: "All pages", signOut: "Sign out" },
  ru: { menu: "Открыть навигацию", tools: "Все страницы", signOut: "Выйти" },
} as const;
const sidebar = (page: Page) => page.locator("#workspace-sidebar");
async function openTools(
  page: Page,
  enhanced: boolean,
  locale: keyof typeof copy = "en",
): Promise<Locator> {
  const wide = (page.viewportSize()?.width ?? 1440) >= 1024;
  const trigger = wide
    ? page
        .getByRole("complementary")
        .getByRole("link", { name: locale === "en" ? "All pages" : "Все страницы", exact: true })
    : page.getByRole("banner").getByRole("link", { name: copy[locale].menu, exact: true });
  if (enhanced) await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
  await trigger.click();
  if (!enhanced) {
    await expect(page).toHaveURL((url) => url.pathname === `/${locale}/operations`);
    await expect(
      page.getByRole("heading", { level: 1, name: copy[locale].tools, exact: true }),
    ).toBeVisible();
    return page.getByRole("main");
  }
  const dialog = page.getByRole("dialog", { name: copy[locale].tools, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}
async function noHorizontalScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
}
const expectedWork = [
  "/en/today",
  "/en/inquiries",
  "/en/cases",
  "/en/inventory",
  "/en/calendar",
  "/en/tasks",
  "/en/contacts",
  "/en/coverage",
  "/en/operations/inbound",
];

for (const javaScriptEnabled of [true, false]) {
  test.describe(`O01/X02 navigation with JavaScript ${javaScriptEnabled}`, () => {
    test.use({ javaScriptEnabled });
    test("everyday work, identity and native destinations fit each range, including a 120-character name", async ({
      context,
      page,
    }, info) => {
      const name = `Broker${randomUUID().replaceAll("-", "")}${"W".repeat(82)}`;
      expect(name).toHaveLength(120);
      await enrolledStaff(db, context, { name });
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect((await page.goto(hostUrl("staff", "/en/today")))?.status()).toBe(200);
        const phone = width < 1024;
        const scope = phone ? await openTools(page, javaScriptEnabled) : sidebar(page);
        const account = page.locator("[data-workspace-account]:visible");
        await expect(account).toHaveCount(1);
        await expect(account).toContainText(name);
        await noHorizontalScroll(page, width);
        const tasks = scope.locator('nav a[href="/en/tasks"]');
        await expect(tasks).toBeVisible();
        expect((await tasks.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        await page.screenshot({
          path: info.outputPath(`navigation-${width}-${javaScriptEnabled}.png`),
          fullPage: true,
        });
        await tasks.click();
        await expect(page).toHaveURL(hostUrl("staff", "/en/tasks"));
        if (!phone)
          await expect(sidebar(page).locator('nav a[href="/en/tasks"]')).toHaveAttribute(
            "aria-current",
            "page",
          );
        else if (javaScriptEnabled) {
          const dialog = await openTools(page, true);
          await expect(dialog.locator('nav a[href="/en/tasks"]')).toHaveAttribute(
            "aria-current",
            "page",
          );
          await page.keyboard.press("Escape");
          await expect(dialog).toBeHidden();
        }
      }
      await page.goto(hostUrl("staff", "/en/tasks?view=mine"));
      await page
        .getByRole("banner")
        .getByRole("button", { name: /Interface language/ })
        .click();
      await page.getByRole("link", { name: "Русский", exact: true }).click();
      await expect(page).toHaveURL(hostUrl("staff", "/ru/tasks?view=mine"));
      await expect(sidebar(page).locator('nav a[href="/ru/tasks"]')).toHaveAttribute(
        "aria-current",
        "page",
      );
      await sidebar(page).getByRole("link", { name: "Butler", exact: true }).click();
      await expect(page).toHaveURL(hostUrl("staff", "/ru/operations/assistance"));
      await expect(
        sidebar(page).getByRole("link", { name: "Butler", exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await page.goBack();
      await expect(page).toHaveURL(hostUrl("staff", "/ru/tasks?view=mine"));
    });
    test("all pages remains permission filtered, with personal settings and working language/sign out", async ({
      context,
      page,
    }) => {
      await enrolledStaff(db, context);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(hostUrl("staff", "/en/tasks?view=mine"));
      const tools = await openTools(page, javaScriptEnabled);
      const hrefs = await tools
        .getByRole("navigation", { name: "Work", exact: true })
        .getByRole("link")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
      expect(hrefs).toEqual(expectedWork);
      await expect(
        tools.getByRole("navigation", { name: "Your account" }).getByRole("link"),
      ).toHaveAttribute("href", "/en/settings");
      await expect(tools.locator('a[href="/en/access/manage"]')).toHaveCount(0);
      await tools.getByRole("button", { name: /Interface language/ }).click();
      await tools.getByRole("link", { name: "Русский", exact: true }).click();
      await expect(page).toHaveURL(
        hostUrl("staff", javaScriptEnabled ? "/ru/tasks?view=mine" : "/ru/operations"),
      );
      const russian = javaScriptEnabled
        ? await openTools(page, true, "ru")
        : page.getByRole("main");
      await russian.getByRole("button", { name: copy.ru.signOut, exact: true }).click();
      await expect(page).toHaveURL((url) => url.pathname === "/ru/access");
    });
    test("compact preference survives navigation and reload without taking away native links", async ({
      context,
      page,
    }) => {
      await enrolledStaff(db, context);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(hostUrl("staff", "/en/tasks?view=mine"));
      await page
        .getByRole("banner")
        .getByRole("button", { name: "Collapse sidebar", exact: true })
        .click();
      await expect(page.locator('[data-sidebar="compact"]')).toHaveCount(1);
      await expect(page).toHaveURL(hostUrl("staff", "/en/tasks?view=mine"));
      expect((await sidebar(page).boundingBox())?.width).toBe(80);
      await sidebar(page).getByRole("link", { name: "Contacts", exact: true }).click();
      await expect(page).toHaveURL(hostUrl("staff", "/en/contacts"));
      await page.reload();
      await expect(page.locator('[data-sidebar="compact"]')).toHaveCount(1);
      await page
        .getByRole("banner")
        .getByRole("button", { name: "Expand sidebar", exact: true })
        .click();
      await expect(page.locator('[data-sidebar="expanded"]')).toHaveCount(1);
      await noHorizontalScroll(page, 1440);
    });
    test("a direct or native all-pages visit is a focused state with a safe Close destination", async ({
      context,
      page,
    }) => {
      await enrolledStaff(db, context);
      await page.goto(hostUrl("staff", "/en/operations"));
      await expect(
        page.getByRole("heading", { level: 1, name: "All pages", exact: true }),
      ).toBeVisible();
      await expect(sidebar(page)).toBeHidden();
      await expect(page.locator("[data-workspace-account]:visible")).toHaveCount(1);
      await page.getByRole("link", { name: "Close", exact: true }).click();
      await expect(page).toHaveURL(hostUrl("staff", "/en/today"));
      if (!javaScriptEnabled) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(hostUrl("staff", "/en/inventory"));
        await openTools(page, false);
        await page.getByRole("link", { name: "Close", exact: true }).click();
        await expect(page).toHaveURL(hostUrl("staff", "/en/inventory"));
      }
    });
  });
}

test("X02 modal keeps focus, stable filtering, nested Escape and return focus on desktop and short phones", async ({
  context,
  page,
  browserName,
}, info) => {
  await enrolledStaff(db, context);
  for (const size of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 360 },
  ]) {
    await page.setViewportSize(size);
    await page.goto(hostUrl("staff", "/en/cases"));
    const trigger =
      size.width >= 1024
        ? sidebar(page).getByRole("link", { name: "All pages", exact: true })
        : page.getByRole("banner").getByRole("link", { name: "Open navigation", exact: true });
    const dialog = await openTools(page, true);
    const filter = dialog.getByRole("searchbox", { name: "Find a page…", exact: true });
    await expect(filter).toBeFocused();
    if (size.height < 480)
      await expect(dialog.locator('nav a[href="/en/today"]')).toBeInViewport({
        ratio: 0.95,
      });
    expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
    const before = await dialog.boundingBox();
    await filter.fill("PROFILE");
    await expect(dialog.getByRole("status")).toHaveText("Pages found: 1");
    await expect(dialog.getByRole("navigation")).toHaveCount(1);
    expect(await dialog.boundingBox()).toEqual(before);
    await filter.fill("no such destination");
    await expect(dialog.getByText("No matching pages. Try another name.")).toBeVisible();
    await dialog.getByRole("button", { name: "Clear page filter", exact: true }).click();
    await expect(filter).toBeFocused();
    for (let index = 0; index < 20; index++) {
      await page.keyboard.press(
        browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab",
      );
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest("dialog")))).toBe(
        true,
      );
    }
    const language = dialog.getByRole("button", { name: /Interface language/ });
    await language.click();
    await expect(dialog.getByRole("link", { name: "Русский", exact: true })).toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(language).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(language).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await noHorizontalScroll(page, size.width);
    await trigger.click();
    expect(
      (
        await new AxeBuilder({ page })
          .include("#agency-tools-menu")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`page-picker-${size.width}-${size.height}.png`),
    });
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
  }
});

test("account disclosure and page shortcut preserve keyboard focus without intercepting typing", async ({
  context,
  page,
  browserName,
}) => {
  await enrolledStaff(db, context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(hostUrl("staff", "/en/settings"));
  const account = sidebar(page).getByRole("button", { name: /^Account: Test Broker/ });
  await account.click();
  await expect(
    sidebar(page).getByRole("link", { name: "Profile & settings", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(account).toBeFocused();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
  const dialog = page.getByRole("dialog", { name: "All pages", exact: true });
  await expect(dialog.getByRole("searchbox")).toBeFocused();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(account).toBeFocused();
  await page.getByRole("textbox", { name: "Your name", exact: true }).fill("Kept draft");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Your name", exact: true })).toHaveValue(
    "Kept draft",
  );
  await page.reload();
  await page.keyboard.press(
    browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab",
  );
  await expect(page.getByRole("link", { name: "Skip to main content", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
});
