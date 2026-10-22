// O04 / F20 / L16: real authorized scopes, private filters and paging in each browser profile,
// with JavaScript on/off. Synthetic viewers have only record grants for their own fixtures.
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { caseCopy } from "../src/features/cases/copy";
import { directoryCopy } from "../src/features/cases/directory-copy";
import { hostUrl, origins } from "./hosts";

type Case = { id: string; reference: string; title: string };
type Seed = {
  token: string;
  ownerName: string;
  formerName: string;
  viewer: { id: string; token: string };
  bulk: string;
  empty: string;
  oldest: string;
  cases: Record<"buyer" | "tenant" | "paused" | "closed" | "covered" | "long", Case>;
};
const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Case index browser tests require the generated disposable database.");
const connection = postgres(url, { max: 2 });
const db = drizzle(connection, { schema });
test.afterAll(async () => {
  await connection.end();
});

function seed(): Seed {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "e2e/support/case-index-seed.ts"],
      {
        encoding: "utf8",
        env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
      },
    ).trim(),
  );
}
async function open(page: Page, session: string, path: string) {
  await page.context().addCookies([
    {
      name: "msr_staff_session",
      value: session,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto(hostUrl("staff", path));
}
const rows = (page: Page, list = "Deal list") =>
  page.getByRole("table", { name: list }).locator("tbody").getByRole("row");
const caseRow = (page: Page, record: Case, list = "Deal list") =>
  rows(page, list).filter({ hasText: record.reference });
async function fitsWidth(page: Page) {
  const { scroll, width } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(width);
}
async function search(page: Page, term: string) {
  await page.getByLabel("Search", { exact: true }).fill(term);
  await page.getByRole("button", { name: "Show", exact: true }).click();
}
async function privateUrl(page: Page) {
  await expect(page).toHaveURL((target) =>
    /^[a-f0-9-]{36}$/u.test(target.searchParams.get("filter") ?? ""),
  );
  const target = new URL(page.url());
  for (const field of ["q", "purpose", "party", "nextAction"])
    expect(target.searchParams.has(field)).toBe(false);
  return target;
}

for (const javaScriptEnabled of [false, true])
  test.describe(`JavaScript ${javaScriptEnabled ? "on" : "off"}`, () => {
    test.use({ javaScriptEnabled });

    test("O04 lists safe case context, applies a private search and denies a withdrawn drill-down", async ({
      page,
    }, info) => {
      test.slow();
      const f = seed();
      const { buyer, tenant, paused, closed, covered, long } = f.cases;
      await open(page, f.viewer.token, "/en/cases");
      await expect(page.getByRole("heading", { level: 1, name: "Deals" })).toBeVisible();
      await expect(rows(page)).toHaveCount(6);
      await expect(page.getByText("Deals: 6", { exact: true })).toBeVisible();
      const buyerRow = caseRow(page, buyer);
      await expect(buyerRow.getByRole("link", { name: buyer.title, exact: true })).toHaveAttribute(
        "href",
        `/en/cases/${buyer.id}`,
      );
      for (const value of [
        buyer.reference,
        "Buying",
        "Agreeing requirements",
        "Active",
        `Accountable broker: ${f.ownerName}`,
        "Synthetic step",
        "Next action needs a due date",
      ])
        await expect(buyerRow).toContainText(value);
      await expect(caseRow(page, tenant)).toContainText("Renting");
      await expect(caseRow(page, tenant)).toContainText("Selecting properties");
      await expect(caseRow(page, paused)).toContainText("Preparing the listing");
      await expect(caseRow(page, paused)).toContainText("Paused");
      await expect(caseRow(page, paused)).toContainText("Synthetic owner documents");
      await expect(caseRow(page, closed)).toContainText("On the market");
      await expect(caseRow(page, closed)).toContainText("Closed");
      await expect(caseRow(page, closed)).toContainText("No active action");
      await expect(caseRow(page, covered)).toContainText(
        `Work without an owner · Last accepted owner: ${f.formerName}`,
      );
      await fitsWidth(page);
      await page.screenshot({ path: info.outputPath("o04-cases.png"), fullPage: true });
      const projectViewport = page.viewportSize();
      await page.setViewportSize({ width: 320, height: 844 });
      await expect(caseRow(page, long)).toBeVisible();
      await fitsWidth(page);
      await page.screenshot({ path: info.outputPath("o04-cases-320.png"), fullPage: true });
      if (projectViewport) await page.setViewportSize(projectViewport);

      await search(page, buyer.reference);
      await privateUrl(page);
      await expect(page.getByLabel("Search", { exact: true })).toHaveValue(buyer.reference);
      await expect(rows(page)).toHaveCount(1);
      await expect(page.getByText("Deals: 1", { exact: true })).toBeVisible();
      if (javaScriptEnabled) {
        await expect(page).toHaveTitle("MS Realty workspace");
        expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
      }
      await search(page, `${f.token}-none`);
      await expect(
        page.getByRole("heading", { level: 2, name: directoryCopy("en").noMatch }),
      ).toBeVisible();
      await expect(rows(page)).toHaveCount(0);
      await page.getByRole("link", { name: "Clear filters", exact: true }).first().click();
      await expect(page).toHaveURL(hostUrl("staff", "/en/cases"));
      await expect(rows(page)).toHaveCount(6);

      await caseRow(page, buyer).getByRole("link", { name: buyer.title, exact: true }).click();
      await expect(page).toHaveURL(hostUrl("staff", `/en/cases/${buyer.id}`));
      // O05's current title-first hierarchy keeps its identity in a separate reference line.
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(buyer.title);
      await expect(page.getByText(buyer.reference, { exact: true })).toBeVisible();
      await page.goto(hostUrl("staff", "/en/cases"));
      await db
        .update(schema.grants)
        .set({ revokedAt: new Date() })
        .where(
          and(eq(schema.grants.principalId, f.viewer.id), eq(schema.grants.recordId, tenant.id)),
        );
      const denied = page.waitForResponse((response) =>
        response.url().endsWith(`/en/cases/${tenant.id}`),
      );
      await caseRow(page, tenant).getByRole("link", { name: tenant.title, exact: true }).click();
      expect((await denied).status()).toBe(404);
      await expect(page.getByText(tenant.title)).toHaveCount(0);
      if (javaScriptEnabled)
        await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
      await page.goto(hostUrl("staff", "/en/cases"));
      await expect(rows(page)).toHaveCount(5);
      await expect(page.getByText(tenant.reference)).toHaveCount(0);
    });

    test("O04 applies all supported filters privately and keeps Mine and Needs action scoped", async ({
      page,
    }) => {
      test.slow();
      const f = seed(),
        buyer = f.cases.buyer;
      const partyName = `Synthetic party ${f.token}`;
      const [party] = await db
        .insert(schema.parties)
        .values({ kind: "person", displayName: partyName })
        .returning({ id: schema.parties.id });
      if (!party) throw new Error("Missing synthetic Party");
      await db
        .insert(schema.caseParticipants)
        .values({ caseId: buyer.id, partyId: party.id, role: "buyer" });
      await db
        .update(schema.cases)
        .set({ ownerId: f.viewer.id })
        .where(eq(schema.cases.id, buyer.id));
      await open(page, f.viewer.token, "/en/cases");
      await page.getByRole("link", { name: "Mine", exact: true }).click();
      await expect(rows(page)).toHaveCount(1);
      await expect(caseRow(page, buyer)).toBeVisible();
      await page.getByRole("link", { name: "Needs action", exact: true }).click();
      await expect(rows(page)).toHaveCount(4);
      await expect(page.getByText("Deals: 4", { exact: true })).toBeVisible();
      await page.getByText("Filters", { exact: true }).click();
      await page.getByLabel("Purpose", { exact: true }).fill(buyer.title);
      await page.getByLabel("Party", { exact: true }).fill(partyName);
      await page.getByLabel("Type", { exact: true }).selectOption("buyer");
      await page.getByLabel("Stage", { exact: true }).selectOption("needs_agreed");
      await page.getByLabel("Disposition", { exact: true }).selectOption("active");
      await page.getByLabel("Accountable broker", { exact: true }).selectOption("me");
      await page.getByLabel("Next action", { exact: true }).fill("Synthetic step");
      await page.getByLabel("Next action status", { exact: true }).selectOption("unscheduled");
      await page.getByLabel("Deals per page", { exact: true }).selectOption("10");
      await page.getByRole("button", { name: "Show", exact: true }).click();
      const target = await privateUrl(page);
      expect(target.href).not.toContain(f.token);
      expect(target.searchParams.get("view")).toBe("needs");
      await expect(rows(page)).toHaveCount(1);
      await expect(caseRow(page, buyer)).toContainText(partyName);
      await expect(page.getByText("Deals: 1", { exact: true })).toBeVisible();
      const retainedUrl = page.url();
      await page.getByRole("link", { name: "Mine", exact: true }).click();
      await expect(rows(page)).toHaveCount(1);
      await expect(page.getByLabel("Party", { exact: true })).toHaveValue(partyName);
      await page.getByLabel("Next action status", { exact: true }).selectOption("waiting");
      await page.getByRole("button", { name: "Show", exact: true }).click();
      await expect(page.getByRole("heading", { name: directoryCopy("en").noMatch })).toBeVisible();
      await expect(page.getByText("Deals: 0", { exact: true })).toBeVisible();
      await page.getByRole("link", { name: "Clear filters", exact: true }).first().click();
      await expect(page).toHaveURL(hostUrl("staff", "/en/cases?view=mine&size=10"));
      await expect(rows(page)).toHaveCount(1);
      // A copied private context grants no search or record access to another staff session.
      await open(page, f.empty, new URL(retainedUrl).pathname + new URL(retainedUrl).search);
      await expect(
        page.getByRole("heading", { name: directoryCopy("en").privateUnavailable }),
      ).toBeVisible();
      await expect(rows(page)).toHaveCount(0);
      await expect(page.getByText(partyName, { exact: true })).toHaveCount(0);
    });

    test("O04 pages all authorized matches beyond fifty and recovers an invalid page link", async ({
      page,
    }) => {
      test.slow();
      const f = seed();
      await open(page, f.bulk, "/en/cases");
      const seen = new Set<string>();
      for (const count of [25, 25, 1]) {
        await expect(rows(page)).toHaveCount(count);
        await expect(page.getByText("Deals: 51", { exact: true })).toBeVisible();
        for (const reference of await rows(page).locator("th p").allTextContents()) {
          expect(seen.has(reference)).toBe(false);
          seen.add(reference);
        }
        if (count !== 1) await page.getByRole("link", { name: "Next page", exact: true }).click();
      }
      expect(seen.size).toBe(51);
      await expect(rows(page)).toContainText(f.oldest);
      await expect(page.getByRole("link", { name: "Next page", exact: true })).toHaveCount(0);
      await page.getByRole("link", { name: "Back to the first page", exact: true }).click();
      await expect(rows(page)).toHaveCount(25);
      await search(page, f.oldest);
      await privateUrl(page);
      await expect(rows(page)).toHaveCount(1);
      await expect(rows(page)).toContainText(f.oldest);
      const invalid = new URL(page.url());
      invalid.searchParams.set("cursor", "invalidcursor");
      await page.goto(invalid.toString());
      await expect(
        page.getByRole("heading", { name: directoryCopy("en").invalidPage }),
      ).toBeVisible();
      await expect(page.getByText(/^Deals: /)).toHaveCount(0);
      await page.getByRole("link", { name: "Back to the first page", exact: true }).click();
      await expect(rows(page)).toHaveCount(1);
      await expect(rows(page)).toContainText(f.oldest);
    });
  });

test("O04 never searches restricted next actions or revoked Party relationships", async ({
  page,
}) => {
  const f = seed(),
    tenant = f.cases.tenant;
  const secret = `Synthetic restricted step ${f.token}`,
    revokedParty = `Synthetic revoked party ${f.token}`;
  await db.update(schema.cases).set({ nextAction: secret }).where(eq(schema.cases.id, tenant.id));
  await db
    .update(schema.grants)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.grants.principalId, f.viewer.id), eq(schema.grants.recordId, tenant.id)));
  await db.insert(schema.grants).values({
    principalId: f.viewer.id,
    capability: "case.read",
    recordType: "case",
    recordId: tenant.id,
    reason: "O04 basic read fixture",
  });
  const [party] = await db
    .insert(schema.parties)
    .values({ kind: "person", displayName: revokedParty })
    .returning({ id: schema.parties.id });
  if (!party) throw new Error("Missing synthetic Party");
  await db
    .insert(schema.caseParticipants)
    .values({ caseId: tenant.id, partyId: party.id, role: "tenant", revokedAt: new Date() });
  await open(page, f.viewer.token, "/en/cases");
  await expect(rows(page)).toHaveCount(6);
  await expect(caseRow(page, tenant)).toContainText("Internal action unavailable");
  await expect(page.getByText(secret, { exact: true })).toHaveCount(0);
  await expect(page.getByText(revokedParty, { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Needs action", exact: true }).click();
  await expect(rows(page)).toHaveCount(3);
  await expect(caseRow(page, tenant)).toHaveCount(0);
  await page.getByRole("link", { name: "All", exact: true }).click();
  await search(page, secret);
  await expect(page.getByRole("heading", { name: directoryCopy("en").noMatch })).toBeVisible();
  await expect(page.getByText("Deals: 0", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Clear filters", exact: true }).first().click();
  await page.getByText("Filters", { exact: true }).click();
  await page.getByLabel("Party", { exact: true }).fill(revokedParty);
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await privateUrl(page);
  await expect(page.getByRole("heading", { name: directoryCopy("en").noMatch })).toBeVisible();
  await expect(page.getByText("Deals: 0", { exact: true })).toBeVisible();
});

test("O04 keeps BG/RU labels, first-use empty and legacy-search recovery", async ({ page }) => {
  const f = seed(),
    buyer = f.cases.buyer;
  for (const locale of ["bg", "ru"]) {
    const copy = directoryCopy(locale);
    await open(page, f.viewer.token, `/${locale}/cases`);
    await expect(
      page.getByRole("heading", { level: 1, name: caseCopy(locale).cases }),
    ).toBeVisible();
    await expect(page.getByLabel(copy.search, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: copy.apply, exact: true })).toBeVisible();
    await expect(rows(page, copy.list)).toHaveCount(6);
    await expect(
      caseRow(page, buyer, copy.list).getByRole("link", { name: buyer.title, exact: true }),
    ).toHaveAttribute("href", `/${locale}/cases/${buyer.id}`);
    await expect(caseRow(page, buyer, copy.list)).toContainText(
      locale === "bg" ? "Уточняване на изискванията" : "Согласование требований",
    );
    await expect(page.getByText(copy.count.replace("{n}", "6"), { exact: true })).toBeVisible();
  }
  await open(page, f.empty, "/en/cases");
  await expect(
    page.getByRole("heading", { level: 2, name: directoryCopy("en").empty }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open inquiries", exact: true })).toHaveAttribute(
    "href",
    "/en/inquiries",
  );
  await expect(rows(page)).toHaveCount(0);
  await open(page, f.viewer.token, `/en/cases?q=${buyer.reference}`);
  await expect(page.getByRole("heading", { name: directoryCopy("en").legacySearch })).toBeVisible();
  await expect(page.getByLabel("Search", { exact: true })).toHaveValue(buyer.reference);
  await expect(rows(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await privateUrl(page);
  await expect(rows(page)).toHaveCount(1);
  await expect(caseRow(page, buyer)).toBeVisible();
});
