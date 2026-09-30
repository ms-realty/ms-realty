import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
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
  ) as {
    staffToken: string;
    managerId: string;
    brokerId: string;
    brokerToken: string;
    caseId: string;
    keyId: string;
  };
}

for (const javaScriptEnabled of [true, false])
  test(`revocation routes work to coverage until individually accepted, JavaScript ${javaScriptEnabled}`, async ({
    browser,
  }, testInfo) => {
    const f = seed();
    const [task] = await db
      .insert(schema.tasks)
      .values({
        ownerId: f.brokerId,
        caseId: f.caseId,
        title: `Synthetic coverage ${f.brokerId}`,
        promisedToClient: true,
        dueAt: new Date("1900-01-01T10:00:00Z"),
      })
      .returning();
    if (!task) throw new Error("Missing task");
    const context = await browser.newContext({
      ...testInfo.project.use,
      javaScriptEnabled,
      viewport: { width: 320, height: 844 },
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
      const page = await context.newPage();
      const findCoverageRecord = async (href: string) => {
        await page.goto(hostUrl("staff", "/en/coverage"));
        for (let n = 0; n < 10; n++) {
          const record = page.locator(`a[href="${href}"]`);
          if (await record.count()) {
            await expect(record).toBeVisible();
            return;
          }
          await page.getByRole("link", { name: "Next page", exact: true }).click();
        }
        throw new Error(`Coverage record not found: ${href}`);
      };
      await page.goto(hostUrl("staff", `/en/access/offboard/${f.brokerId}`));
      await page
        .getByLabel("Reason and handover plan", { exact: true })
        .fill("Manager will review the retained work in agency coverage.");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "End staff access", exact: true }).click();
      await expect(page.getByText("Staff membership ended", { exact: true })).toBeVisible();
      await page.goto(hostUrl("staff", "/en/today"));
      await page
        .getByRole("navigation", { name: "Details", exact: true })
        .getByRole("link", { name: "Agency coverage", exact: true })
        .click();
      for (const [locale, heading] of [
        ["bg", "Дежурна опашка"],
        ["ru", "Очередь подхвата"],
        ["en", "Agency coverage"],
      ]) {
        await page.goto(hostUrl("staff", `/${locale}/coverage`));
        await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
        await expect(page.locator(`a[href="/${locale}/tasks/${task.id}"]`)).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
      await expect(
        page.getByRole("region", { name: "Tasks needing coverage", exact: true }),
      ).toContainText("Promised to a client");
      await findCoverageRecord(`/en/cases/${f.caseId}`);
      await findCoverageRecord(`/en/operations/keys/${f.keyId}`);
      expect(
        (await db.select().from(schema.keySets).where(eq(schema.keySets.id, f.keyId)))[0],
      ).toMatchObject({ holderId: f.brokerId, state: "checked_out", version: 2 });
      await page.goto(hostUrl("staff", "/en/coverage"));
      await page.screenshot({
        path: testInfo.outputPath(`coverage-${javaScriptEnabled}-320.png`),
        fullPage: false,
      });
      await page.locator(`a[href="/en/tasks/${task.id}"]`).click();
      const request = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Request task handover", exact: true }) });
      await request.getByLabel("Receiving colleague", { exact: true }).selectOption(f.managerId);
      await request
        .getByLabel("Reason and handover notes", { exact: true })
        .fill("Manager will take the unchanged client promise.");
      await request.getByRole("checkbox").check();
      await request.getByRole("button", { name: "Request task handover", exact: true }).click();
      await expect(
        page.getByText("This action was recorded successfully.", { exact: true }),
      ).toBeVisible();
      await page.goto(hostUrl("staff", `/en/tasks/${task.id}`));
      const accept = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Accept task handover", exact: true }) });
      await accept
        .getByLabel("Reason and handover notes", { exact: true })
        .fill("I accept the unchanged client promise and deadline.");
      await accept.getByRole("checkbox").check();
      await accept.getByRole("button", { name: "Accept task handover", exact: true }).click();
      await expect(
        page.getByText("This action was recorded successfully.", { exact: true }),
      ).toBeVisible();
      await page.goto(hostUrl("staff", "/en/coverage"));
      await expect(page.locator(`a[href="/en/tasks/${task.id}"]`)).toHaveCount(0);
      await findCoverageRecord(`/en/cases/${f.caseId}`);
      await findCoverageRecord(`/en/operations/keys/${f.keyId}`);
    } finally {
      await context.close();
    }
  });

