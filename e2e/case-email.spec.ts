// O17/F13: real native forms and persistence, with synthetic contacts and no email worker.
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
test.afterAll(async () => {
  await connection.end();
});
for (const javaScriptEnabled of [true, false]) {
  test(`exact email draft and human approval${javaScriptEnabled ? "" : " without JavaScript"}`, async ({
    browser,
  }, testInfo) => {
    const f = JSON.parse(
      execFileSync(
        process.execPath,
        ["--conditions=react-server", "--import", "tsx", "src/server/cases/email-browser-seed.ts"],
        {
          env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
          encoding: "utf8",
        },
      ),
    ) as { caseId: string; staffToken: string; clientToken: string; address: string };
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
      await page.goto(hostUrl("staff", `/en/cases/${f.caseId}/email`));
      await page.getByLabel("Subject", { exact: true }).fill("Please confirm the viewing time");
      await page
        .getByLabel("Message", { exact: true })
        .fill("Synthetic email: does 14:00 Europe/Sofia work for you?");
      await page.getByRole("button", { name: "Save draft for review", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Change recorded", exact: true }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Open current record", exact: true }).click();
      const draft = page.getByRole("article");
      await expect(draft.getByText(f.address, { exact: true })).toBeVisible();
      await expect(draft.getByText("Draft — not sent", { exact: true })).toBeVisible();
      const [message] = await db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.caseId, f.caseId));
      expect(message?.state).toBe("draft");
      expect(
        await db
          .select()
          .from(schema.externalActions)
          .where(eq(schema.externalActions.subjectId, message?.id ?? "")),
      ).toHaveLength(0);
      await page
        .getByLabel("I checked the recipient, subject and complete message above", { exact: true })
        .check();
      await page.getByRole("button", { name: "Approve and queue email", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Change recorded", exact: true }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Open current record", exact: true }).click();
      await expect(
        page
          .getByRole("region", { name: "Review exact email", exact: true })
          .getByText("Queued — not sent yet", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Approve and queue email", exact: true }),
      ).toHaveCount(0);
      const actions = await db
        .select()
        .from(schema.externalActions)
        .where(eq(schema.externalActions.subjectId, message?.id ?? ""));
      expect(actions).toHaveLength(1);
      expect(actions[0]?.state).toBe("queued");
      expect(actions[0]?.attempts).toBe(0);
      const overflow = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        elements: Array.from(document.querySelectorAll("body *"))
          .filter(
            (e) =>
              e.getBoundingClientRect().right > innerWidth + 1 || e.scrollWidth > e.clientWidth + 1,
          )
          .map((e) => ({
            tag: e.tagName,
            cls: e.className,
            right: e.getBoundingClientRect().right,
            scroll: e.scrollWidth,
            client: e.clientWidth,
            wrap: getComputedStyle(e).overflowWrap,
            word: getComputedStyle(e).wordBreak,
            text: e.textContent?.slice(0, 80),
          })),
      }));
      expect(overflow.scroll, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width);
      await page.screenshot({
        path: testInfo.outputPath(`case-email-${javaScriptEnabled ? "hydrated" : "native"}.png`),
        fullPage: true,
      });
      await context.clearCookies();
      await context.addCookies([
        {
          name: "msr_client_session",
          value: f.clientToken,
          url: origins.client,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      await page.goto(hostUrl("client", `/en/cases/${f.caseId}/email`));
      await expect(page.getByText(f.address, { exact: true })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}
