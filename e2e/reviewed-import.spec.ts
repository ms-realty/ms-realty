import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { dataReviewCopy } from "../src/features/import-review/copy";
import { importExecutionCopy } from "../src/features/import-review/execution-copy";
import { hostUrl, origins } from "./hosts";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/u.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 2 }),
  db = drizzle(connection, { schema });
test.afterAll(async () => {
  await connection.end();
});
const c = importExecutionCopy("en"),
  preview = dataReviewCopy("en").imports;
const csv = (rows: string[]) =>
  `reference,title,price,currency,area,bedrooms,location,sourceUrl\n${rows.join("\n")}`;
const row = (reference: string, title = "Synthetic new draft") =>
  `${reference},${title},200,EUR,70,0,Synthetic settlement,https://example.test/${reference}`;

async function prepare(page: Page, source: string) {
  await page.goto(hostUrl("staff", "/en/operations/imports"));
  await page.getByLabel(preview.file, { exact: true }).setInputFiles({
    name: "synthetic-reviewed.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(source),
  });
  await page.getByRole("button", { name: preview.choose, exact: true }).click();
  await page.getByRole("button", { name: preview.check, exact: true }).click();
  for (const [field, value] of Object.entries({
    country: "BG",
    propertyType: "apartment",
    purpose: "sale",
    areaBasis: "living",
    sourceLanguage: "bg",
  }))
    await page.locator(`[name="context.${field}"]`).selectOption(value);
  await page.locator('[name="context.region"]').fill("Synthetic region");
  await page.getByRole("button", { name: c.prepare, exact: true }).click();
  await expect(page.locator("[data-import-receipt]")).toBeVisible();
  return page.locator("[data-import-receipt]").getAttribute("data-import-receipt");
}
async function seal(page: Page) {
  await page.getByLabel(c.confirm, { exact: true }).check();
  await page.getByRole("button", { name: c.seal, exact: true }).click();
  await expect(page.getByRole("status")).toContainText(c.states.ready);
}
for (const javascript of [true, false])
  test(`F32 O28 AT55 exact reviewed subset, reconciliation, Stop and reversal ${javascript ? "enhanced" : "native"}`, async ({
    browser,
  }, info) => {
    const f = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "src/server/import-review/execution-browser-seed.ts",
        ],
        {
          env: { ...process.env, DATABASE_URL: url, AUTH_SECRET: process.env.E2E_AUTH_SECRET },
          encoding: "utf8",
        },
      ),
    ) as {
      token: string;
      reviewerId: string;
      refs: string[];
      listingId: string;
      originalDraft: unknown;
    };
    const context = await browser.newContext({
      ...info.project.use,
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
      const page = await context.newPage();
      const id = await prepare(
        page,
        csv([
          row(f.refs[0] as string, "  Updated source title  "),
          row(f.refs[1] as string),
          row(f.refs[2] as string),
        ]),
      );
      expect(id).toMatch(/^[a-f0-9-]{36}$/u);
      expect(
        await db
          .select()
          .from(schema.listings)
          .where(eq(schema.listings.reference, f.refs[1] as string)),
      ).toEqual([]);
      const first = page.locator('[data-import-row="2"]');
      await first.getByRole("checkbox").check();
      for (const select of await first.locator("select").all())
        await select.selectOption(
          (await select.getAttribute("name"))?.endsWith(".price") ? "keep" : "source",
        );
      await page.locator('[data-import-row="3"]').getByRole("checkbox").check();
      expect(await first.locator("[data-import-original]").nth(1).textContent()).toBe(
        "  Updated source title  ",
      );
      if (javascript) expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page
        .locator("[data-import-receipt]")
        .screenshot({ path: info.outputPath(`o28-reviewed-${javascript}.png`) });
      await seal(page);
      const post = page.waitForRequest(
        (request) =>
          request.method() === "POST" && request.url().includes("/en/operations/imports"),
      );
      await page.getByRole("button", { name: `${c.execute} · 2`, exact: true }).click();
      const originalRequest = await post;
      await expect(page.getByRole("status")).toContainText(c.states.completed);
      await expect(page.locator('[data-import-row="4"] [data-row-outcome]')).toHaveText(
        c.notSelected,
      );
      const [updated] = await db
        .select()
        .from(schema.listings)
        .where(eq(schema.listings.id, f.listingId));
      expect(updated?.draft).toMatchObject({
        title: "Updated source title",
        price: "100",
        sourceClass: "source_supplied",
      });
      expect(
        await db
          .select()
          .from(schema.listings)
          .where(eq(schema.listings.reference, f.refs[2] as string)),
      ).toEqual([]);
      const header: Record<string, string> = {
        ...originalRequest.headers(),
        origin: origins.staff,
      };
      delete header["content-length"];
      // Replay the actual native/enhanced action payload, as a lost response or double POST.
      const replay = await context.request.post(originalRequest.url(), {
        headers: header,
        data: originalRequest.postDataBuffer() ?? Buffer.alloc(0),
        maxRedirects: 0,
      });
      expect([200, 303]).toContain(replay.status());
      await page.goto(hostUrl("staff", `/en/operations/imports?review=${id}`));
      await expect(page.getByRole("status")).toContainText(c.states.completed);
      const receipts = await db
        .select()
        .from(schema.operations)
        .where(
          and(
            eq(schema.operations.actorId, f.reviewerId),
            eq(schema.operations.operationType, "staff_import.row"),
          ),
        );
      expect(receipts).toHaveLength(2);
      for (const receipt of receipts) {
        expect(
          await db
            .select()
            .from(schema.auditEvents)
            .where(eq(schema.auditEvents.operationId, receipt.id)),
        ).toHaveLength(1);
        expect(
          await db
            .select()
            .from(schema.outboxEvents)
            .where(eq(schema.outboxEvents.operationId, receipt.id)),
        ).toHaveLength(1);
      }
      await page.getByLabel(c.reverseConfirm, { exact: true }).check();
      await page.getByRole("button", { name: `${c.reverse} · 2`, exact: true }).click();
      await expect(page.getByText(c.reversals.reversed, { exact: true })).toHaveCount(2);
      expect(
        (await db.select().from(schema.listings).where(eq(schema.listings.id, f.listingId)))[0]
          ?.draft,
      ).toEqual(f.originalDraft);
      expect(
        (
          await db
            .select()
            .from(schema.listings)
            .where(eq(schema.listings.reference, f.refs[1] as string))
        )[0],
      ).toMatchObject({ commercialState: "withdrawn", draft: {} });
      const next = f.refs.slice(3);
      const stopId = await prepare(page, csv(next.map((ref) => row(ref))));
      for (const checkbox of await page.locator('[data-import-row] input[name="selected"]').all())
        await checkbox.check();
      await seal(page);
      await page.getByRole("button", { name: `${c.execute} · 11`, exact: true }).click();
      await expect(page.getByRole("status")).toContainText(c.states.partial);
      await expect(page.locator('[data-import-row="12"] [data-row-outcome]')).toHaveText(
        c.outcomes.pending,
      );
      await page.getByLabel(c.stopConfirm, { exact: true }).check();
      await page.getByRole("button", { name: c.stop, exact: true }).click();
      await expect(page.getByRole("status")).toContainText(c.states.cancelled);
      await page.getByRole("link", { name: c.refresh, exact: true }).click();
      await expect(page.locator("[data-import-receipt]")).toHaveAttribute(
        "data-import-receipt",
        stopId as string,
      );
      expect(
        await db
          .select()
          .from(schema.listings)
          .where(eq(schema.listings.reference, next[10] as string)),
      ).toEqual([]);
      expect(
        await db
          .select()
          .from(schema.listings)
          .where(inArray(schema.listings.reference, next.slice(0, 10))),
      ).toHaveLength(10);
      const imported = await db
        .select()
        .from(schema.listings)
        .where(inArray(schema.listings.reference, f.refs));
      expect(
        imported.every(
          (listing) => !listing.approvedRevisionId && listing.latestRevisionNumber === 0,
        ),
      ).toBe(true);
      expect(
        await db
          .select()
          .from(schema.listingRevisions)
          .where(
            inArray(
              schema.listingRevisions.listingId,
              imported.map((listing) => listing.id),
            ),
          ),
      ).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      if (javascript) expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page
        .locator("[data-import-receipt]")
        .screenshot({ path: info.outputPath(`o28-stopped-${javascript}.png`) });
    } finally {
      await context.close();
    }
  });
