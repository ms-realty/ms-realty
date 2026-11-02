// O13/F23: native navigation retains unsaved photo text, and failed human reviews retain
// evidence without reusing a stale decision or confirmation. Disposable synthetic records.
import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostUrl, origins } from "./hosts";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("Media recovery tests require the generated disposable database.");
const connection = postgres(databaseUrl, { max: 2 });
const db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());
type Seed = { reference: string; listingId: string; relations: string[]; token: string };
function seed(): Seed {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "src/server/media/order-browser-seed.ts"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          AUTH_SECRET: process.env.E2E_AUTH_SECRET,
          DATABASE_URL: databaseUrl,
        },
      },
    ).trim(),
  );
}

test("O13 a lost rejection response reconciles the fresh conflict request without replay", async ({
  page,
  context,
  playwright,
}) => {
  const f = seed();
  const original = await snapshot(f);
  if (!original.asset) throw new Error("Missing fixture asset");
  await openPhoto(page, f, true);
  await fillReview(page);
  const oldKey = await page.locator('input[name="_operationId"]').inputValue();
  await db
    .update(schema.mediaAssets)
    .set({ version: sql`${schema.mediaAssets.version} + 1` })
    .where(eq(schema.mediaAssets.id, original.asset.id));
  await page.getByRole("button", { name: "Approve as a public candidate", exact: true }).click();
  await expect(
    page.getByText(
      "This item changed. Refresh and review the latest version before trying again.",
      { exact: true },
    ),
  ).toBeVisible();
  const requestKey = await page.locator('input[name="_reapplyOperationId"]').inputValue();
  expect(requestKey).not.toBe(oldKey);
  const before = await snapshot(f);
  await page
    .locator("summary")
    .filter({ hasText: /^Reject \/ withdraw public permission$/ })
    .click();

  // Keep the real committed rejection, but lose both response headers and body. An isolated
  // request context prevents response cookies from acknowledging the browser's submission.
  const transport = await playwright.request.newContext({
    storageState: { cookies: await context.cookies(origins.staff), origins: [] },
  });
  let submissions = 0;
  await page.route(
    (target) => target.pathname === `/en/inventory/${f.reference}/media`,
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      submissions += 1;
      const response = await transport.fetch(route.request(), {
        maxRedirects: 0,
        headers: await route.request().allHeaders(),
      });
      expect(response.status()).toBeLessThan(500);
      await route.abort("failed");
    },
  );
  try {
    await page
      .getByRole("button", { name: "Reject / withdraw public permission", exact: true })
      .click();
    const receipt = page.getByRole("link", { name: "Receipt for this request", exact: true });
    await expect(receipt).toBeVisible();
    await expect(receipt).toHaveAttribute(
      "href",
      new RegExp(`operation=${requestKey}&operationType=review$`),
    );
    await expect(receipt).toHaveAttribute("data-form-reconciliation", requestKey);
    await expect(
      page.getByRole("definition").filter({ hasText: /^Synthetic recovered holder$/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("definition").filter({ hasText: /^synthetic-recovered-permission$/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Approve as a public candidate", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Reject / withdraw public permission", exact: true }),
    ).toHaveCount(0);
    const committed = await snapshot(f);
    expect(committed.asset).toMatchObject({
      review: "rejected",
      rights: "rejected",
      audience: "private",
      version: (before.asset?.version ?? 0) + 1,
    });
    expect(committed.publicMedia).toEqual(before.publicMedia);
    const recorded = await db
      .select()
      .from(schema.operations)
      .where(eq(schema.operations.idempotencyKey, requestKey));
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ status: "succeeded", operationType: "media.review" });
    await receipt.click();
    await expect(page.getByRole("status").first()).toContainText("Saved.");
    await page.reload();
    expect(await snapshot(f)).toEqual(committed);
    expect(submissions).toBe(1);
  } finally {
    await transport.dispose();
  }
});

