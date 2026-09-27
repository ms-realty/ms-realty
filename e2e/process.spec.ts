// Native forms bind human operating-policy and signed-document evidence. Synthetic metadata
// exercises workflow only; actual bytes/ClamAV are qualified separately by files scenarios.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostUrl, origins } from "./hosts";

test.use({ javaScriptEnabled: false });
const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable E2E database required");
const connection = postgres(url, { max: 2 }),
  db = drizzle(connection, { schema });
test.afterAll(async () => {
  await connection.end();
});
const later = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 16);
const section = (page: Page, name: string) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name, exact: true }) });
async function receipt(page: Page) {
  await expect(page.getByRole("heading", { name: "Operation result", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Review recorded");
  await page.getByRole("link", { name: "Agreements and checks", exact: true }).click();
}

test("qualified policy, signed agreement and revocation retain exact evidence through native form receipts", async ({
  page,
  context,
}) => {
  const f = JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "src/server/compliance/browser-seed.ts"],
      {
        env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
        encoding: "utf8",
      },
    ),
  ) as {
    caseId: string;
    staffToken: string;
    staffId: string;
    clientPartyId: string;
    versions: Record<string, string>;
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
  await page.goto(hostUrl("staff", `/en/cases/${f.caseId}/process`));
  const policy = section(page, "Approve an operating policy"),
    title = `Synthetic browser policy ${randomUUID().slice(0, 8)}`;
  // A rejected native POST must not restore its draft/errors into sibling bound actions.
  await policy.getByRole("button", { name: "Record", exact: true }).click();
  await expect(policy.getByRole("region", { name: "There is a problem" })).toBeVisible();
  await expect(
    section(page, "Service agreement").getByRole("region", { name: "There is a problem" }),
  ).toHaveCount(0);
  await expect(
    section(page, "Start review").getByRole("region", { name: "There is a problem" }),
  ).toHaveCount(0);
  await policy.getByLabel("Policy title", { exact: true }).fill(title);
  await policy
    .getByLabel("Reviewed document", { exact: true })
    .selectOption(f.versions.process_policy ?? "");
  await policy.getByLabel("Country", { exact: true }).selectOption("BG");
  await policy.getByLabel("Transaction", { exact: true }).selectOption("sale");
  await policy
    .getByLabel("Category under the approved policy", { exact: true })
    .selectOption("unknown");
  await policy
    .getByLabel("Transaction checks, one per line", { exact: true })
    .fill("Synthetic title evidence review");
  await policy
    .getByLabel("Checks for each party, one per line", { exact: true })
    .fill("Synthetic identity review");
  await policy.getByLabel("Policy withdrawal period, days", { exact: true }).fill("14");
  await policy.getByLabel("Policy retention period, days", { exact: true }).fill("1826");
  await policy
    .getByLabel("Policy requires an express start request", { exact: true })
    .selectOption("true");
  await policy
    .getByLabel("Responsible professional", { exact: true })
    .fill("Synthetic test reviewer");
  await policy.getByLabel("Valid until", { exact: true }).fill(later(30));
  await policy.getByRole("button", { name: "Record", exact: true }).click();
  await receipt(page);
  const [savedPolicy] = await db
    .select()
    .from(schema.processPolicies)
    .where(eq(schema.processPolicies.title, title));
  expect(savedPolicy?.documentVersionId).toBe(f.versions.process_policy);
  if (!savedPolicy) throw new Error("Policy was not persisted");
  const agreement = section(page, "Service agreement");
  await agreement.getByLabel("Client", { exact: true }).selectOption(f.clientPartyId);
  await agreement.getByLabel("Approved policy", { exact: true }).selectOption(savedPolicy.id);
  await agreement
    .getByLabel("Reviewed document", { exact: true })
    .selectOption(f.versions.service_agreement ?? "");
  await agreement.getByLabel("Agreement channel", { exact: true }).selectOption("distance");
  for (const name of ["Signed at", "Withdrawal information given at", "Express start requested at"])
    await agreement.getByLabel(name, { exact: true }).fill(later(-1));
  await agreement
    .getByLabel("Start request evidence", { exact: true })
    .selectOption(f.versions.express_start ?? "");
  await agreement
    .getByLabel("Commission basis", { exact: true })
    .fill("Synthetic agreed fixed fee EUR 100.00; no tax conclusion");
  await agreement.getByLabel("Commission payer", { exact: true }).selectOption(f.clientPartyId);
  await agreement.getByLabel("Valid until", { exact: true }).fill(later(20));
  await agreement.getByRole("button", { name: "Record", exact: true }).click();
  await receipt(page);
  const [savedAgreement] = await db
    .select()
    .from(schema.serviceAgreements)
    .where(eq(schema.serviceAgreements.caseId, f.caseId));
  expect(savedAgreement).toMatchObject({
    partyId: f.clientPartyId,
    documentVersionId: f.versions.service_agreement,
    expressStartEvidenceVersionId: f.versions.express_start,
  });
  expect(savedAgreement?.withdrawalDeadlineAt?.getTime()).toBeGreaterThan(Date.now());
  await section(page, "Service agreement")
    .getByLabel("Reason", { exact: true })
    .fill("Synthetic withdrawal instruction");
  await section(page, "Service agreement")
    .getByRole("button", { name: "Revoke evidence", exact: true })
    .click();
  await receipt(page);
  await expect(page.getByText("Synthetic withdrawal instruction", { exact: true })).toBeVisible();
  const restrictedUrl = hostUrl("staff", `/en/cases/${f.caseId}/process/restricted`);
  expect((await page.goto(restrictedUrl))?.status()).toBe(404);
  const [grant] = await db
    .insert(schema.grants)
    .values({
      principalId: f.staffId,
      capability: "compliance.suspicion",
      reason: "Explicit synthetic restricted-register reviewer",
    })
    .returning();
  if (!grant) throw new Error("Fixture grant missing");
  await page.goto(restrictedUrl);
  const restricted = section(page, "Restricted register");
  const privateNote = `Synthetic restricted browser note ${randomUUID()}`;
  await restricted.getByLabel("Client", { exact: true }).selectOption(f.clientPartyId);
  await restricted.getByLabel("Approved policy", { exact: true }).selectOption(savedPolicy.id);
  await restricted.getByLabel("Restricted note", { exact: true }).fill(privateNote);
  await restricted.getByRole("button", { name: "Record", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Review recorded");
  const restrictedReceipt = page.url();
  await page.getByRole("link", { name: "Restricted register", exact: true }).click();
  await expect(page.getByText(privateNote, { exact: true })).toBeVisible();
  await expect(page.getByText("No external confirmation recorded", { exact: true })).toBeVisible();
  await page.goto(hostUrl("staff", `/en/cases/${f.caseId}/process`));
  await expect(page.getByText(privateNote, { exact: true })).toHaveCount(0);
  await db
    .update(schema.grants)
    .set({ revokedAt: new Date() })
    .where(eq(schema.grants.id, grant.id));
  expect((await page.goto(restrictedUrl))?.status()).toBe(404);
  await expect(page.getByText(privateNote, { exact: true })).toHaveCount(0);
  expect((await page.goto(restrictedReceipt))?.status()).toBe(404);
});
