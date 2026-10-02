// Plan §7/S5: private native complaint record, human decision and durable receipt.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
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
for (const javaScriptEnabled of [true, false])
  test(`complaint receipt, reviewed resolution, recovery and private history${javaScriptEnabled ? "" : " without JavaScript"}`, async ({
    browser,
  }, testInfo) => {
    const f = JSON.parse(
      execFileSync(
        process.execPath,
        ["--conditions=react-server", "--import", "tsx", "src/server/complaints/browser-seed.ts"],
        {
          env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
          encoding: "utf8",
        },
      ),
    ) as { staffToken: string; staffId: string; brokerToken: string };
    const context = await browser.newContext({ ...testInfo.project.use, javaScriptEnabled });
    const source = `Synthetic complaint ${randomUUID()}`;
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
      await page.goto(hostUrl("staff", "/en/operations/complaints"));
      await page.getByLabel("Source / external reference", { exact: true }).fill(source);
      await page
        .getByLabel("Received description", { exact: true })
        .fill("Synthetic complaint about a missed follow-up. No real customer.");
      await page.getByLabel("Due at · Europe/Sofia", { exact: true }).fill("2027-01-15T14:00");
      await page
        .getByLabel("I reviewed the record, owner, due date and outcome", { exact: true })
        .check();
      await page.getByRole("button", { name: "Record complaint", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Change recorded", exact: true }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Open current record", exact: true }).click();
      await expect(page.getByText(source, { exact: true })).toBeVisible();
      await page.getByLabel("State", { exact: true }).selectOption("resolved");
      await page
        .getByLabel("Reason and next step", { exact: true })
        .fill("Checked original source and recorded a synthetic response.");
      await page
        .getByLabel("I reviewed the record, owner, due date and outcome", { exact: true })
        .check();
      await page.getByRole("button", { name: "Record review", exact: true }).click();
      await expect(page.getByLabel("Reason and next step", { exact: true })).toHaveValue(
        "Checked original source and recorded a synthetic response.",
      );
      await expect(
        page.getByLabel("Actual outcome and external evidence", { exact: true }),
      ).toHaveAttribute("aria-invalid", "true");
      await expect(
        page.getByLabel("I reviewed the record, owner, due date and outcome", { exact: true }),
      ).not.toBeChecked();
      await page
        .getByLabel("Actual outcome and external evidence", { exact: true })
        .fill("Synthetic external response DEMO-1 acknowledged the missed follow-up.");
      await page
        .getByLabel("I reviewed the record, owner, due date and outcome", { exact: true })
        .check();
      await page.getByRole("button", { name: "Record review", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Change recorded", exact: true }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Open current record", exact: true }).click();
      const [record] = await db
        .select()
        .from(schema.complaints)
        .where(eq(schema.complaints.sourceReference, source));
      expect(record).toMatchObject({ state: "resolved", version: 2, ownerId: f.staffId });
      expect(
        await db
          .select()
          .from(schema.complaintReviews)
          .where(eq(schema.complaintReviews.complaintId, record?.id ?? "")),
      ).toHaveLength(2);
      await expect(
        page
          .getByRole("region", { name: "Decision history", exact: true })
          .getByText("Synthetic external response DEMO-1 acknowledged the missed follow-up.", {
            exact: true,
          }),
      ).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: testInfo.outputPath("complaint-resolved.png"),
        fullPage: true,
      });
      await context.clearCookies();
      await context.addCookies([
        {
          name: "msr_staff_session",
          value: f.brokerToken,
          url: origins.staff,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      await page.goto(hostUrl("staff", `/en/operations/complaints/${record?.id}`));
      await expect(page.getByText(source, { exact: true })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
