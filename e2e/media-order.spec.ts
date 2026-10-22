// O13/W08-T2: a staged photo move writes nothing until Save, Cancel leaves the order alone,
// Save records one version-checked move with a saved-order receipt, a stale review reports a
// conflict, and the active public manifest keeps its order. Receipts read back their own
// recorded order, target photo and listing. Real PostgreSQL, synthetic records.
import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostUrl, origins } from "./hosts";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("Media order browser tests require the generated disposable database.");
const connection = postgres(databaseUrl, { max: 2 });
const db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());

type Listing = { reference: string; listingId: string; relations: string[] };
type Seed = Listing & { token: string; other: Listing };
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

async function workingOrder(listingId: string) {
  const rows = await db
    .select({ id: schema.mediaRelations.id })
    .from(schema.mediaRelations)
    .where(eq(schema.mediaRelations.listingId, listingId))
    .orderBy(asc(schema.mediaRelations.position));
  return rows.map(({ id }) => id);
}
async function listingVersion(listingId: string) {
  const [row] = await db
    .select({ version: schema.listings.version })
    .from(schema.listings)
    .where(eq(schema.listings.id, listingId));
  return row?.version;
}
async function publicMedia(listingId: string) {
  const rows = await db
    .select({ media: schema.publicationManifests.media })
    .from(schema.publicationManifests)
    .where(eq(schema.publicationManifests.listingId, listingId));
  return JSON.stringify(rows.map(({ media }) => media));
}

