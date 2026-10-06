// P08/P09, F04 and AT09: a public-facts link is created from saved properties under this
// browser's creator cookie, read by someone else with no authority beyond the public facts,
// managed and revoked only by its creator, and always rechecked on the recipient's request.
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";

type Listing = { reference: string; title: string };
type Link = { url: string; id: string; token: string };

const programFlags = ["--conditions=react-server", "--import", "tsx", "--input-type=module"];
const prelude = `
import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql as statement } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./src/db/schema/index.ts";
import { createListingFixture, insertPlace, publishForTest } from "./src/server/publication/testing.ts";
import { withdrawPublication } from "./src/server/publication/commands.ts";
import { createStaff } from "./src/server/testing.ts";
const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname)) throw new Error("Disposable shared-shortlist database required");
const input = JSON.parse(process.env.E2E_INPUT ?? "null");
const sql = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(sql, { schema });
const staffFor = () => createStaff(db, { roles: ["content_editor", "publishing_approver"], email: "synthetic-share-" + randomUUID() + "@example.test" });
`;
const seedProgram = `${prelude}
try {
  const staff = await staffFor();
  const suffix = randomUUID().slice(0, 8);
  const placeId = await insertPlace(db, { country: "BG", level: "settlement", parentId: null, nameNative: "Синтетично място " + suffix, nameLatin: "Synthetic shared place " + suffix });
  const listings = [];
  for (let index = 1; index <= input.count; index += 1) {
    const title = "Synthetic shared property " + index + " " + suffix;
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
    listings.push({ reference: fixture.reference, title });
  }
  console.log(JSON.stringify(listings));
} finally { await sql.end(); }
`;
const withdrawProgram = `${prelude}
try {
  const staff = await staffFor();
  for (const reference of input.references) {
    const [row] = await db.select().from(schema.listings).where(eq(schema.listings.reference, reference));
    await withdrawPublication(db, { actor: staff.actor, operationId: randomUUID(), expectedRevision: row.publicationGeneration, reference, reason: "Synthetic P09 unavailable check" });
  }
} finally { await sql.end(); }
`;
const expireProgram = `${prelude}
try {
  await db.update(schema.publicShares).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(schema.publicShares.id, input.id));
} finally { await sql.end(); }
`;

function run(program: string, input: unknown): string {
  return execFileSync(process.execPath, [...programFlags, "--eval", program], {
    encoding: "utf8",
    env: {
      ...process.env,
      AUTH_SECRET: process.env.E2E_AUTH_SECRET,
      DATABASE_URL: process.env.E2E_DATABASE_URL,
      E2E_INPUT: JSON.stringify(input),
    },
  }).trim();
}
const seed = (count: number): Listing[] => JSON.parse(run(seedProgram, { count }));
const withdraw = (...references: string[]) => run(withdrawProgram, { references });
const expire = (id: string) => run(expireProgram, { id });

let listings: Listing[];
test.beforeAll(() => {
  listings = seed(3);
});

