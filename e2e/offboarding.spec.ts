// O23: access removal preserves the physical custody and work that still need human handover.
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { and, eq, isNull } from "drizzle-orm";
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
  test(`O23: offboard with retained keys and work, JavaScript ${javaScriptEnabled}`, async ({
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
    ) as {
      staffToken: string;
      brokerToken: string;
      brokerId: string;
      keyId: string;
      caseId: string;
    };
    const context = await browser.newContext({ ...testInfo.project.use, javaScriptEnabled });
    try {
      const cookie = (token: string) => ({
        name: "msr_staff_session",
        value: token,
        url: origins.staff,
        httpOnly: true,
        sameSite: "Lax" as const,
      });
      await context.addCookies([cookie(f.staffToken)]);
      const page = await context.newPage(),
        path = `/en/access/offboard/${f.brokerId}`;
      await page.goto(hostUrl("staff", path));
      await expect(
        page.getByRole("heading", { name: "End staff access", exact: true }),
      ).toBeVisible();
      await expect(page.locator("dl").getByText("1", { exact: true })).toHaveCount(2);
      if (javaScriptEnabled)
        expect(
          (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
            .violations,
        ).toEqual([]);
      await page.getByLabel("Reason and handover plan", { exact: true }).fill("short");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "End staff access", exact: true }).click();
      await expect(
        page.getByRole("region", { name: "There is a problem", exact: true }),
      ).toBeVisible();
      await expect(page.getByLabel("Reason and handover plan", { exact: true })).toHaveValue(
        "short",
      );
      await expect(page.getByRole("checkbox")).not.toBeChecked();
      expect(
        (
          await db
            .select()
            .from(schema.staffMemberships)
            .where(eq(schema.staffMemberships.principalId, f.brokerId))
        )[0]?.state,
      ).toBe("active");
      await page
        .getByLabel("Reason and handover plan", { exact: true })
        .fill(
          "Manager accepted the handover plan; physical keys remain with the former broker until counted return.",
        );
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "End staff access", exact: true }).click();
      await expect(page.getByText("Staff membership ended", { exact: true })).toBeVisible();
      await expect(page.getByText("Access removal recorded:", { exact: false })).toBeVisible();
      await expect(page.getByRole("button", { name: "End staff access", exact: true })).toHaveCount(
        0,
      );
      const receipt = page.url();
      expect(
        (await db.select().from(schema.keySets).where(eq(schema.keySets.id, f.keyId)))[0],
      ).toMatchObject({ holderId: f.brokerId, state: "checked_out", version: 2 });
      expect(
        (await db.select().from(schema.cases).where(eq(schema.cases.id, f.caseId)))[0]?.ownerId,
      ).toBe(f.brokerId);
      expect(
        await db
          .select()
          .from(schema.passkeys)
          .where(
            and(eq(schema.passkeys.principalId, f.brokerId), isNull(schema.passkeys.revokedAt)),
          ),
      ).toHaveLength(0);
      await page.reload();
      await expect(page.getByText("Staff membership ended", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: testInfo.outputPath(`offboarding-${javaScriptEnabled}.png`),
        fullPage: true,
      });
      await page.getByRole("link", { name: "Team and access", exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const formerLink = page.locator(`a[href="${path}"]`);
      expect((await formerLink.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({
        path: testInfo.outputPath(`offboarding-team-${javaScriptEnabled}.png`),
        fullPage: true,
      });

      await page.locator(`a[href="${path}"]`).click();
      await expect(page.getByText("Staff membership ended", { exact: true })).toBeVisible();
      await page.goto(hostUrl("staff", `${path}?receipt=unknown-synthetic-operation`));
      await expect(page.getByRole("button", { name: "End staff access", exact: true })).toHaveCount(
        0,
      );
      await context.clearCookies();
      await context.addCookies([cookie(f.brokerToken)]);
      await page.goto(receipt);
      await expect(page).toHaveURL((url) => url.pathname === "/en/access");
      await expect(page.getByRole("heading", { name: "Staff sign-in", exact: true })).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "End staff access", exact: true }),
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
