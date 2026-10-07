// O16: review for publication shows the candidate, the BG working preview and the required
// human approvals as recorded status (never boxes to tick), says whether publishing is blocked,
// and keeps every decision on its own form. Real PostgreSQL, synthetic records.
import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostUrl, origins } from "./hosts";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("Listing review browser tests require the generated disposable database.");
const connection = postgres(databaseUrl, { max: 2 });
const db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());

type Seed = {
  reference: string;
  listingId: string;
  brokerId: string;
  blank: { reference: string };
  bgn: { reference: string };
  twoAreas: { reference: string };
  token: string;
  /** A translation reviewer: may review, may not publish. */
  readerToken: string;
};
function seed(): Seed {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "e2e/support/listing-edit-seed.ts"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          AUTH_SECRET: process.env.E2E_AUTH_SECRET,
          DATABASE_URL: process.env.E2E_DATABASE_URL,
        },
      },
    ).trim(),
  );
}
async function open(page: Page, f: Seed, path: string, token = f.token) {
  await page.context().addCookies([
    {
      name: "msr_staff_session",
      value: token,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto(hostUrl("staff", path));
}

for (const javaScriptEnabled of [false, true])
  test.describe(`JavaScript ${javaScriptEnabled ? "on" : "off"}`, () => {
    test.use({ javaScriptEnabled });

    test("O16 shows a published candidate with its approvals as status", async ({ page }) => {
      const f = seed();
      await open(page, f, `/en/inventory/${f.reference}?tab=review`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Review for publication" }),
      ).toBeVisible();
      const candidate = page.getByRole("region", { name: "Publication candidate" });
      await expect(candidate).toContainText("Public version: BG");
      await expect(candidate).toContainText("Approved version 1 · Bulgarian");
      await expect(
        page.getByText(`Current content from the editor · ${f.reference}`),
      ).toBeVisible();
      await expect(
        page.getByText(`${f.reference} · Photo 1 of 1 · Original listing photo`),
      ).toBeVisible();
      // Approvals are status rows: no checkbox the reviewer could tick to fake one.
      const approvals = page.getByRole("region", { name: /approvals/i });
      await expect(approvals.getByRole("checkbox")).toHaveCount(0);
      await expect(
        approvals.getByRole("listitem").filter({ hasText: "Facts are reviewed" }),
      ).toContainText("Done");
      await expect(page.getByRole("link", { name: "Edit the text manually" })).toHaveAttribute(
        "href",
        `/en/inventory/${f.reference}`,
      );
      // The decisions stay on their own forms below.
      await expect(page.locator('[data-inventory-decision="restrict"]')).toBeVisible();
    });

    test("O16 keeps publishing blocked while approvals are missing", async ({ page }) => {
      const f = seed();
      await open(page, f, `/en/inventory/${f.blank.reference}?tab=review`);
      await expect(
        page.getByText("Publishing stays blocked until every human approval is in place."),
      ).toBeVisible();
      await expect(page.getByText("Public version: none confirmed")).toBeVisible();
      const missing = page
        .getByRole("region", { name: "Required approvals" })
        .getByRole("listitem")
        .filter({ hasText: "Missing" });
      expect(await missing.count()).toBeGreaterThan(0);
      await page.getByRole("link", { name: "Review the missing approvals" }).click();
      await expect(page.getByRole("navigation", { name: "Listing sections" })).toBeInViewport();
    });
  });

test("O16 publishes the exact package through its decision and shows the result", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const f = seed();
  await open(page, f, `/en/inventory/${f.reference}?tab=review`);
  await expect(
    page.getByText("The exact candidate is eligible for a publication decision.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Go to the publication decision" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Publication decision · BG" }),
  ).toBeVisible();
  await expect(page.getByText("Publishing actor")).toBeVisible();
  // The package's own recorded decisions name who decided them, as today's directory names them.
  await expect(page.getByText("Factual approval", { exact: true })).toBeVisible();
  await expect(page.getByText("Editorial approval", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Test Staff (name as in the directory now)", { exact: false }),
  ).toHaveCount(2);
  await expect(page.getByText("Butler cannot publish.", { exact: false })).toBeVisible();
  const decision = page.locator('[data-inventory-decision="activate"]');
  // 642:12654: the scope names this package and host; the card's own words, then publish.
  await expect(decision.getByLabel("Decision scope", { exact: true })).toHaveValue(
    /^Publish the BG package for /,
  );
  await decision
    .getByRole("checkbox", { name: "I reviewed exactly this package and the stated scope." })
    .check();
  await expect(decision.getByRole("link", { name: "Cancel", exact: true })).toBeVisible();
  await decision.getByRole("button", { name: "Publish the package", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "The listing is published" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the public page" })).toHaveAttribute(
    "href",
    new RegExp(`/bg/properties/${f.reference}/`),
  );
  // Expired seller consent hides the page while the pointer stays active: the receipt follows
  // the public read, not the pointer.
  const receipt = page.url();
  await db
    .update(schema.sellerInstructions)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(schema.sellerInstructions.listingId, f.listingId));
  await page.goto(receipt);
  await expect(page.getByRole("heading", { level: 1, name: "Activation recorded" })).toBeVisible();
  await expect(
    page.getByText("now: not shown publicly, the publication conditions are no longer met"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the public page" })).toHaveCount(0);
  await db
    .update(schema.sellerInstructions)
    .set({ expiresAt: null })
    .where(eq(schema.sellerInstructions.listingId, f.listingId));
  await page.goto(receipt);
  await expect(
    page.getByRole("heading", { level: 1, name: "The listing is published" }),
  ).toBeVisible();
  // After a later withdrawal the same receipt no longer claims the page is published.
  await db
    .update(schema.currentPublications)
    .set({ state: "withdrawn", reason: "Synthetic withdrawal after the activation." })
    .where(eq(schema.currentPublications.listingId, f.listingId));
  await page.goto(receipt);
  await expect(page.getByRole("heading", { level: 1, name: "Activation recorded" })).toBeVisible();
  await expect(
    page.getByText("The public page no longer shows this package", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the public page" })).toHaveCount(0);
  // The result is this actor's own activation; a made-up id shows the review instead.
  await open(page, f, `/en/inventory/${f.reference}?tab=review&published=${crypto.randomUUID()}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Review for publication" }),
  ).toBeVisible();
});

test("O16 names the approved version it publishes, apart from a newer review version", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const f = seed();
  await open(page, f, `/en/inventory/${f.reference}?tab=review`);
  // Freeze a newer review version: the approved one stays the publishing subject.
  await page.getByRole("button", { name: "Freeze review candidate", exact: true }).click();
  await expect(page.getByText("The action was recorded.")).toBeVisible();
  await open(page, f, `/en/inventory/${f.reference}?tab=review`);
  const candidate = page.getByRole("region", { name: "Publication candidate" });
  await expect(candidate).toContainText("Approved version 1 · Bulgarian");
  await expect(candidate).toContainText(
    "Review version 2 is not approved yet; publishing still uses approved version 1.",
  );
  await expect(page.getByRole("region", { name: "Approvals for version 1" })).toBeVisible();
});

test("O16 keeps recorded currency and every area basis as recorded", async ({ page }) => {
  const f = seed();
  await open(page, f, `/en/inventory/${f.bgn.reference}?tab=review`);
  const before = page.getByRole("complementary", { name: "Before you decide" });
  await expect(before).toContainText("BGN");
  await expect(before).not.toContainText("€");
  await open(page, f, `/en/inventory/${f.twoAreas.reference}?tab=review`);
  await expect(before).toContainText("Living area 68 m²");
  await expect(before).toContainText("Land area 450 m²");
});

test("O16 shows an unconfirmed activation as still being checked, then its result", async ({
  page,
}) => {
  const f = seed();
  const key = crypto.randomUUID();
  await db.insert(schema.operations).values({
    actorKind: "staff",
    actorId: f.brokerId,
    operationType: "publication.activate",
    idempotencyKey: key,
    requestHash: "synthetic-unconfirmed-activation",
    status: "outcome_unknown",
  });
  await open(page, f, `/en/inventory/operations/${key}?reference=${f.reference}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Activation is still being checked" }),
  ).toBeVisible();
  await expect(page.getByText("Not published automatically")).toBeVisible();
  // The address names context only: the candidate is not claimed for a pending request.
  await expect(page.getByText("Known once the result is confirmed")).toBeVisible();
  await expect(page.getByText("published", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Review the exception" })).toHaveAttribute(
    "href",
    `/en/inventory/${f.reference}?tab=review`,
  );
  // Once the same request is confirmed, checking again opens the published result.
  const [manifest] = await db
    .select({ id: schema.publicationManifests.id })
    .from(schema.publicationManifests)
    .where(eq(schema.publicationManifests.listingId, f.listingId))
    .limit(1);
  await db
    .update(schema.operations)
    .set({
      status: "succeeded",
      outcome: { reference: f.reference, locale: "bg", manifestId: manifest?.id },
      completedAt: new Date(),
    })
    .where(eq(schema.operations.idempotencyKey, key));
  await page.getByRole("link", { name: "Check the publication" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "The listing is published" }),
  ).toBeVisible();
});

test("O16 keeps a rental draft price monthly before any frozen revision", async ({ page }) => {
  const f = seed();
  await open(page, f, "/en/inventory/new");
  await page.getByLabel("Purpose", { exact: true }).selectOption("long_term_rent");
  await page.getByLabel("Region", { exact: true }).fill("Благоевград");
  await page.getByLabel("Settlement", { exact: true }).fill("Сандански");
  await page.getByLabel("Bulgarian title", { exact: true }).fill("Синтетичен наем");
  await page.getByLabel("Bulgarian description", { exact: true }).fill("Синтетичен тест.");
  await page.getByLabel("Source or evidence reference", { exact: true }).fill("synthetic-rent");
  await page.getByLabel("Price status", { exact: true }).selectOption("known");
  await page.getByLabel("Price in EUR", { exact: true }).fill("900");
  await page.getByRole("button", { name: "New listing", exact: true }).click();
  await page.getByRole("link", { name: "Open listing", exact: true }).click();
  await page.goto(`${page.url().split("?")[0]}?tab=review`);
  await expect(page.getByRole("complementary", { name: "Before you decide" })).toContainText(
    "€900 per month",
  );
});

test("O16 offers the publication decision only to someone who may publish", async ({ page }) => {
  const f = seed();
  await open(page, f, `/en/inventory/${f.reference}?tab=review`, f.readerToken);
  await expect(
    page.getByText("The exact candidate is eligible for a publication decision.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("A staff member who may publish takes this decision; you cannot publish."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to the publication decision" })).toHaveCount(0);
});

test("O16 reads before deciding, and the decision stands alone on its canvas", async ({ page }) => {
  const f = seed();
  await open(page, f, `/en/inventory/${f.reference}?tab=review`);
  const before = page.getByRole("heading", { level: 2, name: "Before you decide" });
  const toDecision = page.getByRole("link", { name: "Go to the publication decision" });
  const width = page.viewportSize()?.width ?? 1440;
  const top = async (locator: typeof before) => (await locator.boundingBox())?.y ?? 0;
  if (width < 1024) {
    // Phones: the evidence comes after the preview and before the decision (18:3002).
    expect(await top(before)).toBeLessThan(await top(toDecision));
  }
  if (width < 640) {
    // The phone preview keeps the approved 3:2 frame (350 × 233, 164:14942).
    const box = await page.locator("figure img, figure > div").first().boundingBox();
    expect(Math.abs((box?.width ?? 0) / (box?.height ?? 1) - 1.5)).toBeLessThan(0.05);
  }
  await toDecision.click();
  // The decision is a focused state: no workspace navigation, the logo inside the card.
  await expect(
    page.getByRole("heading", { level: 1, name: "Publication decision · BG" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Workspace" })).toBeHidden();
  await expect(page.locator('[data-focused-state] img[alt="MS Realty"]')).toBeVisible();
});

test("O16PUB scope is a UI06 field that wraps: one 52 px line, 78 px for two on a phone", async ({
  page,
}) => {
  const f = seed();
  await open(page, f, `/en/inventory/${f.reference}?tab=review`);
  await page.getByRole("link", { name: "Go to the publication decision" }).click();
  const scope = page
    .locator('[data-inventory-decision="activate"]')
    .getByLabel("Decision scope", { exact: true });
  await expect(scope).toHaveValue(/^Publish the BG package for /);
  const shown = await scope.evaluate((area) => ({
    height: area.getBoundingClientRect().height,
    hiddenEnd: area.scrollHeight > area.clientHeight,
  }));
  // 642:12654 / 642:12748: the whole value shows, on one line at 1440 and two at 390.
  expect(shown).toEqual({
    height: (page.viewportSize()?.width ?? 1440) < 640 ? 78 : 52,
    hiddenEnd: false,
  });
});

test("O16 keeps BG and RU labels", async ({ page }) => {
  const f = seed();
  for (const [locale, title, approvals] of [
    ["bg", "Преглед за публикуване", /одобрени/i],
    ["ru", "Проверка перед публикацией", /одобрени/i],
  ] as const) {
    await open(page, f, `/${locale}/inventory/${f.reference}?tab=review`);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole("region", { name: approvals })).toBeAttached();
  }
});
