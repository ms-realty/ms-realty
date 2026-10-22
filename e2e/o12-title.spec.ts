// O12 UI06 title: a long value stays readable on phones and saves through the one draft form.
import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostUrl, origins } from "./hosts";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("O12 title tests require the generated disposable database.");
const connection = postgres(databaseUrl, { max: 1 });
const db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());

async function openEditor(page: Page) {
  const fixture = JSON.parse(
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
  ) as { reference: string; listingId: string; token: string };
  const [before] = await db
    .select({ draft: schema.listings.draft, version: schema.listings.version })
    .from(schema.listings)
    .where(eq(schema.listings.id, fixture.listingId));
  if (!before) throw new Error("The O12 seed did not create its listing.");
  await page
    .context()
    .addCookies([
      { name: "msr_staff_session", value: fixture.token, url: origins.staff, httpOnly: true },
    ]);
  await page.goto(hostUrl("staff", `/bg/inventory/${fixture.reference}`));
  return { fixture, before };
}

for (const javaScriptEnabled of [false, true])
  test.describe(`JavaScript ${javaScriptEnabled ? "on" : "off"}`, () => {
    test.use({ javaScriptEnabled });

    test("O12 keeps a long title readable and saves it without changing the facts", async ({
      page,
    }) => {
      const { fixture, before } = await openEditor(page);
      const title = page.getByLabel("Заглавие на обявата", { exact: true });
      const value = "Синтетичен просторен апартамент с отделна спалня в центъра на Сандански";
      await title.fill(value);
      // The title stays visible without internal scrolling, including a change to 320 px.
      for (const width of [page.viewportSize()?.width ?? 1440, 320]) {
        await page.setViewportSize({ width, height: 844 });
        const size = await title.evaluate((node) => ({
          width: node.clientWidth,
          scrollWidth: node.scrollWidth,
          height: node.clientHeight,
          scrollHeight: node.scrollHeight,
        }));
        expect(size.scrollWidth).toBeLessThanOrEqual(size.width + 1);
        expect(size.scrollHeight).toBeLessThanOrEqual(size.height + 1);
      }
      await page.getByRole("button", { name: "Запишете описанието", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Работната чернова е записана", exact: true }),
      ).toBeVisible();
      const [saved] = await db
        .select({ draft: schema.listings.draft, version: schema.listings.version })
        .from(schema.listings)
        .where(eq(schema.listings.id, fixture.listingId));
      if (!saved) throw new Error("The saved O12 listing is missing.");
      expect(saved.version).toBe(before.version + 1);
      expect(saved.draft).toEqual({ ...(before.draft as object), title: value });
      await page.getByRole("link", { name: "Към текущата задача", exact: true }).click();
      await expect(title).toHaveValue(value);
    });

    test("O12 stores a single-line title after inserted and pasted line breaks", async ({
      page,
    }) => {
      const { fixture, before } = await openEditor(page);
      const title = page.getByLabel("Заглавие на обявата", { exact: true });
      const value = "Синтетичен просторен апартамент в Сандански";
      await title.fill("Синтетичен\nпросторен\r\nапартамент\u2028в\u2029Сандански");
      if (javaScriptEnabled) {
        await expect(title).toHaveValue(value);
        await title.press("Enter");
        await title.press("Shift+Enter");
        await expect(title).toHaveValue(value);
        // A clipboard replacement keeps word boundaries and leaves the caret after the paste.
        const start = value.indexOf("просторен");
        const pasted = "просторен апартамент";
        await title.evaluate(
          (node, selection) => {
            const control = node as HTMLTextAreaElement;
            control.setSelectionRange(selection.start, selection.end);
            const data = new DataTransfer();
            data.setData("text/plain", "просторен\r\n\nапартамент");
            control.dispatchEvent(
              new ClipboardEvent("paste", {
                clipboardData: data,
                bubbles: true,
                cancelable: true,
              }),
            );
          },
          { start, end: start + pasted.length },
        );
        await expect(title).toHaveValue(value);
        expect(await title.evaluate((node) => (node as HTMLTextAreaElement).selectionStart)).toBe(
          start + pasted.length,
        );
      } else {
        // Native textareas retain hard breaks; the server must guard the HTML POST itself.
        expect(await title.inputValue()).toContain("\n");
      }
      await page.getByRole("button", { name: "Запишете описанието", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Работната чернова е записана", exact: true }),
      ).toBeVisible();
      const [saved] = await db
        .select({ draft: schema.listings.draft, version: schema.listings.version })
        .from(schema.listings)
        .where(eq(schema.listings.id, fixture.listingId));
      if (!saved) throw new Error("The saved O12 listing is missing.");
      expect(saved.version).toBe(before.version + 1);
      expect(saved.draft).toEqual({ ...(before.draft as object), title: value });
      await page.getByRole("link", { name: "Към текущата задача", exact: true }).click();
      await expect(title).toHaveValue(value);
    });
  });
