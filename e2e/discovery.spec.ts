// S3 / AT01–AT13, AT27: synthetic approved inventory through the real public server.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Discovery tests require disposable E2E_DATABASE_URL.");
const sql = postgres(url, { max: 1 });
const db = drizzle(sql, { schema });
test.afterAll(async () => sql.end());
function fixture(command = "create", reference?: string) {
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
      {
        encoding: "utf8",
        env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
      },
    ).trim(),
  ) as {
    published: { reference: string; title: string };
    restricted: { reference: string; title: string };
    withdrawn: { reference: string; title: string };
  };
}

test("AT01/AT05/AT27: published search, local save/compare and withdrawal recheck", async ({
  page,
}, testInfo) => {
  const data = fixture();
  await page.goto(`/en/properties?q=${data.published.reference}`);
  await expect(page.getByRole("link", { name: data.published.title, exact: true })).toBeVisible();
  await expect(
    page.getByText("The map is unavailable. The list and filters remain available."),
  ).toBeVisible();
  await page.getByRole("link", { name: data.published.title, exact: true }).click();
  await expect(page.getByRole("heading", { name: data.published.title })).toBeVisible();
  const approvedPhoto = page.locator('img[src*="/api/media/"]').first();
  await expect(approvedPhoto).toBeVisible();
  await expect
    .poll(() => approvedPhoto.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.screenshot({
    path: testInfo.outputPath("synthetic-property-detail.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save in this browser", exact: true }).click();
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await page.goto("/en/saved");
  await expect(
    page.getByRole("link", { name: data.published.reference, exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Compare", exact: true }).last().click();
  await expect(page.getByRole("link", { name: data.published.title, exact: true })).toBeVisible();
  fixture("withdraw", data.published.reference);
  await page.reload();
  await expect(page.getByText("This property is unavailable here.")).toBeVisible();
  await expect(page.getByText(data.published.title, { exact: true })).toHaveCount(0);
  for (const item of [data.restricted, data.withdrawn, data.published]) {
    await page.goto(`/en/properties?q=${item.reference}`);
    await expect(page.locator("article[data-listing-reference]")).toHaveCount(0);
  }
  await page.goto("/he/properties");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("synthetic-he-discovery.png"),
    fullPage: true,
  });
});

test("F02/F29: native reviewed intent commits only chosen rules to editable search filters", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/en/properties/intent");
  await page
    .getByLabel("Describe your search", { exact: true })
    .fill("buy apartment with 2 bedrooms under 150000 euro");
  await page.getByRole("button", { name: "Review suggestions" }).click();
  await page.getByRole("checkbox", { name: /^Apartment/ }).check();
  await page.getByRole("checkbox", { name: /^Bedrooms/ }).check();
  await page.getByRole("checkbox", { name: /^Price/ }).check();
  await page.getByRole("button", { name: "Search with selected filters" }).click();
  const query = new URL(page.url()).searchParams;
  expect(query.get("purpose")).toBe("sale");
  expect(query.get("type")).toBe("apartment");
  expect(query.get("minBeds")).toBe("2");
  expect(query.get("maxPrice")).toBe("150000");
  expect(query.get("currency")).toBe("EUR");
  expect(query.has("q")).toBe(false);
  await expect(page.getByRole("checkbox", { name: "Apartment", exact: true })).toBeChecked();
  await expect(page.getByLabel("Minimum bedrooms", { exact: true })).toHaveValue("2");
  await page.goto("/en/properties/intent?text=holiday+rental+for+60+euro+per+night");
  await expect(page.getByRole("checkbox", { name: /^Price/ })).toHaveCount(0);
  await page.goto("/en/contact");
  await expect(
    page.getByText("Approved information is not yet available for this page."),
  ).toBeVisible();
  await context.close();
});

test("AT01/AT10/AT11: native no-JavaScript validation, single durable inquiry and receipt session", async ({
  browser,
  baseURL,
}, testInfo) => {
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto("/en/inquire");
  const key = await page.locator('[name="_operationId"]').inputValue();
  const message = `Synthetic inquiry ${randomUUID()}`;
  await page.getByLabel("Your inquiry", { exact: true }).fill(message);
  await page.getByLabel("Email", { exact: true }).fill("invalid");
  await page
    .getByLabel("I understand MS Realty will use these details to respond to this inquiry.")
    .check();
  await page.getByRole("button", { name: "Send an inquiry", exact: true }).click();
  await expect(page.getByRole("region", { name: "Check your answers" })).toBeVisible();
  await expect(page.getByLabel("Your inquiry", { exact: true })).toHaveValue(message);
  await expect(page.locator('[name="_operationId"]')).toHaveValue(key);
  await page.getByLabel("Email", { exact: true }).fill("synthetic-visitor@example.test");
  await page.getByRole("button", { name: "Send an inquiry", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Inquiry received" })).toBeVisible();
  const reference = (await page.locator("bdi").filter({ hasText: /^RQ-/ }).innerText()).trim();
  await page.getByRole("link", { name: "Open receipt" }).click();
  await expect(page.getByRole("heading", { name: "Inquiry received" })).toBeVisible();
  await page.reload();
  await expect(page.getByText(reference, { exact: true })).toBeVisible();
  const replay = await context.request.post("/api/inquiries", {
    headers: { origin: baseURL ?? "" },
    data: {
      submissionKey: key,
      purpose: "question",
      locale: "en",
      contact: { kind: "email", value: "synthetic-visitor@example.test" },
      message,
      privacyNotice: true,
    },
  });
  expect(replay.status()).toBe(200);
  const rows = await db
    .select()
    .from(schema.inquiries)
    .where(eq(schema.inquiries.submissionKey, key));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ reference, coverageQueue: "intake", message, source: "website" });
  await page.screenshot({
    path: testInfo.outputPath("synthetic-native-receipt.png"),
    fullPage: true,
  });
  const outsider = await browser.newContext({ baseURL });
  const otherPage = await outsider.newPage();
  await otherPage.goto(`/en/requests/${key}`);
  await expect(
    otherPage.getByRole("heading", { name: "We cannot confirm the result in this browser." }),
  ).toBeVisible();
  await expect(otherPage.getByText(reference, { exact: true })).toHaveCount(0);
  await outsider.close();
  await context.close();
});

test("AT27: listing withdrawal between reading and submitting keeps the draft without accepting stale intent", async ({
  page,
}, testInfo) => {
  // Model a separate synthetic visitor behind the trusted local test edge. Other scenarios
  // deliberately exercise the real five-request bucket rather than globally disabling it.
  await page.setExtraHTTPHeaders({ "cf-connecting-ip": `198.51.100.${10 + testInfo.workerIndex}` });
  const data = fixture();
  await page.goto(
    `/en/properties/${data.published.reference}/${data.published.reference.toLowerCase()}`,
  );
  await page.getByRole("link", { name: "Request a viewing", exact: true }).click();
  const key = await page.locator('[name="_operationId"]').inputValue();
  await page.getByLabel(/^Your inquiry/).fill("Synthetic viewing preference to retain");
  await page.getByLabel("Email", { exact: true }).fill("synthetic-observer@example.test");
  await page.getByRole("checkbox").check();
  fixture("withdraw", data.published.reference);
  await page.getByRole("button", { name: "Send an inquiry", exact: true }).click();
  await expect(
    page.getByText("The listing changed. Review the current version before continuing."),
  ).toBeVisible();
  await expect(page.getByLabel(/^Your inquiry/)).toHaveValue(
    "Synthetic viewing preference to retain",
  );
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    "synthetic-observer@example.test",
  );
  await expect(page.getByRole("heading", { name: "Inquiry received" })).toHaveCount(0);
  expect(
    await db.select().from(schema.inquiries).where(eq(schema.inquiries.submissionKey, key)),
  ).toHaveLength(0);
});
