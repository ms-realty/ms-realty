// F13: native human triage and persistence. Test provider only; no live mail.
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostUrl, origins } from "./hosts";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 2 }),
  db = drizzle(connection, { schema });
test.afterAll(async () => {
  await connection.end();
});
for (const decision of ["assign", "reject"] as const)
  test(`human inbound ${decision} without JavaScript`, async ({ browser }, testInfo) => {
    const f = JSON.parse(
      execFileSync(
        process.execPath,
        ["--conditions=react-server", "--import", "tsx", "src/server/inbound/browser-seed.ts"],
        {
          env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
          encoding: "utf8",
        },
      ),
    ) as { id: string; caseId: string; partyId: string; staffToken: string; clientToken: string };
    const context = await browser.newContext({ ...testInfo.project.use, javaScriptEnabled: false });
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
      await page.goto(hostUrl("staff", "/en/operations/inbound"));
      await page.locator(`a[href="/en/operations/inbound/${f.id}"]`).click();
      await expect(page.getByRole("heading", { name: "Review email", exact: true })).toBeVisible();
      await expect(
        page.getByText("Synthetic plain text. <script>alert('untrusted')</script>", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "untrusted.pdf" })).toHaveCount(0);
      if (decision === "assign") {
        const [record] = await db.select().from(schema.cases).where(eq(schema.cases.id, f.caseId));
        if (!record) throw new Error("Missing Case");
        await page
          .getByLabel("Find a Case by reference or title", { exact: true })
          .fill(record.reference);
        await page.getByRole("button", { name: "Find Case", exact: true }).click();
        await page.getByLabel("Choose a Case to review", { exact: true }).selectOption(f.caseId);
        await page.getByRole("button", { name: "Open Case context", exact: true }).click();
        await page
          .getByLabel("Current Case participant identified by your review", { exact: true })
          .selectOption(f.partyId);
      }
      await page
        .getByLabel("Reason and evidence for your decision", { exact: true })
        .fill("Independently reviewed this synthetic message and Case.");
      await page
        .getByLabel(
          "I reviewed the complete message and independently verified the Case and participant for assignment.",
          { exact: true },
        )
        .check();
      await page.screenshot({
        path: testInfo.outputPath(`inbound-${decision}-review.png`),
        fullPage: true,
      });
      if (decision === "assign")
        await db
          .update(schema.cases)
          .set({ version: sql`${schema.cases.version} + 1` })
          .where(eq(schema.cases.id, f.caseId));
      await page
        .getByRole("button", {
          name: decision === "assign" ? "Record in Case — staff only" : "Reject from triage",
          exact: true,
        })
        .click();
      if (decision === "assign") {
        await expect(page.getByRole("alert")).toContainText("Decision not saved");
        await expect(
          page.getByLabel("Reason and evidence for your decision", { exact: true }),
        ).toHaveValue("Independently reviewed this synthetic message and Case.");
        await expect(
          page.getByLabel("Current Case participant identified by your review", { exact: true }),
        ).toHaveValue(f.partyId);
        const checkbox = page.getByLabel(
          "I reviewed the complete message and independently verified the Case and participant for assignment.",
          { exact: true },
        );
        await expect(checkbox).not.toBeChecked();
        await checkbox.check();
        await page
          .getByRole("button", { name: "Record in Case — staff only", exact: true })
          .click();
      }
      await expect(page.locator("[data-inbound-receipt]")).toBeVisible();
      const receiptUrl = page.url();
      await page.reload();
      await expect(page.locator("[data-inbound-receipt]")).toBeVisible();
      const [row] = await db
        .select()
        .from(schema.inboundEmails)
        .where(eq(schema.inboundEmails.id, f.id));
      expect(row?.state).toBe(decision === "assign" ? "assigned" : "rejected");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      if (decision === "assign") {
        expect(row?.caseId).toBe(f.caseId);
        const [message] = await db
          .select()
          .from(schema.messages)
          .where(eq(schema.messages.id, row?.messageId ?? ""));
        expect(message).toMatchObject({ channel: "email", audience: "internal", attachments: [] });
        await page.goto(hostUrl("staff", `/en/cases/${f.caseId}/email`));
        await expect(
          page.getByRole("heading", { name: "Incoming email", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByText("Synthetic plain text. <script>alert('untrusted')</script>", {
            exact: true,
          }),
        ).toBeVisible();
      }
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
      const denied = await page.goto(receiptUrl);
      expect(page.url()).not.toBe(receiptUrl);
      await expect(page.locator("[data-inbound-receipt]")).toHaveCount(0);
      expect(denied?.status()).toBeLessThan(500);
    } finally {
      await context.close();
    }
  });
