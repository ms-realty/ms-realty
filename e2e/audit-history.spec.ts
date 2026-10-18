import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { auditHistoryCopy } from "../src/features/audit-history/copy";
import { hostUrl, origins } from "./hosts";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/u.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1 });
const db = drizzle(connection, { schema });
test.afterAll(async () => {
  await connection.end();
});

for (const javascript of [true, false]) {
  test(`W14-T3 listing history ${javascript ? "enhanced" : "native"}`, async ({
    browser,
  }, testInfo) => {
    const f = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "src/server/audit-history/browser-seed.ts",
        ],
        {
          env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
          encoding: "utf8",
        },
      ),
    ) as {
      token: string;
      deniedToken: string;
      readerId: string;
      reference: string;
      hiddenReference: string;
      eventId: string;
      hiddenEventId: string;
    };
    const context = await browser.newContext({
      ...testInfo.project.use,
      javaScriptEnabled: javascript,
    });
    const cookie = (token: string) => ({
      name: "msr_staff_session",
      value: token,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax" as const,
    });
    const copy = auditHistoryCopy("en");
    try {
      await context.addCookies([cookie(f.token)]);
      const page = await context.newPage();
      const writes: string[] = [];
      page.on("request", (request) => {
        if (request.url().includes("/operations/history") && request.method() !== "GET")
          writes.push(request.method());
      });
      const [before] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.operations);
      await page.goto(hostUrl("staff", "/en/operations"));
      await page.locator('a[href="/en/operations/history"]').first().click();
      await expect(page.getByRole("heading", { level: 1, name: copy.title })).toBeVisible();
      await page.getByLabel(copy.reference, { exact: true }).fill(f.reference);
      await page.getByRole("button", { name: copy.search, exact: true }).click();
      await expect(page.locator("[data-history-event]")).toHaveCount(1);
      await page.locator(`[data-history-event="${f.eventId}"] a`).click();
      const detail = page.locator("[data-history-detail]");
      await expect(detail).toContainText(f.reference);
      await expect(detail).toContainText("Synthetic current history editor");
      await expect(detail).toContainText("Synthetic recorded source correction");
      await expect(detail).toContainText(copy.working);
      await expect(detail).toContainText(copy.currentName);
      await expect(detail).toContainText(copy.noOldValues);
      await expect(detail).not.toContainText("PRIVATE_");
      await page.getByRole("link", { name: copy.checkAgain, exact: true }).click();
      await expect(page.locator(`[data-history-detail="${f.eventId}"]`)).toBeVisible();
      await detail.screenshot({ path: testInfo.outputPath(`w14-history-${javascript}.png`) });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      if (javascript) {
        const accessibility = await new AxeBuilder({ page })
          .include("[data-audit-history]")
          .analyze();
        expect(accessibility.violations).toEqual([]);
      }
      await page.getByRole("link", { name: copy.back, exact: true }).click();
      await expect(page.getByLabel(copy.reference, { exact: true })).toHaveValue(f.reference);
      await page.goto(hostUrl("staff", `/en/operations/history?reference=${f.hiddenReference}`));
      await expect(page.getByText(copy.emptyHelp)).toBeVisible();
      await expect(page.locator("[data-history-event]")).toHaveCount(0);
      expect(
        (await page.goto(hostUrl("staff", `/en/operations/history/${f.hiddenEventId}`)))?.status(),
      ).toBe(404);
      await page.goto(hostUrl("staff", "/en/operations/history?cursor=invalid-cursor"));
      await expect(page.getByText(copy.invalidHelp)).toBeVisible();
      await context.addCookies([cookie(f.deniedToken)]);
      await page.goto(hostUrl("staff", "/en/operations/history"));
      await expect(page.locator("[data-permission-state]")).toBeVisible();
      await expect(page.locator("[data-history-event]")).toHaveCount(0);
      await context.addCookies([cookie(f.token)]);
      await db
        .update(schema.grants)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(schema.grants.principalId, f.readerId),
            eq(schema.grants.capability, "audit.read"),
          ),
        );
      await page.goto(hostUrl("staff", `/en/operations/history/${f.eventId}`));
      await expect(page.locator("[data-permission-state]")).toBeVisible();
      await expect(page.locator("[data-history-detail]")).toHaveCount(0);
      await db
        .update(schema.sessions)
        .set({ revokedAt: new Date() })
        .where(eq(schema.sessions.principalId, f.readerId));
      await page.goto(hostUrl("staff", "/en/operations/history"));
      await expect(page).toHaveURL(/\/en\/access(?:\?|$)/u);
      const [after] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.operations);
      expect(after).toEqual(before);
      expect(writes).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
