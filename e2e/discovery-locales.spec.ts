// P01 home, P02 catalogue and P05 property detail read their copy from the message catalogs in
// all seven locales (design/i18n-uncatalogued-copy-plan.md §3.6, phase 1). Hebrew is right to
// left with the listing reference, price and area isolated, without horizontal scroll at 320 and
// 390 px, and passes axe color-contrast and region.
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { publicLocales } from "../src/domain/ids";
import { discoveryCopy } from "../src/features/discovery/copy";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Locale screen tests require disposable E2E_DATABASE_URL.");

/** A listing published in every public locale, with a known price, bedrooms and area. */
function fixture(): { reference: string; title: string } {
  const output = execFileSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "src/features/discovery/testing/seed.ts",
      "locales",
    ],
    {
      encoding: "utf8",
      env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
    },
  );
  return (JSON.parse(output.trim()) as { published: { reference: string; title: string } })
    .published;
}

/** Paths after the locale segment. */
const screens = (reference: string) => ({
  P01: "",
  P02: `/properties?q=${reference}`,
  P05: `/properties/${reference}/${reference.toLowerCase()}`,
});

async function axeViolations(page: Page) {
  // options() replaces the run options, so it comes before withRules() (see readable-actions).
  const result = await new AxeBuilder({ page })
    .options({ iframes: false })
    .withRules(["color-contrast", "region"])
    .analyze();
  return result.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(" ")}`),
  );
}

test("P01, P02 and P05 speak every public locale from the catalogs", async ({ page }) => {
  const listing = fixture();
  for (const locale of publicLocales) {
    const copy = discoveryCopy(locale);
    const paths = screens(listing.reference);
    await page.goto(`/${locale}${paths.P01}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.properties);
    await page.goto(`/${locale}${paths.P02}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.search);
    // The search-alert link speaks the page's language: no forced English island.
    const alerts = page.getByRole("link", { name: copy.alertEntry, exact: true });
    await expect(alerts).toBeVisible();
    expect(
      await alerts.evaluate((link) => [link.getAttribute("lang"), link.getAttribute("dir")]),
    ).toEqual([null, null]);
    await expect(
      page.locator(`article[data-listing-reference="${listing.reference}"]`),
    ).toContainText(copy.bedrooms);
    await page.goto(`/${locale}${paths.P05}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(listing.title);
    await expect(page.getByRole("link", { name: copy.back }).first()).toBeVisible();
  }
});

for (const width of [320, 390]) {
  test(`P01, P02 and P05 in Hebrew at ${width} px: right to left, isolated facts, no horizontal scroll, axe clean`, async ({
    page,
  }) => {
    const listing = fixture();
    await page.setViewportSize({ width, height: 844 });
    for (const [screen, path] of Object.entries(screens(listing.reference))) {
      await page.goto(`/he${path}`);
      await expect(page.locator("html")).toHaveAttribute("lang", "he");
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${screen} scrolls sideways`).toBeLessThanOrEqual(0);
      expect(await axeViolations(page), screen).toEqual([]);
      if (screen === "P01") continue;
      const facts =
        screen === "P02"
          ? page.locator(`article[data-listing-reference="${listing.reference}"]`)
          : page.getByRole("main");
      await expect(facts.locator("bdi", { hasText: listing.reference }).first()).toBeVisible();
      await expect(facts.locator("bdi", { hasText: "€" }).first()).toBeVisible();
      await expect(facts.locator("dd bdi", { hasText: "m²" }).first()).toBeVisible();
    }
    // The shell's phone link is a left-to-right run too.
    await expect(page.getByRole("contentinfo").locator('a[href^="tel:"]')).toContainText(
      "⁦+359 879 696 870⁩",
    );
  });
}
