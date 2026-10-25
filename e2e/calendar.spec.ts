// O08 / L12 / F22: actual PostgreSQL intervals, native controls and complete mobile agenda.
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { calendarCopy } from "../src/features/appointments/calendar-copy";
import { calendarDay } from "../src/features/appointments/calendar-period";
import { caseCopy } from "../src/features/cases/copy";
import { hostUrl, origins } from "./hosts";

type Item = { id: string; reference: string };
type Fixture = {
  token: string;
  replacement: Item;
  teammate: Item;
  proposal: Item;
  hidden: Item;
  readOnly: Item;
  request: Item;
};
const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Calendar tests require the generated disposable database");
const connection = postgres(url, { max: 1 });
const db = drizzle(connection, { schema });
test.afterAll(async () => {
  await connection.end();
});
function seed(): Fixture {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "src/server/appointments/calendar-browser-seed.ts",
      ],
      {
        encoding: "utf8",
        env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
      },
    ).trim(),
  );
}

test("O08 polished staff calendar keeps a complete responsive itinerary and honest empty state", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium-desktop", "Focused staff composition evidence");
  test.setTimeout(90_000);
  const f = seed();
  await page.context().addCookies([
    {
      name: "msr_staff_session",
      value: f.token,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(hostUrl("staff", "/en/calendar?date=2030-10-27&view=week"));
  await expect(
    page.getByRole("article", { name: f.replacement.reference, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: calendarCopy("en").weekOverview })).toBeVisible();
  await expect(page.locator("#workspace-sidebar")).toBeVisible();
  await page.screenshot({ path: info.outputPath("synthetic-desktop-populated.png") });
  await page.screenshot({
    path: info.outputPath("synthetic-desktop-full-itinerary.png"),
    fullPage: true,
  });
  const scope = page.getByLabel(calendarCopy("en").scope, { exact: true });
  expect(await scope.boundingBox()).toMatchObject({ height: 44 });
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
  await expect(page.locator("[data-sidebar]")).toHaveAttribute("data-sidebar", "compact");
  await page.reload();
  await expect(page.locator("[data-sidebar]")).toHaveAttribute("data-sidebar", "compact");
  await page.screenshot({ path: info.outputPath("synthetic-desktop-compact-navigation.png") });
  await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
  await expect(page.locator("[data-sidebar]")).toHaveAttribute("data-sidebar", "expanded");
  await page.goto(hostUrl("staff", "/bg/calendar?date=2030-12-02&view=agenda"));
  await expect(page.getByText(calendarCopy("bg").empty, { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("synthetic-desktop-empty-bg.png") });
  await page.setViewportSize({ width: 1024, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  for (const locale of ["bg", "en", "ru"]) {
    const c = calendarCopy(locale);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(hostUrl("staff", `/${locale}/calendar?date=2030-10-27&view=week`));
    const appointment = page.getByRole("article", { name: f.replacement.reference, exact: true });
    await expect(appointment.getByText(c.reserved, { exact: true })).toBeVisible();
    await expect(appointment.getByText(c.buffer, { exact: false })).toContainText("30 / 30");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
    const details = page.getByText(c.details, { exact: true });
    await details.click();
    await expect(page.getByText(c.scopeNote, { exact: true })).toBeVisible();
    await expect(page.getByText(c.snapshotNote, { exact: true })).toBeVisible();
    await details.click();
    expect(
      (
        await new AxeBuilder({ page })
          .include("main")
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    if (locale === "bg") {
      await page.screenshot({ path: info.outputPath("synthetic-mobile-populated-bg.png") });
      await page.screenshot({
        path: info.outputPath("synthetic-mobile-full-itinerary-bg.png"),
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(hostUrl("staff", "/en/settings?section=preferences"));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("#workspace-sidebar")).toBeVisible();
  await page.screenshot({ path: info.outputPath("synthetic-desktop-settings-context.png") });
});

for (const javaScriptEnabled of [false, true])
  test.describe(`O08 JavaScript ${javaScriptEnabled ? "on" : "off"}`, () => {
    test.use({ javaScriptEnabled });
    test("calendar navigation, DST, permitted scope and scheduling drill-down work with native controls", async ({
      page,
    }, info) => {
      const f = seed();
      const c = calendarCopy("en");
      const read = async () =>
        (
          await db
            .select()
            .from(schema.appointments)
            .where(eq(schema.appointments.id, f.replacement.id))
        )[0];
      const before = await read();
      await page.context().addCookies([
        {
          name: "msr_staff_session",
          value: f.token,
          url: origins.staff,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const path = "/en/calendar?date=2030-10-27&view=day&zone=Europe%2FSofia&scope=team";
      await page.goto(hostUrl("staff", path));
      await expect(
        page.getByRole("heading", { level: 1, name: caseCopy("en").calendar, exact: true }),
      ).toBeVisible();
      const viewing = page.getByRole("article", { name: f.replacement.reference, exact: true });
      await expect(viewing.getByText(c.current, { exact: true })).toBeVisible();
      await expect(viewing.getByText(c.replacement, { exact: true })).toBeVisible();
      await expect(
        viewing.locator('time[datetime="2030-10-27T00:30:00.000Z"]').first(),
      ).toContainText("03:30 GMT+3");
      await expect(
        viewing.locator('time[datetime="2030-10-27T01:30:00.000Z"]').first(),
      ).toContainText("03:30 GMT+2");
      await expect(viewing.getByText(c.buffer, { exact: false })).toContainText("30 / 30");
      await expect(
        page.getByRole("link", { name: `${c.open} ${f.request.reference}`, exact: true }),
      ).toBeVisible();
      await expect(page.getByText(f.hidden.reference, { exact: true })).toHaveCount(0);
      await expect(page.getByText(f.readOnly.reference, { exact: true })).toHaveCount(0);
      await expect(
        page.getByText("PRIVATE_SYNTHETIC_ACCESS_CODE_DO_NOT_PROJECT", { exact: true }),
      ).toHaveCount(0);
      const originalViewport = page.viewportSize();
      await page.setViewportSize({ width: 320, height: 844 });
      await expect(viewing.getByRole("link", { name: c.open, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        320,
      );
      await page.screenshot({
        path: info.outputPath("calendar-mobile-agenda.png"),
        fullPage: true,
      });
      if (javaScriptEnabled)
        expect(
          (
            await new AxeBuilder({ page })
              .include("main")
              .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
      if (originalViewport) await page.setViewportSize(originalViewport);

      const week = page.getByRole("link", { name: c.week, exact: true });
      await week.focus();
      await week.press("Enter");
      await expect(page.getByRole("link", { name: c.week, exact: true })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await page.getByRole("link", { name: c.next, exact: true }).click();
      await expect(page.getByLabel(c.date, { exact: true })).toHaveValue("2030-11-03");
      await expect(
        page.getByRole("article", { name: f.teammate.reference, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("article", { name: f.proposal.reference, exact: true }),
      ).toBeVisible();
      await page.getByLabel(c.scope, { exact: true }).selectOption("mine");
      await page.getByLabel(c.date, { exact: true }).fill("2030-10-28");
      await page.getByRole("button", { name: c.apply, exact: true }).focus();
      await page.getByRole("button", { name: c.apply, exact: true }).press("Enter");
      await expect(page.getByLabel(c.scope, { exact: true })).toHaveValue("mine");
      await expect(
        page.getByRole("article", { name: f.teammate.reference, exact: true }),
      ).toHaveCount(0);
      await expect(
        page
          .getByRole("article", { name: f.replacement.reference, exact: true })
          .getByText(c.overlap, { exact: false }),
      ).toBeVisible();
      await page.getByLabel(c.zone, { exact: true }).selectOption("UTC");
      await page.getByRole("button", { name: c.apply, exact: true }).click();
      await expect(page.getByLabel(c.zone, { exact: true })).toHaveValue("UTC");
      await expect(
        page
          .getByRole("article", { name: f.replacement.reference, exact: true })
          .locator('time[datetime="2030-10-27T00:30:00.000Z"]')
          .first(),
      ).toContainText("00:30 GMT");
      await page.getByRole("link", { name: c.previous, exact: true }).click();
      await expect(page.getByLabel(c.date, { exact: true })).toHaveValue("2030-10-21");
      await expect(page.getByLabel(c.zone, { exact: true })).toHaveValue("UTC");
      await expect(page.getByLabel(c.scope, { exact: true })).toHaveValue("mine");
      await page
        .getByRole("navigation", { name: c.navigation, exact: true })
        .getByRole("link", { name: c.today, exact: true })
        .click();
      await expect(page.getByLabel(c.date, { exact: true })).toHaveValue(
        calendarDay(new Date(), "UTC"),
      );

      for (const locale of ["bg", "ru", "en"]) {
        const local = calendarCopy(locale);
        await page.goto(hostUrl("staff", path.replace("/en/", `/${locale}/`)));
        await expect(page.getByLabel(local.zone, { exact: true })).toHaveValue("Europe/Sofia");
        await expect(page.getByRole("button", { name: local.apply, exact: true })).toBeVisible();
        await expect(
          page
            .getByRole("article", { name: f.replacement.reference, exact: true })
            .getByText(local.current, { exact: true }),
        ).toBeVisible();
      }
      await page
        .getByRole("article", { name: f.replacement.reference, exact: true })
        .getByRole("link", { name: c.open, exact: true })
        .click();
      await expect(
        page.getByRole("heading", { level: 1, name: caseCopy("en").appointmentTitle, exact: true }),
      ).toBeVisible();
      await expect(page.getByText(f.replacement.reference, { exact: true })).toBeVisible();
      const after = await read();
      expect(after).toMatchObject({
        state: before?.state,
        version: before?.version,
        confirmedStartsAt: before?.confirmedStartsAt,
        confirmedEndsAt: before?.confirmedEndsAt,
        proposedStartsAt: before?.proposedStartsAt,
        proposedEndsAt: before?.proposedEndsAt,
      });
    });
  });
