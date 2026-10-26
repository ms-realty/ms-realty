import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { duplicateMergeCopy } from "../src/features/duplicate-review/merge-copy";
import { hostUrl, origins } from "./hosts";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/u.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 2 }),
  db = drizzle(connection, { schema });
test.afterAll(async () => {
  await connection.end();
});

for (const javascript of [true, false])
  test(`O27 F32 AT56 UX22 reviewed merge and split ${javascript ? "enhanced" : "native"}`, async ({
    browser,
  }, testInfo) => {
    const f = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "src/server/duplicate-review/browser-seed.ts",
        ],
        {
          env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
          encoding: "utf8",
        },
      ),
    ) as {
      token: string;
      deniedToken: string;
      party: { left: string; right: string; leftLabel: string; rightLabel: string };
      property: { left: string; right: string; leftLabel: string; rightLabel: string };
    };
    const context = await browser.newContext({
      ...testInfo.project.use,
      javaScriptEnabled: javascript,
    });
    const copy = duplicateMergeCopy("en");
    try {
      await context.addCookies([
        {
          name: "msr_staff_session",
          value: f.token,
          url: origins.staff,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const page = await context.newPage();
      await page.bringToFront();
      for (const subject of ["party", "property"] as const) {
        const pair = f[subject];
        if (subject === "party") {
          await page.goto(hostUrl("staff", "/en/operations/duplicates/merge?subject=party"));
          await expect(page.getByLabel(copy.left, { exact: true }).locator("option")).toHaveCount(
            3,
          );
          await page.getByLabel(copy.left, { exact: true }).selectOption(pair.left);
          await page.getByRole("button", { name: copy.chooseSecond, exact: true }).click();
          await expect(page.locator(`[data-duplicate-source="${pair.left}"]`)).toContainText(
            pair.leftLabel,
          );
          await page.getByLabel(copy.right, { exact: true }).selectOption(pair.right);
          await page.getByRole("button", { name: copy.compare, exact: true }).click();
        } else
          await page.goto(
            hostUrl(
              "staff",
              `/en/operations/duplicates/merge?subject=${subject}&left=${pair.left}&right=${pair.right}`,
            ),
          );
        await expect(page.getByRole("heading", { name: copy.title, exact: true })).toBeVisible();
        await expect(page.locator("[data-duplicate-merge-form]")).toHaveCount(0);
        await expect(page.locator(`[data-duplicate-source="${pair.left}"]`)).toContainText(
          pair.leftLabel,
        );
        await expect(page.locator(`[data-duplicate-source="${pair.right}"]`)).toContainText(
          pair.rightLabel,
        );
        await page.locator(`input[name="survivor"][value="${pair.left}"]`).check();
        await page.getByRole("button", { name: copy.reviewMapping, exact: true }).click();
        const form = page.locator("[data-duplicate-merge-form=merge]");
        await expect(form).toBeVisible();
        const key = await form.locator('[name="operationId"]').inputValue(),
          confirmationUrl = page.url();
        expect(new URL(confirmationUrl).searchParams.get("key")).toBe(key);
        await page.reload();
        await expect(form.locator('[name="operationId"]')).toHaveValue(key);
        await expect(page.locator("[data-duplicate-alias-map]")).toContainText(
          `${pair.right} → ${pair.left}`,
        );
        if (javascript) expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        const statusUrl = await form
          .getByRole("link", { name: copy.checkAgain, exact: true })
          .getAttribute("href");
        if (!statusUrl) throw new Error("Missing exact-operation status link");
        await page.goto(hostUrl("staff", statusUrl));
        await expect(page.getByText(copy.absent, { exact: true })).toBeVisible();
        await page.goto(confirmationUrl);
        await form
          .getByLabel(copy.reason, { exact: true })
          .fill(
            "The human compared both original sources and confirms this identity link while preserving their audiences",
          );
        await form.getByLabel(copy.reviewed, { exact: true }).check();
        await page
          .locator("[data-duplicate-merge-review]")
          .screenshot({ path: testInfo.outputPath(`o27-${subject}-${javascript}.png`) });
        await form.getByRole("button", { name: copy.merge, exact: true }).click();
        await expect(page.getByRole("heading", { name: copy.merged, exact: true })).toBeVisible();
        const receiptUrl = page.url(),
          receiptId = new URL(receiptUrl).searchParams.get("id");
        expect(receiptId).toBeTruthy();
        const [merge] = await db
          .select()
          .from(schema.mergeRecords)
          .where(
            and(
              eq(schema.mergeRecords.subject, subject),
              eq(schema.mergeRecords.mergedId, pair.right),
            ),
          );
        if (!merge) throw new Error("Missing committed identity decision");
        expect(merge.survivorId).toBe(pair.left);
        // Revisit the last confirmation after a lost response: it resolves the original receipt.
        await page.goto(confirmationUrl);
        await expect(page).toHaveURL(receiptUrl);
        expect(
          await db
            .select()
            .from(schema.mergeRecords)
            .where(eq(schema.mergeRecords.mergedId, pair.right)),
        ).toHaveLength(1);
        await page.getByRole("link", { name: copy.openCanonical, exact: true }).click();
        await expect(page.locator("[data-canonical-identity]")).toContainText(pair.leftLabel);
        await expect(page.locator("[data-canonical-identity]")).toContainText(pair.rightLabel);
        if (subject === "party") {
          await page.getByRole("link", { name: copy.openSource, exact: true }).first().click();
          await expect(
            page.getByRole("link", { name: copy.openCanonical, exact: true }),
          ).toBeVisible();
        }
        await page.goto(receiptUrl);
        await page.getByRole("link", { name: copy.splitReview, exact: true }).click();
        const split = page.locator("[data-duplicate-merge-form=reverse]"),
          splitKey = await split.locator('[name="operationId"]').inputValue(),
          splitUrl = page.url();
        await page.reload();
        await expect(split.locator('[name="operationId"]')).toHaveValue(splitKey);
        await split
          .getByLabel(copy.reason, { exact: true })
          .fill(
            "The human requests independent source identities again and preserves all subsequent source history",
          );
        await split.getByLabel(copy.reviewed, { exact: true }).check();
        await split.getByRole("button", { name: copy.reverse, exact: true }).click();
        await expect(page.getByRole("heading", { name: copy.reversed, exact: true })).toBeVisible();
        const reversedUrl = page.url();
        await page.goto(splitUrl);
        await expect(page).toHaveURL(reversedUrl);
        const [history] = await db
          .select()
          .from(schema.mergeRecords)
          .where(eq(schema.mergeRecords.id, merge.id));
        expect(history?.reversedAt).not.toBeNull();
        if (javascript) expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      }
      // A subsequent source edit creates an honest held/manual split, with no submit path.
      const pair = f.party;
      await page.goto(
        hostUrl(
          "staff",
          `/en/operations/duplicates/merge?subject=party&left=${pair.left}&right=${pair.right}&survivor=${pair.left}`,
        ),
      );
      const form = page.locator("[data-duplicate-merge-form=merge]");
      await form
        .getByLabel(copy.reason, { exact: true })
        .fill("Human reviewed a new independent identity-link decision after the previous split");
      await form.getByLabel(copy.reviewed, { exact: true }).check();
      await form.getByRole("button", { name: copy.merge, exact: true }).click();
      await expect(page.getByRole("heading", { name: copy.merged, exact: true })).toBeVisible();
      await db
        .update(schema.parties)
        .set({
          version: sql`${schema.parties.version} + 1`,
          matchingAliases: ["Synthetic subsequent source spelling"],
        })
        .where(eq(schema.parties.id, pair.right));
      await page.getByRole("link", { name: copy.splitReview, exact: true }).click();
      await expect(page.locator("[data-duplicate-held]")).toContainText(
        copy.holds.changed_after_merge,
      );
      await expect(page.getByRole("button", { name: copy.reverse, exact: true })).toHaveCount(0);
      await context.addCookies([
        {
          name: "msr_staff_session",
          value: f.deniedToken,
          url: origins.staff,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      await page.goto(
        hostUrl(
          "staff",
          `/en/operations/duplicates/merge?subject=party&left=${pair.left}&right=${pair.right}`,
        ),
      );
      await expect(page.locator("[data-duplicate-merge-form]")).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
