// O12/W08-T1: editing an existing BG listing. Text and Facts save the one working draft through
// the version-checked command, land on the O12SAVED receipt (own save, this listing only), keep
// the other tab's values and the public listing, report a stale save as a conflict, and keep
// Butler draft-only with the manual path. Real PostgreSQL, synthetic records.
import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostUrl, origins } from "./hosts";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("Listing edit browser tests require the generated disposable database.");
const connection = postgres(databaseUrl, { max: 2 });
const db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());

type Seed = {
  reference: string;
  listingId: string;
  blank: { reference: string; listingId: string };
  bgn: { reference: string; listingId: string };
  token: string;
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
          DATABASE_URL: databaseUrl,
        },
      },
    ).trim(),
  );
}
async function listing(listingId: string) {
  const [row] = await db
    .select({ version: schema.listings.version, draft: schema.listings.draft })
    .from(schema.listings)
    .where(eq(schema.listings.id, listingId));
  return row as { version: number; draft: Record<string, string> };
}
async function publicManifests(listingId: string) {
  const rows = await db
    .select({
      id: schema.publicationManifests.id,
      digest: schema.publicationManifests.contentDigest,
    })
    .from(schema.publicationManifests)
    .where(eq(schema.publicationManifests.listingId, listingId));
  return JSON.stringify(rows);
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

for (const javaScriptEnabled of [false, true])
  test.describe(`JavaScript ${javaScriptEnabled ? "on" : "off"}`, () => {
    test.use({ javaScriptEnabled });

    test("O12 saves text and facts to the working draft with a receipt", async ({ page }) => {
      test.setTimeout(90_000);
      const f = seed();
      const before = await listing(f.listingId);
      const published = await publicManifests(f.listingId);
      await signIn(page, f.token);
      await page.goto(hostUrl("staff", `/en/inventory/${f.reference}`));

      await expect(page.getByRole("heading", { level: 1, name: "Edit listing" })).toBeVisible();
      await expect(
        page.getByText(`${f.reference} · Sandanski · €95,000 · 74.5 m² · 2 bedrooms`),
      ).toBeVisible();
      await expect(page.getByRole("radio", { name: "Text" })).toBeChecked();
      // Photos is a link with JavaScript and a submit control of the form without it.
      const photos = page.getByRole(javaScriptEnabled ? "link" : "button", {
        name: "Photos",
        exact: true,
      });
      await expect(photos).toHaveAttribute(
        javaScriptEnabled ? "href" : "value",
        `/en/inventory/${f.reference}/media`,
      );
      // Butler stays draft-only and cannot draft listing text yet; the manual path is primary.
      const butler = page.getByRole("complementary", { name: "Butler" });
      await expect(butler.getByRole("button", { name: "Prepare a proposal" })).toBeDisabled();
      await expect(butler.getByText("Butler cannot draft listing text yet.")).toBeVisible();
      await expect(butler.getByRole("link", { name: "Continue without Butler" })).toHaveAttribute(
        "href",
        "#listing-text",
      );
      await expect(page.getByText("Correct the published listing", { exact: true })).toBeVisible();

      const description = "Обновено синтетично описание за тест на редактора.";
      await page.getByLabel("Listing title", { exact: true }).fill("Обновено синтетично заглавие");
      await page.getByLabel("Description", { exact: true }).fill(description);
      await page.getByRole("button", { name: "Save the description", exact: true }).click();

      await expect(
        page.getByRole("heading", { level: 1, name: "Working draft saved" }),
      ).toBeVisible();
      await expect(page.getByRole("status")).toContainText(
        `Saved for listing ${f.reference} · BG · Working draft. Publication and approvals stay separate.`,
      );
      await expect(page.getByText(description, { exact: true })).toBeVisible();
      const saved = await listing(f.listingId);
      expect(saved.version).toBe(before.version + 1);
      expect(saved.draft).toEqual({
        ...before.draft,
        title: "Обновено синтетично заглавие",
        description,
      });
      expect(await publicManifests(f.listingId)).toBe(published);
      const receipt = page.url();

      // Reloading the receipt does not save again.
      await page.reload();
      await expect(
        page.getByRole("heading", { level: 1, name: "Working draft saved" }),
      ).toBeVisible();
      expect((await listing(f.listingId)).version).toBe(saved.version);

      // Facts save keeps the text, returns to Facts and shows the new value.
      await page.goto(hostUrl("staff", `/en/inventory/${f.reference}?tab=facts`));
      // Facts keeps Save and Review (647:12680); phones still show the contextual Butler
      // block under the work column (659:12922), wide screens keep it beside Text only.
      await expect(page.getByText("Correct the published listing", { exact: true })).toBeHidden();
      if (test.info().project.name === "chromium-desktop") await expect(butler).toBeHidden();
      else {
        await expect(butler.getByRole("button", { name: "Prepare a proposal" })).toBeDisabled();
        await expect(butler.getByText("Butler cannot draft listing text yet.")).toBeVisible();
      }
      await page.getByLabel("Price in EUR", { exact: true }).fill("96000");
      await page.getByRole("button", { name: "Save the facts", exact: true }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Working draft saved" }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Back to the current task", exact: true }).click();
      await expect(page).toHaveURL(/\?tab=facts$/);
      await expect(page.getByLabel("Price in EUR", { exact: true })).toHaveValue("96000");
      const facts = await listing(f.listingId);
      expect(facts.draft).toEqual({ ...saved.draft, price: "96000" });

      // The older receipt now says the draft changed after it.
      await page.goto(receipt);
      await expect(
        page.getByText("The listing has changed since this save.", { exact: false }),
      ).toBeVisible();

      // A receipt from another listing shows nothing on this one.
      const id = new URL(receipt).searchParams.get("saved") ?? "";
      await page.goto(hostUrl("staff", `/en/inventory/${f.blank.reference}?saved=${id}`));
      await expect(page.getByRole("heading", { level: 1, name: "Edit listing" })).toBeVisible();
      await expect(page.getByText("Working draft saved")).toHaveCount(0);
    });

    test("O12 keeps unsaved text and facts across the tabs", async ({ page }) => {
      const f = seed();
      await signIn(page, f.token);
      await page.goto(hostUrl("staff", `/en/inventory/${f.reference}`));
      const description = page.getByLabel("Description", { exact: true });
      await description.fill("Незаписан текст.");
      await page.getByText("Facts", { exact: true }).click();
      await expect(page.getByRole("radio", { name: "Facts" })).toBeChecked();
      await expect(description).toBeHidden();
      const price = page.getByLabel("Price in EUR", { exact: true });
      await price.fill("97000");
      await page.getByText("Text", { exact: true }).click();
      await expect(description).toHaveValue("Незаписан текст.");
      await page.getByText("Facts", { exact: true }).click();
      await expect(price).toHaveValue("97000");
      expect((await listing(f.listingId)).draft.description).not.toBe("Незаписан текст.");
      if (!javaScriptEnabled)
        await expect(
          page.getByText("Without JavaScript, save before opening Photos or Review", {
            exact: false,
          }),
        ).toBeVisible();
    });

    test("O12 reports a stale save as a conflict and writes nothing", async ({ page }) => {
      test.setTimeout(90_000);
      const f = seed();
      await signIn(page, f.token);
      await page.goto(hostUrl("staff", `/en/inventory/${f.reference}`));
      await page.getByLabel("Description", { exact: true }).fill("Остаряла промяна.");
      const before = await listing(f.listingId);
      await db
        .update(schema.listings)
        .set({ version: before.version + 1 })
        .where(eq(schema.listings.id, f.listingId));
      await page.getByRole("button", { name: "Save the description", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Apply reviewed draft to current revision" }),
      ).toBeVisible();
      await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
        "Остаряла промяна.",
      );
      expect((await listing(f.listingId)).draft).toEqual(before.draft);
    });
  });

