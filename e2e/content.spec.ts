// O21 / AT22: synthetic authoring and explicit review through the deployed application.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { hostUrl, origins } from "./hosts";

test("O21: an exact reviewed edition stays live through drafting and is removed on withdrawal", async ({
  page,
  context,
}, testInfo) => {
  const { token } = JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "src/features/content/testing/seed.ts"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          AUTH_SECRET: process.env.E2E_AUTH_SECRET,
          DATABASE_URL: process.env.E2E_DATABASE_URL,
        },
      },
    ).trim(),
  ) as { token: string };
  await context.addCookies([
    {
      name: "msr_staff_session",
      value: token,
      url: origins.staff,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  const slug = `synthetic-content-${randomUUID()}`,
    title = "Синтетични условия за браузърен тест";
  await page.goto(hostUrl("staff", "/en/content/new"));
  await page.getByLabel("URL segment", { exact: true }).fill(slug);
  await page.getByLabel("Page title", { exact: true }).fill(title);
  await page
    .getByLabel("Page text", { exact: true })
    .fill("Синтетичен текст. Не е реална политика или съвет.");
  await page
    .getByLabel("Jurisdiction or geographic scope", { exact: true })
    .fill("Synthetic test scope");
  await page
    .getByLabel("Scope of professional review", { exact: true })
    .fill("Synthetic browser review only");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Content change recorded", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open workbench", exact: true }).click();
  const publicPage = await context.newPage();
  await publicPage.goto(hostUrl("public", `/bg/help/${slug}`));
  await expect(publicPage.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
  for (const action of [
    "Record qualified claim review",
    "Approve editorial text",
    "Publish reviewed edition",
  ]) {
    const section = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: action, exact: true }) });
    await section
      .getByLabel("Review evidence or reason", { exact: true })
      .fill("Explicit synthetic human decision");
    await section
      .getByLabel("Approval valid until (UTC)", { exact: true })
      .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
    await section.getByRole("checkbox").check();
    await section.getByRole("button", { name: action, exact: true }).click();
    await expect(section.getByText("Content change recorded", { exact: true })).toBeVisible();
    await section.getByRole("link", { name: "Open workbench", exact: true }).click();
  }
  await publicPage.reload();
  await expect(publicPage.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(publicPage.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.getByLabel("Page title", { exact: true }).fill("Непубликувана синтетична редакция");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("link", { name: "Open workbench", exact: true }).click();
  await publicPage.reload();
  await expect(publicPage.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("synthetic-content-workbench.png"),
    fullPage: true,
  });
  const withdrawal = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Withdraw public page", exact: true }) });
  await withdrawal
    .getByLabel("Review evidence or reason", { exact: true })
    .fill("Synthetic withdrawal test");
  await withdrawal.getByRole("checkbox").check();
  await withdrawal.getByRole("button", { name: "Withdraw public page", exact: true }).click();
  await expect(withdrawal.getByText("Content change recorded", { exact: true })).toBeVisible();
  await publicPage.reload();
  await expect(publicPage.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
  await publicPage.close();
});

test("O21: no-JS draft submission returns a durable receipt without publication", async ({
  browser,
}) => {
  const { token } = JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "src/features/content/testing/seed.ts"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          AUTH_SECRET: process.env.E2E_AUTH_SECRET,
          DATABASE_URL: process.env.E2E_DATABASE_URL,
        },
      },
    ).trim(),
  ) as { token: string };
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    await context.addCookies([
      {
        name: "msr_staff_session",
        value: token,
        url: origins.staff,
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);
    const page = await context.newPage(),
      slug = `synthetic-native-${randomUUID()}`;
    await page.goto(hostUrl("staff", "/en/content/new"));
    await page.getByLabel("URL segment", { exact: true }).fill(slug);
    await page.getByLabel("Page title", { exact: true }).fill("Синтетична чернова без JavaScript");
    await page
      .getByLabel("Page text", { exact: true })
      .fill("Синтетичен тест без публична стойност.");
    await page
      .getByLabel("Jurisdiction or geographic scope", { exact: true })
      .fill("Synthetic scope");
    await page
      .getByLabel("Scope of professional review", { exact: true })
      .fill("Synthetic native submission");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByText("Content change recorded", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Open workbench", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Синтетична чернова без JavaScript", exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Open published page", exact: true })).toHaveCount(
      0,
    );
    await page.goto(hostUrl("public", `/bg/help/${slug}`));
    await expect(
      page.getByRole("heading", { name: "Синтетична чернова без JavaScript", exact: true }),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});
