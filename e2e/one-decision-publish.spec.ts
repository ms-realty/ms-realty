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
  single: { reference: string; listingId: string; title: string; englishTitle: string };
  bulk: { reference: string; listingId: string }[];
  rent: { reference: string; listingId: string; title: string };
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
    await expect(page.getByText(f.single.title).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Checked for you" })).toBeVisible();
    // The tick covers every photo it will show: the count is stated and all ten are one
    // click away, behind a closed disclosure (a plain details element, no script).
    await expect(page.getByText("Photos that will be shown: 10.")).toBeVisible();
    const allPhotos = page.locator("details", {
      has: page.locator("summary", { hasText: "All 10 photos" }),
    });
    await expect(allPhotos).toHaveJSProperty("open", false);
    await allPhotos.locator("summary").click();
    await expect(allPhotos.locator("li")).toHaveCount(10);
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
    expect(await detail.text()).toContain(f.single.title);
    const [attested] = await connection`select actor_kind, payload from audit_events
        where action = 'listing.publication.attested' and record_id = ${f.single.listingId}`;
    expect(attested?.actor_kind).toBe("staff");
    expect(attested?.payload).toMatchObject({ basis: "staff_attestation" });

    // Languages: the English draft passed the checks; the broker reads it and ticks it.
    const english = page.locator('[data-language="en"]');
    await expect(english.getByText(f.single.englishTitle, { exact: true })).toBeVisible();
    await english
      .getByRole("checkbox", {
        name: "I read the English text and it says the same as the Bulgarian.",
      })
      .check();
    await page.getByRole("button", { name: "Publish languages", exact: true }).click();
    // A plain form post shows its confirmation, like every other action.
    await expect(page.getByText("English: Published", { exact: true })).toBeVisible();
    await expect(english.getByText("Published", { exact: true })).toBeVisible();
    expect((await live(f.single.listingId)).sort()).toEqual(["bg", "en"]);
    const englishDetail = await request.get(
      hostUrl("public", `/en/properties/${f.single.reference}/${f.single.reference.toLowerCase()}`),
    );
    expect(await englishDetail.text()).toContain(f.single.englishTitle);
    await page.goto(hostUrl("staff", `/en/inventory/${f.single.reference}/publish`));

    // Publish is the screen's one filled action; Unpublish waits behind a deliberate disclosure.
    await expect(page.locator('button[type="submit"]', { hasText: "Unpublish" })).toBeHidden();
    await page.locator("summary", { hasText: "Unpublish" }).click();
    await page.getByRole("checkbox", { name: "Take this listing off the website" }).check();
    await page.locator('button[type="submit"]', { hasText: "Unpublish" }).click();
    await expect(
      page.getByText(`${f.single.reference} is no longer on the website.`),
    ).toBeVisible();
    expect(await live(f.single.listingId)).toEqual([]);
    // The detail URL keeps answering with the safe "not available here" identity, never the copy.
    const gone = await (await request.get(hostUrl("public", publicPath))).text();
    expect(gone).toContain("Този имот не е достъпен тук.");
    expect(gone).not.toContain(f.single.title);
  });
});

test("publishes a selection of ready listings on one attestation", async ({ page }) => {
  test.setTimeout(90_000);
  const f = seed();
  await signIn(page, f.token);
  await page.goto(hostUrl("staff", "/en/inventory"));
  await page.getByRole("link", { name: "Ready to publish" }).click();
  await expect(page).toHaveURL(/view=ready/);
  // The view is one page of listings per request and narrows by pasted numbers, separated by
  // spaces or commas, through the search field.
  await page
    .getByRole("searchbox", { name: "Find listings" })
    .fill(f.bulk.map((listing) => listing.reference).join(", "));
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/q=/);
  await expect(page.getByText("Listings shown: 2.")).toBeVisible();
  for (const listing of f.bulk)
    await expect(page.getByRole("checkbox", { name: `Select ${listing.reference}` })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: `Select ${f.single.reference}` })).toHaveCount(0);
  // Each row states how many photos the tick will show.
  await expect(page.getByText("Photos that will be shown: 1.").first()).toBeVisible();

  // Nothing selected: the error is on the list, not on the attestation box.
  const attestation = page.getByRole("checkbox", { name: /I checked each selected listing/ });
  await attestation.check();
  await page.getByRole("button", { name: "Publish selected" }).click();
  await expect(page.locator("fieldset", { hasText: "Select at least one listing." })).toBeVisible();
  await expect(attestation).not.toHaveAttribute("aria-invalid", "true");

  for (const listing of f.bulk)
    await page.getByRole("checkbox", { name: `Select ${listing.reference}` }).check();
  await page.getByRole("button", { name: "Publish selected" }).click();
  const results = page.getByRole("heading", { name: "Results" }).first();
  await expect(results).toBeVisible();
  for (const listing of f.bulk) {
    await expect(page.getByRole("link", { name: `Open ${listing.reference}` })).toHaveAttribute(
      "href",
      `/en/inventory/${listing.reference}`,
    );
    expect(await live(listing.listingId)).toEqual(["bg"]);
  }
  await expect(page.getByText("Published: 2. Needs attention: 0.")).toBeVisible();
  // The synthetic descriptions are short: the result says so beside the published listing.
  await expect(page.getByText("Published with a warning").first()).toBeVisible();
  // The attestation recorded is the sentence shown for the whole selection.
  const [attested] = await connection`select payload from audit_events
    where action = 'listing.publication.attested' and record_id = ${f.bulk[0]?.listingId ?? ''}`;
  expect(attested?.payload).toMatchObject({
    attestation: expect.stringContaining("I checked each selected listing."),
  });
  // The single listing seeded alongside was not selected and stays unpublished.
  expect(await live(f.single.listingId)).toEqual([]);
});

test("confirms the period of an imported rent as part of the same decision", async ({ page }) => {
  test.setTimeout(90_000);
  const f = seed();
  await signIn(page, f.token);
  await page.goto(hostUrl("staff", `/en/inventory/${f.rent.reference}/publish`));
  // The rent is not in the bulk selection: it needs this one confirmation.
  await expect(page.getByText("€450, per month")).toBeVisible();
  await expect(page.getByLabel("Rent period")).toHaveValue("month");
  await page
    .getByRole("checkbox", { name: /I checked this listing\. The facts are right/ })
    .check();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Published", exact: true })).toBeVisible();
  expect(await live(f.rent.listingId)).toEqual(["bg"]);
  const [revision] = await connection`select r.terms from listing_revisions r
    join listings l on l.approved_revision_id = r.id where l.id = ${f.rent.listingId}`;
  expect(revision?.terms).toMatchObject({
    facts: { price: { state: "known", value: { amountMinor: 45_000, period: "month" } } },
  });
});
