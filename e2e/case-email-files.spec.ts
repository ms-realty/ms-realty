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
  test(`selected private email files survive validation and enhancement, JavaScript ${javaScriptEnabled}`, async ({
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
            E2E_CASE_EMAIL_FILES: "1",
          },
        },
      ),
    ) as {
      caseId: string;
      staffToken: string;
      addresses: string[];
      fileId: string;
      fileName: string;
      fileHash: string;
    };
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
      const files = page.getByRole("group", {
        name: "Reviewed documents (up to 5, total 10 MiB)",
        exact: true,
      });
      await files.getByRole("checkbox").check();
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
      await expect(files.getByRole("checkbox")).toBeChecked();
      await page
        .getByLabel("Subject", { exact: true })
        .fill("Separate drafts with reviewed attachments");
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
      // Both recipient drafts were inserted in one transaction. Their timestamp tie
      // must not make native approval recovery depend on whichever row appears first.
      expect(new Set(messages.map((message) => message.createdAt.toISOString())).size).toBe(1);
      expect(
        messages.every(
          (message) => (message.attachments as { versionId: string }[])[0]?.versionId === f.fileId,
        ),
      ).toBe(true);
      await expect(page.getByRole("link", { name: f.fileName, exact: true })).toHaveCount(2);
      const download = await context.request.get(
        hostUrl("staff", `/api/files/private/document/${f.fileId}`),
      );
      expect(download.status()).toBe(200);
      expect((await download.body()).toString()).toContain("Synthetic client document");
      await expect(page.getByText(`SHA-256: ${f.fileHash}`, { exact: true })).toHaveCount(2);

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
      await page.screenshot({
        path: testInfo.outputPath("reviewed-email-files.png"),
        fullPage: true,
      });
      const first = page.getByRole("article").first();
      const approvedMessageId = await first.locator('input[name="messageId"]').inputValue();
      const sibling = messages.find((message) => message.id !== approvedMessageId);
      if (!sibling) throw new Error("The two-recipient fixture needs an untouched sibling draft");
      if (!javaScriptEnabled) {
        // Force history order to change between GET and native POST. Only fixture
        // ordering changes; recipient, files, version and reviewed content stay exact.
        await db
          .update(schema.messages)
          .set({
            createdAt: new Date(sibling.createdAt.getTime() + 1_000),
          })
          .where(eq(schema.messages.id, sibling.id));
      }
      await first
        .getByLabel(
          "I reviewed the recipient, complete email and every attached file shown above",
          { exact: true },
        )
        .check();
      await first.getByRole("button", { name: "Approve and queue email", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Change recorded", exact: true })).toHaveCount(
        1,
      );
      await expect(
        page
          .locator(`article[data-message-id="${approvedMessageId}"]`)
          .getByRole("heading", { name: "Change recorded", exact: true }),
      ).toBeVisible();
      const untouched = page.locator(`article[data-message-id="${sibling.id}"]`);
      await expect(
        untouched.getByRole("heading", { name: "Change recorded", exact: true }),
      ).toHaveCount(0);
      await expect(
        untouched.getByRole("checkbox", {
          name: "I reviewed the recipient, complete email and every attached file shown above",
          exact: true,
        }),
      ).not.toBeChecked();
      await expect(
        untouched.getByRole("button", { name: "Approve and queue email", exact: true }),
      ).toBeVisible();
      await expect(untouched.locator('input[name="messageId"]')).toHaveValue(sibling.id);
      const queued = await db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.caseId, f.caseId));
      expect(queued.filter((message) => message.state === "queued")).toHaveLength(1);
      expect(queued.filter((message) => message.state === "draft")).toHaveLength(1);
      expect(queued.find((message) => message.id === approvedMessageId)?.state).toBe("queued");
      expect(queued.find((message) => message.id === sibling.id)?.state).toBe("draft");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    } finally {
      release();
      await context.close();
    }
  });
