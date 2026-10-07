// Saved O01 navigation, the phone context bar (Figma 18:2906) and X02 agency tools (22:1103,
// 23:4648), exercised with real authorization in this run's disposable database.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import type { Role } from "../src/domain/capabilities";
import { createStaff } from "../src/server/testing";
import { hostUrl, origins } from "./hosts";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("Workspace navigation requires the disposable browser database");
const connection = postgres(databaseUrl, { max: 2 });
const db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());

async function operator(context: BrowserContext, roles: Role[] = ["assigned_broker"]) {
  const staff = await createStaff(db, { roles });
  const name = `Broker${randomUUID().replaceAll("-", "")}${"W".repeat(82)}`;
  expect(name).toHaveLength(120);
  await db
    .update(schema.principals)
    .set({ displayName: name })
    .where(eq(schema.principals.id, staff.id));
  await db.insert(schema.passkeys).values(
    [0, 1].map(() => ({
      principalId: staff.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.sessions).values({
    principalKind: "staff",
    principalId: staff.id,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(Date.now() + 3600000),
    lastSeenAt: new Date(),
    reverifiedAt: new Date(),
  });
  await context.addCookies([
    {
      name: "msr_staff_session",
      value: token,
      url: origins.staff,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  return name;
}

const copy = {
  en: { menu: "Open menu", tools: "Agency tools", signOut: "Sign out" },
  ru: { menu: "Открыть меню", tools: "Инструменты агентства", signOut: "Выйти" },
} as const;

/** X02 from the phone context bar: in place as a dialog with JavaScript, else its own page. */
async function openTools(
  page: Page,
  javaScriptEnabled: boolean,
  locale: keyof typeof copy = "en",
): Promise<Locator> {
  const menu = page.getByRole("banner").getByRole("link", { name: copy[locale].menu });
  // Hydrated, the control opens the dialog instead of following its link.
  if (javaScriptEnabled) await expect(menu).toHaveAttribute("aria-haspopup", "dialog");
  await menu.click();
  if (!javaScriptEnabled) {
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

const hrefs = (links: Locator) =>
  links.evaluateAll((all) => all.map((link) => link.getAttribute("href")));
/** The destinations X02 lists inside `scope`, in order. */
const rowHrefs = (scope: Locator) => hrefs(scope.getByRole("navigation").getByRole("link"));

const everyday = [
  "/en/today",
  "/en/inquiries",
  "/en/cases",
  "/en/inventory",
  "/en/calendar",
  "/en/tasks",
];

async function noHorizontalScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
}

for (const javaScriptEnabled of [true, false]) {
  test.describe(`complete staff navigation with JavaScript ${javaScriptEnabled}`, () => {
    test.use({ javaScriptEnabled });
    test("Tasks, Butler and tools retain identity, locale and native navigation at every range", async ({
      context,
      page,
      browserName,
    }, testInfo) => {
      const name = await operator(context);
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const response = await page.goto(hostUrl("staff", "/en/today"));
        expect(response?.status()).toBe(200);
        // Below lg every destination and the person live in X02; wide screens keep the rail.
        const phone = width < 1024;
        const tools = phone ? await openTools(page, javaScriptEnabled) : page.getByRole("banner");
        const account = page.locator("[data-workspace-account]:visible");
        await expect(account).toHaveCount(1);
        await expect(account).toContainText(name);
        await noHorizontalScroll(page, width);
        await page.screenshot({
          path: testInfo.outputPath(`workspace-nav-${width}-${javaScriptEnabled}.png`),
          fullPage: true,
        });
        const tasks = tools.locator('nav a[href="/en/tasks"]');
        await expect(tasks).toBeVisible();
        const taskBox = await tasks.boundingBox();
        expect(taskBox?.height).toBeGreaterThanOrEqual(44);
        await tasks.click();
        await expect(page).toHaveURL(hostUrl("staff", "/en/tasks"));
        if (!phone) {
          await expect(page.getByRole("banner").locator('nav a[href="/en/tasks"]')).toHaveAttribute(
            "aria-current",
            "page",
          );
        } else if (javaScriptEnabled) {
          // X02 over the page marks where the person is.
          const dialog = await openTools(page, true);
          await expect(dialog.locator('nav a[href="/en/tasks"]')).toHaveAttribute(
            "aria-current",
            "page",
          );
          await expect(dialog.locator('[aria-current="page"]')).toHaveCount(1);
          await page.keyboard.press("Escape");
          await expect(dialog).toBeHidden();
        }
      }
      await page.goto(hostUrl("staff", "/en/tasks?view=mine"));
      await page.getByRole("button", { name: /Interface language/ }).click();
      await page.getByRole("link", { name: "Русский", exact: true }).click();
      await expect(page).toHaveURL(hostUrl("staff", "/ru/tasks?view=mine"));
      await expect(page.getByRole("banner").locator('nav a[href="/ru/tasks"]')).toHaveAttribute(
        "aria-current",
        "page",
      );
      const butler = page.getByRole("banner").locator('nav a[href="/ru/operations/assistance"]');
      await butler.click();
      await expect(page.getByRole("main")).toBeVisible();
      await expect(butler).toHaveAttribute("aria-current", "page");
      await expect(
        page.getByRole("banner").locator('nav a[href="/ru/operations"]'),
      ).not.toHaveAttribute("aria-current", "page");
      await page.goBack();
      await expect(page).toHaveURL(hostUrl("staff", "/ru/tasks?view=mine"));
      await page.goto(hostUrl("staff", "/en/today"));
      await page.keyboard.press(
        browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab",
      );
      await expect(
        page.getByRole("link", { name: "Skip to main content", exact: true }),
      ).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("main")).toBeFocused();
      if (javaScriptEnabled) {
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
      } else {
        // Playwright disables browser timers with scripting. Axe's asynchronous
        // runner cannot settle there; the native keyboard, named destinations,
        // full identity, control sizes and current-page assertions above still run.
        await testInfo.attach("native-accessibility-coverage", {
          contentType: "text/plain",
          body: "Native keyboard and navigation assertions passed. Timer-dependent axe runs in the enhanced counterpart only; no native axe result is claimed.",
        });
      }
    });

    test("phones: the context bar holds the logo, Butler and the X02 menu (18:2906)", async ({
      context,
      page,
    }) => {
      await operator(context);
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(hostUrl("staff", "/en/inquiries"));
        const bar = page.getByRole("banner");
        await expect(bar.getByRole("img", { name: "MS Realty", exact: true })).toBeVisible();
        // No tab row, no inline search, no disclosure: two controls, each a 44 px target.
        const controls = bar.getByRole("link");
        await expect(controls).toHaveCount(2);
        await expect(bar.getByRole("button")).toHaveCount(0);
        await expect(bar.getByRole("searchbox")).toHaveCount(0);
        await expect(controls.nth(0)).toHaveAccessibleName("Butler");
        await expect(controls.nth(0)).toHaveAttribute("href", "/en/operations/assistance");
        await expect(controls.nth(1)).toHaveAccessibleName(copy.en.menu);
        await expect(controls.nth(1)).toHaveAttribute("href", "/en/operations");
        for (const control of await controls.all()) {
          const box = await control.boundingBox();
          expect(box?.height).toBeGreaterThanOrEqual(44);
          expect(box?.width).toBeGreaterThanOrEqual(44);
        }
        // 76 px bar on the 20 px gutter, its divider below.
        const barBox = await bar.boundingBox();
        expect(barBox?.height).toBe(77);
        const logo = await bar.getByRole("img", { name: "MS Realty" }).boundingBox();
        expect(logo?.x).toBe(20);
        const menuBox = await controls.nth(1).boundingBox();
        expect(Math.round((menuBox?.x ?? 0) + (menuBox?.width ?? 0))).toBe(width - 20);
        await noHorizontalScroll(page, width);
      }
      await page.getByRole("banner").getByRole("link", { name: "Butler" }).click();
      await expect(page).toHaveURL(hostUrl("staff", "/en/operations/assistance"));
      await expect(page.getByRole("banner").getByRole("link", { name: "Butler" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });

    test("phones: X02 keeps the interface language and sign out reachable", async ({
      context,
      page,
    }) => {
      await operator(context);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(hostUrl("staff", "/en/tasks?view=mine"));
      const tools = await openTools(page, javaScriptEnabled);
      await tools.getByRole("button", { name: /Interface language/ }).click();
      await tools.getByRole("link", { name: "Русский", exact: true }).click();
      // In place the page itself changes language; the tools page reopens in Russian.
      await expect(page).toHaveURL(
        hostUrl("staff", javaScriptEnabled ? "/ru/tasks?view=mine" : "/ru/operations"),
      );
      await expect(page.locator("html")).toHaveAttribute("lang", "ru");
      const russian = javaScriptEnabled
        ? await openTools(page, true, "ru")
        : page.getByRole("main");
      await expect(
        russian.getByRole("navigation", { name: "Работа", exact: true }).getByRole("link"),
      ).toHaveCount(8);
      await russian.getByRole("button", { name: copy.ru.signOut, exact: true }).click();
      await expect(page).toHaveURL((url) => url.pathname === "/ru/access");
    });

    test("X02 is the «More tools» page: a focused state whose Close returns to the page left", async ({
      context,
      page,
    }) => {
      await operator(context);
      // Wide screens reach it from the rail; phones without JavaScript from the context bar.
      for (const width of [1440, 390]) {
        if (width < 1024 && javaScriptEnabled) continue;
        await page.setViewportSize({ width, height: 900 });
        await page.goto(hostUrl("staff", "/en/inventory"));
        if (width >= 1024) {
          await page.getByRole("banner").getByRole("link", { name: "More tools" }).click();
          await expect(page).toHaveURL(hostUrl("staff", "/en/operations"));
        } else {
          await openTools(page, false);
        }
        await expect(
          page.getByRole("heading", { level: 1, name: copy.en.tools, exact: true }),
        ).toBeVisible();
        await expect(page.getByRole("navigation", { name: "Workspace" })).toBeHidden();
        await expect(page.locator('[data-focused-state] img[alt="MS Realty"]')).toBeVisible();
        // The person, language and sign out stay with the rail on wide screens.
        await expect(page.locator("[data-workspace-account]:visible")).toHaveCount(
          width >= 1024 ? 0 : 1,
        );
        await noHorizontalScroll(page, width);
        if (javaScriptEnabled)
          expect(
            (
              await new AxeBuilder({ page })
                .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
                .analyze()
            ).violations,
          ).toEqual([]);
        await page.getByRole("link", { name: "Close", exact: true }).click();
        await expect(page).toHaveURL(hostUrl("staff", "/en/inventory"));
      }
      // Opened directly, Close goes to Today.
      await page.goto(hostUrl("staff", "/en/operations"));
      await page.getByRole("link", { name: "Close", exact: true }).click();
      await expect(page).toHaveURL(hostUrl("staff", "/en/today"));
    });
  });
}

test("X02 opens in place as a modal: focus moves in, the page is inert, focus returns", async ({
  context,
  page,
}) => {
  await operator(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(hostUrl("staff", "/en/cases"));
  const menu = page.getByRole("banner").getByRole("link", { name: copy.en.menu });
  await expect(menu).toHaveAttribute("aria-haspopup", "dialog");
  await menu.click();
  const dialog = page.getByRole("dialog", { name: copy.en.tools, exact: true });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(hostUrl("staff", "/en/cases"));
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  // The panel covers the page and keyboard focus stays inside it.
  expect(
    await page.evaluate(
      () => document.getElementById("agency-tools-menu")?.matches(":modal") ?? false,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      [
        [10, 10],
        [195, 420],
        [380, 830],
      ].every(([x, y]) => document.elementFromPoint(x ?? 0, y ?? 0)?.closest("dialog")),
    ),
  ).toBe(true);
  for (let step = 0; step < 30; step++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => {
        const active = document.activeElement;
        return !active || active === document.body || Boolean(active.closest("dialog"));
      }),
    ).toBe(true);
  }
  expect(
    (
      await new AxeBuilder({ page })
        .include("#agency-tools-menu")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  // The language list opens above its control, in view; Escape closes one layer at a time.
  const language = dialog.getByRole("button", { name: /Interface language/ });
  await language.click();
  const russian = dialog.getByRole("link", { name: "Русский", exact: true });
  await expect(russian).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(russian).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(language).toBeFocused();
  // Escape and Close each return focus to the menu control, on the same page.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(menu).toBeFocused();
  await menu.click();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(menu).toBeFocused();
  await expect(page).toHaveURL(hostUrl("staff", "/en/cases"));
  // The current page is marked; choosing a destination closes the panel and goes there.
  await menu.click();
  await expect(dialog.locator('[aria-current="page"]')).toHaveAttribute("href", "/en/cases");
  await dialog.getByRole("link", { name: /^Calendar/ }).click();
  await expect(page).toHaveURL(hostUrl("staff", "/en/calendar"));
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("X02 offers every working destination to a permitted user, and each answers 200", async ({
  context,
  page,
}) => {
  await operator(context, ["manager", "assigned_broker", "content_editor"]);
  await page.goto(hostUrl("staff", "/en/operations"));
  const tools = page.getByRole("main");
  const work = tools.getByRole("navigation", { name: "Work", exact: true });
  const management = tools.getByRole("navigation", { name: "Content and management" });
  expect(await hrefs(work.getByRole("link"))).toEqual([
    ...everyday,
    "/en/coverage",
    "/en/operations/inbound",
    "/en/operations/keys",
    "/en/operations/complaints",
  ]);
  expect(await hrefs(management.getByRole("link"))).toEqual([
    "/en/content",
    "/en/access/manage",
    "/en/operations/jobs",
    "/en/operations/privacy",
    "/en/operations/subscriptions",
  ]);
  // Each row: folder icon, title, one-line description and chevron (23:4663).
  const team = management.getByRole("link", { name: /^Team and access/ });
  await expect(team).toHaveAccessibleName("Team and access People and permissions");
  await expect(team.locator("img")).toHaveCount(2);
  for (const href of await rowHrefs(tools)) {
    const response = await page.goto(hostUrl("staff", href ?? ""));
    expect(response?.status(), href ?? "").toBe(200);
    expect(new URL(page.url()).pathname, href ?? "").toBe(href);
  }
});

test("X02 hides what a restricted user may not open", async ({ context, page }) => {
  await operator(context, ["coordinator"]);
  await page.goto(hostUrl("staff", "/en/operations"));
  const tools = page.getByRole("main");
  expect(await rowHrefs(tools)).toEqual(everyday);
  await expect(tools.getByRole("navigation")).toHaveCount(1);
  for (const hidden of ["Team and access", "Pages", "Agency coverage", "Incoming email"])
    await expect(tools.getByRole("link", { name: new RegExp(`^${hidden}`) })).toHaveCount(0);
});

test("saved light foundation loads real heading and body faces, including Hebrew", async ({
  page,
}) => {
  for (const locale of ["en", "bg", "he"]) {
    await page.goto(`/${locale}`);
    const heading = page.getByRole("heading", { level: 1 });
    const family = await heading.evaluate((element) => getComputedStyle(element).fontFamily);
    expect(family.split(",")[0]).toContain(locale === "he" ? "Noto Sans Hebrew" : "Noto Sans");
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor),
    ).toBe("rgb(248, 247, 243)");
    const loaded = await page.evaluate(() =>
      [...document.fonts]
        .filter((face) => face.status === "loaded")
        .map((face) => face.family.replaceAll('"', "")),
    );
    expect(loaded).toContain(locale === "he" ? "Noto Sans Hebrew" : "Noto Sans");
    expect(loaded).toContain("Noto Sans");
  }
});