for (const javaScriptEnabled of [true, false])
  test(`offboarding work leads to an individually accepted task handover, JavaScript ${javaScriptEnabled}`, async ({
    browser,
  }, testInfo) => {
    const f = seed(),
      receiver = seed();
    const dueAt = new Date(Date.now() + 86400000);
    const [task] = await db
      .insert(schema.tasks)
      .values({
        ownerId: f.brokerId,
        caseId: f.caseId,
        title: "Synthetic handover promise",
        promisedToClient: true,
        dueAt,
      })
      .returning();
    if (!task) throw new Error("Missing synthetic task");
    const context = await browser.newContext({
      ...testInfo.project.use,
      javaScriptEnabled,
      viewport: { width: 320, height: 844 },
    });
    const cookie = (value: string) => ({
      name: "msr_staff_session",
      value,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax" as const,
    });
    try {
      await context.addCookies([cookie(f.staffToken)]);
      const page = await context.newPage();
      await page.goto(hostUrl("staff", `/en/access/offboard/${f.brokerId}`));
      await page.getByRole("link", { name: "Synthetic handover promise", exact: true }).click();
      const request = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Request task handover", exact: true }) });
      await request
        .getByLabel("Receiving colleague", { exact: true })
        .selectOption(receiver.brokerId);
      await request
        .getByLabel("Reason and handover notes", { exact: true })
        .fill("Review the promised follow-up before accepting ownership.");
      await request.getByRole("checkbox").check();
      await request.getByRole("button", { name: "Request task handover", exact: true }).click();
      await expect(
        page.getByText("This action was recorded successfully.", { exact: true }),
      ).toBeVisible();
      expect(
        (await db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)))[0],
      ).toMatchObject({ ownerId: f.brokerId, pendingOwnerId: receiver.brokerId, dueAt });
      await context.clearCookies();
      await context.addCookies([cookie(receiver.brokerToken)]);
      await page.goto(hostUrl("staff", "/en/today"));
      await page.getByRole("link", { name: "Awaiting my acceptance", exact: true }).click();
      await page.getByRole("link", { name: "Synthetic handover promise", exact: true }).click();
      const accept = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Accept task handover", exact: true }) });
      await accept
        .getByLabel("Reason and handover notes", { exact: true })
        .fill("I reviewed the promise and accept the unchanged due date.");
      await accept.getByRole("checkbox").check();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: testInfo.outputPath(`task-handover-${javaScriptEnabled}.png`),
        fullPage: true,
      });
      await accept.getByRole("button", { name: "Accept task handover", exact: true }).click();
      await expect(
        page.getByText("This action was recorded successfully.", { exact: true }),
      ).toBeVisible();
      expect(
        (await db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)))[0],
      ).toMatchObject({
        ownerId: receiver.brokerId,
        pendingOwnerId: null,
        dueAt,
        promisedToClient: true,
        state: "open",
      });
      await page.goto(hostUrl("staff", `/en/tasks/${task.id}`));
      const secondRequest = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Request task handover", exact: true }) });
      await secondRequest
        .getByLabel("Receiving colleague", { exact: true })
        .selectOption(f.brokerId);
      await secondRequest
        .getByLabel("Reason and handover notes", { exact: true })
        .fill("Proposed return for an explicit cancellation check.");
      await secondRequest.getByRole("checkbox").check();
      await secondRequest
        .getByRole("button", { name: "Request task handover", exact: true })
        .click();
      await expect(
        page.getByText("This action was recorded successfully.", { exact: true }),
      ).toBeVisible();
      await page.goto(hostUrl("staff", `/en/tasks/${task.id}`));
      const cancel = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Cancel task handover", exact: true }) });
      await cancel.getByLabel("Reason and handover notes", { exact: true }).fill("short");
      await cancel.getByRole("checkbox").check();
      await cancel.getByRole("button", { name: "Cancel task handover", exact: true }).click();
      await expect(
        page.getByRole("region", { name: "There is a problem", exact: true }),
      ).toBeVisible();
      await expect(cancel.getByLabel("Reason and handover notes", { exact: true })).toHaveValue(
        "short",
      );
      await expect(cancel.getByRole("checkbox")).not.toBeChecked();
      await cancel
        .getByLabel("Reason and handover notes", { exact: true })
        .fill("Cancel the proposal and keep the accepted owner and dates.");
      await cancel.getByRole("checkbox").check();
      await cancel.getByRole("button", { name: "Cancel task handover", exact: true }).click();
      await expect(
        page.getByText("This action was recorded successfully.", { exact: true }),
      ).toBeVisible();
      expect(
        (await db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)))[0],
      ).toMatchObject({ ownerId: receiver.brokerId, pendingOwnerId: null, dueAt, version: 5 });
    } finally {
      await context.close();
    }
  });
