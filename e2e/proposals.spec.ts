// AT33–AT35/C08/C10: exact terms, individual responses and explicit document access.
// Synthetic reviewed evidence proves local behavior only.
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
async function recorded(page: Page) {
  await expect(page.getByRole("heading", { name: "Change recorded", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open current record", exact: true }).click();
}

test("reviewed exact revision needs both named parties; client document access revocation takes effect immediately", async ({
  page,
  context,
  browser,
}, testInfo) => {
  test.setTimeout(120000);
  const f = JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "src/server/proposals/browser-seed.ts"],
      {
        env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
        encoding: "utf8",
      },
    ),
  ) as {
    proposalId: string;
    revisionId: string;
    caseId: string;
    staffToken: string;
    clientToken: string;
    sellerToken: string;
    documentId: string;
    documentVersionId: string;
    documentGrantId: string;
  };
  await context.addCookies([
    {
      name: "msr_staff_session",
      value: f.staffToken,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
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
    await client.goto(hostUrl("client", `/en/proposals/${f.proposalId}`));
    await expect(client.getByRole("heading", { name: "Exact terms", exact: true })).toHaveCount(0);
    await page.goto(hostUrl("staff", `/en/proposals/${f.proposalId}`));
    await page
      .getByLabel(
        "I reviewed these exact parties, terms, source and deadline. This is a coordination record, not legal approval.",
        { exact: true },
      )
      .check();
    await page.getByRole("button", { name: "Record exact-terms review", exact: true }).click();
    await recorded(page);
    await page
      .getByLabel(
        "I reviewed the exact revision and its audience. Make it available to these parties in their client workspace.",
        { exact: true },
      )
      .check();
    await page
      .getByRole("button", { name: "Make available to these parties", exact: true })
      .click();
    await recorded(page);
    await client.goto(hostUrl("client", `/en/proposals/${f.proposalId}`));
    await expect(client.getByRole("heading", { name: "Exact terms", exact: true })).toBeVisible();
    await client.getByLabel("Your response", { exact: true }).selectOption("agreed_for_next_step");
    const response = client
      .locator("form")
      .filter({ has: client.getByRole("button", { name: "Record my response", exact: true }) });
    await response
      .getByLabel("Reason or response note", { exact: true })
      .fill("I reviewed this exact revision.");
    await client.getByRole("button", { name: "Record my response", exact: true }).click();
    await recorded(client);
    await expect(
      client.getByText(
        "Your response is recorded. Overall agreement is still pending the remaining required parties and case review.",
        { exact: true },
      ),
    ).toBeVisible();
    let [revision] = await db
      .select()
      .from(schema.proposalRevisions)
      .where(eq(schema.proposalRevisions.id, f.revisionId));
    expect(revision?.state).toBe("awaiting_response");

    await client.goto(hostUrl("client", "/en/documents"));
    await expect(
      client.getByText("Professional review: Not requested", { exact: true }),
    ).toBeVisible();
    const fileUrl = hostUrl("client", `/api/files/private/document/${f.documentVersionId}`);
    const download = await client.request.get(fileUrl);
    expect(download.status()).toBe(200);
    expect(download.headers()["cache-control"]).toContain("no-store");
    expect(await download.text()).toContain("Synthetic private document fixture");
    await db
      .update(schema.grants)
      .set({ revokedAt: new Date() })
      .where(eq(schema.grants.id, f.documentGrantId));
    await client.reload();
    await expect(
      client.getByText("No documents have been explicitly shared with this account.", {
        exact: true,
      }),
    ).toBeVisible();
    expect((await client.request.get(fileUrl)).status()).toBe(404);

    await clients.clearCookies();
    await clients.addCookies([
      {
        name: "msr_client_session",
        value: f.sellerToken,
        url: origins.client,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await client.goto(hostUrl("client", `/en/proposals/${f.proposalId}`));
    await client.getByLabel("Your response", { exact: true }).selectOption("agreed_for_next_step");
    await client
      .locator("form")
      .filter({ has: client.getByRole("button", { name: "Record my response", exact: true }) })
      .getByLabel("Reason or response note", { exact: true })
      .fill("The named seller agrees to this revision.");
    await client.getByRole("button", { name: "Record my response", exact: true }).click();
    await recorded(client);
    [revision] = await db
      .select()
      .from(schema.proposalRevisions)
      .where(eq(schema.proposalRevisions.id, f.revisionId));
    expect(revision?.state).toBe("agreed_for_next_step");
    expect(
      await db
        .select()
        .from(schema.proposalResponses)
        .where(eq(schema.proposalResponses.revisionId, f.revisionId)),
    ).toHaveLength(2);
    await expect(client.getByText("Agreed for the next step", { exact: true })).toBeVisible();
    await client.screenshot({
      path: testInfo.outputPath("proposal-agreement.png"),
      fullPage: true,
    });
  } finally {
    await clients.close();
  }
});
