import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { hostUrl, origins } from "./hosts";

test.use({ javaScriptEnabled: false });
test("additional proposal parties survive native validation and require review of a new immutable revision", async ({
  page,
  context,
}, info) => {
  const f = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "src/server/proposals/browser-seed.ts",
        "--co-party",
      ],
      {
        env: {
          ...process.env,
          AUTH_SECRET: process.env.E2E_AUTH_SECRET,
          DATABASE_URL: process.env.E2E_DATABASE_URL,
        },
        encoding: "utf8",
      },
    ),
  ) as { proposalId: string; staffToken: string; coPartyId: string };
  await context.addCookies([
    {
      name: "msr_staff_session",
      value: f.staffToken,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto(hostUrl("staff", `/en/proposals/${f.proposalId}`));
  const form = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Save a new revision", exact: true }) });
  const selected = form.getByRole("checkbox", { name: "Synthetic additional buyer", exact: true });
  const amount = form.getByLabel("Amount (EUR)", { exact: true });
  await selected.check();
  await amount.fill("0");
  await form
    .getByLabel("Reason or response note", { exact: true })
    .fill("Both buyers must agree to the same terms");
  await form.getByRole("button", { name: "Save a new revision", exact: true }).click();
  await expect(selected).toBeChecked();
  await expect(amount).toHaveValue("0");
  await amount.fill("110000");
  await form.getByRole("button", { name: "Save a new revision", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Change recorded", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open current record", exact: true }).click();
  const terms = page.locator('[data-proposal-revision="2"]');
  await expect(terms).toContainText("Synthetic additional buyer");
  await expect(terms).toContainText("EUR 110,000.00");
  await expect(terms).toContainText("Draft · not shared");
  await expect(
    page.getByRole("button", { name: "Make available to these parties", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Record exact-terms review", exact: true }),
  ).toBeVisible();
  await expect(
    form.getByRole("checkbox", { name: "Synthetic additional buyer", exact: true }),
  ).toBeChecked();
  const previous = page.locator('[data-proposal-revision="1"]');
  await expect(previous).not.toContainText("Synthetic additional buyer");
  await expect(previous).toContainText("EUR 120,000.00");
  await page.screenshot({
    path: info.outputPath("additional-proposal-parties.png"),
    fullPage: true,
  });
});
