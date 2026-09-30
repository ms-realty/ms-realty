// F13 / AT42: one explicitly selected inbound file; real storage/queue, synthetic provider only.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { attachmentCopy } from "../src/features/inbound/attachment-copy";
import { hostUrl, origins } from "./hosts";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 2 }),
  db = drizzle(connection, { schema });
test.afterAll(async () => {
  await connection.end();
});
for (const locale of ["bg", "ru", "en"])
  for (const javascript of [true, false]) {
    test(`selected inbound attachment ${locale} ${javascript ? "hydrated" : "native"}`, async ({
      browser,
    }, testInfo) => {
      const f = JSON.parse(
        execFileSync(
          process.execPath,
          ["--conditions=react-server", "--import", "tsx", "src/server/inbound/browser-seed.ts"],
          {
            env: {
              ...process.env,
              E2E_INBOUND_ATTACHMENTS: "1",
              AUTH_SECRET: process.env.E2E_AUTH_SECRET,
              DATABASE_URL: url,
            },
            encoding: "utf8",
          },
        ),
      ) as {
        id: string;
        attachmentId: string;
        caseId: string;
        staffToken: string;
        clientToken: string;
      };
      const context = await browser.newContext({
        ...testInfo.project.use,
        viewport: { width: 320, height: 900 },
        javaScriptEnabled: javascript,
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
        const page = await context.newPage(),
          c = attachmentCopy(locale),
          base = hostUrl("staff", `/${locale}/operations/inbound/${f.id}`);
        await page.goto(base);
        const form = page.locator("[data-attachment-form]");
        await expect(form).toBeVisible();
        await form.getByLabel(c.select, { exact: true }).selectOption(f.attachmentId);
        await form.getByLabel(c.fileName, { exact: true }).fill("selected-case-check.pdf");
        await form.getByLabel(c.purpose, { exact: true }).selectOption("case_check");
        await form.getByLabel(c.classification, { exact: true }).selectOption("property");
        await form
          .getByLabel(c.reason, { exact: true })
          .fill("Synthetic reviewed association with this Case and participant");
        await form.getByLabel(c.reviewed, { exact: true }).check();
        // A stale Case must reject the import and retain the person's selections, but not consent.
        await db
          .update(schema.cases)
          .set({ version: sql`${schema.cases.version}+1` })
          .where(eq(schema.cases.id, f.caseId));
        await form.getByRole("button", { name: c.submit, exact: true }).click();
        await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
        await expect(form.getByLabel(c.fileName, { exact: true })).toHaveValue(
          "selected-case-check.pdf",
        );
        await expect(form.getByLabel(c.select, { exact: true })).toHaveValue(f.attachmentId);
        await expect(form.getByLabel(c.purpose, { exact: true })).toHaveValue("case_check");
        await expect(form.getByLabel(c.reviewed, { exact: true })).not.toBeChecked();
        expect(
          await db
            .select()
            .from(schema.inboundAttachmentImports)
            .where(eq(schema.inboundAttachmentImports.inboundEmailId, f.id)),
        ).toHaveLength(0);
        await form.getByLabel(c.reviewed, { exact: true }).check();
        if (javascript) {
          const accessibility = await new AxeBuilder({ page })
            .include('section[aria-labelledby="attachment-title"]')
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
            .analyze();
          expect(accessibility.violations).toEqual([]);
        }
        await form.screenshot({
          path: testInfo.outputPath(
            `attachment-${locale}-${javascript ? "js" : "native"}-form.png`,
          ),
        });
        await form.getByRole("button", { name: c.submit, exact: true }).click();
        await expect(page.locator("[data-attachment-receipt]")).toBeVisible();
        await expect(page.locator(`[data-imported-attachment="${f.attachmentId}"]`)).toContainText(
          "selected-case-check.pdf",
        );
        await expect(page.locator("[data-attachment-form]")).toHaveCount(0);
        const receiptUrl = page.url();
        await page.reload();
        await expect(page.locator("[data-attachment-receipt]")).toBeVisible();
        const links = await db
          .select({ link: schema.inboundAttachmentImports, file: schema.documentVersions })
          .from(schema.inboundAttachmentImports)
          .innerJoin(
            schema.documentVersions,
            eq(schema.documentVersions.id, schema.inboundAttachmentImports.documentVersionId),
          )
          .where(eq(schema.inboundAttachmentImports.inboundEmailId, f.id));
        expect(links).toHaveLength(1);
        expect(links[0]?.file.reviewType).toBeNull();
        expect(links[0]?.link.senderPartyId).toBeTruthy();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(
            `attachment-${locale}-${javascript ? "js" : "native"}-receipt.png`,
          ),
          fullPage: true,
        });
        await page.goto(`${base}?importReceipt=${randomUUID()}`);
        await expect(page.locator("[data-attachment-receipt]")).toHaveCount(0);
        await expect(page.locator(`[data-imported-attachment="${f.attachmentId}"]`)).toBeVisible();
        await expect(page.locator("[data-attachment-form]")).toHaveCount(0);
        await context.clearCookies();
        await context.addCookies([
          {
            name: "msr_client_session",
            value: f.clientToken,
            url: origins.client,
            httpOnly: true,
            sameSite: "Lax",
          },
        ]);
        await page.goto(receiptUrl);
        await expect(page.locator("[data-attachment-receipt]")).toHaveCount(0);
        await expect(page.locator("[data-imported-attachment]")).toHaveCount(0);
      } finally {
        await context.close();
      }
    });
  }
