// O13/W08-T2: a staged photo move writes nothing until Save, Cancel leaves the order alone,
// Save records one version-checked move with a saved-order receipt, a stale review reports a
// conflict, and the active public manifest keeps its order. Receipts read back their own
// recorded order, target photo and listing. Real PostgreSQL, synthetic records.
import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { asc, eq } from "drizzle-orm";
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

async function openMedia(page: Page, f: Seed) {
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
  await expect(page.getByRole("heading", { level: 1, name: "Media and order" })).toBeVisible();
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
      await expect(
        page.getByRole("heading", { name: `Listing ${f.reference} · Photo 1 of 3` }),
      ).toBeVisible();

      // Staging is a read: the review shows before/proposal and nothing is written.
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
      await expect(page.getByRole("heading", { level: 1, name: "Media and order" })).toBeVisible();
      expect(await workingOrder(f.listingId)).toEqual([first, second, third]);
      expect(await listingVersion(f.listingId)).toBe(version);

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
      await expect(
        page.getByRole("heading", { name: `Listing ${f.reference} · Photo 2 of 3` }),
      ).toBeVisible();

      // A review prepared before another change reports a conflict and writes nothing.
      await page.getByRole("link", { name: "Move down", exact: true }).click();
      await db
        .update(schema.listings)
        .set({ version: (version ?? 0) + 2 })
        .where(eq(schema.listings.id, f.listingId));
      await page.getByRole("button", { name: "Save the order", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText(
        "This item changed. Refresh and review the latest version before trying again.",
      );
      expect(await workingOrder(f.listingId)).toEqual([second, first, third]);
    });

    test("O13 receipts read back their own order, photo, cover and listing", async ({ page }) => {
      test.setTimeout(90_000);
      const f = seed();
      const [first, second, third] = f.relations;
      const heading = (n: number) =>
        page.getByRole("heading", { name: `Listing ${f.reference} · Photo ${n} of 3` });
      await openMedia(page, f);

      // Save A (1 ↓), then save B (1 ↓ again): A's receipt still states A's recorded order.
      await page.getByRole("link", { name: "Move down", exact: true }).click();
      await page.getByRole("button", { name: "Save the order", exact: true }).click();
      await expect(page.getByRole("status")).toContainText("New photo order: 2, 1, 3.");
      const receiptA = page.url();
      await page.getByRole("link", { name: "Back to the current task", exact: true }).click();
      await expect(heading(2)).toBeVisible();
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
      await page.getByRole("button", { name: "Hide from next gallery", exact: true }).click();
      await expect(page.getByRole("status").first()).toContainText("Saved.");
      await expect(heading(2)).toBeVisible();
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
      await page.getByRole("button", { name: "Include in next gallery", exact: true }).click();
      await expect(page.getByRole("alert")).toBeVisible();
      await expect(heading(2)).toBeVisible();

      // The cover comparison uses the first photo that is not hidden: with photo 1 (second)
      // hidden, moving photo 2 (third) down makes photo 3 (first) the next cover.
      await page.goto(hostUrl("staff", `/en/inventory/${f.reference}/media?photo=${third}`));
      await page.getByRole("button", { name: "Include in next gallery", exact: true }).click();
      await expect(heading(2)).toBeVisible();
      await page.goto(hostUrl("staff", `/en/inventory/${f.reference}/media?photo=${second}`));
      await page.getByRole("button", { name: "Hide from next gallery", exact: true }).click();
      await expect(heading(1)).toBeVisible();
      await page.goto(hostUrl("staff", `/en/inventory/${f.reference}/media?photo=${third}`));
      await page.getByRole("link", { name: "Move down", exact: true }).click();
      await expect(page.getByText("Before · cover 2", { exact: true })).toBeVisible();
      await expect(page.getByText("After · cover 3", { exact: true })).toBeVisible();
      expect(await workingOrder(f.listingId)).toEqual([second, third, first]);

      // A receipt from another listing of the same broker says nothing on this one.
      const foreign = new URL(receiptA).searchParams.get("saved") ?? "";
      await page.goto(
        hostUrl("staff", `/en/inventory/${f.other.reference}/media?saved=${foreign}`),
      );
      await expect(page.getByRole("heading", { level: 1, name: "Media and order" })).toBeVisible();
      await expect(page.getByText("Saved.", { exact: false })).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: `Listing ${f.other.reference} · Photo 1 of 3` }),
      ).toBeVisible();
      expect(await workingOrder(f.other.listingId)).toEqual(f.other.relations);
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
    ["bg", "Медии и подредба", "Преглед на новата подредба", "Запишете подредбата"],
    ["ru", "Медиа и порядок", "Проверка нового порядка", "Сохранить порядок"],
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