test("O13 Enter in review evidence never selects the concealed Reject action", async ({ page }) => {
  const f = seed();
  const original = await snapshot(f);
  if (!original.asset) throw new Error("Missing fixture asset");
  await db
    .update(schema.mediaAssets)
    .set({ rights: "pending", review: "pending", rightsHolder: null, rightsReference: null })
    .where(eq(schema.mediaAssets.id, original.asset.id));
  const before = await snapshot(f);
  await openPhoto(page, f, true);
  await expect(page.getByRole("link", { name: "Review this photo", exact: true })).toBeVisible();
  await page.getByLabel("Rights holder", { exact: true }).fill("Synthetic entered holder");
  const evidence = page.getByLabel("Rights evidence / permission reference", { exact: true });
  await evidence.fill("synthetic-entered-permission");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === `/en/inventory/${f.reference}/media`,
    ),
    evidence.press("Enter"),
  ]);
  expect(await snapshot(f)).toEqual(before);
  await expect(page.getByRole("link", { name: /private addresses, people/ })).toBeVisible();
  await expect(evidence).toHaveValue("synthetic-entered-permission");
});
async function openPhoto(page: Page, f: Seed, review = false) {
  await page.context().addCookies([
    {
      name: "msr_staff_session",
      value: f.token,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto(
    hostUrl(
      "staff",
      `/en/inventory/${f.reference}/media?photo=${f.relations[0]}${review ? "&panel=review" : ""}`,
    ),
  );
  await expect(page.getByRole("heading", { name: "Photo 1 of 3", exact: true })).toBeVisible();
}
function control(page: Page, name: string) {
  return page
    .getByRole("link", { name, exact: true })
    .or(page.getByRole("button", { name, exact: true }));
}
async function placement(page: Page) {
  await page
    .locator("summary")
    .filter({ hasText: /^Media and order$/ })
    .click();
}
async function snapshot(f: Seed) {
  const placements = await db
    .select()
    .from(schema.mediaRelations)
    .where(eq(schema.mediaRelations.listingId, f.listingId))
    .orderBy(asc(schema.mediaRelations.position));
  const [asset] = await db
    .select()
    .from(schema.mediaAssets)
    .where(eq(schema.mediaAssets.id, placements[0]?.mediaAssetId ?? ""));
  const publicMedia = await db
    .select({ media: schema.publicationManifests.media })
    .from(schema.publicationManifests)
    .where(eq(schema.publicationManifests.listingId, f.listingId));
  return { placements, asset, publicMedia };
}
async function fillReview(page: Page) {
  await page.getByLabel("Rights holder", { exact: true }).fill("Synthetic recovered holder");
  await page
    .getByLabel("Rights evidence / permission reference", { exact: true })
    .fill("synthetic-recovered-permission");
  await page.getByRole("checkbox", { name: /private addresses, people/ }).check();
  await page.getByRole("checkbox", { name: /usage rights and permission/ }).check();
}

for (const javaScriptEnabled of [false, true]) {
  test.describe(`JavaScript ${javaScriptEnabled ? "on" : "off"}`, () => {
    test.use({ javaScriptEnabled });
    for (const destination of ["photo", "move", "visibility", "position"]) {
      test(`O13 keeps unsaved photo details before ${destination}`, async ({ page }) => {
        const f = seed();
        const before = await snapshot(f);
        await openPhoto(page, f);
        await page.getByLabel("Visible caption", { exact: true }).fill("Synthetic unsaved caption");
        if (destination === "photo") await control(page, "Show photo 2").click();
        else {
          await placement(page);
          if (destination === "move") await control(page, "Move down").click();
          else if (destination === "visibility")
            await control(page, "Hide from next gallery").click();
          else {
            await page
              .getByLabel("Place before photo", { exact: true })
              .selectOption(f.relations[2] ?? "");
            await control(page, "Review the new order").click();
          }
        }
        if (javaScriptEnabled) {
          const dialog = page.getByRole("dialog", { name: "Unsaved photo details" });
          await expect(dialog).toBeVisible();
          await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
        } else {
          await expect(
            page.getByRole("link", { name: "Discard and leave", exact: true }),
          ).toBeVisible();
        }
        await expect(page.getByLabel("Visible caption", { exact: true })).toHaveValue(
          "Synthetic unsaved caption",
        );
        expect(await snapshot(f)).toEqual(before);
        await page.getByRole("button", { name: "Save photo details", exact: true }).click();
        await expect(
          page.getByRole("status").filter({ hasText: "Photo draft saved" }),
        ).toBeVisible();
        expect((await snapshot(f)).asset?.detailsDraft?.caption).toBe("Synthetic unsaved caption");
      });
    }

    for (const changedSource of ["text", "bytes"])
      test(`O13 retains review evidence after ${changedSource} conflict and requires a fresh review`, async ({
        page,
      }) => {
        const f = seed();
        const original = await snapshot(f);
        if (!original.asset) throw new Error("Missing fixture asset");
        await db
          .update(schema.mediaAssets)
          .set({ rights: "pending", review: "pending", rightsHolder: null, rightsReference: null })
          .where(eq(schema.mediaAssets.id, original.asset.id));
        await openPhoto(page, f, true);
        await fillReview(page);
        const changed = {
          caption: "Synthetic current caption from another tab",
          altText: "Synthetic current description",
          modification: "none" as const,
          modificationDisclosure: "",
        };
        await db
          .update(schema.mediaAssets)
          .set({
            detailsDraft: changed,
            version: sql`${schema.mediaAssets.version} + 1`,
            ...(changedSource === "bytes"
              ? { sha256: "b".repeat(64), scannedSha256: "b".repeat(64) }
              : {}),
          })
          .where(eq(schema.mediaAssets.id, original.asset.id));
        const before = await snapshot(f);
        await page
          .getByRole("button", { name: "Approve as a public candidate", exact: true })
          .click();
        await expect(
          page.getByText(
            "This item changed. Refresh and review the latest version before trying again.",
            { exact: true },
          ),
        ).toBeVisible();
        await expect(page.getByLabel("Rights holder", { exact: true })).toHaveValue(
          "Synthetic recovered holder",
        );
        await expect(
          page.getByLabel("Rights evidence / permission reference", { exact: true }),
        ).toHaveValue("synthetic-recovered-permission");
        await expect(
          page.getByRole("checkbox", { name: /private addresses, people/ }),
        ).not.toBeChecked();
        await expect(
          page.getByRole("checkbox", { name: /usage rights and permission/ }),
        ).not.toBeChecked();
        await expect(page.getByText(changed.caption, { exact: false }).first()).toBeVisible();
        expect(await snapshot(f)).toEqual(before);
        await test.info().attach("review-conflict-recovery", {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
        // Clicking the fresh decision without new confirmations cannot approve either text or bytes.
        await page
          .getByRole("button", { name: "Approve as a public candidate", exact: true })
          .click();
        await expect(page.getByRole("link", { name: /private addresses, people/ })).toBeVisible();
        await expect(
          page.getByRole("checkbox", { name: /private addresses, people/ }),
        ).not.toBeChecked();
        await expect(page.getByLabel("Rights holder", { exact: true })).toHaveValue(
          "Synthetic recovered holder",
        );
        expect(await snapshot(f)).toEqual(before);
        await fillReview(page);
        await page
          .getByRole("button", { name: "Approve as a public candidate", exact: true })
          .click();
        await expect(page.getByRole("status").first()).toContainText("Saved.");
        const saved = await snapshot(f);
        expect(saved.asset).toMatchObject({
          caption: changed.caption,
          altText: changed.altText,
          detailsDraft: null,
          rightsHolder: "Synthetic recovered holder",
          rightsReference: "synthetic-recovered-permission",
          review: "approved",
          version: (before.asset?.version ?? 0) + 1,
        });
        expect(saved.publicMedia).toEqual(before.publicMedia);
        await page.reload();
        expect(await snapshot(f)).toEqual(saved);
      });

    test("O13 keeps unsaved rights evidence when leaving the review", async ({ page }) => {
      const f = seed();
      const original = await snapshot(f);
      if (!original.asset) throw new Error("Missing fixture asset");
      await db
        .update(schema.mediaAssets)
        .set({ rights: "pending", rightsHolder: null, rightsReference: null })
        .where(eq(schema.mediaAssets.id, original.asset.id));
      const before = await snapshot(f);
      await openPhoto(page, f, true);
      await fillReview(page);
      await control(page, "Show photo 2").click();
      if (javaScriptEnabled) {
        const dialog = page.getByRole("dialog", { name: "Unsaved photo details" });
        await expect(dialog).toBeVisible();
        await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
      } else
        await expect(
          page.getByRole("link", { name: "Discard and leave", exact: true }),
        ).toBeVisible();
      await expect(page.getByLabel("Rights holder", { exact: true })).toHaveValue(
        "Synthetic recovered holder",
      );
      await expect(
        page.getByLabel("Rights evidence / permission reference", { exact: true }),
      ).toHaveValue("synthetic-recovered-permission");
      expect(await snapshot(f)).toEqual(before);
    });

    test("O13 explicitly rejects the current photo after a review conflict", async ({ page }) => {
      const f = seed();
      const original = await snapshot(f);
      if (!original.asset) throw new Error("Missing fixture asset");
      await openPhoto(page, f, true);
      await fillReview(page);
      await db
        .update(schema.mediaAssets)
        .set({ version: sql`${schema.mediaAssets.version} + 1` })
        .where(eq(schema.mediaAssets.id, original.asset.id));
      await page
        .getByRole("button", { name: "Approve as a public candidate", exact: true })
        .click();
      await expect(
        page.getByText(
          "This item changed. Refresh and review the latest version before trying again.",
          { exact: true },
        ),
      ).toBeVisible();
      const before = await snapshot(f);
      await page
        .locator("summary")
        .filter({ hasText: /^Reject \/ withdraw public permission$/ })
        .click();
      await page
        .getByRole("button", { name: "Reject / withdraw public permission", exact: true })
        .click();
      await expect(page.getByRole("status").first()).toContainText("Saved.");
      const rejected = await snapshot(f);
      expect(rejected.asset).toMatchObject({
        review: "rejected",
        rights: "rejected",
        audience: "private",
        version: (before.asset?.version ?? 0) + 1,
      });
      expect(rejected.publicMedia).toEqual(before.publicMedia);
    });

    test("O13 native placement and navigation still complete when the editor is unchanged", async ({
      page,
    }) => {
      const f = seed();
      await openPhoto(page, f);
      await placement(page);
      await control(page, "Hide from next gallery").click();
      await expect(page.getByRole("status").first()).toContainText("Saved.");
      expect((await snapshot(f)).placements[0]?.hidden).toBe(true);
      await control(page, "Show photo 2").click();
      await expect(page.getByRole("heading", { name: "Photo 2 of 3", exact: true })).toBeVisible();
      await placement(page);
      await control(page, "Move down").click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Review the new order" }),
      ).toBeVisible();
    });
  });
}
