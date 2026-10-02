import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostUrl, origins } from "./hosts";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(databaseUrl, { max: 2 }),
  db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());

for (const javaScriptEnabled of [true, false])
  test(`selected email recipients survive validation and enhancement, JavaScript ${javaScriptEnabled}`, async ({
    browser,
  }, testInfo) => {
    const authKey = process.env.E2E_AUTH_SECRET;
    const f = JSON.parse(
      execFileSync(
        process.execPath,
        ["--conditions=react-server", "--import", "tsx", "src/server/cases/email-browser-seed.ts"],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            AUTH_SECRET: authKey,
            DATABASE_URL: databaseUrl,
            E2E_CASE_MULTI_RECIPIENTS: "1",
          },
        },
      ),
    ) as { caseId: string; staffToken: string; addresses: string[] };
    const context = await browser.newContext({ ...testInfo.project.use, javaScriptEnabled });
    let release = () => {};
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
      if (javaScriptEnabled) {
        const ready = new Promise<void>((resolve) => {
          release = resolve;
        });
        await page.route("**/_next/**/*.js*", async (route) => {
          await ready;
          await route.continue();
        });
      }
      await page.goto(hostUrl("staff", `/en/cases/${f.caseId}/email`), { waitUntil: "commit" });
      const recipients = page.getByRole("group", { name: "Recipients (up to 10)", exact: true });
      for (const address of f.addresses)
        await recipients.getByLabel(address, { exact: true }).check();
      await page
        .getByLabel("Message", { exact: true })
        .fill("Synthetic common message, separately addressed.");
      release();
      if (javaScriptEnabled) await page.waitForLoadState("networkidle");
      await page
        .getByLabel("Message", { exact: true })
        .fill("Synthetic common message after enhancement, separately addressed.");
      for (const address of f.addresses)
        await expect(recipients.getByLabel(address, { exact: true })).toBeChecked();
      // Missing subject is rejected without losing either recipient or creating any draft.
      await page.getByRole("button", { name: "Save draft for review", exact: true }).click();
      await expect(
        page.getByRole("region", { name: "There is a problem", exact: true }),
      ).toBeVisible();
      for (const address of f.addresses)
        await expect(recipients.getByLabel(address, { exact: true })).toBeChecked();
      await page.getByLabel("Subject", { exact: true }).fill("Separate drafts for review");
      await page.getByRole("button", { name: "Save draft for review", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Change recorded", exact: true }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Open current record", exact: true }).click();
      await expect(page.getByRole("article")).toHaveCount(2);
      const messages = await db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.caseId, f.caseId));
      expect(messages).toHaveLength(2);
      expect(
        messages.every(
          (message) => message.state === "draft" && (message.recipients as unknown[]).length === 1,
        ),
      ).toBe(true);
      expect(
        await db
          .select()
          .from(schema.externalActions)
          .where(
            inArray(
              schema.externalActions.subjectId,
              messages.map((message) => message.id),
            ),
          ),
      ).toHaveLength(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    } finally {
      release();
      await context.close();
    }
  });
