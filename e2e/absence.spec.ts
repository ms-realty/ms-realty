import { execFileSync } from "node:child_process";
import { expect, type Route, test } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostUrl, origins } from "./hosts";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(databaseUrl, { max: 2 });
const db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());
function seed() {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "src/server/auth/offboarding-browser-seed.ts",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          AUTH_SECRET: process.env.E2E_AUTH_SECRET,
          DATABASE_URL: databaseUrl,
        },
      },
    ),
  ) as {
    staffToken: string;
    brokerId: string;
    caseId: string;
    keyId: string;
  };
}
const reviewAt = () => new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16);
const plan = "Review retained commitments and arrange agency coverage.";

for (const javaScriptEnabled of [true, false])
  test(`O23 absence and explicit return preserve commitments and custody, JavaScript ${javaScriptEnabled}`, async ({
    browser,
  }, testInfo) => {
    const f = seed();
    const [task] = await db
      .insert(schema.tasks)
      .values({
        ownerId: f.brokerId,
        caseId: f.caseId,
        title: `Synthetic absence ${f.brokerId}`,
        promisedToClient: true,
        dueAt: new Date("1900-01-01T10:00:00Z"),
      })
      .returning();
    if (!task) throw new Error("Missing task");
    const context = await browser.newContext({
      ...testInfo.project.use,
      javaScriptEnabled,
      viewport: { width: 320, height: 844 },
    });
    try {
      await context.addCookies([
        {
          name: "msr_staff_session",
          value: f.staffToken,
          url: origins.staff,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const page = await context.newPage();
      await page.goto(hostUrl("staff", "/en/access/manage"));
      await page.locator(`a[href="/en/access/absence/${f.brokerId}"]`).click();
      for (const locale of ["bg", "ru", "en"]) {
        await page.goto(hostUrl("staff", `/${locale}/access/absence/${f.brokerId}`));
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          320,
        );
      }
      await page.screenshot({
        path: testInfo.outputPath(`absence-form-${javaScriptEnabled}-320.png`),
        fullPage: true,
      });
      await page.getByLabel("Coverage review due (UTC)", { exact: true }).fill(reviewAt());
      await page.getByLabel("Coverage or return plan", { exact: true }).fill(plan);
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Record absence", exact: true }).click();
      await expect(page.getByText("Availability change recorded", { exact: false })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Absent", exact: true })).toBeVisible();
      await expect(page.locator("main")).not.toContainText("(UTC)");
      for (const locale of ["bg", "ru", "en"]) {
        await page.goto(hostUrl("staff", `/${locale}/access/absence/${f.brokerId}`));
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          320,
        );
      }
      await page.screenshot({
        path: testInfo.outputPath(`absence-${javaScriptEnabled}-320.png`),
        fullPage: true,
      });
      await page.getByRole("link", { name: "Agency coverage", exact: true }).click();
      await expect(page.getByRole("link", { name: task.title, exact: true })).toBeVisible();
      expect(
        (await db.select().from(schema.keySets).where(eq(schema.keySets.id, f.keyId)))[0],
      ).toMatchObject({ holderId: f.brokerId, state: "checked_out" });
      expect(
        (
          await db
            .select()
            .from(schema.staffMemberships)
            .where(eq(schema.staffMemberships.principalId, f.brokerId))
        )[0]?.state,
      ).toBe("active");
      await page.goto(hostUrl("staff", `/en/access/absence/${f.brokerId}`));
      await page
        .getByLabel("Coverage or return plan", { exact: true })
        .fill("Staff member returned; review retained commitments.");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Confirm return", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Available for work", exact: true }),
      ).toBeVisible();
      expect(await db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id))).toEqual([
        task,
      ]);
      await page.getByRole("link", { name: "Agency coverage", exact: true }).click();
      await expect(page.getByRole("link", { name: task.title, exact: true })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

test("O23 planned absence can be cancelled after explicit conflict review", async ({
  page,
  context,
}) => {
  const f = seed();
  await context.addCookies([
    {
      name: "msr_staff_session",
      value: f.staffToken,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto(hostUrl("staff", `/en/access/absence/${f.brokerId}`));
  await page
    .getByLabel("Starts at (UTC)", { exact: true })
    .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  await page.getByLabel("Coverage review due (UTC)", { exact: true }).fill(reviewAt());
  await page.getByLabel("Coverage or return plan", { exact: true }).fill(plan);
  await page.getByRole("checkbox").check();
  await db
    .update(schema.staffMemberships)
    .set({ version: sql`${schema.staffMemberships.version} + 1` })
    .where(eq(schema.staffMemberships.principalId, f.brokerId));
  await page.getByRole("button", { name: "Record absence", exact: true }).click();
  await expect(page.getByLabel("Coverage or return plan", { exact: true })).toHaveValue(plan);
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Apply my reviewed changes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Absence scheduled", exact: true })).toBeVisible();
  await page
    .getByLabel("Coverage or return plan", { exact: true })
    .fill("The scheduled absence is cancelled; work remains assigned.");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Cancel scheduled absence", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Available for work", exact: true }),
  ).toBeVisible();
});

test("O23 lost absence response reconciles one receipt after leaving and returning", async ({
  page,
  context,
  playwright,
}) => {
  const f = seed();
  await context.addCookies([
    {
      name: "msr_staff_session",
      value: f.staffToken,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const url = hostUrl("staff", `/en/access/absence/${f.brokerId}`);
  const transport = await playwright.request.newContext({
    storageState: { cookies: await context.cookies(url), origins: [] },
  });
  let held: Route | undefined,
    settled = false;
  await page.route(url, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    held = route;
    const response = await transport.fetch(route.request(), {
      maxRedirects: 0,
      headers: await route.request().allHeaders(),
    });
    expect(response.status()).toBeLessThan(500);
    settled = true;
  });
  try {
    await page.goto(url);
    const key = await page.locator('input[name="_operationId"]').inputValue();
    await page.getByLabel("Coverage review due (UTC)", { exact: true }).fill(reviewAt());
    await page.getByLabel("Coverage or return plan", { exact: true }).fill(plan);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Record absence", exact: true }).click();
    await expect.poll(() => settled).toBe(true);
    await page.goto(hostUrl("staff", "/en/access/manage"));
    await page.goto(url);
    await expect(page.getByText("Availability change recorded", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm return", exact: true })).toBeVisible();
    expect(
      await db.select().from(schema.operations).where(eq(schema.operations.idempotencyKey, key)),
    ).toHaveLength(1);
  } finally {
    await held?.abort().catch(() => {});
    await transport.dispose();
  }
});
