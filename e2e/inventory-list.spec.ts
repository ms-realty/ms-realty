// O10: the inventory list searches by number/title/settlement, filters by purpose, and splits
// All / Needs action / Mine from recorded states only, with JavaScript on and off. Real
// PostgreSQL, synthetic records.
import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { hostUrl, origins } from "./hosts";

type Seed = {
  token: string;
  review: string;
  availability: string;
  settled: string;
  draftOnly: string;
  session: string;
};
function seed(): Seed {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "e2e/support/inventory-list-seed.ts"],
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
}
async function open(page: Page, f: Seed, path: string) {
  await page.context().addCookies([
    {
      name: "msr_staff_session",
      value: f.session,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto(hostUrl("staff", path));
}
const rows = (page: Page) =>
  page.getByRole("list", { name: "Listings" }).getByRole("listitem").getByRole("link");

for (const javaScriptEnabled of [false, true])
  test.describe(`JavaScript ${javaScriptEnabled ? "on" : "off"}`, () => {
    test.use({ javaScriptEnabled });

    test("O10 searches, filters and splits All / Needs action / Mine", async ({ page }) => {
      const f = seed();
      await open(page, f, "/en/inventory");
      await expect(page.getByRole("heading", { level: 1, name: "Inventory" })).toBeVisible();

      await page.getByLabel("Search", { exact: true }).fill(f.token);
      await page.getByRole("button", { name: "Show", exact: true }).first().click();
      await expect(rows(page)).toHaveCount(4);
      const review = rows(page).filter({ hasText: f.review });
      await expect(review).toContainText(
        `${f.review} · Синтетичен преглед ${f.token}Sandanski · €95,000 · 74.5 m² · Review needed`,
      );
      await expect(rows(page).filter({ hasText: f.availability })).toContainText(
        "Availability to confirm",
      );
      await expect(rows(page).filter({ hasText: f.draftOnly })).not.toContainText("needed");

      const views = page.getByRole("navigation", { name: "Listing views" });
      await views.getByRole("link", { name: "Needs action" }).click();
      await expect(views.getByRole("link", { name: "Needs action" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(rows(page)).toHaveCount(2);
      await expect(rows(page).filter({ hasText: f.settled })).toHaveCount(0);
      const first = page.getByRole("link", { name: /^Open listing / });
      await expect(first).toHaveAttribute("href", /\/en\/inventory\/MS-\d+$/);

      await views.getByRole("link", { name: "Mine" }).click();
      await expect(rows(page)).toHaveCount(1);
      await expect(rows(page)).toContainText(f.settled);

      await views.getByRole("link", { name: "All" }).click();
      await expect(rows(page)).toHaveCount(4);
      await page.getByText("Filters", { exact: true }).click();
      await page.getByLabel("Purpose", { exact: true }).selectOption("long_term_rent");
      await page.getByRole("button", { name: "Show", exact: true }).last().click();
      await expect(rows(page)).toHaveCount(1);
      await expect(rows(page)).toContainText(f.availability);

      // A repeated parameter keeps its first value instead of failing.
      await open(page, f, `/en/inventory?q=${f.token}&q=other&view=needs&view=mine`);
      await expect(rows(page)).toHaveCount(2);

      await open(page, f, `/en/inventory?q=${f.token}-nothing`);
      await expect(page.getByText("No listing matches this search.")).toBeVisible();
      await page.getByRole("link", { name: "Clear the search" }).click();
      await expect(page).toHaveURL(/\/en\/inventory$/);

      await open(page, f, `/en/inventory?q=${f.token}`);
      await rows(page).filter({ hasText: f.review }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Edit listing" })).toBeVisible();
    });
  });

test("O10 keeps BG and RU view labels", async ({ page }) => {
  const f = seed();
  for (const [locale, title, needs, list] of [
    ["bg", "Имоти и обяви", "Нужно действие", "Обяви"],
    ["ru", "Объекты и объявления", "Нужно действие", "Объявления"],
  ] as const) {
    await open(page, f, `/${locale}/inventory?view=needs&q=${f.token}`);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole("link", { name: needs, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("list", { name: list }).getByRole("link")).toHaveCount(2);
  }
});
