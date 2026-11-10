// P05 / F03–F06 / AT05, AT27: contact remains part of the property decision on every screen.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, type Locator, type Page, test } from "@playwright/test";
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

/** The contact actions: beside the content on desktop, a bottom bar on phones. */
const contactArea = (page: Page, width: number) =>
  width < 1024
    ? page.locator("[data-contact-bar]")
    : page.getByRole("main").getByRole("complementary");

for (const width of [320, 390, 1440]) {
  test(`P05: ${width}px photos lead, then price and facts, the description, the reserved ask region and a visible contact area`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await page.goto(propertyHref());
    const main = page.getByRole("main");
    const heading = main.getByRole("heading", { level: 1, name: listing.title, exact: true });
    const gallery = main.locator("#listing-photos");
    const facts = main.locator("[data-listing-facts]").first();
    const price = main.locator("[data-price]").first();
    const about = main.locator("#about-heading");
    const paragraphs = main.locator("section[aria-labelledby='about-heading'] p");
    const askRegion = main.locator("#ask-about-this-home");
    const contact = contactArea(page, width);
    await expect(heading).toBeVisible();
    await expect(main.getByRole("heading", { level: 1 })).toHaveCount(1);
    // The description reads as paragraphs, not one block.
    await expect(paragraphs).toHaveCount(18);
    await expect(paragraphs.first()).toContainText("Paragraph 1 ");
    await expect(price).toContainText(/€|EUR/);
    // Facts are shown only when known: the seeded fact set has no unknown or blank cell.
    await expect(facts).toContainText("Bedrooms");
    await expect(main).not.toContainText(/Not published|Unknown|Not applicable/);
    // No map where there is no public point; no apology line either.
    await expect(main.getByText("No published map locations on this page.")).toHaveCount(0);
    await expect(
      main
        .getByRole("button", { name: "Save this property", exact: true })
        .locator("visible=true")
        .first(),
    ).toBeVisible();
    for (const [name, purpose] of [
      ["Ask a question", "question"],
      ["Request a viewing", "viewing_request"],
    ] as const) {
      const action = contact.getByRole("link", { name, exact: true });
      await expect(action).toBeVisible();
      const target = new URL((await action.getAttribute("href")) ?? "", page.url());
      expect(target.pathname).toBe("/en/inquire");
      expect(Object.fromEntries(target.searchParams)).toEqual({
        purpose,
        reference: listing.reference,
        manifest: listing.manifestId,
      });
      expect((await bounds(action)).height).toBeGreaterThanOrEqual(44);
    }
    const [galleryBox, priceBox, factsBox, aboutBox, askBox, contactBox, headingBox] =
      await Promise.all([
        bounds(gallery),
        bounds(price),
        bounds(facts),
        bounds(about),
        bounds(askRegion.or(about).first()),
        bounds(contact),
        bounds(heading),
      ]);
    expect(priceBox.y).toBeGreaterThanOrEqual(galleryBox.y + galleryBox.height);
    expect(headingBox.y).toBeGreaterThan(priceBox.y);
    expect(factsBox.y).toBeGreaterThanOrEqual(headingBox.y + headingBox.height);
    expect(aboutBox.y).toBeGreaterThanOrEqual(factsBox.y + factsBox.height);
    expect(askBox.y).toBeGreaterThanOrEqual(aboutBox.y);
    // The reserved region sits after the description and before the location.
    expect(await askRegion.count()).toBe(1);
    const inOrder = await page.evaluate(() => {
      const follows = (before: string, after: string) => {
        const first = document.querySelector(before);
        const second = document.querySelector(after);
        return !!first && !!second && !!(first.compareDocumentPosition(second) & 4);
      };
      return (
        follows("#about-heading", "#ask-about-this-home") &&
        follows("#ask-about-this-home", "#location-heading")
      );
    });
    expect(inOrder).toBe(true);
    if (width < 1024) {
      // The bar is fixed to the bottom of the viewport and spans it.
      expect(contactBox.y + contactBox.height).toBeGreaterThanOrEqual(
        page.viewportSize()?.height ?? 0 - 1,
      );
      expect(contactBox.x).toBeGreaterThanOrEqual(0);
      expect(contactBox.x + contactBox.width).toBeLessThanOrEqual(width);
    } else {
      expect(contactBox.x).toBeGreaterThanOrEqual(galleryBox.x);
      expect(contactBox.x).toBeGreaterThan(aboutBox.x + 200);
      expect(contactBox.y).toBeLessThan(aboutBox.y);
    }
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
    // Phones: the contact bar stays in reach, and its link works without JavaScript.
    const bar = page.locator("[data-contact-bar]");
    await expect(bar).toBeVisible();
    await bar.getByRole("link", { name: "Request a viewing", exact: true }).click();
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
