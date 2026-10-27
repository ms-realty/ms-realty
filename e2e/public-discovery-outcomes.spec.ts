// P01/P02/P05/P21 / F02/F03: exact public identities and reversible native outcomes.
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { discoveryCopy } from "../src/features/discovery/copy";

const seed = () =>
  JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "src/features/discovery/testing/seed.ts",
        "map",
      ],
      { encoding: "utf8", env: process.env },
    ),
  ) as { published: { reference: string; title: string }; restricted: { reference: string } };
let data: ReturnType<typeof seed>;
test.beforeAll(() => {
  data = seed();
});

test("F02 applies native sort and removable criteria, announces a completed count and returns to the selected result", async ({
  page,
}) => {
  const copy = discoveryCopy("en"),
    query = new URLSearchParams({
      q: data.published.reference,
      purpose: "sale",
      type: "apartment,house",
      includeUnconfirmed: "1",
    });
  await page.goto(`/en/properties?${query}`);
  await expect(page.locator("#results-heading")).not.toBeFocused();
  const sort = page.locator('form[action="/en/properties#results-heading"]');
  await sort.getByRole("combobox", { name: copy.sort, exact: true }).selectOption("price_asc");
  await sort.getByRole("button", { name: copy.apply, exact: true }).click();
  await expect(page.locator("#results-heading")).toBeFocused();
  expect(new URL(page.url()).searchParams.get("sort")).toBe("price_asc");
  expect(new URL(page.url()).searchParams.get("type")).toBe("apartment,house");
  const criteria = page.getByRole("list", { name: copy.activeFilters });
  await criteria.getByRole("link", { name: /Remove: Property type.*House/ }).click();
  await expect(page.locator("#results-heading")).toBeFocused();
  expect(new URL(page.url()).searchParams.get("type")).toBe("apartment");
  expect(new URL(page.url()).searchParams.get("q")).toBe(data.published.reference);
  const result = page.locator(`#property-result-${data.published.reference}`);
  await result.click();
  await expect(page.getByRole("heading", { level: 1, name: data.published.title })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: copy.back, exact: true }).first().click();
  await expect(page.locator(`#property-result-${data.published.reference}`)).toBeFocused();
  expect(new URL(page.url()).searchParams.get("sort")).toBe("price_asc");
});

test("P01/P21 keeps separate owner entries and makes unavailable-reference contact a general message without a listing binding", async ({
  page,
}) => {
  const copy = discoveryCopy("en");
  await page.goto("/en");
  await expect(page.getByRole("heading", { level: 1, name: copy.homeTitle })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: copy.forSale })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: copy.forRent })).toBeVisible();
  await expect(page.getByRole("main").locator('a[href="/en/sell"]')).toBeVisible();
  await expect(page.getByRole("main").locator('a[href="/en/let"]')).toBeVisible();
  await page.goto(
    `/en/properties/${data.restricted.reference}/${data.restricted.reference.toLowerCase()}`,
  );
  await expect(page.getByText(copy.unavailable, { exact: true })).toBeVisible();
  await expect(page.locator("[data-property-facts]")).toHaveCount(0);
  const about = page.getByRole("link", {
    name: `${copy.askReference} · ${data.restricted.reference}`,
    exact: true,
  });
  await about.click();
  await expect(page.getByRole("textbox", { name: copy.message, exact: true })).toHaveValue(
    `${copy.askReference}: ${data.restricted.reference}`,
  );
  await expect(page.locator('input[name="listingReference"]')).toHaveValue("");
  await expect(page.locator('input[name="observedManifestId"]')).toHaveValue("");
});

test("M128 preserves an over-limit paste with a visible count and error, while Hebrew search alert entry uses the page language", async ({
  page,
}, testInfo) => {
  const copy = discoveryCopy("en");
  await page.goto("/en/inquire");
  const message = page.getByRole("textbox", { name: copy.message, exact: true });
  const pasted = "Synthetic pasted inquiry. ".repeat(100);
  await message.fill(pasted);
  await expect(message).toHaveValue(pasted);
  await expect(message).not.toHaveAttribute("maxlength", /.+/);
  await expect(message).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByText(copy.messageCount.replace("{count}", String(pasted.length)), { exact: false }),
  ).toBeVisible();
  await page.goto(`/he/properties?q=${data.published.reference}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator('a[href^="/he/search-alerts"]')).toHaveAttribute("lang", "he");
  await expect(page.locator('a[href^="/he/search-alerts"]')).toHaveAttribute("dir", "rtl");
  await page.screenshot({
    path: testInfo.outputPath("synthetic-hebrew-public-results.png"),
    fullPage: true,
  });
});
