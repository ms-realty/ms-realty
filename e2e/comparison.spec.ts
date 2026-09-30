// P07: real publication reads, three aligned choices, native removal, and collective receipt.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { hostUrl, origins } from "./hosts";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Comparison tests require disposable E2E_DATABASE_URL.");

// Same official helpers, synthetic identities, and lock as discovery/testing/seed.ts.
// Deliberately publish long titles and precise differing fact bases before testing their layout.
const seedProgram = `
import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql as statement } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./src/db/schema/index.ts";
import { createListingFixture, defaultFacts, insertPlace, publishForTest } from "./src/server/publication/testing.ts";
import { withdrawPublication } from "./src/server/publication/commands.ts";
import { createStaff } from "./src/server/testing.ts";
const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Comparison seed needs a disposable browser database.");
const sql = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(sql, { schema });
try {
  const staff = await createStaff(db, {
    roles: ["content_editor", "publishing_approver"],
    email: "synthetic-comparison-" + randomUUID() + "@example.test",
  });
  const suffix = randomUUID().slice(0, 8);
  const placeId = await insertPlace(db, {
    country: "BG", level: "settlement", parentId: null,
    nameNative: "Синтетично място " + suffix, nameLatin: "Synthetic comparison location " + suffix,
  });
  const make = async (index) => {
    const title = "Synthetic comparison " + index + " " + suffix + ": " + "long supplied title ".repeat(index + 3);
    const description = "Synthetic test property. Not a real offer.";
    const period = index === 2 ? "month" : "total";
    const areaBasis = index === 2 ? "built" : "living";
    const fixture = await db.transaction(async (tx) => {
      await tx.execute(statement\`select pg_advisory_xact_lock(hashtextextended('discovery-synthetic-fixtures', 0))\`);
      const item = await createListingFixture(tx, {
        reviewerId: staff.id, placeId, title, description,
        purpose: index === 2 ? "long_term_rent" : "sale",
        price: { state: "known", value: { amountMinor: index === 2 ? 70005 : 12345678, currency: "EUR", period, basis: index === 2 ? "negotiable" : "asking" } },
        facts: { ...defaultFacts, bedrooms: { state: "unknown" }, "feature.lift": { state: "unknown" },
          "area.living": index === 2 ? { state: "not_supplied" } : { state: "known", value: { value: 72.123456789, unit: "m2", basis: areaBasis } },
          ...(index === 2 ? { "area.built": { state: "known", value: { value: 65.987654321, unit: "m2", basis: areaBasis } } } : {}),
        },
        translations: { en: { title, description }, he: { title, description } },
      });
      const number = randomBytes(6).readUIntBE(0, 6).toString();
      const reference = "MS-" + number;
      await tx.update(schema.listings).set({ reference }).where(eq(schema.listings.id, item.listingId));
      await tx.update(schema.properties).set({ reference: "PR-2026-" + number }).where(eq(schema.properties.id, item.propertyId));
      await tx.update(schema.sellerInstructions).set({ reference: "SI-2026-" + number }).where(eq(schema.sellerInstructions.listingId, item.listingId));
      return { ...item, reference };
    });
    const manifests = await publishForTest(db, staff.actor, fixture, ["bg", "en", "he"]);
    return { reference: fixture.reference, title, manifestId: manifests[1], listingId: fixture.listingId };
  };
  const published = [await make(1), await make(2), await make(3)];
  const withdrawn = await make(4);
  const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.id, withdrawn.listingId));
  await withdrawPublication(db, { actor: staff.actor, operationId: randomUUID(), expectedRevision: listing.publicationGeneration,
    reference: withdrawn.reference, reason: "Synthetic comparison availability check" });
  console.log(JSON.stringify({ published, withdrawn }));
} finally { await sql.end(); }
`;

const brokerReadbackProgram = `
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./src/db/schema/index.ts";
import { createStaff } from "./src/server/testing.ts";
import { createSession } from "./src/server/auth/sessions.ts";
const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname)) throw new Error("Disposable database required");
const sql = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(sql, { schema });
try {
  const rows = await db.select().from(schema.inquiries).where(eq(schema.inquiries.message, process.env.E2E_COMPARE_MARKER));
  if (rows.length !== 1) throw new Error("Exactly one durable collective inquiry required");
  const broker = await createStaff(db, {roles:["assigned_broker"]});
  await db.insert(schema.passkeys).values([0,1].map(() => ({principalId:broker.id,credentialId:randomUUID(),publicKey:Buffer.from([1]),deviceType:"singleDevice",backedUp:false})));
  const session = await createSession(db, {kind:"staff",id:broker.id});
  console.log(JSON.stringify({id:rows[0].id, reference:rows[0].reference, context:rows[0].context, token:session.token}));
} finally { await sql.end(); }
`;

