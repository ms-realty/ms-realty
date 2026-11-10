// ADR 0013 · C/O Deal overview: staff record Path steps, the client follows, staff complete the Deal.
import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { hostUrl, origins } from "./hosts";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable database required.");

async function recorded(page: Page) {
  await expect(page.getByRole("heading", { name: "Change recorded", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open current record", exact: true }).click();
}

test("staff record Path steps, the client sees progress, staff complete the deal and the client sees it completed", async ({
  page,
  context,
  browser,
}, testInfo) => {
  test.setTimeout(180000);
  const f = JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "src/server/cases/path-browser-seed.ts"],
      {
        env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
        encoding: "utf8",
      },
    ),
  ) as { caseId: string; staffToken: string; clientToken: string; steps: string[] };
  expect(f.steps.slice(-2)).toEqual(["registration", "keys_handed_over"]);
  await context.addCookies([
    {
      name: "msr_staff_session",
      value: f.staffToken,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const clientContext = await browser.newContext({ ...testInfo.project.use });
  try {
    await clientContext.addCookies([
      {
        name: "msr_client_session",
        value: f.clientToken,
        url: origins.client,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const client = await clientContext.newPage();
    const staffDeal = hostUrl("staff", `/en/cases/${f.caseId}`);
    const clientDeal = hostUrl("client", `/en/overview/${f.caseId}`);
    const staffStep = (key: string) => page.locator(`#case-path li[data-step="${key}"]`);
    const clientStep = (key: string) => client.locator(`#case-path li[data-step="${key}"]`);
    const markDone = async (key: string, note?: string) => {
      await page.goto(staffDeal);
      const form = staffStep(key)
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Mark done", exact: true }) });
      if (note) await form.getByLabel("Note for the client", { exact: true }).fill(note);
      await form.getByRole("button", { name: "Mark done", exact: true }).click();
      await recorded(page);
    };

    // The client sees where the Deal stands before anything else on the overview.
    await client.goto(clientDeal);
    await expect(
      client.getByRole("heading", { name: "Your deal path", exact: true }),
    ).toBeVisible();
    await expect(clientStep("terms_agreed")).toHaveAttribute("data-status", "done");
    await expect(clientStep("registration")).toHaveAttribute("aria-current", "step");
    await expect(
      clientStep("registration").getByText("You are here", { exact: true }),
    ).toBeVisible();

    await markDone("registration", "The deed is entered in the register in your name.");
    await client.reload();
    await expect(clientStep("registration")).toHaveAttribute("data-status", "done");
    await expect(
      clientStep("registration").getByText("The deed is entered in the register in your name."),
    ).toBeVisible();
    await expect(clientStep("keys_handed_over")).toHaveAttribute("aria-current", "step");
    await expect(
      clientStep("keys_handed_over").getByText("The owner hands over the keys on the agreed day."),
    ).toBeVisible();

    await markDone("keys_handed_over");
    await page.goto(staffDeal);
    const complete = page
      .locator("#case-path-complete form")
      .filter({ has: page.getByRole("button", { name: "Complete the deal", exact: true }) });
    await complete
      .getByLabel("Registry or deed reference", { exact: true })
      .fill("Synthetic entry 2026/42");
    await complete
      .getByLabel("I checked every step on this path and the date above.", { exact: true })
      .check();
    await complete.getByRole("button", { name: "Complete the deal", exact: true }).click();
    await recorded(page);
    await expect(
      page.locator("#case-path").getByText("Deal completed", { exact: true }),
    ).toBeVisible();

    await client.reload();
    const path = client.locator("#case-path");
    await expect(path.getByText("Deal completed", { exact: true })).toBeVisible();
    await expect(path.getByText(/Synthetic entry 2026\/42/)).toBeVisible();
    await expect(path.locator('li[aria-current="step"]')).toHaveCount(0);
    // Staff read the structured outcome in words, never the stored code.
    await page.goto(staffDeal);
    await expect(page.getByText("Completed through the deal path")).toBeVisible();
  } finally {
    await clientContext.close();
  }
});
