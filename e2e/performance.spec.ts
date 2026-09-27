import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";

// This is a lab transfer budget, not a claim about field Web Vitals. Public map/media
// enhancements must remain lazy and cannot make the shared shell grow back to 340 KB gzip.
test("S1b public initial JavaScript stays below 250 KiB gzip", async ({ page, request }) => {
  await page.goto("/bg");
  await page.waitForLoadState("networkidle");
  const scripts = await page
    .locator("script[src]")
    .evaluateAll((elements) => [
      ...new Set(elements.map((element) => (element as HTMLScriptElement).src)),
    ]);
  expect(scripts.length).toBeGreaterThan(0);
  let gzipBytes = 0;
  for (const script of scripts) {
    const response = await request.get(script);
    expect(response.ok(), script).toBe(true);
    gzipBytes += gzipSync(await response.body()).byteLength;
  }
  await test.info().attach("initial-javascript.json", {
    body: JSON.stringify({ route: "/bg", gzipBytes, budgetBytes: 250 * 1024, scripts }),
    contentType: "application/json",
  });
  expect(gzipBytes).toBeLessThanOrEqual(250 * 1024);
});

test("S1b self-hosted fonts resolve and preload only the page's scripts", async ({ page }) => {
  for (const [locale, script] of [
    ["bg", "cyrillic"],
    ["he", "hebrew"],
  ] as const) {
    await page.goto(`/${locale}`);
    await page.evaluate(() => document.fonts.ready);
    const preloads = await page
      .locator('link[rel="preload"][as="font"]')
      .evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
    expect(preloads).toHaveLength(2);
    expect(preloads.some((url) => url.endsWith(`/noto-sans-${script}.woff2`))).toBe(true);
    expect(preloads.some((url) => url.endsWith("/noto-sans-latin.woff2"))).toBe(true);
    for (const url of preloads) {
      const response = await page.request.get(url);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toMatch(/font|woff/);
    }
  }
});