type Fixture = { reference: string; title: string; manifestId: string };
let data: { published: [Fixture, Fixture, Fixture]; withdrawn: Fixture };
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
        env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
      },
    ).trim(),
  );
});

const references = () => data.published.map((item) => item.reference);
const href = (refs: readonly string[] = references(), locale = "en") =>
  `/${locale}/compare?${new URLSearchParams({ references: refs.join(",") })}`;
const column = (page: Page, reference: string) => page.locator(`th[id="compare-${reference}"]`);
async function bounds(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error("Comparison element must have rendered geometry.");
  return box;
}
async function assertChoice(page: Page, refs: string[]) {
  const table = page.getByRole("table");
  await expect(table.locator('thead th[id^="compare-MS-"]')).toHaveCount(refs.length);
  for (const reference of refs) await expect(column(page, reference)).toBeVisible();
  const expected = data.published.filter((item) => refs.includes(item.reference));
  const inquiry = page.getByRole("link", {
    name: "Discuss this selection with a broker",
    exact: true,
  });
  await expect(inquiry).toBeVisible();
  const query = new URL((await inquiry.getAttribute("href")) ?? "", page.url()).searchParams;
  expect(query.get("purpose")).toBe("question");
  expect(JSON.parse(query.get("selection") ?? "null")).toEqual(
    refs.map((reference) => ({
      reference,
      observedManifestId: expected.find((item) => item.reference === reference)?.manifestId,
    })),
  );
}

for (const width of [320, 390, 1440]) {
  test(`P07: ${width}px shows three aligned columns, exact facts, long titles and approved photos without horizontal page scrolling`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await page.goto(href());
    await assertChoice(page, references());
    await expect(page.getByText("No saved properties yet.", { exact: true })).toHaveCount(0);
    const boxes = await Promise.all(
      references().map((reference) => bounds(column(page, reference))),
    );
    const firstBox = boxes[0];
    if (!firstBox) throw new Error("Expected three comparison columns.");
    for (const box of boxes) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      expect(Math.abs(box.y - firstBox.y)).toBeLessThan(1);
      expect(box.width).toBeGreaterThan(60);
    }
    let previousBox = firstBox;
    for (const box of boxes.slice(1)) {
      expect(box.x).toBeGreaterThanOrEqual(previousBox.x + previousBox.width);
      previousBox = box;
    }
    const table = page.getByRole("table");
    const rows = table.locator("tbody tr");
    await expect(rows).toHaveCount(6);
    for (let index = 0; index < 6; index++) {
      const cells = rows.nth(index).getByRole("cell");
      await expect(cells).toHaveCount(3);
      const cellBoxes = await Promise.all([
        bounds(cells.nth(0)),
        bounds(cells.nth(1)),
        bounds(cells.nth(2)),
      ]);
      for (const box of cellBoxes) {
        expect(Math.abs(box.y - cellBoxes[0].y)).toBeLessThan(1);
        expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      }
    }
    await expect(table.locator('td[headers^="compare-price"]')).toContainText([
      "123,456.78",
      "700.05",
      "123,456.78",
    ]);
    await expect(table.locator('td[headers^="compare-price"]').nth(1)).toContainText("per month");
    await expect(table.locator('td[headers^="compare-price"]').nth(1)).toContainText("Negotiable");
    await expect(table.locator('td[headers^="compare-area"]').nth(0)).toContainText("72.123456789");
    await expect(table.locator('td[headers^="compare-area"]').nth(1)).toContainText("65.987654321");
    for (const number of await table.locator('td[headers^="compare-area"] bdi').all()) {
      const lines = await number.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
        const cell = element.closest("td")?.getBoundingClientRect();
        return {
          rows: new Set(rects.map((rect) => Math.round(rect.top))).size,
          inside: Boolean(
            cell &&
              rects.every((rect) => rect.left >= cell.left - 1 && rect.right <= cell.right + 1),
          ),
        };
      });
      expect(lines.rows).toBe(1);
      expect(lines.inside).toBe(true);
    }
    for (const unit of await table.locator('[data-unit="area"]').all()) {
      const height = await unit.evaluate((element) => ({
        rendered: element.getBoundingClientRect().height,
        line: Number.parseFloat(getComputedStyle(element).lineHeight),
      }));
      expect(height.rendered).toBeLessThanOrEqual(height.line * 1.1);
    }
    await expect(table.locator('td[headers^="compare-lift"]')).toContainText([
      "Unknown",
      "Unknown",
      "Unknown",
    ]);
    for (const item of data.published) {
      await expect(page.getByRole("link", { name: item.title, exact: true })).toBeVisible();
      const photo = column(page, item.reference).locator('img[src*="/api/media/"]');
      await expect(photo).toBeVisible();
      await expect
        .poll(() => photo.evaluate((image) => (image as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
      expect(
        (
          await bounds(
            page.getByRole("link", {
              name: `Remove ${item.reference}`,
              exact: true,
            }),
          )
        ).height,
      ).toBeGreaterThanOrEqual(44);
      const individual = page.getByRole("link", {
        name: `Send an inquiry · ${item.reference}`,
        exact: true,
      });
      await expect(individual).toHaveText("Send an inquiry");
      expect((await bounds(individual)).height).toBeLessThanOrEqual(60);
    }
    expect((await bounds(table.locator("thead"))).height).toBeLessThan(width >= 1024 ? 460 : 220);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    if (width === 320 || width === 1440) {
      const accessibility = await new AxeBuilder({ page }).include("#main").analyze();
      expect(accessibility.violations).toEqual([]);
    }
    await page.screenshot({ path: testInfo.outputPath(`comparison-${width}.png`), fullPage: true });
  });
}

