// P05 / F03–F06 / AT05, AT27: contact remains part of the property decision on every screen.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, type Locator, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { discoveryCopy } from "../src/features/discovery/copy";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Property decision tests require disposable E2E_DATABASE_URL.");
const sql = postgres(url, { max: 1 });
const db = drizzle(sql, { schema });
const longDescription = Array.from(
  { length: 18 },
  (_, index) =>
    `Synthetic long property description. Not a real offer. Paragraph ${index + 1} preserves the supplied property facts and asks the agency to confirm any missing information.`,
).join("\n\n");

// Use the same approved publication helpers and temporary-identity lock as discovery's seed.
// Long source text is approved before publication; do not alter the page DOM or a live manifest.
const seedProgram = `
import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql as statement } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./src/db/schema/index.ts";
import sharp from "sharp";
import { createListingFixture, insertPlace, publishForTest } from "./src/server/publication/testing.ts";
import { createStaff } from "./src/server/testing.ts";
const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Property decision seed needs a disposable browser database.");
const sql = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(sql, { schema });
try {
  const staff = await createStaff(db, {
    roles: ["content_editor", "publishing_approver"],
    email: "synthetic-decision-" + randomUUID() + "@example.test",
  });
  const title = "Synthetic courtyard apartment";
  const description = process.env.MSR_DECISION_DESCRIPTION;
  const placeId = await insertPlace(db, {
    country: "BG", level: "settlement", parentId: null,
    nameNative: "Синтетично място " + randomUUID(), nameLatin: "Synthetic place " + randomUUID(),
  });
  await db.update(schema.geographyPlaces).set({ nameNative: "Синтетичен учебен град", nameLatin: "Synthetic review town" }).where(eq(schema.geographyPlaces.id, placeId));
  const fixture = await db.transaction(async (tx) => {
    await tx.execute(statement\`select pg_advisory_xact_lock(hashtextextended('discovery-synthetic-fixtures', 0))\`);
    const item = await createListingFixture(tx, {
      reviewerId: staff.id, placeId, title, description,
      translations: { en: { title, description }, he: { title, description } },
      photos: 3,
      photoFixture: { width: 1200, height: 800, bytes: await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#d7e3e1" } }).webp().toBuffer() },
    });
    const number = randomBytes(6).readUIntBE(0, 6).toString();
    const reference = "MS-" + number;
    await tx.update(schema.listings).set({ reference }).where(eq(schema.listings.id, item.listingId));
    await tx.update(schema.properties).set({ reference: "PR-2026-" + number }).where(eq(schema.properties.id, item.propertyId));
    await tx.update(schema.sellerInstructions).set({ reference: "SI-2026-" + number }).where(eq(schema.sellerInstructions.listingId, item.listingId));
    return { ...item, reference };
  });
  // Declare synthetic media metadata before producing the approved publication manifest.
  await db.update(schema.mediaAssets).set({ kind: "floor_plan", altText: "Synthetic floor plan", caption: "Synthetic plan for viewer testing. Not a real property plan." }).where(eq(schema.mediaAssets.id, fixture.assetIds[1]));
  await db.update(schema.mediaAssets).set({ kind: "render", originalAssetId: fixture.assetIds[0], altText: "Synthetic rendering", modification: "renovation_render", modificationDisclosure: "Synthetic architectural rendering", caption: "Synthetic render for viewer testing." }).where(eq(schema.mediaAssets.id, fixture.assetIds[2]));
  const manifests = await publishForTest(db, staff.actor, fixture, ["bg", "en", "he"]);
  console.log(JSON.stringify({ reference: fixture.reference, title, manifestId: manifests[1], listingId: fixture.listingId }));
} finally { await sql.end(); }
`;

let listing: { reference: string; title: string; manifestId: string; listingId: string };
test.beforeAll(() => {
  listing = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        seedProgram,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          AUTH_SECRET: process.env.E2E_AUTH_SECRET,
          DATABASE_URL: url,
          MSR_DECISION_DESCRIPTION: longDescription,
        },
      },
    ).trim(),
  );
});
test.afterAll(async () => sql.end());