test.describe("JavaScript on", () => {
  test("O12 asks Save draft / Discard / Stay before leaving unsaved work", async ({ page }) => {
    test.setTimeout(90_000);
    const f = seed();
    const before = await listing(f.listingId);
    await signIn(page, f.token);
    await page.goto(hostUrl("staff", `/en/inventory/${f.reference}`));
    // The leave guard runs once hydrated, when the no-JavaScript note is gone.
    await expect(
      page.getByText("Without JavaScript, save before opening Photos or Review", { exact: false }),
    ).toHaveCount(0);
    await page.getByLabel("Description", { exact: true }).fill("Незаписана промяна.");
    const dialog = page.getByRole("dialog", { name: "You have unsaved changes" });

    await page.getByRole("link", { name: "Photos", exact: true }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Stay" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
      "Незаписана промяна.",
    );
    if ((page.viewportSize()?.width ?? 1440) < 1024) {
      // Opening the phone menu (X02) is not leaving; choosing a destination in it is.
      const menu = page.getByRole("banner").getByRole("link", { name: "Open menu" });
      await expect(menu).toHaveAttribute("aria-haspopup", "dialog");
      await menu.click();
      const tools = page.getByRole("dialog", { name: "Agency tools", exact: true });
      await expect(tools).toBeVisible();
      await expect(dialog).toBeHidden();
      await tools.getByRole("link", { name: /^Calendar/ }).click();
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Stay" }).click();
      await expect(dialog).toBeHidden();
      await page.keyboard.press("Escape");
      await expect(tools).toBeHidden();
      await expect(page).toHaveURL(hostUrl("staff", `/en/inventory/${f.reference}`));
      await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
        "Незаписана промяна.",
      );
    }

    await page.getByRole("link", { name: "Review for publication" }).click();
    await dialog.getByRole("button", { name: "Discard changes" }).click();
    await expect(page).toHaveURL(/\?tab=review$/);
    expect(await listing(f.listingId)).toEqual(before);

    await page.goto(hostUrl("staff", `/en/inventory/${f.reference}`));
    await page.getByLabel("Description", { exact: true }).fill("Записана от диалога.");
    await page.getByRole("link", { name: "Photos", exact: true }).click();
    await dialog.getByRole("button", { name: "Save draft" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Working draft saved" }),
    ).toBeVisible();
    expect((await listing(f.listingId)).draft.description).toBe("Записана от диалога.");
    // The saved receipt offers to continue where the person was going.
    await expect(page.getByRole("link", { name: "Continue", exact: true })).toHaveAttribute(
      "href",
      `/en/inventory/${f.reference}/media`,
    );

    // A photo-only change later moves the listing version; the receipt says only that.
    const receipt = page.url();
    const saved = await listing(f.listingId);
    await db
      .update(schema.listings)
      .set({ version: saved.version + 1 })
      .where(eq(schema.listings.id, f.listingId));
    await page.goto(receipt);
    await expect(page.getByText("The listing has changed since this save.")).toBeVisible();
  });

  test("O12 a save leaves without a browser prompt only once the server acknowledged it", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const f = seed();
    await signIn(page, f.token);
    const edit = hostUrl("staff", `/en/inventory/${f.reference}?tab=facts`);
    // Each case gets its own tab, so no earlier tab's restored work can add a prompt.
    const open = async () => {
      const tab = await page.context().newPage();
      const prompts: string[] = [];
      tab.on("dialog", (prompt) => {
        prompts.push(prompt.type());
        void prompt.accept();
      });
      await tab.goto(edit);
      return {
        tab,
        prompts,
        dialog: tab.getByRole("dialog", { name: "You have unsaved changes" }),
        source: tab.getByLabel("Source or evidence reference", { exact: true }),
        photos: tab.getByRole("link", { name: "Photos", exact: true }),
        saved: tab.getByRole("heading", { level: 1, name: "Working draft saved" }),
      };
    };

    // Rejected (a blank source reference): still unsaved, leaving asks, reloading prompts.
    const rejected = await open();
    await rejected.source.fill("");
    await rejected.photos.click();
    await rejected.dialog.getByRole("button", { name: "Save draft" }).click();
    await expect(rejected.source).toHaveAttribute("aria-invalid", "true");
    // In the page's language, never raw schema text.
    await expect(rejected.tab.getByText("Fill in this field.").first()).toBeVisible();
    await expect(rejected.tab.getByText(/expected string/)).toHaveCount(0);
    await rejected.photos.click();
    await expect(rejected.dialog).toBeVisible();
    await rejected.dialog.getByRole("button", { name: "Stay" }).click();
    await rejected.tab.reload();
    expect(rejected.prompts).toEqual(["beforeunload"]);

    // The request fails in transport or never answers: the work stays protected.
    for (const failure of ["abort", "stall"] as const) {
      const failed = await open();
      await failed.tab.route("**/*", (route) =>
        route.request().method() === "POST"
          ? failure === "abort"
            ? route.abort()
            : undefined
          : route.continue(),
      );
      await failed.source.fill(`Synthetic contract, ${failure}`);
      await failed.photos.click();
      await failed.dialog.getByRole("button", { name: "Save draft" }).click();
      if (failure === "abort")
        await expect(
          failed.tab.getByText("Your entered values are retained below.", { exact: false }),
        ).toBeVisible();
      await failed.photos.click();
      await expect(failed.dialog).toBeVisible();
      await failed.dialog.getByRole("button", { name: "Stay" }).click();
      // Reload while the request is still failing or pending, so it can never complete first.
      await failed.tab.reload();
      expect(failed.prompts).toEqual(["beforeunload"]);
      await failed.tab.unrouteAll({ behavior: "ignoreErrors" });
    }

    // A real acknowledged save in one tab never covers another submit: a stalled save in a second
    // tab, under that tab's cookie, still asks before the work is lost.
    const first = await open();
    const completed = await first.tab.locator('input[name="_operationId"]').first().inputValue();
    await first.source.fill("Synthetic contract, first save");
    await first.tab.getByRole("button", { name: "Save the facts" }).click();
    await expect(first.saved).toBeVisible();
    expect(first.prompts).toEqual([]);
    expect(
      (await first.tab.context().cookies()).some((cookie) => cookie.name === "msr_saved_operation"),
    ).toBe(true);
    const stalled = await open();
    await stalled.tab.route("**/*", (route) =>
      route.request().method() === "POST" ? undefined : route.continue(),
    );
    await stalled.source.fill("Synthetic contract, stalled second save");
    await stalled.tab.getByRole("button", { name: "Save the facts" }).click();
    await stalled.tab.reload();
    expect(stalled.prompts).toEqual(["beforeunload"]);
    await stalled.tab.unrouteAll({ behavior: "ignoreErrors" });

    // A page kept with an operation that already went through submits it again: the server
    // answers with the latest version and a fresh operation; the values stay and apply cleanly.
    const kept = await open();
    await kept.source.fill("Synthetic contract, kept page");
    // Set last: any re-render restores the form's own operation id.
    await kept.tab
      .locator('input[name="_operationId"]')
      .first()
      .evaluate((input, value) => {
        (input as HTMLInputElement).value = value;
      }, completed);
    await kept.tab.getByRole("button", { name: "Save the facts" }).click();
    await expect(
      kept.tab.getByText("This page's earlier save already went through.", { exact: false }),
    ).toBeVisible();
    await expect(kept.source).toHaveValue("Synthetic contract, kept page");
    await kept.tab
      .getByRole("button", { name: "Apply reviewed draft to current revision" })
      .click();
    await expect(kept.saved).toBeVisible();
    expect(kept.prompts).toEqual([]);

    // A double click submits the same content twice; the form blocks the second, the nonce
    // stays, and the acknowledged save leaves without a prompt.
    const twice = await open();
    await twice.source.fill("Synthetic contract, double click");
    await twice.tab.getByRole("button", { name: "Save the facts" }).dblclick();
    await expect(twice.saved).toBeVisible();
    expect(twice.prompts).toEqual([]);

    // Acknowledged saves, from the dialog and from the form's own button, raise no prompt.
    const viaDialog = await open();
    await viaDialog.source.fill("Synthetic brokerage contract, section 2");
    await viaDialog.photos.click();
    await viaDialog.dialog.getByRole("button", { name: "Save draft" }).click();
    await expect(viaDialog.saved).toBeVisible();
    expect(viaDialog.prompts).toEqual([]);
    const viaButton = await open();
    await viaButton.source.fill("Synthetic brokerage contract, section 3");
    await viaButton.tab.getByRole("button", { name: "Save the facts" }).click();
    await expect(viaButton.saved).toBeVisible();
    expect(viaButton.prompts).toEqual([]);
  });

  test("O12 starts an imported listing from its revision and keeps the source field while typing", async ({
    page,
  }) => {
    const f = seed();
    await signIn(page, f.token);
    await page.goto(hostUrl("staff", `/en/inventory/${f.blank.reference}`));
    await expect(page.getByLabel("Listing title", { exact: true })).toHaveValue(
      "Синтетична обява без чернова",
    );
    const source = page.getByLabel("Source or evidence reference", { exact: true });
    await source.pressSequentially("synthetic-source-record");
    await expect(source).toHaveValue("synthetic-source-record");
    await page.getByLabel("Language of the source evidence", { exact: true }).selectOption("bg");
    await page.getByRole("button", { name: "Save the description", exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Working draft saved" }),
    ).toBeVisible();
    const saved = await listing(f.blank.listingId);
    expect(saved.draft).toMatchObject({
      title: "Синтетична обява без чернова",
      sourceReference: "synthetic-source-record",
      sourceLanguage: "bg",
      priceState: "known",
      price: "95000.00",
    });
  });
});