test("P07: URL selection, removal, reload, Back and reopening stay consistent with browser storage", async ({
  page,
}) => {
  await page.goto(href());
  await assertChoice(page, references());
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem("ms-realty.compare.v1") ?? "null")),
    )
    .toEqual(references());
  const remaining = [data.published[0].reference, data.published[2].reference];
  await page
    .getByRole("link", { name: `Remove ${data.published[1].reference}`, exact: true })
    .click();
  expect(new URL(page.url()).searchParams.get("references")).toBe(remaining.join(","));
  await assertChoice(page, remaining);
  await expect(column(page, data.published[1].reference)).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem("ms-realty.compare.v1") ?? "null")),
    )
    .toEqual(remaining);
  await page.reload();
  await assertChoice(page, remaining);
  await page.goBack();
  await assertChoice(page, references());
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem("ms-realty.compare.v1") ?? "null")),
    )
    .toEqual(references());
  await page.goto("/en/compare");
  await page.getByRole("link", { name: "Compare", exact: true }).click();
  await assertChoice(page, references());
});

test("P07: unavailable choice remains visible and blocks collective intent until native removal", async ({
  browser,
  baseURL,
}, testInfo) => {
  const context = await browser.newContext({
    ...testInfo.project.use,
    baseURL,
    javaScriptEnabled: false,
    viewport: { width: 320, height: 844 },
  });
  const page = await context.newPage();
  const refs = [
    data.published[0].reference,
    data.withdrawn.reference,
    data.published[2].reference,
  ] as const;
  await page.goto(href(refs));
  await expect(page.getByRole("table").locator('thead th[id^="compare-MS-"]')).toHaveCount(3);
  await expect(column(page, data.withdrawn.reference)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Discuss this selection with a broker" }),
  ).toHaveCount(0);
  await expect(page.getByText(data.withdrawn.title, { exact: true })).toHaveCount(0);
  await expect(column(page, data.withdrawn.reference).getByRole("img")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({
    path: testInfo.outputPath("comparison-unavailable-native-320.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: `Remove ${data.withdrawn.reference}`, exact: true }).click();
  const remaining = [refs[0], refs[2]];
  expect(new URL(page.url()).searchParams.get("references")).toBe(remaining.join(","));
  await assertChoice(page, remaining);
  await context.close();
});

test("P07: invalid URL choices need explicit native correction before inquiry", async ({
  browser,
  baseURL,
}, testInfo) => {
  const context = await browser.newContext({
    ...testInfo.project.use,
    baseURL,
    javaScriptEnabled: false,
  });
  const page = await context.newPage();
  for (const entries of [
    [...references(), data.withdrawn.reference],
    [data.published[0].reference, "invalid", data.published[1].reference],
    [data.published[0].reference, data.published[0].reference, data.published[1].reference],
  ]) {
    await page.goto(href(entries));
    await expect(page.getByText(/^Review the selection in this address:/)).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Discuss this selection with a broker" }),
    ).toHaveCount(0);
    const remove = entries.length === 4 ? data.withdrawn.reference : entries[1];
    await page
      .getByRole("link", { name: `Remove ${remove}`, exact: true })
      .last()
      .click();
    const remaining = entries.filter((_, index) => index !== (entries.length === 4 ? 3 : 1));
    expect(new URL(page.url()).searchParams.get("references")).toBe(remaining.join(","));
    await assertChoice(page, remaining);
  }
  await context.close();
});

test("P07: native three-property inquiry carries every ordered identity through the receipt", async ({
  browser,
  baseURL,
}, testInfo) => {
  const context = await browser.newContext({
    ...testInfo.project.use,
    baseURL,
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.setExtraHTTPHeaders({ "cf-connecting-ip": `198.51.100.${70 + testInfo.workerIndex}` });
  await page.goto(href());
  await assertChoice(page, references());
  await page
    .getByRole("link", { name: "Discuss this selection with a broker", exact: true })
    .click();
  const expected = data.published.map(({ reference, manifestId }) => ({
    reference,
    observedManifestId: manifestId,
  }));
  await expect(page.locator('[name="selectedListings"]')).toHaveValue(JSON.stringify(expected));
  await expect(page.locator('[name="listingReference"]')).toHaveValue("");
  const marker = `Synthetic collective comparison ${randomUUID()}`;
  await page.getByLabel("Your inquiry", { exact: true }).fill(marker);
  await page.getByLabel("Email", { exact: true }).fill("synthetic-comparison@example.test");
  await page
    .getByRole("checkbox", {
      name: "I understand MS Realty will use these details to respond to this inquiry.",
    })
    .check();
  await page.getByRole("button", { name: "Send an inquiry", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Inquiry received" })).toBeVisible();
  await page.getByRole("link", { name: "Open receipt", exact: true }).click();
  const selection = page.getByRole("list", { name: "Compare", exact: true });
  await expect(selection.getByRole("listitem")).toHaveText(references());
  await page.reload();
  await expect(selection.getByRole("listitem")).toHaveText(references());
  await page.screenshot({
    path: testInfo.outputPath("comparison-native-receipt-390.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Compare", exact: true }).click();
  await assertChoice(page, references());
  await page.screenshot({
    path: testInfo.outputPath("comparison-native-receipt-return.png"),
    fullPage: true,
  });
  const stored = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        brokerReadbackProgram,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          AUTH_SECRET: process.env.E2E_AUTH_SECRET,
          DATABASE_URL: url,
          E2E_COMPARE_MARKER: marker,
        },
      },
    ),
  ) as {
    id: string;
    reference: string;
    token: string;
    context: { selection: { reference: string; manifestId: string }[] };
  };
  expect(
    stored.context.selection.map(({ reference, manifestId }) => ({
      reference,
      observedManifestId: manifestId,
    })),
  ).toEqual(expected);
  const staff = await browser.newContext({
    ...testInfo.project.use,
    javaScriptEnabled: false,
    viewport: { width: 320, height: 844 },
  });
  try {
    await staff.addCookies([
      {
        name: "msr_staff_session",
        value: stored.token,
        url: origins.staff,
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);
    const broker = await staff.newPage();
    await broker.goto(hostUrl("staff", `/en/inquiries/${stored.id}`));
    await expect(
      broker.getByRole("heading", { name: stored.reference, exact: true }),
    ).toBeVisible();
    const selected = broker.getByRole("region", {
      name: "Properties selected at submission",
      exact: true,
    });
    await expect(selected.getByRole("heading", { level: 4 })).toContainText(references());
    await expect(selected.locator("details")).toHaveCount(3);
    for (const detail of await selected.locator("details").all())
      await expect(detail).not.toHaveAttribute("open");
    expect(await broker.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
    await broker.screenshot({
      path: testInfo.outputPath("comparison-broker-native-320.png"),
      fullPage: true,
    });
  } finally {
    await staff.close();
  }
  await context.close();
});

test("P07: native individual inquiry preserves its subject and returns to the original comparison", async ({
  browser,
  baseURL,
}, testInfo) => {
  const context = await browser.newContext({
    ...testInfo.project.use,
    baseURL,
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    await page.setExtraHTTPHeaders({
      "cf-connecting-ip": `198.51.100.${90 + testInfo.workerIndex}`,
    });
    await page.goto(href());
    const subject = data.published[1];
    await page
      .getByRole("link", { name: `Send an inquiry · ${subject.reference}`, exact: true })
      .click();
    await expect(page.locator('[name="listingReference"]')).toHaveValue(subject.reference);
    await expect(page.locator('[name="observedManifestId"]')).toHaveValue(subject.manifestId);
    await expect(page.locator('[name="selectedListings"]')).toHaveValue("");
    await expect(page.locator('[name="comparisonReferences"]')).toHaveValue(references().join(","));
    await page
      .getByLabel("Your inquiry", { exact: true })
      .fill(`Synthetic individual comparison ${randomUUID()}`);
    await page
      .getByLabel("Email", { exact: true })
      .fill("synthetic-individual-comparison@example.test");
    await page
      .getByRole("checkbox", {
        name: "I understand MS Realty will use these details to respond to this inquiry.",
      })
      .check();
    await page.getByRole("button", { name: "Send an inquiry", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Inquiry received" })).toBeVisible();
    await page.getByRole("link", { name: "Open receipt", exact: true }).click();
    await expect(page.getByRole("list", { name: "Compare", exact: true })).toHaveCount(0);
    await expect(page.locator("#main")).toContainText(subject.reference);
    const back = page.getByRole("link", { name: "Compare", exact: true });
    expect(
      new URL((await back.getAttribute("href")) ?? "", page.url()).searchParams.get("references"),
    ).toBe(references().join(","));
    await page.reload();
    await back.click();
    await assertChoice(page, references());
  } finally {
    await context.close();
  }
});

test("P07: malformed or duplicated native selection preserves the command and blocks a generic inquiry", async ({
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
    for (const duplicate of [false, true]) {
      const issued = await context.request.get("/api/inquiries");
      expect(issued.ok()).toBe(true);
      const { submissionKey } = (await issued.json()) as { submissionKey: string };
      const body = new URLSearchParams({
        submissionKey,
        locale: "en",
        purpose: "question",
        selectedListings: duplicate
          ? JSON.stringify(
              data.published.map(({ reference, manifestId }) => ({
                reference,
                observedManifestId: manifestId,
              })),
            )
          : "invalid",
      });
      if (duplicate) body.append("selectedListings", body.get("selectedListings") ?? "");
      const response = await context.request.post("/api/inquiries", {
        headers: { "content-type": "application/x-www-form-urlencoded", origin: origins.public },
        data: body.toString(),
        maxRedirects: 0,
      });
      expect(response.status()).toBe(303);
      const location = response.headers().location;
      if (!location) throw new Error("Native context rejection needs a recovery destination");
      const recovery = new URL(location);
      expect(recovery.pathname).toBe("/en/inquire");
      expect(recovery.searchParams.get("submission")).toBe(submissionKey);
      expect(recovery.searchParams.get("context")).toBe("invalid");
      await page.goto(location);
      await expect(page.getByRole("button", { name: "Send an inquiry", exact: true })).toHaveCount(
        0,
      );
      await expect(page.locator('[name="submissionKey"]')).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Compare", exact: true })).toBeVisible();
    }
  } finally {
    await context.close();
  }
});

test("P07: Hebrew comparison keeps the ordered selection and aligned facts at narrow widths", async ({
  page,
}, testInfo) => {
  await page.goto(href(references(), "he"));
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const table = page.getByRole("table");
  await expect(table.locator('thead th[id^="compare-MS-"]')).toHaveCount(3);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const boxes = await Promise.all(
      references().map((reference) => bounds(column(page, reference))),
    );
    const [firstBox, secondBox, thirdBox] = boxes;
    if (!firstBox || !secondBox || !thirdBox) throw new Error("Expected all three RTL columns");
    for (const box of boxes) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      expect(Math.abs(box.y - firstBox.y)).toBeLessThan(1);
    }
    expect(firstBox.x).toBeGreaterThan(secondBox.x);
    expect(secondBox.x).toBeGreaterThan(thirdBox.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    const collective = page.getByRole("link", { name: "דברו על הבחירה עם מתווך", exact: true });
    const inquiryHref = await collective.getAttribute("href");
    if (!inquiryHref) throw new Error("RTL comparison needs its complete inquiry link");
    const selected = JSON.parse(
      new URL(inquiryHref, page.url()).searchParams.get("selection") ?? "null",
    ) as { reference: string; observedManifestId: string }[];
    expect(selected.map((item) => item.reference)).toEqual(references());
    for (const [index, item] of selected.entries()) {
      expect(item.observedManifestId).toMatch(/^[0-9a-f-]{36}$/);
      expect(item.observedManifestId).not.toBe(data.published[index]?.manifestId);
    }
    await page.screenshot({
      path: testInfo.outputPath(`comparison-he-${width}.png`),
      fullPage: true,
    });
  }
});
