import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { origins } from "./hosts";

// Covers two bounded map attempts plus database setup and the native fallback journey.
test.setTimeout(60_000);

function fixture(command = "map", reference?: string) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "src/features/discovery/testing/seed.ts",
        command,
        ...(reference ? [reference] : []),
      ],
      { encoding: "utf8", env: process.env },
    ),
  );
}

test("real PMTiles map opens on demand, retains list, and loses withdrawn pins", async ({
  page,
}) => {
  const data = fixture();
  const mapRequests: string[] = [],
    external: string[] = [],
    errors: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/maps/")) mapRequests.push(request.url());
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== origins.public)
      external.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const url = `/en/properties?q=${encodeURIComponent(data.published.reference)}`;
  await page.goto(url);
  await expect(page.getByRole("button", { name: "Show map" })).toBeEnabled();
  expect(mapRequests).toHaveLength(0);
  const archive = page.waitForResponse((r) => r.url().endsWith("basemap.pmtiles"));
  await page.getByRole("button", { name: "Show map" }).click();
  expect((await archive).status()).toBe(206);
  await expect(page.getByText("Loading map…", { exact: true })).not.toBeVisible({ timeout: 20000 });
  await expect(page.getByText("The map is unavailable.", { exact: false })).not.toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  const marker = page.getByRole("button", { name: new RegExp(data.published.reference) });
  await marker.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("link", { name: new RegExp(`Open property: ${data.published.reference}`) }),
  ).toBeVisible();
  await page
    .locator(".maplibregl-map")
    .screenshot({ path: test.info().outputPath("map-controls.png") });
  await page.screenshot({ path: test.info().outputPath("real-map.png"), fullPage: true });
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await page.getByRole("link", { name: "Go to list", exact: true }).click();
  await expect(page.locator("#property-results")).toBeFocused();
  await page.goto(
    `/en/properties/${data.published.reference}/${data.published.reference.toLowerCase()}`,
  );
  await expect(page.getByRole("heading", { name: data.published.title })).toBeVisible();
  await page.getByRole("button", { name: "Show map" }).click();
  await expect(
    page.getByText("The marker shows the area or settlement centre, not the property address."),
  ).toBeVisible();
  await expect(page.getByText("Loading map…", { exact: true })).not.toBeVisible({ timeout: 20000 });
  await expect(page.getByText("The map is unavailable.", { exact: false })).not.toBeVisible();
  await expect(page.locator(".msr-map-marker")).toBeVisible();
  await page.getByRole("link", { name: "Go to list", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/properties$/);
  await page.goto(url);

  fixture("withdraw", data.published.reference);
  await page.reload();
  await expect(page.getByRole("button", { name: "Show map" })).not.toBeVisible();
  await expect(page.locator(".msr-map-marker")).toHaveCount(0);
});

test("map failure and retry leave the listing usable; no-JavaScript list still works", async ({
  page,
  browser,
}) => {
  const data = fixture();
  const url = `/en/properties?q=${encodeURIComponent(data.published.reference)}`;
  await page.route("**/maps/**", (route) => route.fulfill({ status: 503, body: "" }));
  await page.goto(url);
  await page.getByRole("button", { name: "Show map" }).click();
  await expect(page.getByText("The map is unavailable. Use the list or try again.")).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByRole("link", { name: data.published.title, exact: true })).toBeVisible();
  await page.unroute("**/maps/**");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".msr-map-marker")).toBeVisible();
  await expect(
    page.getByText("The map is unavailable. Use the list or try again."),
  ).not.toBeVisible({ timeout: 20000 });
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: test.info().project.use.baseURL,
  });
  const native = await context.newPage();
  await native.goto(new URL(url, page.url()).toString());
  await expect(native.getByRole("link", { name: data.published.title, exact: true })).toBeVisible();
  await expect(native.getByText("The map needs JavaScript.", { exact: false })).toBeVisible();
  await context.close();
});