test.describe("JavaScript off", () => {
  test.use({ javaScriptEnabled: false });

  test("O12 asks before leaving unsaved work and saves on the chosen tab", async ({ page }) => {
    const f = seed();
    await signIn(page, f.token);
    // An unchanged draft leaves straight away.
    await page.goto(hostUrl("staff", `/en/inventory/${f.reference}`));
    await page.getByRole("button", { name: "Photos", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/en/inventory/${f.reference}/media(#.*)?$`));

    // Unsaved work: Save draft / Discard / Stay, nothing written, entry kept.
    await page.goto(hostUrl("staff", `/en/inventory/${f.reference}`));
    const before = await listing(f.listingId);
    await page.getByLabel("Description", { exact: true }).fill("Незаписано без JavaScript.");
    await page.getByRole("button", { name: "Review for publication" }).click();
    await expect(page.getByText("You have unsaved changes.", { exact: false })).toBeVisible();
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
      "Незаписано без JavaScript.",
    );
    await expect(page.getByRole("link", { name: "Discard changes" })).toHaveAttribute(
      "href",
      `/en/inventory/${f.reference}?tab=review`,
    );
    expect(await listing(f.listingId)).toEqual(before);

    // The Facts tab chosen natively is where Save returns.
    await page.goto(hostUrl("staff", `/en/inventory/${f.reference}`));
    await page.getByText("Facts", { exact: true }).click();
    await page.getByLabel("Price in EUR", { exact: true }).fill("98000");
    await page.getByRole("button", { name: "Save the facts", exact: true }).click();
    await page.getByRole("link", { name: "Back to the current task", exact: true }).click();
    await expect(page).toHaveURL(/\?tab=facts$/);
    await expect(page.getByLabel("Price in EUR", { exact: true })).toHaveValue("98000");
  });
});

test("O12 restores unsaved work after browser history and can discard it", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium-desktop", "uses the desktop shell navigation");
  const f = seed();
  await signIn(page, f.token);
  await page.goto(hostUrl("staff", `/en/inventory/${f.reference}`));
  await page.locator('nav a[href="/en/inventory"]').first().click();
  await expect(page).toHaveURL(/\/en\/inventory$/);
  await page.goBack();
  const description = page.getByLabel("Description", { exact: true });
  const saved = await description.inputValue();
  await description.fill("Незаписано преди историята.");
  await page.goForward();
  await expect(page).toHaveURL(/\/en\/inventory$/);
  await page.goBack();
  await expect(
    page.getByText("Unsaved changes from earlier on this page are restored."),
  ).toBeVisible();
  await expect(description).toHaveValue("Незаписано преди историята.");
  await page.getByRole("button", { name: "Discard these changes" }).click();
  await expect(description).toHaveValue(saved);
});

test("O12 keeps earlier unsaved work when someone else saved, for a reviewed apply", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium-desktop", "one browser is enough for storage");
  const f = seed();
  await signIn(page, f.token);
  await page.goto(hostUrl("staff", `/en/inventory/${f.reference}`));
  const description = page.getByLabel("Description", { exact: true });
  await description.fill("Моя по-ранна промяна.");
  // Another operator saves the listing meanwhile.
  const current = await listing(f.listingId);
  await db
    .update(schema.listings)
    .set({
      version: current.version + 1,
      draft: { ...current.draft, description: "Промяна от друг човек." },
    })
    .where(eq(schema.listings.id, f.listingId));
  page.on("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(
    page.getByText("Unsaved changes from before someone else saved this listing are kept.", {
      exact: false,
    }),
  ).toBeVisible();
  // Nothing is applied silently: the field shows the current version until the choice.
  await expect(description).toHaveValue("Промяна от друг човек.");
  await expect(page.getByText("Моя по-ранна промяна.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Apply my earlier changes" }).click();
  await expect(description).toHaveValue("Моя по-ранна промяна.");
  expect((await listing(f.listingId)).draft.description).toBe("Промяна от друг човек.");
});

