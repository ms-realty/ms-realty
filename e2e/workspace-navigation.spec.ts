// Saved O01 navigation exercised with real authorization in this run's disposable database.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { type BrowserContext, expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { createStaff } from "../src/server/testing";
import { hostUrl, origins } from "./hosts";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("Workspace navigation requires the disposable browser database");
const connection = postgres(databaseUrl, { max: 2 });
const db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());

async function operator(context: BrowserContext) {
  const staff = await createStaff(db, { roles: ["assigned_broker"] });
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

for (const javaScriptEnabled of [true, false]) {
  test.describe(`complete staff navigation with JavaScript ${javaScriptEnabled}`, () => {
    test.use({ javaScriptEnabled });
    test("Tasks, Hermes and tools retain identity, locale and native navigation at every range", async ({
      context,
      page,
      browserName,
    }, testInfo) => {
      const name = await operator(context);
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const response = await page.goto(hostUrl("staff", "/en/today"));
        expect(response?.status()).toBe(200);
        const more = page.getByRole("button", { name: "More", exact: true });
        if (width < 1024) {
          await more.focus();
          await page.keyboard.press("Enter");
        }
        const account = page.locator("[data-workspace-account]:visible");
        await expect(account).toHaveCount(1);
        await expect(account).toContainText(name);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
        await page.screenshot({
          path: testInfo.outputPath(`workspace-nav-${width}-${javaScriptEnabled}.png`),
          fullPage: true,
        });
        const tasks = page.getByRole("banner").locator('nav a[href="/en/tasks"]');
        await expect(tasks).toBeVisible();
        const taskBox = await tasks.boundingBox();
        expect(taskBox?.height).toBeGreaterThanOrEqual(44);
        await tasks.click();
        await expect(page).toHaveURL(hostUrl("staff", "/en/tasks"));
        await expect(page.getByRole("banner").locator('nav a[href="/en/tasks"]')).toHaveAttribute(
          "aria-current",
          "page",
        );
      }
      await page.goto(hostUrl("staff", "/en/tasks?view=mine"));
      await page.getByRole("button", { name: /Interface language/ }).click();
      await page.getByRole("link", { name: "Русский", exact: true }).click();
      await expect(page).toHaveURL(hostUrl("staff", "/ru/tasks?view=mine"));
      await expect(page.getByRole("banner").locator('nav a[href="/ru/tasks"]')).toHaveAttribute(
        "aria-current",
        "page",
      );
      const hermes = page.getByRole("banner").locator('nav a[href="/ru/operations/assistance"]');
      await hermes.click();
      await expect(page.getByRole("main")).toBeVisible();
      await expect(hermes).toHaveAttribute("aria-current", "page");
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
  });
}

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
