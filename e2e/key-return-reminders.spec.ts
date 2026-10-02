import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { caseCopy } from "../src/features/cases/copy";
import { custodyCopy } from "../src/features/key-custody/copy";
import { hostUrl, origins } from "./hosts";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable database required");
const connection = postgres(url, { max: 2 }),
  db = drizzle(connection, { schema });
test.afterAll(async () => {
  await connection.end();
});
for (const locale of ["bg", "ru", "en"])
  for (const javascript of [true, false])
    test(`Today overdue key return ${locale} ${javascript ? "hydrated" : "native"}`, async ({
      browser,
    }, testInfo) => {
      const f = JSON.parse(
        execFileSync(
          process.execPath,
          [
            "--conditions=react-server",
            "--import",
            "tsx",
            "src/server/key-custody/browser-seed.ts",
          ],
          {
            env: {
              ...process.env,
              E2E_KEY_RETURN: "1",
              AUTH_SECRET: process.env.E2E_AUTH_SECRET,
              DATABASE_URL: url,
            },
            encoding: "utf8",
          },
        ),
      ) as {
        keyId: string;
        keyReference: string;
        staffToken: string;
        brokerToken: string;
        dueAt: string;
      };
      const context = await browser.newContext({
        ...testInfo.project.use,
        viewport: { width: 320, height: 900 },
        javaScriptEnabled: javascript,
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
        const page = await context.newPage(),
          c = custodyCopy(locale);
        await page.goto(hostUrl("staff", `/${locale}/today`));
        const reminder = page.locator(`[data-key-return="${f.keyId}"]`);
        await expect(reminder).toBeVisible();
        await expect(reminder.locator("time")).toHaveAttribute("datetime", f.dueAt);
        await expect(reminder.locator("time")).toContainText(
          new Intl.DateTimeFormat(locale, {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Europe/Sofia",
          }).format(new Date(f.dueAt)),
        );
        await expect(reminder).toContainText("Synthetic custody holder");
        if (javascript)
          expect(
            (
              await new AxeBuilder({ page })
                .include("[data-key-return-reminders]")
                .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
                .analyze()
            ).violations,
          ).toEqual([]);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
        await page
          .locator("[data-key-return-reminders]")
          .screenshot({ path: testInfo.outputPath(`key-reminder-${locale}-${javascript}.png`) });
        await reminder.getByRole("link", { name: f.keyReference, exact: true }).click();
        const detail = page.url();
        await page.getByLabel(c.state, { exact: true }).selectOption("stored");
        await page
          .getByLabel(c.storageLabel, { exact: true })
          .fill("Synthetic cabinet, returned keys counted");
        await page
          .getByLabel(c.note, { exact: true })
          .fill("Physically received both synthetic keys and checked the custody receipt");
        await page.getByLabel(c.reviewed, { exact: true }).check();
        await page.getByRole("button", { name: c.move, exact: true }).click();
        await expect(
          page.getByRole("heading", { name: caseCopy(locale).saved, exact: true }),
        ).toBeVisible();
        expect(
          (await db.select().from(schema.keySets).where(eq(schema.keySets.id, f.keyId)))[0],
        ).toMatchObject({ state: "stored", holderId: null, dueAt: null, version: 2 });
        await page.goto(hostUrl("staff", `/${locale}/today`));
        await expect(page.locator(`[data-key-return="${f.keyId}"]`)).toHaveCount(0);
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
        await page.goto(hostUrl("staff", `/${locale}/today`));
        await expect(page.locator("[data-key-return-reminders]")).toHaveCount(0);
        expect((await page.goto(detail))?.status()).toBe(404);
      } finally {
        await context.close();
      }
    });
