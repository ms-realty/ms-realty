import { execFileSync } from "node:child_process";
import { expect, type Route, test } from "@playwright/test";
import { eq, inArray, sql } from "drizzle-orm";
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
  const authKey = process.env.E2E_AUTH_SECRET;
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
        env: { ...process.env, AUTH_SECRET: authKey, DATABASE_URL: databaseUrl },
      },
    ),
  ) as { staffToken: string; managerId: string; brokerId: string; caseId: string };
}

test("access administration does not disclose unreadable Cases in invitation choices", async ({
  page,
  context,
}) => {
  const f = seed();
  await db
    .update(schema.grants)
    .set({ revokedAt: new Date() })
    .where(eq(schema.grants.principalId, f.managerId));
  await db.insert(schema.grants).values({
    principalId: f.managerId,
    capability: "access.grant",
    reason: "Synthetic access administration only",
  });
  const records = await db
    .insert(schema.cases)
    .values(
      Array.from({ length: 201 }, (_, n) => ({
        reference: `C-ACCESS-${f.managerId}-${n}`,
        kind: "buyer" as const,
        stage: "needs_agreed",
        title: `Synthetic restricted Case ${n}`,
        ownerId: f.brokerId,
        nextAction: "Review synthetic requirements",
      })),
    )
    .returning({ id: schema.cases.id });
  const allowed = records.at(-1);
  if (!allowed) throw new Error("Missing Case fixture");
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
    // The permission result is the server-rendered form, independent of load-time resources.
    const restricted = await page.goto(hostUrl("staff", "/en/access/manage?q=restricted&page=2"), {
      waitUntil: "domcontentloaded",
    });
    expect(await restricted?.text()).not.toContain("Synthetic restricted Case");
    const choices = page.locator('select[name="caseId"]');
    await expect(choices).toBeVisible();
    await expect(choices.locator('option:not([value=""])')).toHaveCount(0);
    const [permission] = await db
      .insert(schema.grants)
      .values({
        principalId: f.managerId,
        capability: "case.read",
        recordType: "case",
        recordId: allowed.id,
        reason: "Synthetic one-Case read scope",
      })
      .returning();
    if (!permission) throw new Error("Missing permission fixture");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(choices).toBeVisible();
    await expect(choices.locator('option:not([value=""])')).toHaveCount(1);
    await expect(choices.locator(`option[value="${allowed.id}"]`)).toHaveText(
      /Synthetic restricted Case 200/,
    );
    await db
      .update(schema.grants)
      .set({ revokedAt: new Date() })
      .where(eq(schema.grants.id, permission.id));
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(choices).toBeVisible();
    await expect(choices.locator('option:not([value=""])')).toHaveCount(0);
  } finally {
    await db
      .update(schema.grants)
      .set({ revokedAt: new Date() })
      .where(eq(schema.grants.principalId, f.managerId));
    await db.delete(schema.cases).where(
      inArray(
        schema.cases.id,
        records.map(({ id }) => id),
      ),
    );
  }
});

