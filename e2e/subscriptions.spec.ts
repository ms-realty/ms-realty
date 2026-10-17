// Synthetic no-JavaScript human policy review. Runtime sends remain disabled throughout.
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { hostUrl, origins } from "./hosts";

test("F05: native exact-rule approval, retained error inputs, durable receipt and disable without sending", async ({
  browser,
}, testInfo) => {
  // Includes serialized shared-rule review and cold fixture process startup.
  test.setTimeout(120_000);
  const url = process.env.E2E_DATABASE_URL;
  if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
    throw new Error("Disposable E2E database required");
  const connection = postgres(url, { max: 1 });
  // The service rule is intentionally one global human decision. Browser projects review it
  // in sequence instead of racing snapshots and hiding legitimate version conflicts.
  await connection`select pg_advisory_lock(hashtextextended('synthetic-alert-rule-browser', 0))`;
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const { token } = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "src/features/subscriptions/testing/seed.ts",
        ],
        {
          encoding: "utf8",
          timeout: 60_000,
          env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
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
    const page = await context.newPage();
    await page.goto(hostUrl("staff", "/en/operations/subscriptions"));
    await expect(
      page.getByRole("heading", { name: "Saved-search alert rule", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Runtime delivery is disabled. Recording approval does not enable it.", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel("Review note", { exact: true })
      .fill("Synthetic native review; no real subscriber or provider involved");
    await page.getByRole("checkbox").check();
    // Missing expiry is a real server rejection. The note survives; approval remains absent.
    await page.getByRole("button", { name: "Approve fixed rule", exact: true }).click();
    await expect(page).toHaveURL(/error=VALIDATION_FAILED/);
    await expect(page.getByLabel("Review note", { exact: true })).toHaveValue(
      "Synthetic native review; no real subscriber or provider involved",
    );
    await expect(page.getByRole("checkbox")).not.toBeChecked();
    await page
      .getByLabel("Approval expires at (UTC)", { exact: true })
      .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Approve fixed rule", exact: true }).click();
    await expect(page.locator("[data-rule-receipt]")).toBeVisible();
    await expect(page.getByText("Human approval is current", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Runtime delivery is disabled. Recording approval does not enable it.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("synthetic-native-search-alert-rule.png"),
      fullPage: true,
    });
    await page
      .getByLabel("Review note", { exact: true })
      .fill("Synthetic operator disable after review");
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Disable rule and cancel queued digests", exact: true })
      .click();
    await expect(page.locator("[data-rule-receipt]")).toBeVisible();
    await expect(page.getByText("No current human approval", { exact: true })).toBeVisible();
    const [effects] =
      await connection`select count(*)::int as n from external_actions where subject_type = 'search_alert_digest'`;
    expect(effects?.n).toBe(0);
  } finally {
    await context.close().catch(() => undefined);
    try {
      await connection`select pg_advisory_unlock(hashtextextended('synthetic-alert-rule-browser', 0))`;
    } finally {
      await connection.end({ timeout: 2 });
    }
  }
});