async function openGallery(page: Page, f: Seed) {
  await page.context().addCookies([
    {
      name: "msr_staff_session",
      value: f.token,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto(hostUrl("staff", `/en/inventory/${f.reference}/media`));
  await expect(page.getByRole("heading", { level: 1, name: "Photos" })).toBeVisible();
}

async function openPlacement(page: Page) {
  const summary = page.locator("summary").filter({ hasText: /^Media and order$/ });
  if ((await summary.locator("..").getAttribute("open")) === null) await summary.click();
}
async function openMedia(page: Page, f: Seed) {
  await openGallery(page, f);
  await expect(page.getByRole("heading", { name: `Photo 1 of 3` })).toHaveCount(0);
  await page.getByRole("link", { name: "Show photo 1", exact: true }).click();
  await openPlacement(page);
}
async function openPhotoReview(page: Page, javaScriptEnabled = true) {
  await page
    .getByRole(javaScriptEnabled ? "link" : "button", { name: "Review this photo", exact: true })
    .click();
}

for (const javaScriptEnabled of [false, true])
  test.describe(`JavaScript ${javaScriptEnabled ? "on" : "off"}`, () => {
    test.use({ javaScriptEnabled });

    test("O13 stages a move, cancels, saves with a receipt and leaves the public order", async ({
      page,
    }) => {
      test.setTimeout(90_000);
      const f = seed();
      const [first, second, third] = f.relations;
      const version = await listingVersion(f.listingId);
      const published = await publicMedia(f.listingId);
      await openMedia(page, f);
      await expect(page.getByRole("button", { name: "Already the first photo" })).toBeDisabled();
      await expect(page.getByRole("heading", { name: `Photo 1 of 3` })).toBeVisible();

      // Staging is a read: the review shows before/proposal and nothing is written.
      await openPlacement(page);
      await page.getByRole("link", { name: "Move down", exact: true }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Review the new order" }),
      ).toBeVisible();
      await expect(page.getByText("Photo 1 moves one place down.", { exact: false })).toBeVisible();
      const facts = page.locator("dl").first();
      await expect(facts.getByText("1, 2, 3", { exact: true })).toBeVisible();
      await expect(facts.getByText("2, 1, 3", { exact: true })).toBeVisible();
      await expect(page.getByText("Before · cover 1", { exact: true })).toBeVisible();
      await expect(page.getByText("After · cover 2", { exact: true })).toBeVisible();
      expect(await workingOrder(f.listingId)).toEqual([first, second, third]);

      await page.getByRole("link", { name: "Cancel", exact: true }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Photo 1 of 3", exact: true }),
      ).toBeVisible();
      expect(await workingOrder(f.listingId)).toEqual([first, second, third]);
      expect(await listingVersion(f.listingId)).toBe(version);

      await openPlacement(page);
      await page.getByRole("link", { name: "Move down", exact: true }).click();
      await page.getByRole("button", { name: "Save the order", exact: true }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "The new order is saved" }),
      ).toBeVisible();
      await expect(page.getByRole("status")).toContainText(
        `${f.reference} · New photo order: 2, 1, 3. The public listing has not changed.`,
      );
      expect(await workingOrder(f.listingId)).toEqual([second, first, third]);
      expect(await listingVersion(f.listingId)).toBe((version ?? 0) + 1);
      expect(await publicMedia(f.listingId)).toBe(published);

      // A reload of the receipt does not repeat the move.
      await page.reload();
      await expect(
        page.getByRole("heading", { level: 1, name: "The new order is saved" }),
      ).toBeVisible();
      expect(await workingOrder(f.listingId)).toEqual([second, first, third]);

      await page.getByRole("link", { name: "Back to the current task", exact: true }).click();
      await expect(page.getByRole("heading", { name: `Photo 2 of 3` })).toBeVisible();

      // A review prepared before another change reports a conflict and writes nothing.
      await openPlacement(page);
      await page.getByRole("link", { name: "Move down", exact: true }).click();
      await db
        .update(schema.listings)
        .set({ version: (version ?? 0) + 2 })
        .where(eq(schema.listings.id, f.listingId));
      await page.getByRole("button", { name: "Save the order", exact: true }).click();
      // Next's route announcer is also an alert; match the notice by its text.
      await expect(page.getByRole("alert").filter({ hasText: "This item changed." })).toContainText(
        "This item changed. Refresh and review the latest version before trying again.",
      );
      expect(await workingOrder(f.listingId)).toEqual([second, first, third]);
    });

    test("O13 receipts read back their own order, photo, cover and listing", async ({ page }) => {
      test.setTimeout(90_000);
      const f = seed();
      const [first, second, third] = f.relations;
      const heading = (n: number) => page.getByRole("heading", { name: `Photo ${n} of 3` });
      await openMedia(page, f);

      // Save A (1 ↓), then save B (1 ↓ again): A's receipt still states A's recorded order.
      await openPlacement(page);
      await page.getByRole("link", { name: "Move down", exact: true }).click();
      await page.getByRole("button", { name: "Save the order", exact: true }).click();
      await expect(page.getByRole("status")).toContainText("New photo order: 2, 1, 3.");
      const receiptA = page.url();
      // A text-only draft save moves the listing version but not the photo order: the old
      // receipt must not claim the order changed (same effect as saveListingDraft).
      const [{ version: afterA } = { version: 0 }] = await db
        .select({ version: schema.listings.version })
        .from(schema.listings)
        .where(eq(schema.listings.id, f.listingId));
      await db
        .update(schema.listings)
        .set({ version: afterA + 1 })
        .where(eq(schema.listings.id, f.listingId));
      await page.reload();
      await expect(page.getByRole("status")).toContainText("New photo order: 2, 1, 3.");
      await expect(page.getByText("The order has changed since this save.")).toHaveCount(0);
      await page.getByRole("link", { name: "Back to the current task", exact: true }).click();
      await expect(heading(2)).toBeVisible();
      await openPlacement(page);
      await page.getByRole("link", { name: "Move down", exact: true }).click();
      await page.getByRole("button", { name: "Save the order", exact: true }).click();
      await expect(page.getByRole("status")).toContainText("New photo order: 1, 3, 2.");
      expect(await workingOrder(f.listingId)).toEqual([second, third, first]);
      await page.goto(receiptA);
      await expect(page.getByRole("status")).toContainText("New photo order: 2, 1, 3.");
      await expect(
        page.getByText(
          "The order has changed since this save. The gallery shows the current order.",
        ),
      ).toBeVisible();

      // Hide/show readback keeps the photo it changed, not photo 1.
      await page.goto(hostUrl("staff", `/en/inventory/${f.reference}/media?photo=${third}`));
      await expect(heading(2)).toBeVisible();
      await openPlacement(page);
      await page.getByRole("button", { name: "Hide from next gallery", exact: true }).click();
      await expect(page.getByRole("status").first()).toContainText("Saved.");
      await expect(heading(2)).toBeVisible();
      await openPlacement(page);
      await expect(
        page.getByRole("button", { name: "Include in next gallery", exact: true }),
      ).toBeVisible();

      // A failed command keeps its photo selected too.
      const [{ version } = { version: 0 }] = await db
        .select({ version: schema.listings.version })
        .from(schema.listings)
        .where(eq(schema.listings.id, f.listingId));
      await db
        .update(schema.listings)
        .set({ version: version + 1 })
        .where(eq(schema.listings.id, f.listingId));
      await openPlacement(page);
      await page.getByRole("button", { name: "Include in next gallery", exact: true }).click();
      await expect(page.getByRole("alert").filter({ hasText: "This item changed." })).toBeVisible();
      await expect(heading(2)).toBeVisible();

      // The cover comparison uses the first photo that is not hidden: with photo 1 (second)
      // hidden, moving photo 2 (third) down makes photo 3 (first) the next cover.
      await page.goto(hostUrl("staff", `/en/inventory/${f.reference}/media?photo=${third}`));
      await openPlacement(page);
      await page.getByRole("button", { name: "Include in next gallery", exact: true }).click();
      await expect(heading(2)).toBeVisible();
      await page.goto(hostUrl("staff", `/en/inventory/${f.reference}/media?photo=${second}`));
      await openPlacement(page);
      await page.getByRole("button", { name: "Hide from next gallery", exact: true }).click();
      await expect(heading(1)).toBeVisible();
      await page.goto(hostUrl("staff", `/en/inventory/${f.reference}/media?photo=${third}`));
      await openPlacement(page);
      await page.getByRole("link", { name: "Move down", exact: true }).click();
      await expect(page.getByText("Before · cover 2", { exact: true })).toBeVisible();
      await expect(page.getByText("After · cover 3", { exact: true })).toBeVisible();
      expect(await workingOrder(f.listingId)).toEqual([second, third, first]);

      // A receipt from another listing of the same broker says nothing on this one.
      const foreign = new URL(receiptA).searchParams.get("saved") ?? "";
      await page.goto(
        hostUrl(
          "staff",
          `/en/inventory/${f.other.reference}/media?photo=${f.other.relations[0]}&saved=${foreign}`,
        ),
      );
      await expect(
        page.getByRole("heading", { level: 1, name: "Photo 1 of 3", exact: true }),
      ).toBeVisible();
      await expect(page.getByText("Saved.", { exact: false })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: `Photo 1 of 3` })).toBeVisible();
      expect(await workingOrder(f.other.listingId)).toEqual(f.other.relations);
    });

    test("O13 arbitrary position is staged and saved once without publishing", async ({ page }) => {
      const f = seed();
      const [first, second, third] = f.relations;
      const version = await listingVersion(f.listingId);
      const published = await publicMedia(f.listingId);
      await openMedia(page, f);
      await page.getByRole("link", { name: "Show photo 3", exact: true }).click();
      await openPlacement(page);
      await page.getByLabel("Place before photo", { exact: true }).selectOption(first ?? "");
      await page.getByRole("button", { name: "Review the new order", exact: true }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Review the new order" }),
      ).toBeVisible();
      await expect(page.locator("dl").getByText("3, 1, 2", { exact: true })).toBeVisible();
      expect(await workingOrder(f.listingId)).toEqual(f.relations);
      await page.getByRole("button", { name: "Save the order", exact: true }).click();
      await expect(page.getByRole("status")).toContainText("New photo order: 3, 1, 2.");
      expect(await workingOrder(f.listingId)).toEqual([third, first, second]);
      expect(await listingVersion(f.listingId)).toBe((version ?? 0) + 1);
      expect(await publicMedia(f.listingId)).toBe(published);
    });

    test("O13 saves and discards photo text independently of rights and publication", async ({
      page,
    }) => {
      const f = seed();
      const published = await publicMedia(f.listingId);
      const [original] = await db
        .select({ asset: schema.mediaAssets })
        .from(schema.mediaRelations)
        .innerJoin(
          schema.mediaAssets,
          eq(schema.mediaAssets.id, schema.mediaRelations.mediaAssetId),
        )
        .where(eq(schema.mediaRelations.id, f.relations[0] ?? ""));
      if (!original) throw new Error("Missing fixture photo");
      await openMedia(page, f);
      await expect(page.getByRole("checkbox", { name: /usage rights and permission/ })).toHaveCount(
        0,
      );
      await page.getByLabel("Visible caption", { exact: true }).fill("Synthetic caption draft");
      await page
        .getByLabel("Image description", { exact: true })
        .fill("Synthetic room description");
      await page.getByRole("button", { name: "Save photo details", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: "Photo draft saved" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Photo 1 of 3", exact: true })).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Review saved photo details", exact: true }),
      ).toHaveAttribute("href", /panel=review#photo-review-panel$/);
      await expect(page.getByLabel("Visible caption", { exact: true })).toHaveValue(
        "Synthetic caption draft",
      );
      const [edited] = await db
        .select()
        .from(schema.mediaAssets)
        .where(eq(schema.mediaAssets.id, original.asset.id));
      expect(edited).toMatchObject({
        caption: original.asset.caption,
        altText: original.asset.altText,
        rights: original.asset.rights,
        audience: original.asset.audience,
        review: original.asset.review,
        detailsDraft: { caption: "Synthetic caption draft", altText: "Synthetic room description" },
      });
      expect(await publicMedia(f.listingId)).toBe(published);
      await page.reload();
      await expect(page.getByLabel("Visible caption", { exact: true })).toHaveValue(
        "Synthetic caption draft",
      );
      await page.getByRole("button", { name: "Discard photo draft", exact: true }).click();
      await expect(
        page.getByRole("status").filter({ hasText: "Photo draft discarded" }),
      ).toBeVisible();
      await expect(page.getByLabel("Visible caption", { exact: true })).toHaveValue(
        original.asset.caption ?? "",
      );
      expect(
        (
          await db
            .select()
            .from(schema.mediaAssets)
            .where(eq(schema.mediaAssets.id, original.asset.id))
        )[0]?.detailsDraft,
      ).toBeNull();
      expect(await publicMedia(f.listingId)).toBe(published);
    });

    test("O13 checks on a twice-placed photo read back the placement used", async ({ page }) => {
      test.setTimeout(90_000);
      const f = seed();
      // One asset placed twice: review, scan and a failed command must return to placement 4.
      const [first] = await db
        .select({ assetId: schema.mediaRelations.mediaAssetId })
        .from(schema.mediaRelations)
        .where(eq(schema.mediaRelations.id, f.relations[0] ?? ""));
      const [twice] = await db
        .insert(schema.mediaRelations)
        .values({ listingId: f.listingId, mediaAssetId: first?.assetId ?? "", position: 99 })
        .returning({ id: schema.mediaRelations.id });
      const fourth = page.getByRole("heading", { name: `Photo 4 of 4` });
      await openMedia(page, f);
      await page.goto(hostUrl("staff", `/en/inventory/${f.reference}/media?photo=${twice?.id}`));
      await expect(fourth).toBeVisible();

      await page.getByLabel("Image description", { exact: true }).fill("Синтетична снимка");
      await page.getByRole("button", { name: "Save photo details", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: "Photo draft saved" })).toBeVisible();
      await expect(fourth).toBeVisible();
      await openPhotoReview(page, javaScriptEnabled);
      await page.getByLabel("Rights holder", { exact: true }).fill("Синтетичен притежател");
      await page
        .getByLabel("Rights evidence / permission reference", { exact: true })
        .fill("synthetic-permission");
      const review = async () => {
        await page.getByRole("checkbox", { name: /private addresses, people/ }).check();
        await page.getByRole("checkbox", { name: /usage rights and permission/ }).check();
        await page
          .getByRole("button", { name: "Approve as a public candidate", exact: true })
          .click();
      };
      await review();
      await expect(page.getByRole("status").first()).toContainText("Saved.");
      await expect(fourth).toBeVisible();

      // A stale review fails and still shows placement 4.
      await openPhotoReview(page, javaScriptEnabled);
      await db
        .update(schema.mediaAssets)
        .set({ version: sql`${schema.mediaAssets.version} + 1` })
        .where(eq(schema.mediaAssets.id, first?.assetId ?? ""));
      await review();
      await expect(page.getByRole("alert").filter({ hasText: "This item changed." })).toBeVisible();
      await expect(fourth).toBeVisible();

      // A scan retry on placement 4 returns to placement 4.
      await db
        .update(schema.mediaAssets)
        .set({ scan: "failed", review: "pending", audience: "private" })
        .where(eq(schema.mediaAssets.id, first?.assetId ?? ""));
      await page.goto(hostUrl("staff", `/en/inventory/${f.reference}/media?photo=${twice?.id}`));
      await page.getByRole("button", { name: "Retry scan", exact: true }).click();
      await expect(page.getByRole("status").first()).toContainText("Saved.");
      await expect(fourth).toBeVisible();
    });
  });

