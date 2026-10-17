// Synthetic browser workflow: inventory draft, immutable review, translation, blocked publication.
// Identity ceremonies have their own suite; these fixtures seed valid sessions only in this
// run's disposable database. They never stand in for live acceptance or launch evidence.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { type BrowserContext, expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostUrl, origins } from "./hosts";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("Work browser tests require the generated disposable database.");
const connection = postgres(databaseUrl, { max: 2 });
const db = drizzle(connection, { schema });
test.afterAll(async () => {
  await connection.end();
});

async function staffSession(context: BrowserContext) {
  const name = `Inventory reviewer ${randomUUID().slice(0, 8)}`;
  const [party] = await db
    .insert(schema.parties)
    .values({ kind: "person", displayName: name })
    .returning();
  if (!party) throw new Error("Party fixture missing");
  const [principal] = await db
    .insert(schema.principals)
    .values({
      partyId: party.id,
      kind: "staff",
      issuer: "urn:ms-realty:staff",
      subject: randomUUID(),
      email: `${randomUUID()}@example.test`,
      displayName: name,
    })
    .returning();
  if (!principal) throw new Error("Principal fixture missing");
  await db.insert(schema.staffMemberships).values({ principalId: principal.id });
  await db.insert(schema.grants).values({
    principalId: principal.id,
    role: "assigned_broker",
    reason: "Isolated work journey fixture",
  });
  await db.insert(schema.grants).values(
    ["content_editor", "publishing_approver", "translation_reviewer"].map((role) => ({
      principalId: principal.id,
      role: role as "content_editor" | "publishing_approver" | "translation_reviewer",
      reason: "Synthetic inventory journey",
    })),
  );
  await db.insert(schema.passkeys).values(
    [0, 1].map(() => ({
      principalId: principal.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.sessions).values({
    principalKind: "staff",
    principalId: principal.id,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(Date.now() + 3600000),
    lastSeenAt: new Date(),
    reverifiedAt: new Date(),
  });
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
  return principal;
}

test.use({ javaScriptEnabled: false });
test("O12/O16 native decisions retain drafts and operation identity with mobile section recovery", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await staffSession(context);
  await page.goto(hostUrl("staff", "/en/inventory/new"));
  await page.getByLabel("Region", { exact: true }).fill("Благоевград");
  await page.getByLabel("Settlement", { exact: true }).fill("Сандански");
  await page
    .getByLabel("Bulgarian title", { exact: true })
    .fill(`Синтетична обява ${randomUUID().slice(0, 8)}`);
  await page
    .getByLabel("Bulgarian description", { exact: true })
    .fill("Измислено описание само за тест.");
  await page
    .getByLabel("Source or evidence reference", { exact: true })
    .fill("synthetic-source-record");
  await page.getByLabel("Price status", { exact: true }).selectOption("known");
  await page.getByLabel("Price in EUR", { exact: true }).fill("95000.03");
  await page.getByLabel("Area status", { exact: true }).selectOption("known");
  await page.getByLabel("Area in m²", { exact: true }).fill("74.5");
  await page.getByRole("button", { name: "New listing", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Draft saved", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open listing", exact: true }).click();
  const reference = page.url().split("/").pop() ?? "";
  expect(reference).toMatch(/^MS-\d+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Edit listing" })).toBeVisible();
  // Without JavaScript, leaving the editor is a submit control (UX 03.3); unchanged → goes on.
  await page.getByRole("button", { name: "Review for publication", exact: true }).click();
  await expect(page.getByText("No publication has been activated.")).toBeVisible();
  await page.getByRole("button", { name: "Freeze review candidate", exact: true }).click();
  await expect(page.getByText("The action was recorded.")).toBeVisible();
  await page.getByRole("link", { name: "Open listing", exact: true }).click();
  await expect(page).toHaveURL(/#inventory-draft$/);
  await expect(page.getByRole("heading", { name: "Working draft", exact: true })).toBeInViewport();
  const sections = page.getByRole("navigation", { name: "Listing sections", exact: true });
  await sections.getByRole("link", { name: "Review and publication", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review and publication", exact: true }),
  ).toBeInViewport();
  const factual = page.locator('[data-inventory-decision="facts"]');
  const factualKey = await factual.locator('input[name="_operationId"]').inputValue();
  const reviewNote = "Synthetic exact source review retained through native validation.";
  await factual.getByLabel("Review scope or reason", { exact: true }).fill(reviewNote);
  // noValidate deliberately reaches server validation with the explicit confirmation missing.
  await factual.getByRole("button", { name: "Approve factual revision", exact: true }).click();
  const summary = factual.getByRole("region", { name: "Check the form", exact: true });
  await expect(summary).toBeVisible();
  await expect(factual.getByLabel("Review scope or reason", { exact: true })).toHaveValue(
    reviewNote,
  );
  await expect(factual.locator('input[name="_operationId"]')).toHaveValue(factualKey);
  await expect(
    page
      .locator('[data-inventory-decision="availability"]')
      .getByLabel("Review scope or reason", { exact: true }),
  ).toHaveValue("");
  await expect(
    page
      .locator('[data-inventory-decision="submit"]')
      .getByRole("region", { name: "Check the form", exact: true }),
  ).toHaveCount(0);
  expect(
    await db
      .select()
      .from(schema.operations)
      .where(eq(schema.operations.idempotencyKey, factualKey)),
  ).toHaveLength(0);
  const checkboxId = await factual.getByRole("checkbox").getAttribute("id");
  await summary.getByRole("link").click();
  await expect(factual.getByRole("checkbox")).toBeInViewport();
  expect(decodeURIComponent(new URL(page.url()).hash)).toBe(`#${checkboxId}`);
  await factual.getByRole("checkbox").check();
  await factual.getByRole("button", { name: "Approve factual revision", exact: true }).click();
  await expect(page.getByText("The action was recorded.", { exact: true })).toBeVisible();
  expect(
    await db
      .select({ status: schema.operations.status })
      .from(schema.operations)
      .where(eq(schema.operations.idempotencyKey, factualKey)),
  ).toEqual([{ status: "succeeded" }]);
  await page.getByRole("link", { name: "Open listing", exact: true }).click();
  await expect(page).toHaveURL(/#inventory-review$/);
  await expect(
    page.getByRole("heading", { name: "Review and publication", exact: true }),
  ).toBeInViewport();
  for (const label of ["Submit editorial review", "Approve source revision"]) {
    const form = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: label, exact: true }) });
    await form
      .getByLabel("Review scope or reason", { exact: true })
      .fill("Synthetic source values checked, no real listing approval.");
    await form.getByRole("checkbox").check();
    await form.getByRole("button", { name: label, exact: true }).click();
    await expect(page.getByText("The action was recorded.")).toBeVisible();
    await page.getByRole("link", { name: "Open listing", exact: true }).click();
  }
  await page
    .getByRole("navigation", { name: "Translations", exact: true })
    .getByRole("link", { name: "EN", exact: true })
    .click();
  await page.getByLabel("Translated title", { exact: true }).fill("Synthetic English listing");
  await page
    .getByLabel("Translated description", { exact: true })
    .fill("Synthetic translation for an automated browser test.");
  await page.getByRole("button", { name: "Apply selected action", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Translation action recorded", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Return to translation", exact: true }).click();
  for (const intent of ["submit", "approve"]) {
    await page.getByLabel("Action", { exact: true }).selectOption(intent);
    await page
      .getByLabel("Review note", { exact: true })
      .fill("Compared exact source facts in this synthetic test.");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Apply selected action", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Translation action recorded", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Return to translation", exact: true }).click();
  }
  await expect(
    page.getByText(
      "This language version is approved. Create a new source revision to replace it.",
    ),
  ).toBeVisible();
  await page.goto(hostUrl("staff", `/en/inventory/${reference}?tab=review`));
  await sections.getByRole("link", { name: "Review and publication", exact: true }).click();
  const release = page.locator('[data-inventory-decision="prepare"]');
  const releaseKey = await release.locator('input[name="_operationId"]').inputValue();
  await release.getByLabel("Publication language", { exact: true }).selectOption("en");
  await release
    .getByLabel("Review scope or reason", { exact: true })
    .fill("Synthetic attempt without media or consent evidence");
  await release.getByRole("checkbox").check();
  await release.getByRole("button", { name: "Prepare publication", exact: true }).click();
  await expect(
    release.getByText("Current reviewed seller permission for these exact terms is required.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(release.getByLabel("Review scope or reason", { exact: true })).toHaveValue(
    "Synthetic attempt without media or consent evidence",
  );
  await expect(release.getByRole("checkbox")).toBeChecked();
  await expect(release.getByLabel("Publication language", { exact: true })).toHaveValue("en");
  await expect(release.locator('input[name="_operationId"]')).toHaveValue(releaseKey);
  await expect(
    release.getByRole("link", { name: "Review seller evidence", exact: true }),
  ).toHaveAttribute("href", `/en/inventory/${reference}/evidence`);
  await expect(
    release.getByRole("link", { name: "Operation receipt", exact: true }),
  ).toHaveAttribute("href", `/en/inventory/operations/${releaseKey}?reference=${reference}`);
  await expect(
    release.getByRole("button", { name: "Prepare publication", exact: true }),
  ).toHaveCount(0);
  expect(
    await db
      .select({ status: schema.operations.status })
      .from(schema.operations)
      .where(eq(schema.operations.idempotencyKey, releaseKey)),
  ).toEqual([{ status: "failed" }]);
  await page
    .locator("#inventory-review")
    .getByRole("link", { name: "Back to listing sections", exact: true })
    .click();
  await expect(sections).toBeInViewport();
  await sections.getByRole("link", { name: "Working draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Working draft", exact: true })).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
  const [listing] = await db
    .select()
    .from(schema.listings)
    .where(eq(schema.listings.reference, reference));
  if (!listing) throw new Error("No listing was recorded");
  expect(
    await db
      .select()
      .from(schema.currentPublications)
      .where(eq(schema.currentPublications.listingId, listing.id)),
  ).toHaveLength(0);
  await page.screenshot({
    path: test.info().outputPath("inventory-reviewed-blocked.png"),
    fullPage: true,
  });
  await context.close();
});
