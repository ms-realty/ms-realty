// O23: current grants remain complete and usable as the staff directory grows.
import { execFileSync } from "node:child_process";
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
  test(`O23 grant directory pages every current grant and retains its receipt and native staff choices, JavaScript ${javaScriptEnabled}`, async ({
    browser,
  }, testInfo) => {
    const f = JSON.parse(
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
          env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
        },
      ),
    ) as { staffToken: string; managerId: string; brokerId: string };
    const [target] = await db
      .select()
      .from(schema.principals)
      .where(eq(schema.principals.id, f.brokerId));
    if (!target) throw new Error("Missing directory target");
    await db.insert(schema.grants).values(
      Array.from({ length: 55 }, () => ({
        principalId: f.brokerId,
        capability: "document.review" as const,
        reason: "Synthetic scoped review grant for directory pagination",
      })),
    );
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
      await page.goto(hostUrl("staff", "/en/access/manage"));
      await page.locator("#capability-principal").selectOption(f.brokerId);
      await page.locator("#recovery-principal").selectOption(f.brokerId);
      const grantForm = page.locator("form").filter({
        has: page.getByRole("button", { name: "Record capability grant", exact: true }),
      });
      await grantForm
        .getByRole("combobox", { name: "Capability", exact: true })
        .selectOption("document.review");
      await grantForm
        .getByLabel("Reason and authorized purpose", { exact: true })
        .fill("Record the reviewed grant and retain its receipt through the full directory.");
      await grantForm.getByRole("checkbox").check();
      await grantForm.getByRole("button", { name: "Record capability grant", exact: true }).click();
      await expect(page.getByText("Access change recorded:", { exact: false })).toBeVisible();
      const receipt = new URL(page.url()).searchParams.get("receipt");
      expect(receipt).toMatch(/^[a-f0-9-]{36}$/);
      const search = page.getByLabel("Search current grants by name or email", { exact: true });
      await search.fill(target.email);
      await page.getByRole("button", { name: "Search", exact: true }).click();
      const expected = await db
        .select({ id: schema.grants.id })
        .from(schema.grants)
        .where(eq(schema.grants.principalId, f.brokerId));
      const seen: string[] = [];
      const directory = page.getByRole("navigation", { name: "Current staff grants", exact: true });
      for (const number of [1, 2, 3]) {
        await expect(search).toHaveValue(target.email);
        expect(new URL(page.url()).searchParams.get("receipt")).toBe(receipt);
        const ids = await page
          .locator('input[name="grantId"]')
          .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
        expect(ids).toHaveLength(number < 3 ? 25 : expected.length - 50);
        seen.push(...ids);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          320,
        );
        if (number < 3) {
          await directory.getByRole("link", { name: "Next page", exact: true }).click();
          await expect(page).toHaveURL(
            (url) => url.searchParams.get("grantsPage") === String(number + 1),
          );
        }
      }
      expect([...seen].sort()).toEqual(expected.map(({ id }) => id).sort());
      await expect(directory.getByRole("link", { name: "Next page", exact: true })).toHaveCount(0);
      await directory.getByRole("link", { name: "Previous page", exact: true }).click();
      await expect(page.locator('input[name="grantId"]')).toHaveCount(25);
      const invalidPage = new URL(page.url());
      invalidPage.searchParams.set("grantsPage", "invalid");
      await page.goto(invalidPage.toString());
      expect(
        await page
          .locator('input[name="grantId"]')
          .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)),
      ).toEqual(seen.slice(0, 25));
      await search.fill(`no-current-grant-${f.brokerId}`);
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await expect(page.getByText("No matching current grants.", { exact: true })).toBeVisible();
      await expect(page.locator('input[name="grantId"]')).toHaveCount(0);
      expect(new URL(page.url()).searchParams.get("receipt")).toBe(receipt);
      await page.locator("#capability-principal").selectOption(f.brokerId);
      await page.locator("#recovery-principal").selectOption(f.brokerId);
    } finally {
      await context.close();
    }
  });
