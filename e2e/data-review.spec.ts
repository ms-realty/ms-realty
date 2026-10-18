import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { dataReviewCopy } from "../src/features/import-review/copy";
import { hostUrl, origins } from "./hosts";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/u.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 2 }),
  db = drizzle(connection, { schema });
test.afterAll(async () => {
  await connection.end();
});
for (const javascript of [true, false])
  test(`W12 source preview and separate contact review ${javascript ? "enhanced" : "native"}`, async ({
    browser,
  }, testInfo) => {
    const f = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "src/server/import-review/browser-seed.ts",
        ],
        {
          env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
          encoding: "utf8",
        },
      ),
    ) as {
      reviewerId: string;
      token: string;
      deniedToken: string;
      left: string;
      right: string;
      leftEmail: string;
      rightEmail: string;
      leftInquiry: string;
    };
    const context = await browser.newContext({
      ...testInfo.project.use,
      javaScriptEnabled: javascript,
    });
    try {
      await context.addCookies([
        {
          name: "msr_staff_session",
          value: f.token,
          url: origins.staff,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const page = await context.newPage(),
        copy = dataReviewCopy("en"),
        c = copy.imports;
      await page.goto(hostUrl("staff", "/en/operations/imports"));
      await expect(page.getByRole("heading", { name: c.title, exact: true })).toBeVisible();
      await page.getByLabel(c.file, { exact: true }).setInputFiles({
        name: "unsupported.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: Buffer.from("not parsed"),
      });
      await page.getByRole("button", { name: c.choose, exact: true }).click();
      await expect(page.locator("[data-import-review]").getByRole("alert")).toContainText(
        c.failure,
      );
      await expect(page.locator("[data-import-problems]")).toHaveCount(0);
      await page.getByLabel(c.file, { exact: true }).setInputFiles({
        name: "synthetic-listings.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          '\uFEFFSource code,Source title,price,currency,area\r\nMS-W12,"  Exact, source title  ",unknown,EUR,70\r\nMS-W12,=1+1,100,EUR,71\r\nMS-W13,Ordinary source,1200,EUR,72\r\n',
        ),
      });
      await page.getByRole("button", { name: c.choose, exact: true }).click();
      await expect(page.getByRole("heading", { name: c.mapping, exact: true })).toBeVisible();
      await page.getByLabel(c.fields.reference, { exact: true }).selectOption("0");
      await page.getByLabel(c.fields.title, { exact: true }).selectOption("1");
      await page
        .locator("[data-import-review]")
        .screenshot({ path: testInfo.outputPath(`w12-mapping-${javascript}.png`) });
      await page.getByRole("button", { name: c.check, exact: true }).click();
      await expect(page.getByRole("heading", { name: c.problems, exact: true })).toBeVisible();
      await expect(page.locator("[data-source-row]")).toHaveCount(2);
      await expect(page.locator('[data-source-row="2"]')).toContainText(c.issues.number);
      await expect(page.locator('[data-source-row="3"]')).toContainText(c.issues.formula);
      await page.locator('[data-source-row="2"] summary').click();
      expect(
        await page.locator('[data-source-row="2"] [data-source-value]').nth(1).textContent(),
      ).toBe("  Exact, source title  ");
      await expect(page.locator("[data-import-review]")).toContainText(c.boundary);
      expect(
        await db
          .select()
          .from(schema.importBatches)
          .where(eq(schema.importBatches.createdById, f.reviewerId)),
      ).toEqual([]);
      await page
        .locator("[data-import-review]")
        .screenshot({ path: testInfo.outputPath(`w12-problems-${javascript}.png`) });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      if (javascript)
        expect(
          (
            await new AxeBuilder({ page })
              .include("[data-import-review]")
              .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
      const d = copy.duplicates;
      await page.goto(
        hostUrl("staff", `/en/operations/duplicates?left=${f.left}&right=${f.right}`),
      );
      await expect(page.locator(`[data-contact-comparison="${f.left}"]`)).toContainText(
        f.leftEmail,
      );
      await expect(page.locator(`[data-contact-comparison="${f.right}"]`)).toContainText(
        f.rightEmail,
      );
      await expect(page.locator("[data-duplicate-review]")).toContainText(d.scope);
      await page
        .getByLabel(d.nextStep, { exact: true })
        .fill("Ask the responsible broker to verify identity against the original contact source");
      await page.getByLabel(d.reviewed, { exact: true }).check();
      await page
        .locator("[data-duplicate-review]")
        .screenshot({ path: testInfo.outputPath(`w12-comparison-${javascript}.png`) });
      await page.getByRole("button", { name: d.defer, exact: true }).click();
      await expect(page.getByRole("heading", { name: d.pending, exact: true })).toBeVisible();
      await expect(page.locator("[data-contact-review-receipt]")).toContainText(
        "Synthetic data reviewer",
      );
      await expect(page.locator("[data-contact-review-receipt]")).toContainText(d.saved);
      const ownTasks = await db
        .select()
        .from(schema.tasks)
        .where(
          and(eq(schema.tasks.inquiryId, f.leftInquiry), eq(schema.tasks.ownerId, f.reviewerId)),
        );
      expect(ownTasks).toHaveLength(1);
      expect(ownTasks[0]).toMatchObject({
        type: "fact_verification",
        promisedToClient: false,
        state: "open",
      });
      for (const id of [f.left, f.right])
        expect(
          (await db.select().from(schema.parties).where(eq(schema.parties.id, id)))[0]
            ?.mergedIntoPartyId,
        ).toBeNull();
      expect(
        await db
          .select()
          .from(schema.mergeRecords)
          .where(eq(schema.mergeRecords.mergedId, f.right)),
      ).toEqual([]);
      await page.reload();
      await expect(page.getByRole("heading", { name: d.pending, exact: true })).toBeVisible();
      await page
        .locator("[data-contact-review-receipt]")
        .screenshot({ path: testInfo.outputPath(`w12-pending-${javascript}.png`) });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await context.clearCookies();
      await context.addCookies([
        {
          name: "msr_staff_session",
          value: f.deniedToken,
          url: origins.staff,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      expect((await page.goto(hostUrl("staff", "/en/operations/imports")))?.status()).toBe(404);
    } finally {
      await context.close();
    }
  });