const propertyHref = () => `/en/properties/${listing.reference}/${listing.reference.toLowerCase()}`;
async function bounds(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error("Expected property decision element to have rendered geometry.");
  return box;
}

for (const width of [320, 390, 1440]) {
  test(`P05: ${width}px contact follows gallery/facts and precedes long description and absent-map fallback`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await page.goto(propertyHref());
    const main = page.getByRole("main");
    const heading = main.getByRole("heading", { level: 1, name: listing.title, exact: true });
    // The cover leads; the remaining photos are disclosed on demand. A failed image
    // still has a visible figure and must not make the geometry assertion wait for an img.
    const gallery = main.locator("figure").first();
    const facts = main.locator("[data-property-facts]");
    const price = main.locator("header > p").last();
    const panel = main.getByRole("complementary");
    const description = main.getByText(longDescription, { exact: true });
    const mapFallback = main.getByText("No published map locations on this page.", { exact: true });
    await expect(heading).toBeVisible();
    await expect(main.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(description).toHaveText(longDescription);
    await expect(mapFallback).toBeVisible();
    await expect(main.getByRole("button", { name: "Show map", exact: true })).toHaveCount(0);
    await expect(price).toContainText(/€|EUR/);
    await expect(facts).toContainText("Bedrooms");
    await expect(
      panel.getByRole("button", {
        name: `Save in this browser · ${listing.reference}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: `Compare · ${listing.reference}`, exact: true }),
    ).toBeVisible();
    for (const [name, purpose] of [
      ["Send an inquiry", "question"],
      ["Request a viewing", "viewing_request"],
    ] as const) {
      const action = panel.getByRole("link", { name, exact: true });
      const href = await action.getAttribute("href");
      const target = new URL(href ?? "", page.url());
      expect(target.pathname).toBe("/en/inquire");
      expect(Object.fromEntries(target.searchParams)).toEqual({
        purpose,
        reference: listing.reference,
        manifest: listing.manifestId,
      });
      expect((await bounds(action)).height).toBeGreaterThanOrEqual(44);
    }
    const [titleBox, galleryBox, factsBox, priceBox, panelBox, descriptionBox, mapBox] =
      await Promise.all([
        bounds(heading),
        bounds(gallery),
        bounds(facts),
        bounds(price),
        bounds(panel),
        bounds(description),
        bounds(mapFallback),
      ]);
    if (width < 1024) {
      expect(panelBox.y).toBeGreaterThanOrEqual(galleryBox.y + galleryBox.height);
      expect(panelBox.y).toBeGreaterThanOrEqual(factsBox.y + factsBox.height);
      expect(panelBox.y).toBeGreaterThanOrEqual(priceBox.y + priceBox.height);
      expect(descriptionBox.y).toBeGreaterThanOrEqual(panelBox.y + panelBox.height);
      expect(mapBox.y).toBeGreaterThanOrEqual(descriptionBox.y + descriptionBox.height);
      expect(panelBox.x).toBeGreaterThanOrEqual(0);
      expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(width);
    } else {
      expect(panelBox.x).toBeGreaterThanOrEqual(galleryBox.x + galleryBox.width);
      expect(panelBox.y).toBeLessThanOrEqual(titleBox.y);
      expect(descriptionBox.x + descriptionBox.width).toBeLessThanOrEqual(panelBox.x);
      expect(descriptionBox.y).toBeGreaterThanOrEqual(factsBox.y + factsBox.height);
    }
    expect(descriptionBox.height).toBeGreaterThan(500);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath(`property-decision-${width}.png`),
      fullPage: true,
    });
  });
}

test("P05/F06/AT27: phone contact works without JavaScript and records the exact property on its receipt", async ({
  browser,
  baseURL,
}, testInfo) => {
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
    extraHTTPHeaders: { "cf-connecting-ip": `198.51.100.${170 + testInfo.workerIndex}` },
  });
  try {
    const page = await context.newPage();
    await page.goto(propertyHref());
    const panel = page.getByRole("main").getByRole("complementary");
    const description = page.getByText(longDescription, { exact: true });
    const panelBox = await bounds(panel);
    expect((await bounds(description)).y).toBeGreaterThanOrEqual(panelBox.y + panelBox.height);
    await panel.getByRole("link", { name: "Request a viewing", exact: true }).click();
    await expect(page.locator('[name="listingReference"]')).toHaveValue(listing.reference);
    await expect(page.locator('[name="observedManifestId"]')).toHaveValue(listing.manifestId);
    await expect(page.getByLabel("What would you like to do?", { exact: true })).toHaveValue(
      "viewing_request",
    );
    const key = await page.locator('[name="_operationId"]').inputValue();
    const message = `Synthetic property viewing preference ${randomUUID()}`;
    await page.getByLabel(/^Your inquiry/).fill(message);
    await page.getByLabel("Email", { exact: true }).fill("synthetic-decision@example.test");
    await page
      .getByLabel("I understand MS Realty will use these details to respond to this inquiry.")
      .check();
    await page.getByRole("button", { name: "Review inquiry", exact: true }).click();
    await page.getByRole("button", { name: "Send inquiry to MS Realty", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Inquiry received", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Open receipt", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/en/requests/${key}$`));
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Inquiry received", exact: true }),
    ).toBeVisible();
    // P12: the receipt names the exact saved property by its reference.
    await expect(
      page
        .getByRole("region", { name: "The property in this inquiry", exact: true })
        .getByText(`No. ${listing.reference}`, { exact: true }),
    ).toBeVisible();
    const rows = await db
      .select()
      .from(schema.inquiries)
      .where(eq(schema.inquiries.submissionKey, key));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      state: "received",
      purpose: "viewing_request",
      source: "website",
      listingId: listing.listingId,
      message,
      context: {
        listing: { reference: listing.reference, manifestId: listing.manifestId, locale: "en" },
      },
    });
    await page.screenshot({
      path: testInfo.outputPath("property-native-receipt.png"),
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});

for (const [width, height, locale] of [
  [1440, 900, "en"],
  [390, 844, "en"],
  [320, 844, "he"],
  [844, 390, "en"],
] as const) {
  test(`P06/UI17: ${width}px ${locale} selected media, keyboard, fit/zoom, Back and focus return`, async ({
    page,
  }, info) => {
    const copy = discoveryCopy(locale);
    await page.setViewportSize({ width, height });
    await page.goto(propertyHref().replace("/en/", `/${locale}/`));
    const main = page.getByRole("main");
    await main.getByText(copy.morePhotos.replace("{count}", "2"), { exact: true }).click();
    const launcher = main.getByRole("link", {
      name: `${copy.openMedia.replace("{position}", "2")} · Synthetic floor plan`,
      exact: true,
    });
    const href = await launcher.getAttribute("href");
    expect(href).toMatch(/^\/api\/media\/[a-f\d-]{36}\/[a-f\d]{64}$/);
    const parent = page.url();
    await launcher.click();
    const viewer = page.getByRole("dialog", { name: copy.mediaViewer, exact: true });
    await expect(viewer).toBeVisible();
    await expect(viewer.getByRole("button", { name: copy.close, exact: true })).toBeFocused();
    await expect(viewer).toContainText(
      copy.mediaPosition.replace("{position}", "2").replace("{count}", "3"),
    );
    const image = viewer.getByRole("img", { name: "Synthetic floor plan", exact: true });
    await expect
      .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
      .toBe(1200);
    expect(await image.evaluate((node) => getComputedStyle(node).objectFit)).toBe("contain");
    await expect(viewer).toContainText("Synthetic plan for viewer testing.");
    await viewer.getByRole("button", { name: copy.zoomIn, exact: true }).click();
    await expect(
      viewer.getByRole("button", { name: `${copy.fitMedia} 150%`, exact: true }),
    ).toBeVisible();
    const viewport = viewer.getByRole("region", { name: copy.mediaFloorPlan, exact: true });
    expect(await viewport.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    await viewport.focus();
    await page.keyboard.press(locale === "he" ? "ArrowLeft" : "ArrowRight");
    // A zoomed image retains arrow-key panning; media navigation remains a separate control.
    await expect(viewer).toContainText(
      copy.mediaPosition.replace("{position}", "2").replace("{count}", "3"),
    );
    await viewer.getByRole("button", { name: `${copy.fitMedia} 150%`, exact: true }).click();
    await expect(
      viewer.getByRole("button", { name: `${copy.fitMedia} 100%`, exact: true }),
    ).toBeVisible();
    expect(await viewer.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press(locale === "he" ? "ArrowLeft" : "ArrowRight");
    await expect(viewer).toContainText(
      copy.mediaPosition.replace("{position}", "3").replace("{count}", "3"),
    );
    await expect(viewer).toContainText("Synthetic architectural rendering");
    await expect(viewer.getByRole("button", { name: copy.nextMedia, exact: true })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await page.keyboard.press("Tab");
    expect(await viewer.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`gallery-${locale}-${width}.png`) });
    await page.goBack();
    await expect(viewer).toHaveCount(0);
    await expect(page).toHaveURL(parent);
    await expect(launcher).toBeFocused();
    await launcher.click();
    await page.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);
    await expect(launcher).toBeFocused();
  });
}

for (const width of [320, 390, 1440]) {
  test(`P05/L03: ${width}px actions stay reachable, preserve source context and clear the page end`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(propertyHref());
    await page.screenshot({ path: info.outputPath(`property-viewport-${width}.png`) });
    const dock = page.getByRole("navigation", { name: "Property actions", exact: true });
    const panel = page.getByRole("complementary");
    if (width === 1440) {
      await expect(dock).toBeHidden();
      expect(await panel.evaluate((node) => getComputedStyle(node).position)).toBe("sticky");
      await page.evaluate(() => window.scrollBy(0, 900));
      const panelBox = await bounds(panel);
      const headerBox = await bounds(page.locator("[data-public-header]"));
      expect(panelBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
      expect(panelBox.y).toBeLessThan(160);
    } else {
      await expect(dock).toBeVisible();
      for (const [name, purpose] of [
        ["Send an inquiry", "question"],
        ["Request a viewing", "viewing_request"],
      ] as const) {
        const action = dock.getByRole("link", {
          name: `${name} · ${listing.reference}`,
          exact: true,
        });
        const target = new URL((await action.getAttribute("href")) ?? "", page.url());
        expect(Object.fromEntries(target.searchParams)).toEqual({
          purpose,
          reference: listing.reference,
          manifest: listing.manifestId,
        });
        expect((await bounds(action)).height).toBeGreaterThanOrEqual(44);
      }
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const copyright = page.locator("footer > div > p");
      await expect
        .poll(
          async () =>
            (await bounds(copyright)).y + (await bounds(copyright)).height <=
            (await bounds(dock)).y + 1,
        )
        .toBe(true);
      const lastLink = page.locator("footer a").last();
      await lastLink.focus();
      await expect
        .poll(
          async () =>
            (await bounds(lastLink)).y + (await bounds(lastLink)).height <=
            (await bounds(dock)).y + 1,
        )
        .toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`property-actions-${width}.png`) });
  });
}

test("P06/AT01: native media links and captions remain usable without JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    await page.goto(propertyHref());
    await page.getByText("More photos (2)", { exact: true }).click();
    const plan = page.getByRole("link", {
      name: "Open media 2 · Synthetic floor plan",
      exact: true,
    });
    await expect(plan).toBeVisible();
    await expect(
      page.getByText("Synthetic plan for viewer testing. Not a real property plan.", {
        exact: true,
      }),
    ).toBeVisible();
    const href = await plan.getAttribute("href");
    const response = await context.request.get(href ?? "");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/webp");
    await plan.click();
    await expect(page).toHaveURL(new URL(href ?? "", baseURL).toString());
  } finally {
    await context.close();
  }
});
