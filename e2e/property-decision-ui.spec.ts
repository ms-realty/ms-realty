// P05 / F03–F06 / AT05, AT27: contact remains part of the property decision on every screen.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, type Locator, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";

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
  const title = "Synthetic property decision " + randomUUID().slice(0, 8);
  const description = process.env.MSR_DECISION_DESCRIPTION;
  const placeId = await insertPlace(db, {
    country: "BG", level: "settlement", parentId: null,
    nameNative: "Синтетично място " + randomUUID(), nameLatin: "Synthetic place " + randomUUID(),
  });
  const fixture = await db.transaction(async (tx) => {
    await tx.execute(statement\`select pg_advisory_xact_lock(hashtextextended('discovery-synthetic-fixtures', 0))\`);
    const item = await createListingFixture(tx, {
      reviewerId: staff.id, placeId, title, description,
      translations: { en: { title, description } },
    });
    const number = randomBytes(6).readUIntBE(0, 6).toString();
    const reference = "MS-" + number;
    await tx.update(schema.listings).set({ reference }).where(eq(schema.listings.id, item.listingId));
    await tx.update(schema.properties).set({ reference: "PR-2026-" + number }).where(eq(schema.properties.id, item.propertyId));
    await tx.update(schema.sellerInstructions).set({ reference: "SI-2026-" + number }).where(eq(schema.sellerInstructions.listingId, item.listingId));
    return { ...item, reference };
  });
  const manifests = await publishForTest(db, staff.actor, fixture, ["bg", "en"]);
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
    const gallery = main.locator("ul").filter({ has: page.locator('img[src*="/api/media/"]') });
    const facts = main.locator("dl").first();
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
      panel.getByRole("button", { name: "Save in this browser", exact: true }),
    ).toBeVisible();
    await expect(panel.getByRole("button", { name: "Compare", exact: true })).toBeVisible();
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
    await expect(page.getByLabel("Purpose", { exact: true })).toHaveValue("viewing_request");
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
    await expect(page.getByText(listing.reference, { exact: true })).toBeVisible();
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
