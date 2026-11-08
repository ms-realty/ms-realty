// P10/P11: AI-authored UI corrections; these checks grant no content or language approval.
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { discoveryCopy } from "../src/features/discovery/copy";
import { inquiryReviewCopy } from "../src/features/discovery/inquiry-review-copy";
import { searchAlertCopy } from "../src/features/discovery/search-alert-copy";
import { privacyCopy } from "../src/features/privacy/copy";
import { hostUrl, origins } from "./hosts";

const filters = new URLSearchParams({
  purpose: "sale",
  minPrice: "950.03",
  currency: "EUR",
  areaBasis: "living",
  minArea: "74.51",
});

for (const javaScriptEnabled of [true, false]) {
  test.describe(`P10/P11 language corrections with JavaScript ${javaScriptEnabled}`, () => {
    test.use({ javaScriptEnabled });

    for (const [locale, title, direction] of [
      ["ru", "Уведомления по этому поиску", "ltr"],
      ["he", "התראות לחיפוש הזה", "rtl"],
    ] as const) {
      test(`${locale} normal search entry keeps local copy, exact criteria and account boundaries`, async ({
        page,
        context,
      }, info) => {
        const c = searchAlertCopy(locale);
        await page.goto(hostUrl("public", `/${locale}/properties?${filters}`));
        const entry = page.getByRole("link", { name: c.entry, exact: true });
        await expect(entry).toHaveAttribute("lang", locale);
        await expect(entry).toHaveAttribute("dir", direction);
        await entry.click();
        const heading = page.getByRole("heading", { name: title, exact: true });
        await expect(heading).toBeVisible();
        await expect(heading).toHaveAttribute("lang", locale);
        await expect(heading).toHaveAttribute("dir", direction);
        await expect(page.locator('main [lang="en"]')).toHaveCount(0);
        const searchUrl = new URL(page.url());
        expect(searchUrl.searchParams.get("minPrice")).toBe("950.03");
        expect(searchUrl.searchParams.get("minArea")).toBe("74.51");
        expect(searchUrl.searchParams.get("areaBasis")).toBe("living");
        await expect(page.getByText(c.deliveryOff, { exact: true })).toBeVisible();
        await expect(page.getByText(c.lead, { exact: true })).toBeVisible();
        await expect(page.getByText(c.accountHint, { exact: true })).toBeVisible();
        await expect(page.getByText(c.manualHint, { exact: true })).toBeVisible();
        await expect(page.getByRole("checkbox")).toHaveCount(0);
        await expect(page.getByRole("link", { name: c.manual, exact: true })).toHaveAttribute(
          "href",
          `/${locale}/inquire`,
        );
        await page.setViewportSize({ width: 320, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          320,
        );
        await page.screenshot({
          path: info.outputPath(`${locale}-alert-review.png`),
          fullPage: true,
        });

        if (locale !== "he") return;
        const fixture = JSON.parse(
          execFileSync(
            process.execPath,
            [
              "--conditions=react-server",
              "--import",
              "tsx",
              "src/features/discovery/testing/search-alert-seed.ts",
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
        ) as { token: string };
        await context.addCookies([
          {
            name: "msr_client_session",
            value: fixture.token,
            url: origins.client,
            httpOnly: true,
            sameSite: "Lax",
          },
        ]);
        await page.getByRole("link", { name: c.account, exact: true }).click();
        await expect(page).toHaveURL(
          (url) =>
            url.origin === origins.client && url.pathname === "/he/preferences/search-alerts",
        );
        await expect(page.getByRole("heading", { name: title, exact: true })).toHaveAttribute(
          "dir",
          "rtl",
        );
        // The fixture reviews Bulgarian terms only. Hebrew must keep its terms gate closed.
        const termsRequired = page.getByText(privacyCopy("he").noTerms, { exact: true });
        await expect(termsRequired).toBeVisible();
        expect(
          await termsRequired.evaluate((element) =>
            element.closest("[lang]")?.getAttribute("lang"),
          ),
        ).toBe("he");
        expect(await termsRequired.evaluate((element) => getComputedStyle(element).direction)).toBe(
          "rtl",
        );
        await expect(page.getByRole("checkbox")).toHaveCount(0);
        await expect(page.getByRole("radio")).toHaveCount(0);
        await expect(page.getByText(c.deliveryOff, { exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          320,
        );
        await page.screenshot({
          path: info.outputPath("he-alert-terms-required.png"),
          fullPage: true,
        });
      });
    }

    test("Hebrew inquiry review preserves the brand phone's leading plus inside the RTL page", async ({
      page,
    }, info) => {
      const c = discoveryCopy("he"),
        review = inquiryReviewCopy("he");
      await page.goto(hostUrl("public", "/he/inquire"));
      await page.getByLabel(c.message, { exact: true }).fill("Synthetic contact direction review");
      await page.getByLabel(c.contactMethod, { exact: true }).selectOption("phone");
      await page.locator('input[name="contactValue"]').fill("+359879696870");
      await page.getByRole("checkbox", { name: c.privacy, exact: true }).check();
      await page.getByRole("button", { name: review.reviewAction, exact: true }).click();
      const region = page.getByRole("region", { name: review.reviewTitle, exact: true });
      await expect(region).toBeVisible();
      await expect(page.locator('input[name="contactValue"]')).toHaveValue("+359879696870");
      const label = region.locator("dt").filter({ hasText: new RegExp(`^${c.phone}$`) });
      const value = label.locator("..").locator("dd");
      await expect(value).toHaveAttribute("dir", "ltr");
      await expect(value.locator('bdi[dir="ltr"]')).toHaveText("+359879696870");
      expect(await label.evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");
      expect(await region.evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");
      const positions = await value.locator("bdi").evaluate((element) => {
        const text = element.firstChild;
        if (!text) throw new Error("Missing contact text");
        const left = (start: number) => {
          const range = document.createRange();
          range.setStart(text, start);
          range.setEnd(text, start + 1);
          return range.getBoundingClientRect().left;
        };
        return { plus: left(0), firstDigit: left(1) };
      });
      expect(positions.plus).toBeLessThan(positions.firstDigit);
      await page.screenshot({
        path: info.outputPath("he-inquiry-contact-review.png"),
        fullPage: true,
      });
    });
  });
}
