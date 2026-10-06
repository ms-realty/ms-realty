// O04 (Figma 14:1847 desktop, 14:4522 mobile): the cases index searches by case number or title,
// shows each visible case's type, purpose, stage, disposition and owner, states its 50-case
// bound, and keeps first-use empty, no-match and a denied drill-down truthful; with JavaScript
// on and off, at the project width and at 320 px, in EN, BG and RU. Real PostgreSQL; each viewer
// reads only its own synthetic cases, so other projects sharing the database cannot change it.
import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
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
const rows = (page: Page, list = "Case list") =>
  page.getByRole("list", { name: list }).getByRole("link");
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

for (const javaScriptEnabled of [false, true])
  test.describe(`JavaScript ${javaScriptEnabled ? "on" : "off"}`, () => {
    test.use({ javaScriptEnabled });

    test("O04 lists visible cases, searches them and opens the case workspace", async ({
      page,
    }, info) => {
      test.slow();
      const f = seed();
      const { buyer, tenant, paused, closed, covered, long } = f.cases;
      await open(page, f.viewer.token, "/en/cases");
      await expect(page.getByRole("heading", { level: 1, name: "Cases" })).toBeVisible();
      await expect(rows(page)).toHaveCount(6);
      await expect(page.getByText("Cases: 6", { exact: true })).toBeVisible();
      // One link per case; its name carries type, purpose, stage, disposition and owner.
      await expect(
        page.getByRole("link", {
          name: `${buyer.reference} · Buying ${buyer.title} · Requirements to agree Accountable broker: ${f.ownerName}`,
          exact: true,
        }),
      ).toHaveAttribute("href", `/en/cases/${buyer.id}`);
      await expect(rows(page).filter({ hasText: tenant.reference })).toHaveText(
        `${tenant.reference} · Renting ${tenant.title} · Selecting properties Accountable broker: ${f.ownerName}`,
      );
      await expect(rows(page).filter({ hasText: paused.reference })).toHaveText(
        `${paused.reference} · Selling ${paused.title} · Preparing the listing Paused · Accountable broker: ${f.ownerName}`,
      );
      await expect(rows(page).filter({ hasText: closed.reference })).toHaveText(
        `${closed.reference} · Letting ${closed.title} · Marketing Closed · Accountable broker: ${f.ownerName}`,
      );
      await expect(rows(page).filter({ hasText: covered.reference })).toHaveText(
        `${covered.reference} · Buying ${covered.title} · Viewings Agency coverage · Last accepted owner: ${f.formerName}`,
      );
      await fitsWidth(page);
      await page.screenshot({ path: info.outputPath("o04-cases.png"), fullPage: true });
      const projectViewport = page.viewportSize();
      await page.setViewportSize({ width: 320, height: 844 });
      await expect(rows(page).filter({ hasText: long.reference })).toBeVisible();
      await fitsWidth(page);
      await page.screenshot({ path: info.outputPath("o04-cases-320.png"), fullPage: true });
      if (projectViewport) await page.setViewportSize(projectViewport);

      await search(page, buyer.reference);
      await expect(page).toHaveURL(hostUrl("staff", `/en/cases?q=${buyer.reference}`));
      await expect(page.getByLabel("Search", { exact: true })).toHaveValue(buyer.reference);
      await expect(rows(page)).toHaveCount(1);
      await expect(page.getByText("Cases: 1", { exact: true })).toBeVisible();

      await search(page, `${f.token}-none`);
      await expect(
        page.getByRole("heading", { level: 2, name: "No case matches this search." }),
      ).toBeVisible();
      await expect(rows(page)).toHaveCount(0);
      await page.getByRole("link", { name: "Clear the search", exact: true }).click();
      await expect(page).toHaveURL(hostUrl("staff", "/en/cases"));
      await expect(rows(page)).toHaveCount(6);

      await rows(page).filter({ hasText: buyer.reference }).click();
      await expect(page).toHaveURL(hostUrl("staff", `/en/cases/${buyer.id}`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        `${buyer.reference} · ${buyer.title}`,
      );

      // Access withdrawn after the list was read: the drill-down is denied without the case's
      // content, and the next list read drops the case.
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
      await rows(page).filter({ hasText: tenant.reference }).click();
      expect((await denied).status()).toBe(404);
      await expect(page.getByText(tenant.title)).toHaveCount(0);
      // The O05 route answers with Next's error shell, whose "Page not found" body is drawn by
      // JavaScript; without it the 404 page is blank. That page belongs to O05, not this index.
      if (javaScriptEnabled)
        await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
      await page.goto(hostUrl("staff", "/en/cases"));
      await expect(rows(page)).toHaveCount(5);
      await expect(page.getByText(tenant.reference)).toHaveCount(0);
    });
  });

test("O04 states the 50-case bound and finds an older case by its number", async ({ page }) => {
  const f = seed();
  await open(page, f.bulk, "/en/cases");
  await expect(rows(page)).toHaveCount(50);
  await expect(
    page.getByText(
      "Showing the 50 most recently updated cases you can access. To find another case, search by its number or title.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText(/^Cases: /)).toHaveCount(0);
  await expect(page.getByText(f.oldest)).toHaveCount(0);
  await search(page, f.oldest);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText(f.oldest);
});

test("O04 keeps BG and RU labels, and a first-use empty state", async ({ page }) => {
  const f = seed();
  const { buyer } = f.cases;
  for (const [locale, title, label, apply, list, row, count] of [
    [
      "bg",
      "Случаи",
      "Търсене",
      "Покажете",
      "Списък със случаи",
      `${buyer.reference} · Покупка ${buyer.title} · Изисквания за уточнение Отговорен брокер: ${f.ownerName}`,
      "Случаи: 6",
    ],
    [
      "ru",
      "Дела",
      "Поиск",
      "Показать",
      "Список дел",
      `${buyer.reference} · Покупка ${buyer.title} · Согласование требований Ответственный брокер: ${f.ownerName}`,
      "Всего дел: 6",
    ],
  ] as const) {
    await open(page, f.viewer.token, `/${locale}/cases`);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: apply, exact: true })).toBeVisible();
    await expect(rows(page, list)).toHaveCount(6);
    await expect(rows(page, list).filter({ hasText: buyer.reference })).toHaveText(row);
    await expect(page.getByText(count, { exact: true })).toBeVisible();
  }

  await open(page, f.empty, "/en/cases");
  await expect(
    page.getByRole("heading", { level: 2, name: "No cases are available to you." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open inquiries", exact: true })).toHaveAttribute(
    "href",
    "/en/inquiries",
  );
  await expect(page.getByRole("list", { name: "Case list" })).toHaveCount(0);
});
