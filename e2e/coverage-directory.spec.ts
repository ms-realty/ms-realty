import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { firstPartyIssuers } from "../src/domain/records";
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
  ) as { brokerId: string; brokerToken: string; caseId: string; keyId: string };
}

for (const javaScriptEnabled of [true, false])
  test(`F19 late receiving broker remains selectable after 51 ineligible staff at 320px, JavaScript ${javaScriptEnabled}`, async ({
    browser,
  }, testInfo) => {
    const owner = seed();
    const receiverName = `Z${"R".repeat(110)}${randomUUID().replaceAll("-", "").slice(0, 9)}`;
    const padding = Array.from({ length: 51 }, (_, index) => ({
      id: randomUUID(),
      partyId: randomUUID(),
      name: `000 directory ineligible ${String(index).padStart(2, "0")}`,
    }));
    // All 51 are active directory members before the Z receiver in name order, but have no
    // Case capabilities. The old limit-before-eligibility query cannot offer this receiver.
    await db.transaction(async (tx) => {
      await tx.insert(schema.parties).values(
        padding.map((row) => ({
          id: row.partyId,
          kind: "person" as const,
          displayName: row.name,
        })),
      );
      await tx.insert(schema.principals).values(
        padding.map((row) => ({
          id: row.id,
          kind: "staff" as const,
          issuer: firstPartyIssuers.staff,
          subject: row.id,
          partyId: row.partyId,
          email: `directory-${row.id}@example.test`,
          displayName: row.name,
        })),
      );
      await tx
        .insert(schema.staffMemberships)
        .values(padding.map((row) => ({ principalId: row.id, state: "active" as const })));
    });
    // Create the actual receiver only after the 51 earlier directory members exist.
    const receiver = seed();
    await db
      .update(schema.principals)
      .set({ displayName: receiverName })
      .where(eq(schema.principals.id, receiver.brokerId));
    const dueAt = new Date(Date.now() + 86400000);
    const [task] = await db
      .insert(schema.tasks)
      .values({
        ownerId: owner.brokerId,
        caseId: owner.caseId,
        title: `Preserved late-recipient promise ${owner.caseId}`,
        dueAt,
        promisedToClient: true,
      })
      .returning();
    if (!task) throw new Error("Missing promised task fixture");
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
    const currentCase = async () =>
      (await db.select().from(schema.cases).where(eq(schema.cases.id, owner.caseId)))[0];
    try {
      await context.addCookies([cookie(owner.brokerToken)]);
      const page = await context.newPage();
      const continuity = hostUrl("staff", `/en/cases/${owner.caseId}/continuity`);
      await page.goto(continuity);
      const request = page.locator("form").filter({
        has: page.getByRole("button", { name: "Request handover", exact: true }),
      });
      const select = request.getByLabel("Receiving broker", { exact: true });
      await expect(select.locator(`option[value="${receiver.brokerId}"]`)).toHaveText(receiverName);
      for (const row of padding)
        await expect(select.locator(`option[value="${row.id}"]`)).toHaveCount(0);
      await select.selectOption(receiver.brokerId);
      await expect(select).toHaveValue(receiver.brokerId);
      await request
        .getByLabel("Reason", { exact: true })
        .fill("The named receiving broker will review and accept the unchanged client promise.");
      await request.getByRole("checkbox").check();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        320,
      );
      await request.screenshot({
        path: testInfo.outputPath(`late-recipient-request-${javaScriptEnabled}-320.png`),
      });
      await request.getByRole("button", { name: "Request handover", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Change recorded", exact: true }),
      ).toBeVisible();
      expect(await currentCase()).toMatchObject({
        ownerId: owner.brokerId,
        pendingOwnerId: receiver.brokerId,
      });
      expect((await db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)))[0]).toEqual(
        task,
      );

      await context.clearCookies();
      await context.addCookies([cookie(receiver.brokerToken)]);
      await page.goto(continuity);
      const accept = page.locator("form").filter({
        has: page.getByRole("button", { name: "Accept case and commitments", exact: true }),
      });
      await accept
        .getByLabel("Reason", { exact: true })
        .fill("I am the named receiver and accept the existing Case and its unchanged promise.");
      await accept.getByRole("checkbox").check();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        320,
      );
      await accept
        .getByRole("button", { name: "Accept case and commitments", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Change recorded", exact: true }),
      ).toBeVisible();
      const accepted = await currentCase();
      expect(accepted).toMatchObject({ ownerId: receiver.brokerId, pendingOwnerId: null });
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Change recorded", exact: true }),
      ).toBeVisible();
      expect(await currentCase()).toEqual(accepted);
      expect(
        (await db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)))[0],
      ).toMatchObject({
        ownerId: receiver.brokerId,
        dueAt,
        state: "open",
        promisedToClient: true,
      });
      expect(
        (await db.select().from(schema.keySets).where(eq(schema.keySets.id, owner.keyId)))[0],
      ).toMatchObject({ holderId: owner.brokerId, state: "checked_out", version: 2 });
      await page.getByRole("link", { name: "Open current record", exact: true }).click();
      await expect(page.getByRole("main").getByText(receiverName, { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        320,
      );
      await page.screenshot({
        path: testInfo.outputPath(`late-recipient-accepted-${javaScriptEnabled}-320.png`),
        fullPage: false,
      });
    } finally {
      await context.close();
      // Delete only our unused directory padding, in FK order. Seeded Cases, receipts and
      // accepted promises remain in the runner-owned disposable database until teardown.
      await db.transaction(async (tx) => {
        const ids = padding.map((row) => row.id);
        await tx
          .delete(schema.staffMemberships)
          .where(inArray(schema.staffMemberships.principalId, ids));
        await tx.delete(schema.principals).where(inArray(schema.principals.id, ids));
        await tx.delete(schema.parties).where(
          inArray(
            schema.parties.id,
            padding.map((row) => row.partyId),
          ),
        );
      });
    }
  });
