import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostUrl, origins } from "./hosts";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable database required.");
const connection = postgres(url, { max: 2 }),
  db = drizzle(connection, { schema });
test.afterAll(async () => {
  await connection.end();
});
async function recorded(page: Page) {
  await expect(page.getByRole("heading", { name: "Change recorded", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open current record", exact: true }).click();
}

test("C12 / AT18 exact owner preview, private reviewed images and current consent before marketing", async ({
  page,
  context,
  browser,
}, testInfo) => {
  test.setTimeout(120000);
  const f = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "src/server/cases/owner-preview-browser-seed.ts",
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
    propertyId: string;
    instructionId: string;
    revisionId: string;
    assetId: string;
    reference: string;
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
  const ownerContext = await browser.newContext({
    ...testInfo.project.use,
    javaScriptEnabled: false,
  });
  try {
    await ownerContext.addCookies([
      {
        name: "msr_client_session",
        value: f.clientToken,
        url: origins.client,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const owner = await ownerContext.newPage();
    const continuity = hostUrl("staff", `/en/cases/${f.caseId}/continuity`);
    const preview = hostUrl("client", `/en/properties/${f.caseId}/preview?listing=${f.reference}`);
    await owner.goto(hostUrl("client", `/en/overview/${f.caseId}`));
    await expect(owner.getByRole("link", { name: /Review owner listing preview/ })).toHaveCount(0);
    await page.goto(continuity);
    const binding = page.locator("form").filter({
      has: page.getByRole("button", { name: "Bind reviewed instruction", exact: true }),
    });
    await binding
      .getByLabel("Reviewed seller instruction", { exact: true })
      .selectOption(f.instructionId);
    await binding
      .getByLabel("Reason", { exact: true })
      .fill("Reviewed current owner authority, matching property and exact seller instructions.");
    await binding.getByRole("checkbox").check();
    await binding.getByRole("button", { name: "Bind reviewed instruction", exact: true }).click();
    await recorded(page);
    await owner.reload();
    await owner.getByRole("link", { name: /Review owner listing preview/ }).click();
    await expect(
      owner.getByRole("heading", { name: `Owner listing preview · ${f.reference}`, exact: true }),
    ).toBeVisible();
    await expect(
      owner.getByRole("heading", { name: "Current approved Bulgarian source", exact: true }),
    ).toBeVisible();
    const image = owner.locator(`main img[src*="${f.assetId}"]`);
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    const oldImageUrl = new URL((await image.getAttribute("src")) ?? "", origins.client).toString();
    const imageResponse = await ownerContext.request.get(oldImageUrl);
    expect(imageResponse.status()).toBe(200);
    expect(imageResponse.headers()["cache-control"]).toContain("no-store");
    expect(imageResponse.headers()["content-type"]).toContain("image/webp");
    const acknowledge = async () => {
      await owner
        .getByLabel(
          "I reviewed the exact displayed terms, facts, Bulgarian copy, images and public disclosure and acknowledge them for this case.",
          { exact: true },
        )
        .check();
      await owner
        .getByRole("button", { name: "Acknowledge exact listing preview", exact: true })
        .click();
      // The native response renders the now-current preview, replacing its confirmation form.
      await expect(
        owner.getByText("Your acknowledgment is current for this exact preview.", { exact: true }),
      ).toBeVisible();
      await owner.goto(preview);
      await expect(
        owner.getByText("Your acknowledgment is current for this exact preview.", { exact: true }),
      ).toBeVisible();
    };
    await acknowledge();
    await db
      .update(schema.mediaAssets)
      .set({ caption: "Updated image disclosure requires renewed owner consent." })
      .where(eq(schema.mediaAssets.id, f.assetId));
    await owner.reload();
    await expect(
      owner.getByRole("button", { name: "Acknowledge exact listing preview", exact: true }),
    ).toBeVisible();
    expect((await ownerContext.request.get(oldImageUrl)).status()).toBe(404);
    await acknowledge();
    for (const next of [
      "scope_authority_review",
      "assessment",
      "instructions_agreed",
      "preparing",
      "marketing",
    ]) {
      await page.goto(continuity);
      const stage = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Record stage change", exact: true }) });
      await stage.getByLabel("Next stage", { exact: true }).selectOption(next);
      await stage
        .getByLabel("Reason", { exact: true })
        .fill("Reviewed exact instructions and current owner preview acknowledgment.");
      await stage.getByRole("button", { name: "Record stage change", exact: true }).click();
      await recorded(page);
    }
    expect(
      (await db.select().from(schema.cases).where(eq(schema.cases.id, f.caseId)))[0]?.stage,
    ).toBe("marketing");
    expect(
      await db
        .select()
        .from(schema.currentPublications)
        .where(eq(schema.currentPublications.listingId, f.listingId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(schema.approvals)
        .where(
          and(
            eq(schema.approvals.kind, "owner_acknowledgment"),
            eq(schema.approvals.subjectId, f.revisionId),
          ),
        ),
    ).toHaveLength(2);
    await owner.screenshot({ path: testInfo.outputPath("owner-preview.png"), fullPage: true });
    await db
      .update(schema.propertyRelationships)
      .set({ revokedAt: new Date() })
      .where(eq(schema.propertyRelationships.propertyId, f.propertyId));
    expect((await ownerContext.request.get(preview)).status()).toBe(404);
    expect((await ownerContext.request.get(oldImageUrl)).status()).toBe(404);
  } finally {
    await ownerContext.close();
  }
});