test("O12 keeps a source price it cannot carry visible and needs a choice to drop it", async ({
  page,
}) => {
  const f = seed();
  await signIn(page, f.token);
  await page.goto(hostUrl("staff", `/en/inventory/${f.bgn.reference}`));
  // The needed-before-saving box (647:12802) stays one named group holding the recorded price.
  const needed = page.getByRole("group", { name: "Needed before this draft can be saved" });
  await expect(
    needed.getByText("The source recorded 115,000 BGN · total price.", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("Source or evidence reference", { exact: true })
    .fill("synthetic-bgn-source");
  await page.getByLabel("Language of the source evidence", { exact: true }).selectOption("bg");
  await page.getByRole("button", { name: "Save the description", exact: true }).click();
  await expect(
    page.getByText("Enter the price, or confirm that it stays unknown for now.").first(),
  ).toBeVisible();
  expect((await listing(f.bgn.listingId)).draft).toEqual({});
  await page.getByRole("checkbox", { name: "Keep the price unknown for now" }).check();
  await page.getByRole("button", { name: "Save the description", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Working draft saved" })).toBeVisible();
  expect((await listing(f.bgn.listingId)).draft).toMatchObject({
    priceState: "unknown",
    price: "",
  });
});

test("O12 without a saved draft asks for the source and does not write", async ({ page }) => {
  const f = seed();
  await signIn(page, f.token);
  await page.goto(hostUrl("staff", `/en/inventory/${f.blank.reference}`));
  await expect(page.getByText("No working draft is saved yet.", { exact: false })).toBeVisible();
  const source = page.getByLabel("Source or evidence reference", { exact: true });
  await expect(source).toBeVisible();
  const before = await listing(f.blank.listingId);
  await page.getByLabel("Listing title", { exact: true }).fill("Синтетично заглавие");
  await page.getByRole("button", { name: "Save the description", exact: true }).click();
  const summary = page.getByRole("region", { name: "Check the form" });
  await expect(summary).toBeVisible();
  await expect(source).toHaveAttribute("aria-invalid", "true");
  // 694:13318: the error summary leads the work column, then the no-draft alert.
  const summaryTop = (await summary.boundingBox())?.y ?? Number.POSITIVE_INFINITY;
  const alertTop =
    (await page.getByText("No working draft is saved yet.", { exact: false }).boundingBox())?.y ??
    0;
  expect(summaryTop).toBeLessThan(alertTop);
  expect(await listing(f.blank.listingId)).toEqual(before);
});

test("O12 keeps BG and RU labels and a read-only role cannot edit", async ({ page }) => {
  const f = seed();
  await signIn(page, f.token);
  for (const [locale, title, text, save] of [
    ["bg", "Редактиране на обява", "Текст", "Запишете описанието"],
    ["ru", "Редактирование объявления", "Текст", "Сохранить описание"],
  ] as const) {
    await page.goto(hostUrl("staff", `/${locale}/inventory/${f.reference}`));
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole("radio", { name: text, exact: true })).toBeChecked();
    await expect(page.getByRole("button", { name: save, exact: true })).toBeVisible();
  }
  await page.context().clearCookies();
  await signIn(page, f.readerToken);
  await page.goto(hostUrl("staff", `/en/inventory/${f.reference}`));
  await expect(page.getByText("Your role cannot edit this record.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save the description" })).toHaveCount(0);
});
