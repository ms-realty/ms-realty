// B11 / W13 / F27 F28 / P23 C14 O29 O30: synthetic native consultation continuity.
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { hostUrl, origins } from "./hosts";

function seed<T>(...args: string[]): T {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "src/server/service-intake/browser-seed.ts",
        ...args,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          AUTH_SECRET: process.env.E2E_AUTH_SECRET,
          DATABASE_URL: process.env.E2E_DATABASE_URL,
        },
      },
    ).trim(),
  ) as T;
}
for (const javaScriptEnabled of [true, false])
  test.describe(`B11 consultation with JavaScript ${javaScriptEnabled}`, () => {
    test.use({ javaScriptEnabled, viewport: { width: 320, height: 720 } });
    test("request, named acceptance, service Case and scoped client continuation remain bounded", async ({
      page,
      context,
    }, testInfo) => {
      const f = seed<{ token: string; slug: string }>();
      await page.goto(hostUrl("public", `/bg/services/${f.slug}`));
      const topic = javaScriptEnabled
        ? "Консултация за управление"
        : "Консултация за кратък престой";
      await page.getByRole("link", { name: new RegExp(`^${topic}`) }).click();
      await expect(page.locator('[name="serviceScope"]')).toHaveValue(/scopeVersionId/);
      await page.locator('[name="serviceLocation"]').fill("Synthetic declared place");
      await page
        .locator('[name="serviceNeeds"]')
        .fill("Synthetic request for human clarification, no reservation or work order");
      if (javaScriptEnabled)
        await page.locator('[name="serviceRelationship"]').selectOption("unknown");
      else {
        const start = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
          end = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
        await page.locator('[name="serviceFrom"]').fill(start);
        await page.locator('[name="serviceUntil"]').fill(end);
      }
      await page.locator('[name="contactValue"]').fill("synthetic-browser@example.test");
      await page.locator('[name="privacyNotice"]').check();
      const review = page.getByRole("button", { name: "Прегледай запитването", exact: true });
      await review.focus();
      await page.keyboard.press("Enter");
      const send = page.getByRole("button", {
        name: "Изпрати запитването до MS Realty",
        exact: true,
      });
      await expect(send).toBeVisible();
      await expect(page.getByText("Synthetic declared place", { exact: true })).toBeVisible();
      if (javaScriptEnabled)
        expect(
          (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
            .violations,
        ).toEqual([]);
      await send.click();
      await expect(send).toHaveCount(0);
      const received = seed<{ inquiry: { id: string; purpose: string }; record?: { id: string } }>(
        "read",
        f.slug,
      );
      expect(received.inquiry.purpose).toBe("service_consultation");
      expect(received.record).toBeUndefined();
      await context.addCookies([
        {
          name: "msr_staff_session",
          value: f.token,
          url: origins.staff,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ]);
      await page.goto(hostUrl("staff", "/en/operations/consultations"));
      await expect(page.locator(`a[href="/en/inquiries/${received.inquiry.id}"]`)).toBeVisible();
      await page.locator(`a[href="/en/inquiries/${received.inquiry.id}"]`).click();
      await expect(page.getByText("Synthetic declared place", { exact: true })).toBeVisible();
      const accept = page.locator("form").filter({
        has: page.getByRole("button", { name: "Accept and assign to me", exact: true }),
      });
      await accept
        .locator('[name="nextAction"]')
        .fill("Clarify the bounded synthetic consultation");
      await accept
        .locator('[name="dueAt"]')
        .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
      await accept.getByRole("button", { name: "Accept and assign to me", exact: true }).click();
      await page.getByText("Open updated record", { exact: true }).click();
      await page.locator(`a[href="/en/cases/new?inquiry=${received.inquiry.id}"]`).first().click();
      await expect(page.locator('[name="kind"]')).toHaveValue("service_intake");
      await page.locator('[name="title"]').fill("Synthetic bounded consultation Case");
      await page.locator('[name="nextAction"]').fill("Human clarification only");
      await page
        .locator('[name="dueAt"]')
        .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
      await page.getByRole("button", { name: "Create consultation", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Create consultation", exact: true }),
      ).toHaveCount(0);
      const linked = seed<{ record: { id: string; kind: string; serviceTopic: string } }>(
        "read",
        f.slug,
      );
      expect(linked.record.kind).toBe("service_intake");
      await page.goto(hostUrl("staff", `/en/operations/consultations/${linked.record.id}`));
      await expect(
        page.getByRole("heading", { name: "Synthetic bounded consultation Case", exact: true }),
      ).toBeVisible();
      await expect(page.locator('a[href="#case-appointments"]')).toHaveCount(0);
      await expect(page.locator('a[href="#case-properties"]')).toHaveCount(0);
      await page.screenshot({
        path: testInfo.outputPath(`O30-${javaScriptEnabled}.png`),
        fullPage: true,
      });
      const client = seed<{ token: string }>("client", linked.record.id);
      await context.addCookies([
        {
          name: "msr_client_session",
          value: client.token,
          url: origins.client,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ]);
      await page.goto(hostUrl("client", `/en/overview/${linked.record.id}`));
      await expect(page.getByText("Synthetic declared place", { exact: true })).toBeVisible();
      await expect(page.getByText("Human clarification only", { exact: true })).toHaveCount(0);
      await expect(page.locator('a[href="#case-appointments"]')).toHaveCount(0);
      await expect(page.locator('a[href="#case-properties"]')).toHaveCount(0);
      await page.screenshot({
        path: testInfo.outputPath(`C14-${javaScriptEnabled}.png`),
        fullPage: true,
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
    });
  });
