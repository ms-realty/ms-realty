import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { auditHistoryCopy } from "../src/features/audit-history/copy";
import { privacyCopy } from "../src/features/privacy/copy";
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
      missingIdentityEventId: string;
      publishedEventId: string;
      publishedOperationId: string;
      publishedListingId: string;
      publicationReference: string;
      manifestId: string;
      restrictedEventId: string;
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
      await page.locator('main a[href="/en/operations/history"]:visible').click();
      await expect(page.getByRole("heading", { level: 1, name: copy.title })).toBeVisible();
      await page.getByLabel(copy.reference, { exact: true }).fill(f.reference);
      await page.getByRole("button", { name: copy.search, exact: true }).click();
      await expect(page.locator("[data-history-event]")).toHaveCount(2);
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
      await page.locator(`[data-history-event="${f.missingIdentityEventId}"] a`).click();
      await expect(detail).toContainText(copy.unknownActor);
      await expect(detail).toContainText(copy.noReason);
      await expect(detail).not.toContainText("Synthetic current history editor");
      await detail.screenshot({
        path: testInfo.outputPath(`w14-missing-identity-${javascript}.png`),
      });

      await page.goto(hostUrl("staff", `/en/operations/history/${f.publishedEventId}`));
      await expect(detail).toContainText(copy.published);
      await expect(detail).toContainText(copy.current.restricted);
      await expect(page.getByText(copy.current.restricted, { exact: true })).toBeInViewport({
        ratio: 1,
      });
      await expect(detail).toContainText(copy.boundary);
      await expect(detail).toContainText(f.publicationReference);
      const [event] = await db
        .select()
        .from(schema.auditEvents)
        .where(eq(schema.auditEvents.id, f.publishedEventId));
      expect(event?.operationId).toBe(f.publishedOperationId);
      const [operation] = await db
        .select()
        .from(schema.operations)
        .where(eq(schema.operations.id, f.publishedOperationId));
      expect(operation).toMatchObject({
        status: "succeeded",
        operationType: "publication.activate",
        outcome: { manifestId: f.manifestId, reference: f.publicationReference },
      });
      const [manifest] = await db
        .select()
        .from(schema.publicationManifests)
        .where(eq(schema.publicationManifests.id, f.manifestId));
      expect(manifest?.listingId).toBe(f.publishedListingId);
      const [delivery] = await db
        .select()
        .from(schema.destinationDeliveries)
        .where(
          and(
            eq(schema.destinationDeliveries.manifestId, f.manifestId),
            eq(schema.destinationDeliveries.listingId, f.publishedListingId),
            eq(schema.destinationDeliveries.kind, "publish"),
            eq(schema.destinationDeliveries.state, "verified"),
            eq(schema.destinationDeliveries.destination, "website"),
          ),
        );
      expect(delivery?.verifiedAt).toEqual(event?.occurredAt);
      expect(delivery?.generation).toBe(manifest?.generation);
      await detail.locator("summary").click();
      await expect(detail).toContainText(f.publishedOperationId);
      await expect(detail).toContainText(f.manifestId);
      await detail.screenshot({
        path: testInfo.outputPath(`w14-published-restricted-${javascript}.png`),
      });
      await page.goto(hostUrl("staff", `/en/operations/history/${f.restrictedEventId}`));
      await expect(detail).toContainText(copy.restricted);
      await expect(detail).toContainText("Synthetic later correction requires restriction");
      await expect(detail).not.toContainText(copy.published);
      await page.getByRole("link", { name: copy.back, exact: true }).click();
      await page.getByRole("link", { name: copy.privacy, exact: true }).click();
      await expect(page).toHaveURL(hostUrl("staff", "/en/operations/privacy"));
      await expect(
        page.getByRole("heading", { level: 1, name: privacyCopy("en").operations }),
      ).toBeVisible();
      await page
        .locator("main")
        .screenshot({ path: testInfo.outputPath(`w14-existing-privacy-${javascript}.png`) });
      await page.goto(hostUrl("staff", `/en/operations/history?reference=${f.hiddenReference}`));
      await expect(page.getByText(copy.emptyHelp)).toBeVisible();
      await expect(page.locator("[data-history-event]")).toHaveCount(0);
      expect([200, 404]).toContain(
        (await page.goto(hostUrl("staff", `/en/operations/history/${f.hiddenEventId}`)))?.status(),
      );
      await expect(page.locator("[data-history-detail]")).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText("PRIVATE_OTHER_LISTING");
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
      await context.close().catch((error: unknown) => {
        if (!String(error).includes("has been closed")) throw error;
      });
    }
  });
}
