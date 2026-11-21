// ADR 0015 · O Deal page and proposal: a broker adds a held home that is not published, makes a
// proposal on it, records that both sides agreed, records the path's duty steps and completes
// the Deal; the home is then sold. The agreement itself is recorded with JavaScript off.
import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostUrl, origins } from "./hosts";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable database required.");
const connection = postgres(url, { max: 2 });
const db = drizzle(connection, { schema });
test.afterAll(async () => {
  await connection.end();
});

async function recorded(page: Page, title = "Change recorded") {
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open current record", exact: true }).click();
}

test("a broker takes a held home from the shortlist to agreed terms, the path and a sold home", async ({
  page,
  context,
  browser,
}, testInfo) => {
  test.setTimeout(240000);
  const f = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "src/server/proposals/agree-browser-seed.ts",
      ],
      {
        env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
        encoding: "utf8",
      },
    ),
  ) as {
    caseId: string;
    staffToken: string;
    clientToken: string;
    listingId: string;
    reference: string;
  };
  const cookie = {
    name: "msr_staff_session",
    value: f.staffToken,
    url: origins.staff,
    httpOnly: true,
    sameSite: "Lax" as const,
  };
  await context.addCookies([cookie]);
  const deal = hostUrl("staff", `/en/cases/${f.caseId}`);

  // Add a home to this deal: any home the agency holds, with a one-line reason.
  await page.goto(deal);
  const pick = page.locator("[data-broker-pick]");
  // The Deal has no home yet, so adding one is open: the first thing to do here.
  await expect(pick).toHaveAttribute("open", "");
  await pick.getByLabel("Home", { exact: true }).selectOption(f.reference);
  await pick
    .getByLabel("Why it fits, in one line", { exact: true })
    .fill("Two bedrooms near the school");
  await pick.getByRole("button", { name: "Add a home to this deal", exact: true }).click();
  await recorded(page);

  // The client opens the home from their Deal: a private page, since it is not public.
  const clients = await browser.newContext({ ...testInfo.project.use });
  try {
    await clients.addCookies([
      {
        name: "msr_client_session",
        value: f.clientToken,
        url: origins.client,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const client = await clients.newPage();
    await client.goto(hostUrl("client", `/en/properties/${f.caseId}`));
    await client.getByRole("link", { name: f.reference, exact: true }).click();
    await expect(client).toHaveURL(new RegExp(`/en/properties/${f.caseId}/homes/${f.reference}$`));
    await expect(
      client.getByRole("heading", { level: 1, name: "Двустаен апартамент до училището" }),
    ).toBeVisible();
    await expect(
      client.getByText("Only the people on your deal can see this page.", { exact: false }),
    ).toBeVisible();
    // Not live in English: no link to a public page that would not show it.
    await expect(
      client.getByRole("link", { name: "See this home on the public website" }),
    ).toHaveCount(0);
  } finally {
    await clients.close();
  }

  // Make a proposal on it, naming the seller the agency had not recorded yet.
  await page.getByRole("link", { name: "Make a proposal", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Make a proposal" })).toBeVisible();
  await page.getByLabel("Seller's full name").fill("Synthetic Seller Name");
  await page.getByLabel("Amount (EUR)", { exact: true }).fill("95000");
  await page.getByLabel("Payment basis", { exact: true }).fill("Deposit now, balance at the deed");
  const deadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  await page.getByLabel("Response deadline", { exact: true }).fill(`${deadline}T12:00`);
  await page.getByRole("button", { name: "Make a proposal", exact: true }).click();
  await recorded(page);
  const proposalUrl = page.url();
  expect(proposalUrl).toMatch(/\/en\/proposals\/[0-9a-f-]{36}$/);

  // Record that both sides agreed, with JavaScript off: a native form post.
  const noScript = await browser.newContext({ ...testInfo.project.use, javaScriptEnabled: false });
  try {
    await noScript.addCookies([cookie]);
    const plain = await noScript.newPage();
    await plain.goto(proposalUrl);
    const agree = plain.locator("[data-proposal-agree]");
    await expect(
      agree.getByRole("heading", { name: "Record that both sides agreed", exact: true }),
    ).toBeVisible();
    await agree.getByLabel("How the buyer said yes", { exact: true }).selectOption("in_person");
    await agree.getByLabel("How the seller said yes", { exact: true }).selectOption("phone");
    await agree.getByRole("button", { name: "Record that both sides agreed", exact: true }).click();
    await expect(
      plain.getByRole("heading", { name: "Both sides agreed to these terms.", exact: true }),
    ).toBeVisible();
  } finally {
    await noScript.close();
  }
  await page.goto(proposalUrl);
  await expect(page.getByText("Agreed for the next step", { exact: true }).first()).toBeVisible();
  await expect(page.locator("[data-proposal-agree]")).toHaveCount(0);

  // The path: duties are steps. Money and the property wait for identity checks.
  const step = (key: string) => page.locator(`#case-path li[data-step="${key}"]`);
  await page.goto(deal);
  await expect(step("terms_agreed")).toHaveAttribute("data-status", "done");
  await expect(step("identity_checks").getByText("Required for this deal")).toBeVisible();
  await expect(
    step("deposit_preliminary_contract").getByText("Record the identity checks before this step."),
  ).toHaveCount(1);
  const markDone = async (key: string, away?: "Yes" | "No") => {
    await page.goto(deal);
    const form = step(key)
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Mark done", exact: true }) });
    if (!(await form.isVisible())) await step(key).locator("summary").first().click();
    if (away)
      await form
        .getByLabel("Signed online or away from your office?", { exact: true })
        .selectOption({ label: away });
    await form.getByRole("button", { name: "Mark done", exact: true }).click();
    await recorded(page);
  };
  await markDone("brokerage_agreement", "No");
  for (const key of [
    "identity_checks",
    "deposit_preliminary_contract",
    "property_checks",
    "funds_ready",
    "notary_deed",
    "registration",
    "keys_handed_over",
  ])
    await markDone(key);
  await page.goto(deal);
  const complete = page
    .locator("#case-path-complete form")
    .filter({ has: page.getByRole("button", { name: "Complete the deal", exact: true }) });
  await complete
    .getByLabel("I checked every step on this path and the date above.", { exact: true })
    .check();
  await complete.getByRole("button", { name: "Complete the deal", exact: true }).click();
  await recorded(page);
  await expect(
    page.locator("#case-path").getByText("Deal completed", { exact: true }),
  ).toBeVisible();
  const [home] = await db
    .select({ state: schema.listings.commercialState })
    .from(schema.listings)
    .where(eq(schema.listings.id, f.listingId));
  expect(home?.state).toBe("sold");
});
