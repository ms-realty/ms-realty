// P08/F04: device-local saves, deliberate P07 selection and truthful publication rechecks.
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const seedProgram = `
import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql as statement } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./src/db/schema/index.ts";
import { createListingFixture, insertPlace, publishForTest } from "./src/server/publication/testing.ts";
import { withdrawPublication } from "./src/server/publication/commands.ts";
import { createStaff } from "./src/server/testing.ts";
const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname)) throw new Error("Disposable saved-properties database required");
const sql = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(sql, { schema });
try {
  const staff = await createStaff(db, { roles: ["content_editor", "publishing_approver"], email: "synthetic-saved-" + randomUUID() + "@example.test" });
  const suffix = randomUUID().slice(0, 8);
  const placeId = await insertPlace(db, { country: "BG", level: "settlement", parentId: null, nameNative: "Синтетично място " + suffix, nameLatin: "Synthetic saved place " + suffix });
  const make = async (index) => {
    const title = "Synthetic saved property " + index + " " + suffix + ": " + "long supplied title ".repeat(3);
    const description = "Synthetic test property. Not a real offer.";
    const fixture = await db.transaction(async (tx) => {
      await tx.execute(statement\`select pg_advisory_xact_lock(hashtextextended('discovery-synthetic-fixtures', 0))\`);
      const item = await createListingFixture(tx, { reviewerId: staff.id, placeId, title, description, translations: { en: { title, description }, he: { title, description } } });
      const number = randomBytes(6).readUIntBE(0, 6).toString();
      const reference = "MS-" + number;
      await tx.update(schema.listings).set({ reference }).where(eq(schema.listings.id, item.listingId));
      await tx.update(schema.properties).set({ reference: "PR-2026-" + number }).where(eq(schema.properties.id, item.propertyId));
      await tx.update(schema.sellerInstructions).set({ reference: "SI-2026-" + number }).where(eq(schema.sellerInstructions.listingId, item.listingId));
      return { ...item, reference };
    });
    await publishForTest(db, staff.actor, fixture, ["bg", "en", "he"]);
    return { reference: fixture.reference, title, listingId: fixture.listingId };
  };
  const published = [await make(1), await make(2), await make(3), await make(4)];
  const withdrawn = await make(5);
  const [row] = await db.select().from(schema.listings).where(eq(schema.listings.id, withdrawn.listingId));
  await withdrawPublication(db, { actor: staff.actor, operationId: randomUUID(), expectedRevision: row.publicationGeneration, reference: withdrawn.reference, reason: "Synthetic P08 unavailable check" });
  console.log(JSON.stringify({ published, withdrawn }));
} finally { await sql.end(); }
`;
type Fixture = { reference: string; title: string };
let data: { published: [Fixture, Fixture, Fixture, Fixture]; withdrawn: Fixture };
test.beforeAll(() => {
  data = JSON.parse(
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
          DATABASE_URL: process.env.E2E_DATABASE_URL,
        },
      },
    ).trim(),
  );
});

const savedKey = "ms-realty.saved.v1";
const compareKey = "ms-realty.compare.v1";
type FourReferences = [string, string, string, string];
function publishedReferences(): FourReferences {
  if (data.published.length !== 4)
    throw new Error("P08 fixture must publish exactly four properties");
  return [
    data.published[0].reference,
    data.published[1].reference,
    data.published[2].reference,
    data.published[3].reference,
  ];
}
const check = (page: Page, reference: string) =>
  page.getByRole("checkbox", { name: `Select for comparison ${reference}`, exact: true });
const card = (page: Page, reference: string) =>
  page.locator(`article[data-listing-reference="${reference}"]`);
async function loaded(page: Page) {
  await expect(
    page.getByRole("heading", { name: data.published[3].title, exact: true }),
  ).toBeVisible();
  await expect(check(page, data.published[3].reference)).toBeEnabled();
}