test("offboarding keeps an unresolved operation after leaving and returning", async ({
  page,
  context,
  browser,
}) => {
  const fixture = seed();
  await context.addCookies([
    {
      name: "msr_staff_session",
      value: fixture.staffToken,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const url = hostUrl("staff", `/en/access/offboard/${fixture.brokerId}`);
  let held: Route | undefined;
  await page.route(url, async (route) => {
    if (route.request().method() === "POST") held = route;
    else await route.continue();
  });
  try {
    await page.goto(url);
    await page
      .getByLabel("Reason and handover plan", { exact: true })
      .fill("Manager reviewed the retained keys and case handover.");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "End staff access", exact: true }).click();
    await expect.poll(() => Boolean(held)).toBe(true);
    await page.goto(hostUrl("staff", "/en/access/manage"));
    await page.goto(url);
    await expect(page.getByRole("button", { name: "End staff access", exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByText(
        "The result is not confirmed. Keep this reference and check again before retrying.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByText("Access removal recorded:", { exact: false })).toHaveCount(0);
    const nativeContext = await browser.newContext({ javaScriptEnabled: false });
    try {
      await nativeContext.addCookies(await context.cookies());
      const nativePage = await nativeContext.newPage();
      await nativePage.goto(url);
      await expect(
        nativePage.getByRole("button", { name: "End staff access", exact: true }),
      ).toHaveCount(0);
      await expect(nativePage).toHaveURL(/\?receipt=/);
    } finally {
      await nativeContext.close();
    }
  } finally {
    await held?.abort().catch(() => {});
  }
});

for (const javaScriptEnabled of [true, false])
  test(`offboarding conflict preserves the draft and requires review, JavaScript ${javaScriptEnabled}`, async ({
    browser,
  }, testInfo) => {
    const fixture = seed();
    const context = await browser.newContext({
      ...testInfo.project.use,
      javaScriptEnabled,
      viewport: { width: 320, height: 844 },
    });
    try {
      await context.addCookies([
        {
          name: "msr_staff_session",
          value: fixture.staffToken,
          url: origins.staff,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const page = await context.newPage();
      await page.goto(hostUrl("staff", `/en/access/offboard/${fixture.brokerId}`));
      const reason = "Manager reviewed the retained keys and case handover.";
      await page.getByLabel("Reason and handover plan", { exact: true }).fill(reason);
      await page.getByRole("checkbox").check();
      await db
        .update(schema.principals)
        .set({
          displayName: "Updated synthetic colleague",
          version: sql`${schema.principals.version} + 1`,
        })
        .where(eq(schema.principals.id, fixture.brokerId));
      await page.getByRole("button", { name: "End staff access", exact: true }).click();
      await expect(page.getByLabel("Reason and handover plan", { exact: true })).toHaveValue(
        reason,
      );
      await expect(page.getByRole("checkbox")).not.toBeChecked();
      const review = page.getByRole("button", { name: "Apply my reviewed changes", exact: true });
      await expect(review).toBeVisible();
      await expect(page.getByText(/Updated synthetic colleague ·/).last()).toBeVisible();
      expect(
        (
          await db
            .select()
            .from(schema.staffMemberships)
            .where(eq(schema.staffMemberships.principalId, fixture.brokerId))
        )[0]?.state,
      ).toBe("active");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: testInfo.outputPath(`offboarding-conflict-${javaScriptEnabled}.png`),
        fullPage: true,
      });
      await page.getByRole("checkbox").check();
      await review.click();
      await expect(page.getByText("Access removal recorded:", { exact: false })).toBeVisible();
      await expect(page.getByText("Staff membership ended", { exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });

for (const conflict of [false, true])
  test(`offboarding reconciles a lost response after server settlement, conflict ${conflict}`, async ({
    page,
    context,
    playwright,
  }) => {
    const fixture = seed();
    await context.addCookies([
      {
        name: "msr_staff_session",
        value: fixture.staffToken,
        url: origins.staff,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const url = hostUrl("staff", `/en/access/offboard/${fixture.brokerId}`);
    let held: Route | undefined;
    let settled = false;
    let operationKey = "";
    // route.fetch applies response cookies to the browser even without route.fulfill.
    // An isolated proxy can drop response headers as well as the response body.
    // WebKit's intercepted request omits Cookie even from allHeaders; copy this synthetic
    // browser's cookies into the isolated proxy, never back from the proxy to the browser.
    const transport = await playwright.request.newContext({
      storageState: { cookies: await context.cookies(url), origins: [] },
    });
    await page.route(url, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      held = route;
      // Send the real command but never deliver its response to the page.
      const response = await transport.fetch(route.request(), {
        maxRedirects: 0,
        headers: await route.request().allHeaders(),
      });
      expect(response.status()).toBeLessThan(500);
      settled = true;
    });
    try {
      await page.goto(url);
      operationKey = await page.locator('input[name="_operationId"]').inputValue();
      await page
        .getByLabel("Reason and handover plan", { exact: true })
        .fill("Manager reviewed the retained keys and case handover.");
      await page.getByRole("checkbox").check();
      if (conflict)
        await db
          .update(schema.principals)
          .set({ version: sql`${schema.principals.version} + 1` })
          .where(eq(schema.principals.id, fixture.brokerId));
      await page.getByRole("button", { name: "End staff access", exact: true }).click();
      await expect.poll(() => settled).toBe(true);
      expect(
        await db
          .select({ status: schema.operations.status })
          .from(schema.operations)
          .where(eq(schema.operations.idempotencyKey, operationKey)),
      ).toHaveLength(1);
      await page.goto(hostUrl("staff", "/en/access/manage"));
      await page.goto(url);
      await expect(page.getByRole("button", { name: "End staff access", exact: true })).toHaveCount(
        0,
      );
      if (conflict) {
        await expect(
          page.getByText("This operation did not change access.", { exact: true }),
        ).toBeVisible();
        await page.getByRole("link", { name: "Review again before acting", exact: true }).click();
        await expect(
          page.getByRole("button", { name: "End staff access", exact: true }),
        ).toBeVisible();
        await expect(page.getByRole("checkbox")).not.toBeChecked();
      } else {
        await expect(page.getByText("Access removal recorded:", { exact: false })).toBeVisible();
        await expect(page.getByText("Staff membership ended", { exact: true })).toBeVisible();
      }
    } finally {
      await held?.abort().catch(() => {});
      await transport.dispose();
    }
  });
