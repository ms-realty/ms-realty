// Agency operations: synthetic physical-custody recording, never access permission or live handover proof.
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
test.afterAll(async () => connection.end());
for (const javaScriptEnabled of [true, false])
  test(`key custody: receive, issue and return with JavaScript ${javaScriptEnabled}`, async ({
    browser,
  }, testInfo) => {
    const f = JSON.parse(
      execFileSync(
        process.execPath,
        ["--conditions=react-server", "--import", "tsx", "src/server/key-custody/browser-seed.ts"],
        {
          encoding: "utf8",
          env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
        },
      ),
    ) as {
      staffToken: string;
      staffId: string;
      brokerId: string;
      brokerToken: string;
      propertyReference: string;
    };
    const context = await browser.newContext({ ...testInfo.project.use, javaScriptEnabled });
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
      await page.goto(hostUrl("staff", "/en/operations/keys"));
      const tag = `SYN-${randomUUID().slice(0, 8)}`.toUpperCase();
      await page.getByLabel("Property reference", { exact: true }).fill(f.propertyReference);
      await page.getByLabel("Key set tag", { exact: true }).fill(tag);
      await page.getByLabel("Number of keys", { exact: true }).fill("2");
      await page
        .getByLabel("Receipt / authority reference", { exact: true })
        .fill("Synthetic signed receipt K1");
      await page.getByLabel("Storage label", { exact: true }).fill("Synthetic cabinet A");
      await page
        .getByLabel("Handover evidence and reason", { exact: true })
        .fill("Received two synthetic keys from owner under receipt K1.");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Record keys received", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Change recorded", exact: true }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Open current record", exact: true }).click();
      const detail = page.url();
      const [key] = await db.select().from(schema.keySets).where(eq(schema.keySets.keyTag, tag));
      if (!key) throw new Error("No durable key set");
      await page.getByLabel("State", { exact: true }).selectOption("checked_out");
      await page.getByLabel("Staff holder", { exact: true }).selectOption(f.brokerId);
      // Missing due-back must preserve the reviewed facts and require a fresh confirmation.
      await page
        .getByLabel("Handover evidence and reason", { exact: true })
        .fill("Handed two synthetic keys to the selected broker, receipt K2.");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Record custody change", exact: true }).click();
      await expect(
        page.getByRole("region", { name: "There is a problem", exact: true }),
      ).toBeVisible();
      await expect(page.getByLabel("Handover evidence and reason", { exact: true })).toHaveValue(
        "Handed two synthetic keys to the selected broker, receipt K2.",
      );
      await expect(page.getByRole("checkbox")).not.toBeChecked();
      await expect(page.getByLabel("Due back · Europe/Sofia", { exact: true })).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      const year = new Date().getUTCFullYear() + 1;
      await page.getByLabel("Due back · Europe/Sofia", { exact: true }).fill(`${year}-01-15T12:00`);
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Record custody change", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Change recorded", exact: true }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Open current record", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: `${key.reference} · ${tag}`, exact: true }),
      ).toBeVisible();
      expect(
        (await db.select().from(schema.keySets).where(eq(schema.keySets.id, key.id)))[0],
      ).toMatchObject({ state: "checked_out", holderId: f.brokerId, storageLabel: null });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const holderControl = await page.getByLabel("Staff holder", { exact: true }).boundingBox();
      expect(holderControl?.height).toBeGreaterThanOrEqual(44);

      await page.screenshot({
        path: testInfo.outputPath(`key-custody-${javaScriptEnabled}.png`),
        fullPage: true,
      });
      await page.getByLabel("State", { exact: true }).selectOption("stored");
      await page.getByLabel("Storage label", { exact: true }).fill("Synthetic cabinet B");
      await page
        .getByLabel("Handover evidence and reason", { exact: true })
        .fill("Both synthetic keys counted and physically returned under receipt K3.");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Record custody change", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Change recorded", exact: true }),
      ).toBeVisible();
      const stored = (
        await db.select().from(schema.keySets).where(eq(schema.keySets.id, key.id))
      )[0];
      expect(stored).toMatchObject({
        state: "stored",
        holderId: null,
        dueAt: null,
        storageLabel: "Synthetic cabinet B",
        version: 3,
      });
      expect(
        await db
          .select()
          .from(schema.keyCustodyEvents)
          .where(eq(schema.keyCustodyEvents.keySetId, key.id)),
      ).toHaveLength(3);
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
      const response = await page.goto(detail);
      expect(response?.status()).toBe(404);
      await expect(page.getByText(tag, { exact: false })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
