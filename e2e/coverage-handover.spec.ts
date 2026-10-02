import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { findCoverageRecord } from "./coverage-helpers";
import { hostUrl, origins } from "./hosts";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(databaseUrl, { max: 2 }),
  db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());
function seed() {
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
        env: {
          ...process.env,
          AUTH_SECRET: process.env.E2E_AUTH_SECRET,
          DATABASE_URL: databaseUrl,
        },
      },
    ),
  ) as {
    staffToken: string;
    managerId: string;
    brokerToken: string;
    brokerId: string;
    caseId: string;
    keyId: string;
  };
}

for (const javaScriptEnabled of [true, false])
  test(`F19 revoked-owner Case, inquiry and keys leave coverage only after their own recorded handover, JavaScript ${javaScriptEnabled}`, async ({
    browser,
  }, testInfo) => {
    const f = seed(),
      receiver = seed();
    await db.insert(schema.grants).values({
      principalId: f.managerId,
      capability: "case.transition",
      recordType: "case",
      recordId: f.caseId,
      reason: "Synthetic Case handover authority",
    });
    const dueAt = new Date(Date.now() + 86400000);
    const [inquiry] = await db
      .insert(schema.inquiries)
      .values({
        reference: `RQ-COVER-${randomUUID()}`,
        source: "website",
        state: "assigned",
        purpose: "question",
        submissionKey: randomUUID(),
        payloadDigest: "synthetic",
        caseId: f.caseId,
        ownerId: f.brokerId,
        preferredLocale: "bg",
        message: "Synthetic retained client request",
        followUpAt: dueAt,
      })
      .returning();
    if (!inquiry) throw new Error("Missing inquiry");
    const [task] = await db
      .insert(schema.tasks)
      .values({
        ownerId: f.brokerId,
        caseId: f.caseId,
        inquiryId: inquiry.id,
        title: `Synthetic retained promise ${f.brokerId}`,
        promisedToClient: true,
        dueAt,
      })
      .returning();
    if (!task) throw new Error("Missing task");
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
      await page
        .getByLabel("Reason and handover plan", { exact: true })
        .fill("Review Case, client promises, inquiry and physical keys separately.");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "End staff access", exact: true }).click();
      await expect(page.getByText("Staff membership ended", { exact: true })).toBeVisible();
      expect(await findCoverageRecord(page, `/en/cases/${f.caseId}`)).toBe(true);
      await page.locator(`a[href="/en/cases/${f.caseId}"]`).click();
      await page.locator(`a[href="/en/cases/${f.caseId}/continuity"]`).click();
      const request = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Request handover", exact: true }) });
      await request.getByLabel("Receiving broker", { exact: true }).selectOption(receiver.brokerId);
      await request
        .getByLabel("Reason", { exact: true })
        .fill("Review and accept the preserved promises and deadlines.");
      await request.getByRole("checkbox").check();
      await request.getByRole("button", { name: "Request handover", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Change recorded", exact: true }),
      ).toBeVisible();
      expect(
        (await db.select().from(schema.cases).where(eq(schema.cases.id, f.caseId)))[0],
      ).toMatchObject({ ownerId: f.brokerId, pendingOwnerId: receiver.brokerId });
      expect(await findCoverageRecord(page, `/en/cases/${f.caseId}`)).toBe(true);
      await context.clearCookies();
      await context.addCookies([cookie(receiver.brokerToken)]);
      await page.goto(hostUrl("staff", `/en/cases/${f.caseId}/continuity`));
      const accept = page.locator("form").filter({
        has: page.getByRole("button", { name: "Accept case and commitments", exact: true }),
      });
      await accept
        .getByLabel("Reason", { exact: true })
        .fill("I accept the Case and its existing promises without changing their deadlines.");
      await accept.getByRole("checkbox").check();
      await accept
        .getByRole("button", { name: "Accept case and commitments", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Change recorded", exact: true }),
      ).toBeVisible();
      expect(
        (await db.select().from(schema.cases).where(eq(schema.cases.id, f.caseId)))[0],
      ).toMatchObject({ ownerId: receiver.brokerId, pendingOwnerId: null });
      const accepted = (
        await db.select().from(schema.cases).where(eq(schema.cases.id, f.caseId))
      )[0];
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Change recorded", exact: true }),
      ).toBeVisible();
      expect(
        (await db.select().from(schema.cases).where(eq(schema.cases.id, f.caseId)))[0],
      ).toEqual(accepted);
      expect(
        (await db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)))[0],
      ).toMatchObject({ ownerId: receiver.brokerId, promisedToClient: true, dueAt });
      expect(
        (await db.select().from(schema.inquiries).where(eq(schema.inquiries.id, inquiry.id)))[0]
          ?.ownerId,
      ).toBe(f.brokerId);
      expect(await findCoverageRecord(page, `/en/cases/${f.caseId}`)).toBe(false);
      expect(await findCoverageRecord(page, `/en/inquiries/${inquiry.id}`)).toBe(true);
      await page.locator(`a[href="/en/inquiries/${inquiry.id}"]`).click();
      await page
        .getByLabel("Next action", { exact: true })
        .fill("Contact the client about the retained request.");
      await page
        .getByLabel("Follow-up time (UTC)", { exact: true })
        .fill(new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16));
      await page.getByRole("button", { name: "Accept and assign to me", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Change recorded", exact: true }),
      ).toBeVisible();
      expect(
        (await db.select().from(schema.inquiries).where(eq(schema.inquiries.id, inquiry.id)))[0]
          ?.ownerId,
      ).toBe(receiver.brokerId);
      expect(
        (await db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)))[0],
      ).toMatchObject({ promisedToClient: true, dueAt });
      await context.clearCookies();
      await context.addCookies([cookie(f.staffToken)]);
      expect(await findCoverageRecord(page, `/en/inquiries/${inquiry.id}`)).toBe(false);
      expect(await findCoverageRecord(page, `/en/operations/keys/${f.keyId}`)).toBe(true);
      await page.locator(`a[href="/en/operations/keys/${f.keyId}"]`).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        320,
      );
      await page.screenshot({
        path: testInfo.outputPath(`retained-key-${javaScriptEnabled}-320.png`),
        fullPage: true,
      });
      await page.getByLabel("State", { exact: true }).selectOption("stored");
      await page
        .getByLabel("Storage label", { exact: true })
        .fill("Synthetic checked return cabinet");
      await page
        .getByLabel("Handover evidence and reason", { exact: true })
        .fill("Counted and physically received the synthetic keys under return receipt R3.");
      await page
        .getByRole("checkbox", {
          name: "I checked physical custody, the recipient and handover evidence",
          exact: true,
        })
        .check();
      await page.getByRole("button", { name: "Record custody change", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Change recorded", exact: true }),
      ).toBeVisible();
      expect(
        (await db.select().from(schema.keySets).where(eq(schema.keySets.id, f.keyId)))[0],
      ).toMatchObject({ state: "stored", holderId: null });
      for (const href of [
        `/en/cases/${f.caseId}`,
        `/en/tasks/${task.id}`,
        `/en/inquiries/${inquiry.id}`,
        `/en/operations/keys/${f.keyId}`,
      ])
        expect(await findCoverageRecord(page, href)).toBe(false);
    } finally {
      await context.close();
    }
  });
