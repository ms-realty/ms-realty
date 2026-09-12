// Opt-in browser regression; uses an existing Playwright install without adding
// a production dependency. Set MS_REALTY_PLAYWRIGHT_MODULE / MS_REALTY_CHROME_PATH
// when the browser tools are installed outside this checkout.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHttpApp } from "../lib/http.mjs";
import { createNodeServer, listen, close } from "../lib/node-server.mjs";
import { labelsFor } from "../lib/public-site.mjs";
import { approvedPublicSeedFixtureOptions } from "./approved-public-seed.fixture.mjs";

const { chromium } = await import(process.env.MS_REALTY_PLAYWRIGHT_MODULE || "playwright");
const manifest = JSON.parse(readFileSync(new URL("../data/app-route-manifest.json", import.meta.url), "utf8"));
const routes = manifest.routes.filter((route) => route.type === "search");
assert.equal(routes.length, 7);
const app = createHttpApp(approvedPublicSeedFixtureOptions());
const server = createNodeServer((request) => ["GET", "HEAD", "OPTIONS"].includes(request.method)
  ? app(request)
  : { status: 403, headers: { "content-type": "application/json" }, body: "{}" });
const address = await listen(server, 0, "127.0.0.1");
const base = `http://127.0.0.1:${address.port}`;
let browser;
let checked = 0;
let noScriptChecked = 0;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.MS_REALTY_CHROME_PATH ? { executablePath: process.env.MS_REALTY_CHROME_PATH } : {}),
  });
  for (const route of routes) for (const width of [320, 390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: "light", locale: route.locale });
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    try {
      await context.route("**/*", async (intercept) => {
        const request = intercept.request();
        // Isolate enhancement geometry from image/font network timing. This
        // check deliberately does not calculate a performance score.
        if (request.resourceType() === "image") return intercept.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="680" height="510"/>' });
        if (request.url().startsWith("https://fonts.googleapis.com/")) return intercept.fulfill({ contentType: "text/css", body: "" });
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) return intercept.abort("blockedbyclient");
        if (request.url().includes("/vendor/ms-realty-public.js")) await held;
        return intercept.continue();
      });
      const page = await context.newPage();
      await page.goto(base + route.path, { waitUntil: "commit" });
      await page.locator("main").waitFor();
      await page.waitForFunction(() => [...document.styleSheets].some((sheet) => sheet.href?.includes("ms-realty-public.css")));
      // The local web font settles the heading metrics by a fraction of a
      // pixel; measure after it so the comparison isolates the enhancement.
      await page.evaluate(() => document.fonts.ready);
      const before = await page.evaluate(() => {
        const controls = [...document.querySelectorAll(".sr-toolbar [data-search-assistant-open], .sr-toolbar [data-evidence-open]")];
        return {
          top: document.querySelector(".sr-list").getBoundingClientRect().top,
          height: document.querySelector(".sr-toolbar").getBoundingClientRect().height,
          hidden: controls.every((control) => control.hidden && !control.checkVisibility({ checkVisibilityCSS: true })),
          focusable: controls.some((control) => { control.focus(); return document.activeElement === control; }),
        };
      });
      release();
      await page.waitForLoadState("load");
      await page.locator("[data-search-help]").waitFor({ state: "visible" });
      const after = await page.evaluate(() => ({
        top: document.querySelector(".sr-list").getBoundingClientRect().top,
        height: document.querySelector(".sr-toolbar").getBoundingClientRect().height,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      }));
      const label = `${route.locale} at ${width}px`;
      assert(before.hidden && !before.focusable, `${label}: unavailable controls stay invisible and unfocusable`);
      assert(Math.abs(after.top - before.top) <= 0.5, `${label}: results moved ${after.top - before.top}px during enhancement`);
      assert(Math.abs(after.height - before.height) <= 0.5, `${label}: toolbar height changed during enhancement`);
      assert(!after.overflow, `${label}: page overflows horizontally`);
      assert.equal(await page.getByRole("combobox", { name: labelsFor(route.locale).sort, exact: true }).count(), 1, label);
      // One compact entry discloses both assistance actions on request; opening
      // it floats a panel over the results instead of moving them.
      await page.locator("[data-search-help] summary").click();
      assert(await page.locator("[data-search-help]").evaluate((help) => help.open), label);
      assert(await page.locator("[data-search-help] [data-search-assistant-open], [data-search-help] [data-evidence-open]").evaluateAll((controls) => controls.length === 2 && controls.every((control) => control.checkVisibility())), `${label}: both actions disclosed`);
      const disclosed = await page.evaluate(() => ({
        top: document.querySelector(".sr-list").getBoundingClientRect().top,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      }));
      assert(Math.abs(disclosed.top - after.top) <= 0.5, `${label}: results moved when the help panel opened`);
      assert(!disclosed.overflow, `${label}: help panel overflows horizontally`);
      await page.locator("[data-search-assistant-open]").click();
      assert(await page.locator("[data-search-assistant]").evaluate((dialog) => dialog.open), label);
      await page.keyboard.press("Escape");
      assert(await page.locator("[data-search-assistant]").evaluate((dialog) => !dialog.open), label);
      assert(await page.locator("[data-search-assistant-open]").evaluate((control) => document.activeElement === control), label);
      await page.keyboard.press("Escape");
      assert(await page.locator("[data-search-help]").evaluate((help) => !help.open && document.activeElement === help.querySelector("summary")), `${label}: Escape closes the entry and restores focus`);
      checked += 1;
    } finally {
      release();
      await context.close();
    }
  }
  for (const locale of ["bg", "he"]) for (const width of [390, 1440]) {
    const route = routes.find((candidate) => candidate.locale === locale);
    const context = await browser.newContext({ viewport: { width, height: 844 }, javaScriptEnabled: false });
    try {
      await context.route("**/*", (intercept) => {
        const request = intercept.request();
        if (request.resourceType() === "image") return intercept.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="680" height="510"/>' });
        if (request.url().startsWith("https://fonts.googleapis.com/")) return intercept.fulfill({ contentType: "text/css", body: "" });
        return ["GET", "HEAD", "OPTIONS"].includes(request.method()) ? intercept.continue() : intercept.abort("blockedbyclient");
      });
      const page = await context.newPage();
      await page.goto(base + route.path, { waitUntil: "load" });
      assert(await page.locator(".psa-entry, .pse-entry, .sr-help").evaluateAll((controls) => controls.every((control) => getComputedStyle(control).display === "none")), `${locale}: no-JS controls reserve no empty space`);
      const select = page.getByRole("combobox", { name: labelsFor(locale).sort, exact: true });
      const order = await select.locator("option").nth(1).getAttribute("value");
      await select.selectOption(order);
      await Promise.all([
        page.waitForURL((url) => url.searchParams.get("sort") === order),
        page.locator("[data-search-toolbar-form]").getByRole("button", { name: labelsFor(locale).applyFilters, exact: true }).click(),
      ]);
      assert.equal(await select.inputValue(), order, `${locale}: native sort survives navigation`);
      noScriptChecked += 1;
    } finally {
      await context.close();
    }
  }
  console.log(JSON.stringify({ kind: "public_enhancement_layout", passed: checked, noScriptPassed: noScriptChecked, locales: routes.length, widths: [320, 390, 1440] }));
} finally {
  await browser?.close();
  await close(server);
}
