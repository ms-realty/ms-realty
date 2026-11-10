// ADR 0012: an imported listing goes public on one recorded decision. The staff member sees what
// the public will see and what was checked, ticks one attestation and presses Publish; the
// bulk view does the same for a selection. Real PostgreSQL, synthetic records.
import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";
import { hostUrl, origins } from "./hosts";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error(
    "One-decision publishing browser tests require the generated disposable database.",
  );
const connection = postgres(databaseUrl, { max: 2 });
test.afterAll(async () => connection.end());

type Seed = {
  token: string;
  single: { reference: string; listingId: string };
  bulk: { reference: string; listingId: string }[];
};
function seed(): Seed {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "e2e/support/one-decision-seed.ts"],
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
  await page
    .context()
    .addCookies([
      {
        name: "msr_staff_session",
        value: token,
        url: origins.staff,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
}
const live = async (listingId: string) =>
  (
    await connection`select locale from current_publications
      where listing_id = ${listingId} and state = 'active'`
  ).map((row) => row.locale);

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("publishes one imported listing on one attestation, then unpublishes it", async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000);
    const f = seed();
    await signIn(page, f.token);
    await page.goto(hostUrl("staff", `/en/inventory/${f.single.reference}`));
    // The listing's primary action is Publish; the detailed review is a secondary entry.
    await page.getByRole("link", { name: "Publish", exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`/en/inventory/${f.single.reference}/publish$`));
    await expect(page.getByRole("heading", { name: "What the public will see" })).toBeVisible();
    await expect(page.getByText("Синтетичен апартамент за публикуване").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Checked for you" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Detailed review" }).last()).toHaveAttribute(
      "href",
      `/en/inventory/${f.single.reference}?tab=review`,
    );
    // No internal jargon on the main path.
    const text = (await page.locator("main").innerText()).toLowerCase();
    for (const word of ["revision", "manifest", "candidate", "generation"])
      expect(text).not.toContain(word);

    // Publishing without the attestation is refused and records nothing.
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(
      page.getByText("Tick the box to confirm that you checked the listing.").first(),
    ).toBeVisible();
    expect(await live(f.single.listingId)).toEqual([]);

    await page
      .getByRole("checkbox", { name: /I checked this listing\. The facts are right/ })
      .check();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Published", exact: true })).toBeVisible();
    await expect(page.getByText(`${f.single.reference} is on the website.`)).toBeVisible();
    expect(await live(f.single.listingId)).toEqual(["bg"]);
    const publicPath = `/bg/properties/${f.single.reference}/${f.single.reference.toLowerCase()}`;
    await expect(page.getByRole("link", { name: "Open on the website" })).toHaveAttribute(
      "href",
      hostUrl("public", publicPath).replace(/\/$/, ""),
    );
    const detail = await request.get(hostUrl("public", publicPath));
    expect(detail.status()).toBe(200);
    expect(await detail.text()).toContain("Синтетичен апартамент за публикуване");
    const [attested] = await connection`select actor_kind, payload from audit_events
        where action = 'listing.publication.attested' and record_id = ${f.single.listingId}`;
    expect(attested?.actor_kind).toBe("staff");
    expect(attested?.payload).toMatchObject({ basis: "staff_attestation" });

    await page.getByRole("checkbox", { name: "Remove this listing from the website." }).check();
    await page.getByRole("button", { name: "Unpublish", exact: true }).click();
    await expect(
      page.getByText(`${f.single.reference} is no longer on the website.`),
    ).toBeVisible();
    expect(await live(f.single.listingId)).toEqual([]);
    // The detail URL keeps answering with the safe "not available here" identity, never the copy.
    const gone = await (await request.get(hostUrl("public", publicPath))).text();
    expect(gone).toContain("Този имот не е достъпен тук.");
    expect(gone).not.toContain("Синтетичен апартамент за публикуване");
  });
});

test("publishes a selection of ready listings on one attestation", async ({ page }) => {
  test.setTimeout(90_000);
  const f = seed();
  await signIn(page, f.token);
  await page.goto(hostUrl("staff", "/en/inventory"));
  await page.getByRole("link", { name: "Ready to publish" }).click();
  await expect(page).toHaveURL(/view=ready/);
  for (const listing of f.bulk)
    await page.getByRole("checkbox", { name: `Select ${listing.reference}` }).check();
  await page.getByRole("checkbox", { name: /I checked each selected listing/ }).check();
  await page.getByRole("button", { name: "Publish selected" }).click();
  const results = page.getByRole("heading", { name: "Results" }).first();
  await expect(results).toBeVisible();
  for (const listing of f.bulk) {
    await expect(page.getByText(listing.reference).first()).toBeVisible();
    expect(await live(listing.listingId)).toEqual(["bg"]);
  }
  await expect(page.getByText("Published: 2. Needs attention: 0.")).toBeVisible();
  // The single listing seeded alongside was not selected and stays unpublished.
  expect(await live(f.single.listingId)).toEqual([]);
});