/** Local runs have no edge: a distinct forwarded address keeps each test in its own bucket. */
async function ownAddress(page: Page) {
  const host = 1 + Math.floor(Math.random() * 254);
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${host}` });
}

const savedKey = "ms-realty.saved.v1";
const sharePanel = (page: Page) => page.getByRole("region", { name: "Share only the public part" });
const cards = (page: Page) => page.locator("article[data-share-state]");
const sharedLinks = (page: Page) => page.getByRole("region", { name: "Shared links" });

async function save(page: Page, items: Listing[]) {
  await page.goto("/en/saved");
  await page.evaluate(({ refs, key }) => localStorage.setItem(key, JSON.stringify(refs)), {
    refs: items.map((item) => item.reference),
    key: savedKey,
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: items.at(-1)?.title, exact: true })).toBeVisible();
}

/** The cookie entry is an ordinary GET link, followed before the share form exists. */
async function enableSharing(page: Page, last: Listing) {
  await sharePanel(page).getByRole("link", { name: "Continue to sharing" }).click();
  await expect(page).toHaveURL(/\/en\/saved$/);
  await expect(page.getByRole("heading", { name: last.title, exact: true })).toBeVisible();
  await expect(
    sharePanel(page).getByRole("button", { name: "Create a link for these listings" }),
  ).toBeVisible();
}

async function createLink(page: Page, options: { without?: Listing[] } = {}): Promise<Link> {
  const before = await cards(page).count();
  const panel = sharePanel(page);
  for (const item of options.without ?? [])
    await panel.getByRole("checkbox", { name: `Include in the link ${item.reference}` }).uncheck();
  await panel.getByRole("checkbox", { name: "I have reviewed these public facts." }).check();
  await panel.getByRole("button", { name: "Create a link for these listings" }).click();
  await expect(panel.getByText("The public link was created")).toBeVisible();
  await expect(panel.getByRole("link", { name: "Go to the link" })).toHaveAttribute(
    "href",
    /^#share-[0-9a-f-]{36}$/,
  );
  await expect(cards(page)).toHaveCount(before + 1);
  const card = cards(page).first();
  const url = (await card.locator("code").innerText()).trim();
  const id = (await card.getAttribute("id"))?.replace(/^share-/, "") ?? "";
  const token = url.split("/").at(-1) ?? "";
  expect(url).toMatch(/^http:\/\/localhost:\d+\/en\/share\/[A-Za-z0-9_-]{43}$/);
  return { url, id, token };
}

/**
 * Hydration mismatches and runtime errors only show in the console: fail the journey on them.
 * Only two tool-induced WebKit messages are ignored: axe's temporary contrast `<style>` probes
 * (reported against the nonce CSP) and Next's `_rsc` prefetch of header links, which WebKit
 * rejects for a page carrying this file's extra `x-forwarded-for` header once a wide viewport
 * shows the desktop navigation. Every other console error, CSP report and React message stays
 * fatal.
 */
const toolNoise = [
  /^Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline'/,
  /[?&]_rsc=[\w-]+ due to access control checks\.?$/,
];
function watch(page: Page, problems: string[]) {
  const record = (text: string) => {
    if (!toolNoise.some((pattern) => pattern.test(text))) problems.push(text);
  };
  page.on("pageerror", (error) => record(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") record(message.text());
  });
}

async function recipient(
  browser: Browser,
  baseURL: string | undefined,
  use: object,
  options: { js?: boolean; problems?: string[] } = {},
) {
  const context = await browser.newContext({
    ...use,
    baseURL,
    javaScriptEnabled: options.js ?? true,
  });
  const page = await context.newPage();
  if (options.problems) watch(page, options.problems);
  return { context, page };
}
async function noOverflow(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
}
const cookieNames = async (context: BrowserContext) =>
  (await context.cookies()).map((cookie) => cookie.name);

test("P08/P09: a creator reviews and creates a link, a recipient sees public facts only, and only the creator can manage and revoke it", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const [first, second, third] = listings as [Listing, Listing, Listing];
  const problems: string[] = [];
  watch(page, problems);
  await ownAddress(page);
  await save(page, [first, second, third]);

  // The creator cookie comes first: the entry is a plain link, and no form exists before it.
  await expect(sharePanel(page).getByText("one small cookie")).toBeVisible();
  await expect(sharePanel(page).getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Share selected" })).toHaveAttribute(
    "href",
    "#share",
  );
  expect(await cookieNames(page.context())).not.toContain("msr_share_creator");
  await enableSharing(page, third);
  const issued = (await page.context().cookies()).find(
    (cookie) => cookie.name === "msr_share_creator",
  );
  expect(issued).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
  expect(issued?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);

  // Review: exactly which public facts go in, then leave the third property out.
  const panel = sharePanel(page);
  for (const item of [first, second, third])
    await expect(panel.locator(`li[data-listing-reference="${item.reference}"]`)).toContainText(
      item.title,
    );
  await expect(panel.getByText("Included in the link:")).toContainText("3 / 12");
  await expect(panel.getByText("The link works for 7 days after you create it.")).toBeVisible();
  const price = (
    await page
      .locator(`article[data-listing-reference="${first.reference}"] .text-price`)
      .innerText()
  ).trim();
  await panel.getByRole("checkbox", { name: `Include in the link ${third.reference}` }).uncheck();
  await panel.getByRole("button", { name: "Create a link for these listings" }).click();
  // The review confirmation is required: nothing was created.
  await expect(panel.getByText("Confirm that you have reviewed the public facts.")).toBeVisible();
  await expect(cards(page)).toHaveCount(0);
  for (const width of [320, 390, 1440]) {
    await noOverflow(page, width);
    await page.screenshot({
      path: testInfo.outputPath(`saved-share-review-${width}.png`),
      fullPage: true,
    });
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const link = await createLink(page, { without: [third] });

  // Creator management: Public link, identities, actual expiry, Copy link and Revoke this link.
  const card = cards(page).first();
  await expect(card).toHaveAttribute("data-share-state", "active");
  await expect(card.getByRole("heading", { name: "Public link" })).toBeVisible();
  await expect(card.getByRole("link", { name: first.reference })).toBeVisible();
  await expect(card.getByRole("link", { name: second.reference })).toBeVisible();
  await expect(card.getByRole("link", { name: third.reference })).toHaveCount(0);
  const created = await card.locator("dt:text-is('Created') + dd time").getAttribute("datetime");
  const expires = card.locator("dt:text-is('Expires') + dd time");
  expect(
    Date.parse((await expires.getAttribute("datetime")) ?? "") - Date.parse(created ?? ""),
  ).toBe(7 * 24 * 60 * 60 * 1000);
  await expect(expires).toHaveText(/20\d\d.*(EES?T|GMT\+\d)/);
  await expect(card.getByRole("button", { name: "Copy link" })).toBeVisible();
  await card.getByRole("button", { name: "Copy link" }).click();
  await expect(card.getByRole("status")).toHaveText(/Link copied|Copying is not available here\./);
  await expect(card.locator("summary")).toHaveText("Revoke this link");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("saved-share-manage.png"), fullPage: true });

  // Recipient: another browser, no cookies, only the current public facts.
  const other = await recipient(browser, baseURL, testInfo.project.use, { problems });
  const requested: string[] = [];
  other.page.on("request", (request) => requested.push(new URL(request.url()).origin));
  const response = await other.page.goto(link.url);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(other.page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex, nofollow/,
  );
  await expect(
    other.page.getByRole("heading", { level: 1, name: "Shared list of properties" }),
  ).toBeVisible();
  await expect(other.page.getByText("Only public listings are included here.")).toBeVisible();
  await expect(other.page.locator("article[data-listing-reference]")).toHaveCount(2);
  for (const item of [first, second])
    await expect(
      other.page.locator(`article[data-listing-reference="${item.reference}"]`),
    ).toContainText(item.title);
  await expect(
    other.page.locator(`article[data-listing-reference="${first.reference}"] .text-price`),
  ).toHaveText(price);
  expect(await other.page.content()).not.toContain(third.reference);
  await expect(other.page.getByText("This link works until:")).toBeVisible();
  // No management, no creator, no private data, and nothing is set for the recipient.
  for (const name of [/Revoke/, /Copy link/])
    await expect(other.page.getByRole("button", { name })).toHaveCount(0);
  await expect(other.page.getByText("Shared links")).toHaveCount(0);
  expect(await cookieNames(other.context)).not.toContain("msr_share_creator");
  expect(await other.page.content()).not.toContain(issued?.value ?? "__no_creator_cookie__");
  expect(new Set(requested.filter((origin) => origin !== "null"))).toEqual(
    new Set([new URL(link.url).origin]),
  );
  // Open, compare and contact stay available.
  await expect(other.page.getByRole("link", { name: "Compare these properties" })).toHaveAttribute(
    "href",
    `/en/compare?references=${first.reference},${second.reference}`,
  );
  await expect(other.page.getByRole("link", { name: "Send an inquiry" }).first()).toBeVisible();
  for (const width of [320, 390, 1440]) {
    await noOverflow(other.page, width);
    await other.page.screenshot({
      path: testInfo.outputPath(`share-recipient-${width}.png`),
      fullPage: true,
    });
  }
  expect((await new AxeBuilder({ page: other.page }).analyze()).violations).toEqual([]);

  // The viewing token cannot manage the link, even from a browser holding its own cookie.
  await other.page.goto("/en/saved");
  await expect(cards(other.page)).toHaveCount(0);
  await other.page.goto("/api/public-shares/creator-session?locale=en");
  await expect(other.page).toHaveURL(/\/en\/saved$/);
  await expect(cards(other.page)).toHaveCount(0);
  await other.page.goto(link.url);
  await expect(other.page.locator("article[data-listing-reference]")).toHaveCount(2);

  // Revoke: explained first, then acknowledged with its time; actions are replaced.
  await card.locator("summary").click();
  await expect(
    card.getByText("Public information that someone has already copied cannot be"),
  ).toBeVisible();
  await card.getByRole("button", { name: "Revoke the link now" }).click();
  await expect(card.getByText("The link is revoked. Future access has stopped.")).toBeVisible();
  await expect(card).toHaveAttribute("data-share-state", "revoked");
  await expect(card.getByRole("button")).toHaveCount(0);
  await expect(card.locator("dt:text-is('Revoked') + dd time")).toBeVisible();
  await expect(card.getByText(link.token)).toHaveCount(0);
  // Current revocation is read on the recipient's very next request.
  await other.page.reload();
  await expect(
    other.page.getByRole("heading", {
      level: 1,
      name: "Access through this link has been stopped",
    }),
  ).toBeVisible();
  await expect(other.page.locator("article")).toHaveCount(0);
  expect(await other.page.content()).not.toContain(first.title);
  await other.page.screenshot({
    path: testInfo.outputPath("share-recipient-revoked.png"),
    fullPage: true,
  });
  // And it stays revoked for the creator after a reload.
  await page.reload();
  await expect(cards(page).first()).toHaveAttribute("data-share-state", "revoked");
  await other.context.close();
  expect(problems).toEqual([]);
});

test("P09: a closed shared property keeps only its reference, and a list with none left says why and offers Bulgarian", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const pair = seed(2) as [Listing, Listing];
  await ownAddress(page);
  await save(page, pair);
  await enableSharing(page, pair[1]);
  const link = await createLink(page);
  const other = await recipient(browser, baseURL, testInfo.project.use);

  await other.page.goto(link.url);
  await expect(other.page.locator("article[data-listing-reference]")).toHaveCount(2);

  withdraw(pair[0].reference);
  await other.page.reload();
  const placeholder = other.page.locator(
    `article[data-listing-reference="${pair[0].reference}"][data-unavailable]`,
  );
  await expect(placeholder).toContainText("This property is no longer available in this list.");
  await expect(placeholder).not.toContainText(pair[0].title);
  await expect(placeholder.locator("a, button, img")).toHaveCount(0);
  await expect(other.page.getByText("Properties shown:")).toContainText("1 / 2");
  // An item may only lack an approved version here: the source language is offered.
  await expect(
    other.page.getByRole("link", { name: "Open this list in Bulgarian" }),
  ).toHaveAttribute("href", `/bg/share/${link.token}`);
  await expect(
    other.page.locator(`article[data-listing-reference="${pair[1].reference}"]`),
  ).toContainText(pair[1].title);
  await expect(other.page.getByRole("link", { name: "Compare these properties" })).toHaveCount(0);
  await other.page.screenshot({
    path: testInfo.outputPath("share-recipient-some-unavailable.png"),
    fullPage: true,
  });

  withdraw(pair[1].reference);
  await other.page.reload();
  await expect(
    other.page.getByText("None of these properties can be shown right now"),
  ).toBeVisible();
  expect(await other.page.content()).not.toContain(pair[1].title);
  await other.page.getByRole("link", { name: "Open this list in Bulgarian" }).click();
  await expect(other.page).toHaveURL(new RegExp(`/bg/share/${link.token}$`));
  await expect(
    other.page.getByRole("heading", { level: 1, name: "Споделен списък с имоти" }),
  ).toBeVisible();
  await expect(other.page.getByRole("link", { name: "Отворете списъка на български" })).toHaveCount(
    0,
  );
  await other.context.close();
});

test("P09: an expired link says so, shows no facts and gives its creator no actions", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const [item] = seed(1) as [Listing];
  await ownAddress(page);
  await save(page, [item]);
  await enableSharing(page, item);
  const link = await createLink(page);
  expire(link.id);

  const other = await recipient(browser, baseURL, testInfo.project.use);
  await other.page.goto(link.url);
  await expect(
    other.page.getByRole("heading", { level: 1, name: "This link has expired" }),
  ).toBeVisible();
  await expect(other.page.locator('[data-share-status="expired"]')).toBeVisible();
  expect(await other.page.content()).not.toContain(item.title);
  await expect(other.page.getByRole("link", { name: "Search properties" })).toHaveAttribute(
    "href",
    "/en/properties",
  );
  await other.page.screenshot({
    path: testInfo.outputPath("share-recipient-expired.png"),
    fullPage: true,
  });

  await page.reload();
  const card = cards(page).first();
  await expect(card).toHaveAttribute("data-share-state", "expired");
  await expect(card.getByRole("button")).toHaveCount(0);
  await expect(card.getByText("To share these properties again, create a new link.")).toBeVisible();
  await other.context.close();
});

test("P08/P09: no link is created without the creator cookie, and a lost session is explained without inventing recovery", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const [item] = listings as [Listing, ...Listing[]];
  await ownAddress(page);
  await save(page, [item]);
  await enableSharing(page, item);
  const panel = sharePanel(page);

  // Cookie gone before creation: refused, with the way back to the entry, nothing stored.
  await page.context().clearCookies();
  await panel.getByRole("checkbox", { name: "I have reviewed these public facts." }).check();
  await panel.getByRole("button", { name: "Create a link for these listings" }).click();
  await expect(panel.getByText("This browser is not set up for managing links yet.")).toBeVisible();
  await expect(panel.getByRole("link", { name: "Continue to sharing" })).toBeVisible();
  await expect(cards(page)).toHaveCount(0);
  await enableSharing(page, item);
  await expect(cards(page)).toHaveCount(0);

  // A link created, then the session lost: it cannot be managed, and a new link does not end it.
  const link = await createLink(page);
  await page.context().clearCookies();
  await page.reload();
  await expect(cards(page)).toHaveCount(0);
  await expect(
    sharedLinks(page).getByText("You have not created a shared link in this browser yet."),
  ).toBeVisible();
  await sharedLinks(page).getByText("Cannot find a link you shared?").click();
  await expect(
    sharedLinks(page).getByText("the link itself cannot restore that", { exact: false }),
  ).toBeVisible();
  await expect(sharedLinks(page).getByRole("link", { name: "Send an inquiry" })).toHaveAttribute(
    "href",
    "/en/inquire?purpose=question",
  );
  await page.screenshot({ path: testInfo.outputPath("saved-share-lost.png"), fullPage: true });
  await enableSharing(page, item);
  await createLink(page);

  const other = await recipient(browser, baseURL, testInfo.project.use);
  await other.page.goto(link.url);
  await expect(other.page.locator("article[data-listing-reference]")).toHaveCount(1);
  await other.context.close();
});

test("P09: JavaScript-off recipient reads the list, a creator enters and revokes with native forms", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const [item] = listings as [Listing, ...Listing[]];
  await ownAddress(page);
  await save(page, [item]);
  await enableSharing(page, item);
  const link = await createLink(page);

  const plain = await recipient(browser, baseURL, testInfo.project.use, { js: false });
  await plain.page.goto(link.url);
  await expect(
    plain.page.getByRole("heading", { level: 1, name: "Shared list of properties" }),
  ).toBeVisible();
  await expect(
    plain.page.locator(`article[data-listing-reference="${item.reference}"]`),
  ).toContainText(item.title);
  await expect(plain.page.getByText("This link works until:")).toBeVisible();

  // A fresh browser with scripts off still reaches the creator entry and returns to P08.
  const entry = await recipient(browser, baseURL, testInfo.project.use, { js: false });
  await entry.page.goto("/api/public-shares/creator-session?locale=en");
  await expect(entry.page).toHaveURL(/\/en\/saved$/);
  expect(await cookieNames(entry.context)).toContain("msr_share_creator");
  await expect(
    entry.page.getByText("Saving in the browser needs JavaScript.", { exact: false }),
  ).toBeVisible();
  await expect(
    sharedLinks(entry.page).getByText("You have not created a shared link"),
  ).toBeVisible();
  await entry.context.close();

  // The creator's own cookie, scripts off: the card is listed and revoked by a native post.
  const state = await page.context().storageState();
  const creator = await browser.newContext({
    ...testInfo.project.use,
    baseURL,
    javaScriptEnabled: false,
    storageState: state,
  });
  const offline = await creator.newPage();
  await offline.goto("/en/saved");
  const card = cards(offline).first();
  await expect(card).toHaveAttribute("data-share-state", "active");
  await expect(card.getByText(link.url)).toBeVisible();
  await card.locator("summary").click();
  await card.getByRole("button", { name: "Revoke the link now" }).click();
  await expect(cards(offline).first()).toHaveAttribute("data-share-state", "revoked");
  await expect(cards(offline).first().locator("dt:text-is('Revoked') + dd time")).toBeVisible();

  await plain.page.reload();
  await expect(
    plain.page.getByRole("heading", {
      level: 1,
      name: "Access through this link has been stopped",
    }),
  ).toBeVisible();
  await plain.context.close();
  await creator.close();
});

test("P09: the Hebrew recipient view is right-to-left and fits 320 px", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const [item] = listings as [Listing, ...Listing[]];
  const problems: string[] = [];
  await ownAddress(page);
  await save(page, [item]);
  await enableSharing(page, item);
  const link = await createLink(page);

  const other = await recipient(browser, baseURL, testInfo.project.use, { problems });
  await other.page.goto(link.url.replace("/en/share/", "/he/share/"));
  await expect(other.page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(other.page.locator("html")).toHaveAttribute("lang", "he");
  await expect(
    other.page.getByRole("heading", { level: 1, name: "רשימת נכסים משותפת" }),
  ).toBeVisible();
  await expect(
    other.page.locator(`article[data-listing-reference="${item.reference}"]`),
  ).toBeVisible();
  for (const width of [320, 1440]) {
    await noOverflow(other.page, width);
    await other.page.screenshot({
      path: testInfo.outputPath(`share-recipient-he-${width}.png`),
      fullPage: true,
    });
  }
  expect((await new AxeBuilder({ page: other.page }).analyze()).violations).toEqual([]);
  await other.context.close();
  expect(problems).toEqual([]);
});
