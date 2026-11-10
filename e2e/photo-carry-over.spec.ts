// ADR 0016: a listing carried over from the old website, whose photos exist only as old-website
// keys, gets them copied from the Publish screen, is published on one attestation, and shows the
// photos on the public detail page and the search card. Real PostgreSQL, synthetic records and
// generated images.
import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";
import { hostUrl, origins } from "./hosts";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("Photo carry-over browser tests require the generated disposable database.");
const connection = postgres(databaseUrl, { max: 2 });
test.afterAll(async () => connection.end());

type Seed = {
  token: string;
  reference: string;
  listingId: string;
  title: string;
  photos: string[];
};
function seed(): Seed {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "e2e/support/photo-carry-over-seed.ts"],
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
async function signIn(page: Page, token: string) {
  await page.context().addCookies([
    {
      name: "msr_staff_session",
      value: token,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

test("copies a carried-over listing's photos, publishes it and shows them in public", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const f = seed();
  await signIn(page, f.token);
  await page.goto(hostUrl("staff", `/en/inventory/${f.reference}/publish`));

  // Before: the screen says the photos were never copied, and offers the one thing to do.
  const notice = page.locator("[data-carry-over]");
  await expect(notice.getByText("Photos from the old website", { exact: true })).toBeVisible();
  await expect(notice.getByText(/Not copied to the new system yet: 3\./)).toBeVisible();
  await expect(page.locator('[data-warning="photos_not_copied"]')).toBeVisible();
  await notice.getByRole("button", { name: "Copy photos from the old website" }).click();

  // After: the photos are in the preview, in their old order, and nothing asks to copy them.
  await expect(page.locator("[data-carry-over]")).toHaveCount(0);
  await expect(page.locator('[data-warning="photos_not_copied"]')).toHaveCount(0);
  await expect(page.locator('[data-warning="no_photos"]')).toHaveCount(0);
  const rows = await connection`select id, admission, scan, processing, sealed_key
    from media_assets where id in ${connection(f.photos)}`;
  expect(rows.map((r) => [r.admission, r.scan, r.processing])).toEqual(
    f.photos.map(() => ["reencode", "clean", "ready"]),
  );

  // The Photos tab says where a photo came from.
  await page.goto(hostUrl("staff", `/en/inventory/${f.reference}/media?photo=${f.photos[0]}`));
  await expect(page.locator("[data-legacy-origin]")).toHaveText("From the agency's old website.");

  await page.goto(hostUrl("staff", `/en/inventory/${f.reference}/publish`));
  await page
    .getByRole("checkbox", { name: /I checked this listing\. The facts are right/ })
    .check();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Published", exact: true })).toBeVisible();

  // Public detail: the gallery serves the copied photos through the public media route.
  const publicPath = `/bg/properties/${f.reference}/${f.reference.toLowerCase()}`;
  await page.goto(hostUrl("public", publicPath));
  await expect(page.getByRole("heading", { name: f.title }).first()).toBeVisible();
  for (const id of f.photos)
    await expect(page.locator(`img[src^="/api/media/${id}/"]`).first()).toBeAttached();
  const cover = page.locator(`img[src^="/api/media/${f.photos[0]}/"]`).first();
  await expect(cover).toHaveAttribute("srcset", /480w, .+ 960w, .+ 1600w, .+ 1800w/);
  await expect(cover).toHaveAttribute("width", "1800");
  await expect(cover).toHaveAttribute("height", "1200");
  expect((await cover.getAttribute("alt"))?.trim()).toBeTruthy();
  await expect
    .poll(() => cover.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  const image = await request.get(hostUrl("public", (await cover.getAttribute("src")) ?? ""));
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/webp");

  // Search card: the cover is the first photo of the old gallery.
  await page.goto(hostUrl("public", `/bg/properties?q=${f.reference}`));
  const card = page.locator("article", { hasText: f.reference }).first();
  await expect(card.locator(`img[src^="/api/media/${f.photos[0]}/"]`)).toBeAttached();
  await expect
    .poll(() =>
      card
        .locator("img")
        .first()
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
});
