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
  for (const [locale, expectedFiles] of [
    [
      "bg",
      [
        "/fonts/noto-sans-latin.woff2",
        "/fonts/manrope-latin.woff2",
        "/fonts/noto-sans-cyrillic.woff2",
        "/fonts/manrope-cyrillic.woff2",
      ],
    ],
    [
      "he",
      [
        "/fonts/noto-sans-latin.woff2",
        "/fonts/manrope-latin.woff2",
        "/fonts/noto-sans-hebrew.woff2",
      ],
    ],
  ] as const) {
    await page.goto(`/${locale}`);
    await page.evaluate(() => document.fonts.ready);
    const preloads = await page
      .locator('link[rel="preload"][as="font"]')
      .evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
    expect(preloads.map((url) => new URL(url).pathname).sort()).toEqual([...expectedFiles].sort());
    const files: { path: string; bodyBytes: number }[] = [];
    for (const url of preloads) {
      expect(new URL(url).origin).toBe(new URL(page.url()).origin);
      const response = await page.request.get(url);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toMatch(/font|woff/);
      files.push({ path: new URL(url).pathname, bodyBytes: (await response.body()).byteLength });
    }
    await test.info().attach(`preloaded-fonts-${locale}.json`, {
      body: JSON.stringify({
        route: `/${locale}`,
        files,
        totalBodyBytes: files.reduce((total, file) => total + file.bodyBytes, 0),
      }),
      contentType: "application/json",
    });
  }
});
