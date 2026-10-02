import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

function fixture() {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "src/features/discovery/testing/seed.ts"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          AUTH_SECRET: process.env.E2E_AUTH_SECRET,
          DATABASE_URL: process.env.E2E_DATABASE_URL,
        },
      },
    ),
  ) as { published: { reference: string; title: string } };
}

for (const javaScriptEnabled of [true, false]) {
  test(`P02: results stay discoverable and native filters survive collapse, JavaScript ${javaScriptEnabled}`, async ({
    browser,
    baseURL,
  }, testInfo) => {
    const data = fixture();
    const context = await browser.newContext({
      ...testInfo.project.use,
      baseURL,
      javaScriptEnabled,
    });
    const page = await context.newPage();
    try {
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        for (const locale of ["bg", "en", "he"]) {
          await page.goto(`/${locale}/properties?q=${data.published.reference}`);
          const form = page.locator(`form[action="/${locale}/properties"]`);
          const details = form.locator("details");
          await expect(details).not.toHaveAttribute("open");
          await expect(page.locator("#results-heading")).toBeVisible();
          const outcome = await page.locator("#results-heading").boundingBox();
          const controls = await form.boundingBox();
          if (!outcome || !controls)
            throw new Error("Search outcome and controls must be rendered");
          expect(outcome.y).toBeLessThan(controls.y);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(width);
          if (locale === "en") {
            await expect(
              page.getByRole("link", { name: data.published.title, exact: true }),
            ).toBeVisible();
          }
          await page.screenshot({
            path: testInfo.outputPath(`search-${locale}-${width}-${javaScriptEnabled}.png`),
            fullPage: true,
          });
        }
      }
      await page.goto(
        `/en/properties?q=${data.published.reference}&type=apartment,house&minBeds=2&maxPrice=150000&currency=EUR&areaBasis=built&minArea=55&sort=price_asc`,
      );
      const form = page.locator('form[action="/en/properties"]');
      const details = form.locator("details");
      const disclosure = form.getByRole("button", { name: /^Filters/ });
      await expect(details).not.toHaveAttribute("open");
      await expect(page.getByRole("list", { name: "Active filters" })).toContainText(
        "Apartment, House",
      );
      // Native summary must be usable with the keyboard even without hydration.
      await disclosure.focus();
      await page.keyboard.press("Enter");
      await expect(details).toHaveAttribute("open", "");
      await expect(form.getByRole("checkbox", { name: "Apartment", exact: true })).toBeChecked();
      await expect(form.getByRole("checkbox", { name: "House", exact: true })).toBeChecked();
      await form.getByLabel("Minimum bedrooms", { exact: true }).fill("3");
      await disclosure.click();
      await expect(details).not.toHaveAttribute("open");
      await form.getByRole("button", { name: "Search properties", exact: true }).click();
      const query = new URL(page.url()).searchParams;
      expect(query.get("q")).toBe(data.published.reference);
      expect(query.getAll("type").sort()).toEqual(["apartment", "house"]);
      expect(query.get("minBeds")).toBe("3");
      expect(query.get("maxPrice")).toBe("150000");
      expect(query.get("currency")).toBe("EUR");
      expect(query.get("areaBasis")).toBe("built");
      expect(query.get("minArea")).toBe("55");
      expect(query.get("sort")).toBe("price_asc");
      await page.getByRole("link", { name: "Clear filters", exact: true }).click();
      await expect(page).toHaveURL(/\/en\/properties$/);
      await expect(page.getByRole("list", { name: "Active filters" })).toHaveCount(0);
      await form.getByRole("button", { name: /^Filters/ }).click();
      await expect(form.getByLabel("Minimum bedrooms", { exact: true })).toHaveValue("");
      await expect(
        form.getByRole("checkbox", { name: "Apartment", exact: true }),
      ).not.toBeChecked();
    } finally {
      await context.close();
    }
  });

  test(`P02: rejected criteria remain editable without losing the search, JavaScript ${javaScriptEnabled}`, async ({
    browser,
    baseURL,
  }, testInfo) => {
    const context = await browser.newContext({
      ...testInfo.project.use,
      baseURL,
      javaScriptEnabled,
      viewport: { width: 320, height: 844 },
    });
    const page = await context.newPage();
    try {
      await page.goto("/en/properties?q=retained%20search&minBeds=invalid");
      const form = page.locator('form[action="/en/properties"]');
      await expect(form.locator("details")).toHaveAttribute("open", "");
      await expect(form.getByLabel("Minimum bedrooms", { exact: true })).toHaveValue("invalid");
      await expect(form.getByLabel("Place, text or reference", { exact: true })).toHaveValue(
        "retained search",
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        320,
      );
      await form.getByLabel("Minimum bedrooms", { exact: true }).fill("2");
      await form.getByRole("button", { name: "Apply filters", exact: true }).click();
      await expect(page.locator("#results-heading")).toBeVisible();
      expect(new URL(page.url()).searchParams.get("q")).toBe("retained search");
      expect(new URL(page.url()).searchParams.get("minBeds")).toBe("2");
      await expect(form.locator("details")).not.toHaveAttribute("open");
    } finally {
      await context.close();
    }
  });
}
