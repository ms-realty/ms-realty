// S3 / AT01–AT13, AT27: synthetic approved inventory through the real public server.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { inquiryReviewCopy } from "../src/features/discovery/inquiry-review-copy";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Discovery tests require disposable E2E_DATABASE_URL.");
const sql = postgres(url, { max: 1 });
const db = drizzle(sql, { schema });
test.afterAll(async () => sql.end());

for (const javaScriptEnabled of [true, false]) {
  test(`P18 owner intake review/edit/confirm preserves self-declaration with JavaScript ${javaScriptEnabled}`, async ({
    browser,
    baseURL,
  }, info) => {
    const context = await browser.newContext({
      baseURL,
      javaScriptEnabled,
      viewport: { width: 390, height: 844 },
      extraHTTPHeaders: {
        "cf-connecting-ip": `2001:db8:${randomUUID().replaceAll("-", "").slice(0, 24).match(/.{4}/g)?.join(":")}`,
      },
    });
    try {
      const page = await context.newPage();
      await page.goto("/en/inquire?purpose=seller_consultation");
      const key = await page.locator('[name="_operationId"]').inputValue();
      await expect(page.getByLabel(/^Town or area/)).toHaveValue("");
      await expect(page.getByLabel("Property type", { exact: true })).toHaveValue("");
      await expect(page.getByLabel("Sale or long-term letting", { exact: true })).toHaveValue("");
      await page.getByLabel(/^Town or area/).fill("Synthetic broad locality");
      await page.getByLabel("Property type", { exact: true }).selectOption("house");
      await page.getByLabel("Sale or long-term letting", { exact: true }).selectOption("sale");
      await page.getByLabel(/^Document area/).fill("78.50");
      await page
        .getByLabel("Your relationship to the property", { exact: true })
        .selectOption("representative");
      await page.getByLabel(/^Area source/).fill("Synthetic private source note");
      await page.getByLabel(/^Current use or condition/).fill("Not known first-hand");
      await page.getByLabel("Email", { exact: true }).fill("synthetic-owner@example.test");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Review inquiry", exact: true }).click();
      const review = page.getByRole("region", { name: "Review your inquiry", exact: true });
      await expect(review).toContainText("Synthetic broad locality");
      await expect(review).toContainText("78.50 m²");
      await expect(review).toContainText("Representative");
      await expect(review).toContainText("do not verify ownership");
      expect(
        await db.select().from(schema.inquiries).where(eq(schema.inquiries.submissionKey, key)),
      ).toHaveLength(0);
      expect(
        await db.select().from(schema.operations).where(eq(schema.operations.idempotencyKey, key)),
      ).toHaveLength(0);
      expect(page.url()).not.toMatch(/Synthetic|private|owner@example/);
      await page.getByRole("button", { name: "Edit inquiry", exact: true }).click();
      await expect(page.getByLabel(/^Town or area/)).toHaveValue("Synthetic broad locality");
      await expect(page.getByLabel(/^Area source/)).toHaveValue("Synthetic private source note");
      await expect(page.getByRole("checkbox")).toBeChecked();
      await page.getByRole("button", { name: "Review inquiry", exact: true }).click();
      await page.screenshot({
        path: info.outputPath(`owner-review-390-${javaScriptEnabled}.png`),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Send inquiry to MS Realty", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Inquiry received", exact: true }),
      ).toBeVisible();
      const records = await db
        .select()
        .from(schema.inquiries)
        .where(eq(schema.inquiries.submissionKey, key));
      expect(records).toHaveLength(1);
      expect(records[0]?.context).toMatchObject({
        ownerInput: {
          version: 1,
          provenance: "self_declared",
          locality: "Synthetic broad locality",
          propertyType: "house",
          transaction: "sale",
          documentArea: "78.50",
          relationship: "representative",
          propertyStatus: "Not known first-hand",
          documentSource: "Synthetic private source note",
        },
      });
      await page.getByRole("link", { name: "Open receipt", exact: true }).click();
      await expect(page.getByRole("main")).toContainText("78.50 m²");
      await expect(page.getByRole("main")).toContainText("Representative");
      await expect(page.getByRole("main")).not.toContainText("Synthetic private source note");
      await expect(page.getByRole("main")).not.toContainText("synthetic-owner@example.test");
      await page.reload();
      await expect(page.getByRole("main")).toContainText("78.50 m²");
    } finally {
      await context.close();
    }
  });
}
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
  await expect(page.getByText("No published map locations on this page.")).toBeVisible();
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
  // P08 deliberately requires two choices; the single-property P07 URL remains supported.
  await expect(
    page.getByRole("checkbox", { name: `Select for comparison ${data.published.reference}` }),
  ).toBeChecked();
  await expect(page.getByRole("button", { name: "Compare selected properties" })).toBeDisabled();
  await page.goto(`/en/compare?references=${data.published.reference}`);
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
  // CSS-pixel scale: Linux WebKit refuses full-page captures over 32767 device pixels, and the
  // Hebrew catalogue grows with listings that earlier browser projects publish.
  await page.screenshot({
    path: testInfo.outputPath("synthetic-he-discovery.png"),
    fullPage: true,
    scale: "css",
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
  await expect(page).toHaveURL(/\/en\/properties\?/);
  const query = new URL(page.url()).searchParams;
  expect(query.get("purpose")).toBe("sale");
  expect(query.get("type")).toBe("apartment");
  expect(query.get("minBeds")).toBe("2");
  expect(query.get("maxPrice")).toBe("150000");
  expect(query.get("currency")).toBe("EUR");
  expect(query.has("q")).toBe(false);
  await page.getByRole("button", { name: /^Filters/ }).click();
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
  await page.getByRole("button", { name: "Review inquiry", exact: true }).click();
  await expect(page.getByRole("region", { name: "Check your answers" })).toBeVisible();
  await expect(page.getByLabel("Your inquiry", { exact: true })).toHaveValue(message);
  await expect(page.locator('[name="_operationId"]')).toHaveValue(key);
  await page.getByLabel("Email", { exact: true }).fill("synthetic-visitor@example.test");
  await page.getByRole("button", { name: "Review inquiry", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Review your inquiry", exact: true }),
  ).toBeVisible();
  expect(
    await db.select().from(schema.inquiries).where(eq(schema.inquiries.submissionKey, key)),
  ).toHaveLength(0);
  expect(
    await db.select().from(schema.operations).where(eq(schema.operations.idempotencyKey, key)),
  ).toHaveLength(0);
  await expect(page.locator('[name="_operationId"]')).toHaveValue(key);
  await expect(page).not.toHaveURL(/synthetic-visitor|Synthetic%20inquiry/);
  await page.getByRole("button", { name: "Edit inquiry", exact: true }).click();
  await expect(page.getByLabel("Your inquiry", { exact: true })).toHaveValue(message);
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    "synthetic-visitor@example.test",
  );
  await expect(page.getByRole("checkbox")).toBeChecked();
  await page.getByRole("button", { name: "Review inquiry", exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath("inquiry-native-review-390.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Send inquiry to MS Realty", exact: true }).click();
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

for (const javaScriptEnabled of [true, false]) {
  test(`P11 changed after review requires explicit source refresh with JavaScript ${javaScriptEnabled}`, async ({
    browser,
    baseURL,
  }, info) => {
    const data = fixture();
    const context = await browser.newContext({
      baseURL,
      javaScriptEnabled,
      viewport: { width: 390, height: 844 },
      extraHTTPHeaders: {
        "cf-connecting-ip": `2001:db8:${randomUUID().replaceAll("-", "").slice(0, 24).match(/.{4}/g)?.join(":")}`,
      },
    });
    try {
      const page = await context.newPage();
      await page.goto(
        `/en/properties/${data.published.reference}/${data.published.reference.toLowerCase()}`,
      );
      await page.getByRole("link", { name: "Request a viewing", exact: true }).click();
      const key = await page.locator('[name="_operationId"]').inputValue();
      const previousManifest = await page.locator('[name="observedManifestId"]').inputValue();
      await page
        .getByLabel(/^Your inquiry/)
        .fill("Synthetic retained preference after publication change");
      await page.getByLabel("Email", { exact: true }).fill("synthetic-revision@example.test");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Review inquiry", exact: true }).click();
      await expect(page.getByRole("region", { name: "Review your inquiry" })).toContainText(
        data.published.title,
      );
      expect(
        await db.select().from(schema.inquiries).where(eq(schema.inquiries.submissionKey, key)),
      ).toHaveLength(0);
      fixture("republish", data.published.reference);
      await page.getByRole("button", { name: "Send inquiry to MS Realty", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Review current sources", exact: true }),
      ).toBeVisible();
      await expect(page.getByLabel(/^Your inquiry/)).toHaveValue(
        "Synthetic retained preference after publication change",
      );
      await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
        "synthetic-revision@example.test",
      );
      await expect(page.getByRole("checkbox")).toBeChecked();
      await expect(page.locator('[name="_operationId"]')).toHaveValue(key);
      await expect(page.locator('[name="observedManifestId"]')).toHaveValue(previousManifest);
      expect(
        await db.select().from(schema.inquiries).where(eq(schema.inquiries.submissionKey, key)),
      ).toHaveLength(0);
      await page.getByRole("button", { name: "Review current sources", exact: true }).click();
      await expect(page.getByRole("region", { name: "Review your inquiry" })).toContainText(
        "Synthetic retained preference after publication change",
      );
      const currentManifest = await page.locator('[name="observedManifestId"]').inputValue();
      expect(currentManifest).not.toBe(previousManifest);
      await expect(page.locator('[name="_operationId"]')).toHaveValue(key);
      await page.screenshot({
        path: info.outputPath(`inquiry-explicit-current-review-${javaScriptEnabled}.png`),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Send inquiry to MS Realty", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Inquiry received", exact: true }),
      ).toBeVisible();
      const records = await db
        .select()
        .from(schema.inquiries)
        .where(eq(schema.inquiries.submissionKey, key));
      expect(records).toHaveLength(1);
      expect(records[0]?.context).toMatchObject({
        listing: { reference: data.published.reference, manifestId: currentManifest },
      });
    } finally {
      await context.close();
    }
  });
}

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
  await page.getByRole("button", { name: "Review inquiry", exact: true }).click();
  await expect(page.getByText(inquiryReviewCopy("en").sourcesChanged).first()).toBeVisible();
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
  await page.getByRole("button", { name: "Review current sources", exact: true }).click();
  await expect(page.getByLabel(/^Your inquiry/)).toHaveValue(
    "Synthetic viewing preference to retain",
  );
  await expect(
    page.getByRole("button", { name: "Send inquiry to MS Realty", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('[name="listingReference"]')).toHaveValue(data.published.reference);
});

test("P11: the stateless form transport asks to re-enter private details after a correctable failure", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const issued = await context.request.get("/api/inquiries");
    const { submissionKey } = (await issued.json()) as { submissionKey: string };
    const message = `Synthetic private message ${randomUUID()}`;
    const response = await context.request.post("/api/inquiries", {
      headers: { "content-type": "application/x-www-form-urlencoded", origin: baseURL ?? "" },
      data: new URLSearchParams({
        submissionKey,
        locale: "en",
        purpose: "question",
        contactKind: "email",
        contactValue: "invalid",
        message,
        privacyNotice: "yes",
      }).toString(),
      maxRedirects: 0,
    });
    expect(response.status()).toBe(303);
    const location = response.headers().location ?? "";
    expect(location).not.toContain("invalid");
    expect(location).not.toContain(encodeURIComponent(message).slice(0, 20));
    const page = await context.newPage();
    await page.goto(location);
    await expect(
      page.getByText(
        "We could not accept the form. Your name, contact details and message were not kept, so please enter them again and send.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByLabel("Your inquiry", { exact: true })).toHaveValue("");
  } finally {
    await context.close();
  }
});
