import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

test("public listing results adapt to the specified compact, medium and wide ranges", async ({
  page,
}, testInfo) => {
  const fixture = JSON.parse(
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
  await page.goto(`/en/properties?q=${fixture.published.reference}`);
  await expect(
    page.getByRole("link", { name: fixture.published.title, exact: true }),
  ).toBeVisible();
  const results = page.locator("#property-results > div");
  const card = results.locator("article");
  for (const [width, columns] of [
    [639, 1],
    [640, 2],
    [768, 2],
    [1024, 2],
    [1440, 3],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    const actualColumns = await results.evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
    );
    expect(actualColumns, `Visible result columns at ${width}px`).toBe(columns);
    const bounds = await card.boundingBox();
    expect(bounds?.width).toBeGreaterThan(250);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    if (width === 768)
      await page.screenshot({ path: testInfo.outputPath("search-medium-768.png"), fullPage: true });
  }
});