test("P08: save four, choose second and fourth, compare exactly those and recover all saves with Back and reload", async ({
  page,
}, testInfo) => {
  const refs = publishedReferences();
  for (const item of data.published) {
    await page.goto(`/en/properties/${item.reference}/${item.reference.toLowerCase()}`);
    await page.getByRole("button", { name: "Save in this browser", exact: true }).click();
    await expect(page.getByRole("button", { name: "Remove", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  await page.goto("/en/saved");
  await loaded(page);
  await expect(page.locator("article[data-listing-reference]")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Compare selected properties" })).toBeDisabled();
  await check(page, refs[1]).check();
  await check(page, refs[3]).check();
  await expect(page.getByRole("status").filter({ hasText: "Selected for comparison:" })).toHaveText(
    "Selected for comparison: 2 / 3",
  );
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await page.screenshot({
      path: testInfo.outputPath(`saved-selected-${width}.png`),
      fullPage: true,
    });
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("link", { name: "Compare selected properties" }).click();
  expect(new URL(page.url()).searchParams.get("references")).toBe(`${refs[1]},${refs[3]}`);
  await expect(page.locator('th[id^="compare-MS-"]')).toHaveCount(2);
  await expect(page.locator(`th[id="compare-${refs[1]}"]`)).toBeVisible();
  await expect(page.locator(`th[id="compare-${refs[3]}"]`)).toBeVisible();
  await page.goBack();
  await loaded(page);
  await expect(check(page, refs[1])).toBeChecked();
  await expect(check(page, refs[3])).toBeChecked();
  await page.reload();
  await loaded(page);
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), savedKey),
  ).toEqual(refs);
  await expect(check(page, refs[1])).toBeChecked();
  await expect(check(page, refs[3])).toBeChecked();
  await check(page, refs[0]).check();
  await expect(check(page, refs[2])).toBeDisabled();
  await check(page, refs[0]).uncheck();
  await expect(check(page, refs[2])).toBeEnabled();
  await page.getByRole("button", { name: `Remove ${refs[1]}`, exact: true }).click();
  await expect(card(page, refs[1])).toHaveCount(0);
  await page.getByRole("button", { name: "Undo removal" }).click();
  await loaded(page);
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), savedKey),
  ).toEqual(refs);
  await expect(check(page, refs[1])).toBeChecked();
  await expect(page.getByRole("link", { name: "Compare selected properties" })).toHaveAttribute(
    "href",
    `/en/compare?references=${refs[1]},${refs[3]}`,
  );
});

test("P08: an unavailable selected property stays visible and needs explicit correction; Hebrew remains readable at 320", async ({
  page,
}, testInfo) => {
  await page.goto("/en/saved");
  const refs: [...FourReferences, string] = [...publishedReferences(), data.withdrawn.reference];
  await page.evaluate(
    ({ refs, savedKey, compareKey }) => {
      localStorage.setItem(savedKey, JSON.stringify(refs));
      localStorage.setItem(compareKey, JSON.stringify([refs[0], refs[1], refs[4]]));
    },
    { refs, savedKey, compareKey },
  );
  await page.reload();
  await expect(
    card(page, data.withdrawn.reference).getByText("This property is unavailable here."),
  ).toBeVisible();
  await expect(page.getByText(data.withdrawn.title, { exact: true })).toHaveCount(0);
  await expect(check(page, data.withdrawn.reference)).toBeChecked();
  await expect(page.getByRole("button", { name: "Compare selected properties" })).toBeDisabled();
  await check(page, data.withdrawn.reference).uncheck();
  await expect(check(page, data.withdrawn.reference)).toBeDisabled();
  await expect(page.getByRole("link", { name: "Compare selected properties" })).toHaveAttribute(
    "href",
    `/en/compare?references=${refs[0]},${refs[1]}`,
  );
  await page.setViewportSize({ width: 320, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("saved-unavailable-320.png"), fullPage: true });
  await page.goto("/he/saved");
  await expect(
    page.getByRole("heading", { name: data.published[0].title, exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: testInfo.outputPath("saved-he-320.png"), fullPage: true });
});

test("P08: denied browser storage reports unreadable saves rather than a false empty state", async ({
  browser,
  baseURL,
}, testInfo) => {
  const context = await browser.newContext({ ...testInfo.project.use, baseURL });
  try {
    await context.addInitScript(() => {
      Object.defineProperty(Storage.prototype, "getItem", {
        value() {
          throw new Error("Synthetic storage denial");
        },
      });
      Object.defineProperty(Storage.prototype, "setItem", {
        value() {
          throw new Error("Synthetic storage denial");
        },
      });
    });
    const page = await context.newPage();
    await page.goto("/en/saved");
    await expect(
      page.getByText(
        "Browser saves could not be read. This does not mean your saved list is empty.",
      ),
    ).toBeVisible();
    await expect(page.getByText("No saved properties yet.")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Compare selected properties" })).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("saved-storage-denied.png"),
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});

test("P08: JavaScript-off explains browser-local limitations and retains the native property link", async ({
  browser,
  baseURL,
}, testInfo) => {
  const context = await browser.newContext({
    ...testInfo.project.use,
    baseURL,
    javaScriptEnabled: false,
  });
  try {
    const page = await context.newPage();
    await page.goto("/en/saved");
    await expect(
      page.getByText(
        "Saving in the browser needs JavaScript. You can bookmark the property address instead.",
      ),
    ).toBeVisible();
    await expect(page.getByText("No saved properties yet.")).toHaveCount(0);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await page.getByRole("link", { name: "Back to properties", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/properties$/);
  } finally {
    await context.close();
  }
});