test("O13 order review keeps BG and RU staff labels", async ({ page }) => {
  const f = seed();
  await page.context().addCookies([
    {
      name: "msr_staff_session",
      value: f.token,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  for (const [locale, title, review, save] of [
    ["bg", "Снимки", "Преглед на новата подредба", "Запишете подредбата"],
    ["ru", "Фото", "Проверка нового порядка", "Сохранить порядок"],
  ] as const) {
    await page.goto(
      hostUrl(
        "staff",
        `/${locale}/inventory/${f.reference}/media?photo=${f.relations[0]}&move=down`,
      ),
    );
    await expect(page.getByRole("heading", { level: 1, name: review })).toBeVisible();
    await expect(page.getByRole("button", { name: save, exact: true })).toBeVisible();
    await page.goto(hostUrl("staff", `/${locale}/inventory/${f.reference}/media`));
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  }
  expect(await workingOrder(f.listingId)).toEqual(f.relations);
});

// The enhanced editor must not lose a review when another photo or placement action is chosen.
test("O13 protects unsaved photo details and requires an explicit review decision", async ({
  page,
}) => {
  const f = seed();
  await openMedia(page, f);
  await expect(page.getByRole("button", { name: "Save photo details", exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /usage rights and permission/ })).toHaveCount(0);
  await page.getByLabel("Visible caption", { exact: true }).fill("Unsaved synthetic caption");
  await page.getByRole("link", { name: "Show photo 2", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Unsaved photo details" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page.getByLabel("Visible caption", { exact: true })).toHaveValue(
    "Unsaved synthetic caption",
  );
  await openPlacement(page);
  await page.getByRole("button", { name: "Hide from next gallery", exact: true }).click();
  await expect(dialog).toBeVisible();
  expect(await workingOrder(f.listingId)).toEqual(f.relations);
  await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
  await page.getByRole("link", { name: "Show photo 2", exact: true }).click();
  await dialog.getByRole("button", { name: "Discard and leave", exact: true }).click();
  await expect(page.getByRole("heading", { name: `Photo 2 of 3` })).toBeVisible();
  expect(await workingOrder(f.listingId)).toEqual(f.relations);
});

test("O13 desktop drag stages several moves, reviews the cover, cancels and saves once", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Touch and keyboard use the same staged arrow controls.");
  const f = seed();
  const [first, second, third] = f.relations;
  const version = await listingVersion(f.listingId);
  const published = await publicMedia(f.listingId);
  await openGallery(page, f);
  await page.getByRole("button", { name: "Reorder photos", exact: true }).click();
  const tile = (id: string | undefined) => page.locator(`[data-photo="${id}"]`);
  await tile(third).dragTo(tile(first));
  await tile(second).dragTo(tile(first));
  expect(await workingOrder(f.listingId)).toEqual(f.relations);
  await page.getByRole("button", { name: "Review the new order", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review the new order", exact: true }),
  ).toBeVisible();
  const proposed = [third, second, first];
  expect(
    await page
      .locator("[data-photo]")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-photo"))),
  ).toEqual(proposed);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await workingOrder(f.listingId)).toEqual(f.relations);
  await page.getByRole("button", { name: "Reorder photos", exact: true }).click();
  await tile(third).dragTo(tile(first));
  await page.getByRole("button", { name: "Review the new order", exact: true }).click();
  await page.getByRole("button", { name: "Save the order", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "New photo order: 3, 1, 2." }),
  ).toBeVisible();
  expect(await workingOrder(f.listingId)).toEqual([third, first, second]);
  expect(await listingVersion(f.listingId)).toBe((version ?? 0) + 1);
  expect(await publicMedia(f.listingId)).toBe(published);
  await page.reload();
  await expect(page.getByRole("button", { name: "Reorder photos", exact: true })).toBeVisible();
  expect(await listingVersion(f.listingId)).toBe((version ?? 0) + 1);
});

test("O13 staged arrow order survives reload and is saved only after review", async ({ page }) => {
  const f = seed();
  const [first, second, third] = f.relations;
  await openGallery(page, f);
  await page.getByRole("button", { name: "Reorder photos", exact: true }).click();
  await expect(page.getByRole("link", { name: "Upload", exact: true })).toHaveCount(0);
  const thirdTile = page.locator(`[data-photo="${third}"]`);
  await page.getByRole("button", { name: "Move up · 3", exact: true }).click();
  await expect(thirdTile.getByRole("button", { name: "Move up · 2", exact: true })).toBeFocused();
  await expect(page.getByRole("status")).toHaveText(
    "Photograph 3: position 2 of 3 in the proposed order.",
  );
  await page.keyboard.press("Enter");
  await expect(thirdTile).toBeFocused();
  await expect(thirdTile.getByRole("button", { name: "Move up · 1", exact: true })).toBeDisabled();
  await thirdTile.getByRole("button", { name: "Move down · 1", exact: true }).click();
  await expect(thirdTile.getByRole("button", { name: "Move down · 2", exact: true })).toBeFocused();
  await expect(page.getByRole("status")).toHaveText(
    "Photograph 3: position 2 of 3 in the proposed order.",
  );
  await page.keyboard.press("Enter");
  await expect(thirdTile).toBeFocused();
  await expect(
    thirdTile.getByRole("button", { name: "Move down · 3", exact: true }),
  ).toBeDisabled();
  await thirdTile.getByRole("button", { name: "Move up · 3", exact: true }).click();
  expect(await workingOrder(f.listingId)).toEqual(f.relations);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Review the new order", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Review the new order", exact: true }).click();
  await page.getByRole("button", { name: "Save the order", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "New photo order: 1, 3, 2." }),
  ).toBeVisible();
  expect(await workingOrder(f.listingId)).toEqual([first, third, second]);
});

test("O13 tablet keeps the contextual photo beside visible editing fields", async ({ page }) => {
  const f = seed();
  await page.setViewportSize({ width: 768, height: 1024 });
  await openMedia(page, f);
  const region = page.getByRole("region", { name: "Photo 1 of 3", exact: true });
  const preview = await region.getByRole("img").first().boundingBox();
  const caption = await page.getByLabel("Visible caption", { exact: true }).boundingBox();
  const description = await page.getByLabel("Image description", { exact: true }).boundingBox();
  expect(preview).not.toBeNull();
  expect(caption).not.toBeNull();
  expect(description).not.toBeNull();
  if (!preview || !caption || !description) throw new Error("Missing photo editing surface");
  expect(caption.x).toBeGreaterThan(preview.x + preview.width - 1);
  expect(caption.y + caption.height).toBeLessThan(1024);
  expect(description.y + description.height).toBeLessThan(1024);
});
