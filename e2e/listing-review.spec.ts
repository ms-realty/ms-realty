// O16: review for publication shows the candidate, the BG working preview and the required
// human approvals as recorded status (never boxes to tick), says whether publishing is blocked,
// and keeps every decision on its own form. Real PostgreSQL, synthetic records.
import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { hostUrl, origins } from "./hosts";

type Seed = {
  reference: string;
  blank: { reference: string };
  token: string;
};
function seed(): Seed {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "e2e/support/listing-edit-seed.ts"],
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
      value: f.token,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto(hostUrl("staff", path));
}

for (const javaScriptEnabled of [false, true])
  test.describe(`JavaScript ${javaScriptEnabled ? "on" : "off"}`, () => {
    test.use({ javaScriptEnabled });

    test("O16 shows a published candidate with its approvals as status", async ({ page }) => {
      const f = seed();
      await open(page, f, `/en/inventory/${f.reference}?tab=review`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Review for publication" }),
      ).toBeVisible();
      const candidate = page.getByRole("region", { name: "Publication candidate" });
      await expect(candidate).toContainText("Public version: BG");
      await expect(candidate).toContainText("Review version 1 · Bulgarian");
      await expect(
        page.getByText(`Current content from the editor · ${f.reference}`),
      ).toBeVisible();
      await expect(
        page.getByText(`${f.reference} · Photo 1 of 1 · Original listing photo`),
      ).toBeVisible();
      // Approvals are status rows: no checkbox the reviewer could tick to fake one.
      const approvals = page.getByRole("region", { name: "Required approvals" });
      await expect(approvals.getByRole("checkbox")).toHaveCount(0);
      await expect(
        approvals.getByRole("listitem").filter({ hasText: "Facts are reviewed" }),
      ).toContainText("Done");
      await expect(page.getByRole("link", { name: "Edit the text manually" })).toHaveAttribute(
        "href",
        `/en/inventory/${f.reference}`,
      );
      // The decisions stay on their own forms below.
      await expect(page.locator('[data-inventory-decision="restrict"]')).toBeVisible();
    });

    test("O16 keeps publishing blocked while approvals are missing", async ({ page }) => {
      const f = seed();
      await open(page, f, `/en/inventory/${f.blank.reference}?tab=review`);
      await expect(
        page.getByText("Publishing stays blocked until every human approval is in place."),
      ).toBeVisible();
      await expect(page.getByText("Public version: none confirmed")).toBeVisible();
      const missing = page
        .getByRole("region", { name: "Required approvals" })
        .getByRole("listitem")
        .filter({ hasText: "Missing" });
      expect(await missing.count()).toBeGreaterThan(0);
      await page.getByRole("link", { name: "Review the missing approvals" }).click();
      await expect(page.getByRole("navigation", { name: "Listing sections" })).toBeInViewport();
    });
  });

test("O16 publishes the exact package through its decision and shows the result", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const f = seed();
  await open(page, f, `/en/inventory/${f.reference}?tab=review`);
  await expect(
    page.getByText("The exact candidate is eligible for a publication decision.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Go to the publication decision" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Publication decision · BG" }),
  ).toBeVisible();
  await expect(page.getByText("Publishing actor")).toBeVisible();
  await expect(page.getByText("Butler cannot publish.", { exact: false })).toBeVisible();
  const decision = page.locator('[data-inventory-decision="activate"]');
  await decision
    .getByLabel("Review scope or reason", { exact: true })
    .fill("Synthetic exact package check, no real listing.");
  await decision.getByRole("checkbox").check();
  await decision.getByRole("button", { name: "Activate reviewed manifest (BG)" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "The listing is published" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the public page" })).toHaveAttribute(
    "href",
    new RegExp(`/bg/properties/${f.reference}/`),
  );
  // The result is this actor's own activation; a made-up id shows the review instead.
  await open(page, f, `/en/inventory/${f.reference}?tab=review&published=${crypto.randomUUID()}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Review for publication" }),
  ).toBeVisible();
});

test("O16 keeps BG and RU labels", async ({ page }) => {
  const f = seed();
  for (const [locale, title, approvals] of [
    ["bg", "Преглед за публикуване", "Нужни одобрения"],
    ["ru", "Проверка перед публикацией", "Необходимые одобрения"],
  ] as const) {
    await open(page, f, `/${locale}/inventory/${f.reference}?tab=review`);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole("region", { name: approvals })).toBeAttached();
  }
});
