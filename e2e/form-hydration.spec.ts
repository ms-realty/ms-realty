import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { hostUrl, origins } from "./hosts";

// A slow connection must not erase a usable server-rendered form when its JavaScript arrives.
test("UI07: typing before hydration survives later edits and submission", async ({ page }) => {
  const release = await delayScripts(page);
  try {
    await page.goto("/en/design/forms", { waitUntil: "commit" });
    const subject = page.getByRole("textbox", { name: "Practice subject", exact: true });
    const note = page.getByRole("textbox", { name: "Practice note (optional)", exact: true });
    await subject.fill("Synthetic draft before JavaScript");
    await note.fill("Synthetic note before JavaScript");
    release();
    await page.waitForLoadState("networkidle");
    await note.fill("Synthetic note after JavaScript");
    await expect(subject).toHaveValue("Synthetic draft before JavaScript");
    await page.getByRole("button", { name: "Check practice form", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Practice form checked", exact: true }),
    ).toBeVisible();
  } finally {
    release();
  }
});

// This covers native select and explicit human confirmation, not just ordinary text fields.
test("O21: pre-hydration content fields and review confirmation survive enhancement", async ({
  page,
  context,
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
    ),
  ) as { token: string };
  await context.addCookies([
    {
      name: "msr_staff_session",
      value: token,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const releaseCreate = await delayScripts(page);
  try {
    await page.goto(hostUrl("staff", "/en/content/new"), { waitUntil: "commit" });
    await page.getByRole("combobox", { name: "Content type", exact: true }).selectOption("service");
    const slug = `synthetic-hydration-${randomUUID()}`;
    await page.getByLabel("URL segment", { exact: true }).fill(slug);
    await page.getByLabel("Page title", { exact: true }).fill("Synthetic delayed-JavaScript draft");
    await page
      .getByLabel("Page text", { exact: true })
      .fill("Synthetic draft; no real policy or advice.");
    await page
      .getByLabel("Jurisdiction or geographic scope", { exact: true })
      .fill("Synthetic scope");
    await page
      .getByLabel("Scope of professional review", { exact: true })
      .fill("Synthetic initial review");
    releaseCreate();
    await page.waitForLoadState("networkidle");
    await page
      .getByLabel("Scope of professional review", { exact: true })
      .fill("Synthetic amended review");
    await expect(page.getByRole("combobox", { name: "Content type", exact: true })).toHaveValue(
      "service",
    );
    await expect(page.getByLabel("URL segment", { exact: true })).toHaveValue(slug);
    await expect(page.getByLabel("Page title", { exact: true })).toHaveValue(
      "Synthetic delayed-JavaScript draft",
    );
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByText("Content change recorded", { exact: true })).toBeVisible();
    const href = await page
      .getByRole("link", { name: "Open workbench", exact: true })
      .getAttribute("href");
    if (!href) throw new Error("Saved workbench missing");
    const review = await context.newPage();
    const releaseReview = await delayScripts(review);
    try {
      await review.goto(hostUrl("staff", href), { waitUntil: "commit" });
      const section = review.locator("section").filter({
        has: review.getByRole("heading", { name: "Record qualified claim review", exact: true }),
      });
      await section
        .getByLabel("Review evidence or reason", { exact: true })
        .fill("Explicit synthetic review before JavaScript");
      const expiry = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
      await section.getByLabel("Approval valid until (UTC)", { exact: true }).fill(expiry);
      await section.getByRole("checkbox").check();
      releaseReview();
      await review.waitForLoadState("networkidle");
      await section
        .getByLabel("Review evidence or reason", { exact: true })
        .fill("Explicit synthetic review after JavaScript");
      await expect(section.getByRole("checkbox")).toBeChecked();
      await expect(section.getByLabel("Approval valid until (UTC)", { exact: true })).toHaveValue(
        expiry,
      );
      await section
        .getByRole("button", { name: "Record qualified claim review", exact: true })
        .click();
      await expect(review).toHaveURL((url) => url.pathname === "/en/content/operations");
      await expect(review.getByText("Content change recorded", { exact: true })).toBeVisible();
    } finally {
      releaseReview();
      await review.close();
    }
  } finally {
    releaseCreate();
  }
});

async function delayScripts(page: Page) {
  let release!: () => void;
  const scripts = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/_next/**/*.js*", async (route) => {
    await scripts;
    await route.continue();
  });
  return release;
}
