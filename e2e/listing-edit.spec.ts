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
      await expect(page.getByRole("link", { name: "Photos", exact: true })).toHaveAttribute(
        "href",
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
      await expect(page.getByRole("link", { name: "Correct the published listing" })).toBeVisible();

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
    await page.getByLabel("Description", { exact: true }).fill("Незаписана промяна.");
    const dialog = page.getByRole("dialog", { name: "You have unsaved changes" });

    await page.getByRole("link", { name: "Photos", exact: true }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Stay" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
      "Незаписана промяна.",
    );

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

test("O12 without a saved draft asks for the source and does not write", async ({ page }) => {
  const f = seed();
  await signIn(page, f.token);
  await page.goto(hostUrl("staff", `/en/inventory/${f.blank.reference}`));
  await expect(
    page.getByText("No working draft is saved yet.", { exact: false }),
  ).toBeVisible();
  const source = page.getByLabel("Source or evidence reference", { exact: true });
  await expect(source).toBeVisible();
  const before = await listing(f.blank.listingId);
  await page.getByLabel("Listing title", { exact: true }).fill("Синтетично заглавие");
  await page.getByRole("button", { name: "Save the description", exact: true }).click();
  await expect(page.getByRole("region", { name: "Check the form" })).toBeVisible();
  await expect(source).toHaveAttribute("aria-invalid", "true");
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
