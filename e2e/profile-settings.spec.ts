// O23/F30 personal settings use the real command ledger in this run's disposable database.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import settingsBg from "../messages/staff/bg/workspace.json" with { type: "json" };
import settings from "../messages/staff/en/workspace.json" with { type: "json" };
import settingsRu from "../messages/staff/ru/workspace.json" with { type: "json" };
import * as schema from "../src/db/schema";
import { workCopy } from "../src/features/work/copy";
import { hostUrl } from "./hosts";
import { enrolledStaff } from "./support/staff-session";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("Profile settings require the disposable browser database");
const connection = postgres(databaseUrl, { max: 2 });
const db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());
const copy = settings.personalSettings;
const form = workCopy("en").form;

for (const javaScriptEnabled of [true, false]) {
  test.describe(`O23 profile with JavaScript ${javaScriptEnabled}`, () => {
    test.use({ javaScriptEnabled });
    test("phone settings keep the selected view and all locale choices visible without horizontal scrolling", async ({
      context,
      page,
    }) => {
      await enrolledStaff(db, context, { roles: [] });
      await page.setViewportSize({ width: 320, height: 740 });
      for (const [locale, messages] of [
        ["en", settings.personalSettings],
        ["bg", settingsBg.personalSettings],
        ["ru", settingsRu.personalSettings],
      ] as const) {
        await page.goto(hostUrl("staff", `/${locale}/settings?section=security`));
        const views = page.getByRole("navigation", { name: messages.title, exact: true });
        const chooser = views.getByRole("button", {
          name: `${messages.title}: ${messages.securityNav}`,
          exact: true,
        });
        await expect(chooser).toBeVisible();
        await chooser.click();
        const profile = views.getByRole("link", { name: messages.profile, exact: true });
        await expect(profile).toBeInViewport({ ratio: 0.95 });
        await profile.click();
        await expect(
          page.getByRole("textbox", { name: messages.displayName, exact: true }),
        ).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          320,
        );
      }
    });
    test("invalid drafts survive, a name saves with its durable receipt, and another person cannot read it", async ({
      context,
      page,
    }, info) => {
      const staff = await enrolledStaff(db, context, { roles: [] });
      await page.goto(hostUrl("staff", "/en/settings"));
      await expect(
        page.getByRole("heading", { level: 1, name: copy.title, exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: copy.agency, exact: true })).toHaveCount(0);
      await expect(page.getByRole("main")).toContainText(staff.email);
      const input = page.getByRole("textbox", { name: copy.displayName, exact: true });
      await input.fill("   ");
      await page.getByRole("button", { name: copy.save, exact: true }).click();
      await expect(page.getByText(copy.invalidName, { exact: true })).toBeVisible();
      await expect(input).toHaveValue("   ");
      expect(
        (await db.select().from(schema.principals).where(eq(schema.principals.id, staff.id)))[0]
          ?.version,
      ).toBe(1);
      const operation = await page.locator('form input[name="_operationId"]').inputValue();
      await input.fill("Éva Стоянова");
      await page.getByRole("button", { name: copy.save, exact: true }).click();
      await expect(page.getByText(copy.saved, { exact: true })).toBeVisible();
      await expect(page.getByRole("main")).toContainText("Éva Стоянова");
      expect(
        (await db.select().from(schema.principals).where(eq(schema.principals.id, staff.id)))[0],
      ).toMatchObject({ version: 2, displayName: "Éva Стоянова", email: staff.email });
      const statusUrl = hostUrl(
        "staff",
        `/en/settings/operations/${encodeURIComponent(operation)}`,
      );
      await page.goto(statusUrl);
      await expect(
        page.getByRole("heading", { level: 1, name: copy.statusTitle, exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("main")).toContainText("Éva Стоянова");
      await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
      await page.screenshot({
        path: info.outputPath(`profile-receipt-${javaScriptEnabled}.png`),
        fullPage: true,
      });
      await page.getByRole("link", { name: copy.currentProfile, exact: true }).click();
      await expect(input).toHaveValue("Éva Стоянова");
      if (javaScriptEnabled)
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
      await enrolledStaff(db, context, { name: "Other fixture staff", roles: [] });
      await page.goto(statusUrl);
      await expect(page.getByRole("main")).toContainText(copy.missing);
      await expect(page.getByRole("main")).not.toContainText("Éva Стоянова");
    });
    test("a real version conflict preserves the draft and requires an explicit reviewed reapply", async ({
      context,
      page,
    }) => {
      const staff = await enrolledStaff(db, context, { roles: [] });
      await page.goto(hostUrl("staff", "/en/settings"));
      const input = page.getByRole("textbox", { name: copy.displayName, exact: true });
      await input.fill("My retained name");
      await db
        .update(schema.principals)
        .set({ displayName: "Newer recorded name", version: sql`${schema.principals.version} + 1` })
        .where(eq(schema.principals.id, staff.id));
      await page.getByRole("button", { name: copy.save, exact: true }).click();
      await expect(page.getByText(copy.conflict, { exact: true })).toBeVisible();
      await expect(input).toHaveValue("My retained name");
      await expect(page.getByRole("main")).toContainText("Newer recorded name");
      expect(
        (await db.select().from(schema.principals).where(eq(schema.principals.id, staff.id)))[0]
          ?.displayName,
      ).toBe("Newer recorded name");
      await page.getByRole("button", { name: form.reapply, exact: true }).click();
      await expect(page.getByText(copy.saved, { exact: true })).toBeVisible();
      expect(
        (await db.select().from(schema.principals).where(eq(schema.principals.id, staff.id)))[0],
      ).toMatchObject({ version: 3, displayName: "My retained name" });
    });
  });
}

test("permitted agency access and optional backup enrolment retain the workspace and personal return", async ({
  context,
  page,
}) => {
  const staff = await enrolledStaff(db, context, { roles: ["manager"] });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(hostUrl("staff", "/en/settings"));
  await page.getByRole("link", { name: copy.agency, exact: true }).click();
  await page.getByRole("link", { name: copy.team, exact: true }).click();
  await expect(page).toHaveURL(hostUrl("staff", "/en/access/manage"));
  await expect(page.getByRole("complementary", { name: "Workspace navigation" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: copy.openSettings, exact: true }).click();
  await page.getByRole("link", { name: copy.profile, exact: true }).click();
  await expect(page.getByRole("textbox", { name: copy.displayName, exact: true })).toHaveValue(
    staff.name,
  );
  await page.getByRole("link", { name: copy.securityNav, exact: true }).click();
  await page.getByRole("link", { name: copy.addPasskey, exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: copy.security, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Workspace navigation" })).toBeVisible();
  expect(
    await db.select().from(schema.passkeys).where(eq(schema.passkeys.principalId, staff.id)),
  ).toHaveLength(1);
});

test("a lost save acknowledgement retains the draft and reconciles the recorded name without replay", async ({
  context,
  page,
}) => {
  const staff = await enrolledStaff(db, context, { roles: [] });
  await page.goto(hostUrl("staff", "/en/settings"));
  const input = page.getByRole("textbox", { name: copy.displayName, exact: true });
  await input.fill("Recorded despite lost acknowledgement");
  await page.route("**/en/settings", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fetch();
    await route.abort("failed");
  });
  await page.getByRole("button", { name: copy.save, exact: true }).click();
  await expect(page.getByText(form.unknown, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("definition").filter({ hasText: "Recorded despite lost acknowledgement" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: copy.save, exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: copy.profileStatus, exact: true }).click();
  await expect(page.getByRole("main")).toContainText(copy.saved);
  await expect(page.getByRole("main")).toContainText("Recorded despite lost acknowledgement");
  await page.reload();
  expect(
    (await db.select().from(schema.principals).where(eq(schema.principals.id, staff.id)))[0]
      ?.version,
  ).toBe(2);
  expect(
    await db.select().from(schema.operations).where(eq(schema.operations.actorId, staff.id)),
  ).toHaveLength(1);
});
