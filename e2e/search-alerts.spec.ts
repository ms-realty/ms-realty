// P10 records an explicit preference using existing identity/consent. It does not prove mail delivery.
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { searchAlertCopy } from "../src/features/discovery/search-alert-copy";
import { privacyCopy } from "../src/features/privacy/copy";
import { hostUrl, origins } from "./hosts";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("Search alerts require the generated disposable browser database");
const connection = postgres(databaseUrl, { max: 2 }),
  db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());
const filters = new URLSearchParams({
  purpose: "long_term_rent",
  q: "Synthetic search alerts",
  type: "apartment,house",
  minPrice: "950.03",
  maxPrice: "1500.07",
  currency: "EUR",
  minBeds: "2",
  maxBeds: "3",
  minRooms: "3",
  maxRooms: "5",
  areaBasis: "built",
  minArea: "74.51",
  maxArea: "90.07",
  features: "lift,parking",
  includeUnconfirmed: "1",
  sort: "price_asc",
});
for (const javaScriptEnabled of [true, false]) {
  test.describe(`P10 search alerts with JavaScript ${javaScriptEnabled}`, () => {
    test.use({ javaScriptEnabled });
    test("public review preserves exact search through account continuation and offers a manual route", async ({
      page,
    }, info) => {
      const c = searchAlertCopy("en");
      await page.goto(hostUrl("public", `/en/properties?${filters}`));
      await page.getByRole("link", { name: c.entry, exact: true }).click();
      await expect(page.getByRole("heading", { name: c.title, exact: true })).toBeVisible();
      const publicUrl = new URL(page.url());
      expect(publicUrl.searchParams.get("minArea")).toBe("74.51");
      expect(publicUrl.searchParams.get("minPrice")).toBe("950.03");
      expect(publicUrl.searchParams.get("includeUnconfirmed")).toBe("1");
      await expect(page.locator('input[type="email"]')).toHaveCount(0);
      await expect(page.getByRole("link", { name: c.manual, exact: true })).toHaveAttribute(
        "href",
        "/en/inquire",
      );
      const accountHref = await page
        .getByRole("link", { name: c.account, exact: true })
        .getAttribute("href");
      if (!accountHref) throw new Error("Missing account continuation");
      expect(new URL(accountHref).searchParams.toString()).toBe(publicUrl.searchParams.toString());
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
        await page.screenshot({
          path: info.outputPath(`search-alert-review-${width}-${javaScriptEnabled}.png`),
          fullPage: true,
        });
      }
      await page.getByRole("link", { name: c.account, exact: true }).click();
      await expect(page).toHaveURL(
        (url) => url.origin === origins.client && url.pathname === "/en/access",
      );
      expect(new URL(page.url()).searchParams.get("returnTo")).toBe(
        new URL(accountHref).pathname + new URL(accountHref).search,
      );
      await page.goBack();
      await page.getByRole("link", { name: c.edit, exact: true }).click();
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === "/en/properties" &&
          url.searchParams.get("minArea") === "74.51" &&
          url.searchParams.get("includeUnconfirmed") === "1",
      );
    });
    test("verified account records one exact search with separate consent and can pause it natively", async ({
      page,
      context,
    }, info) => {
      const fixture = JSON.parse(
        execFileSync(
          process.execPath,
          [
            "--conditions=react-server",
            "--import",
            "tsx",
            "src/features/discovery/testing/search-alert-seed.ts",
          ],
          {
            encoding: "utf8",
            env: {
              ...process.env,
              AUTH_SECRET: process.env.E2E_AUTH_SECRET,
              DATABASE_URL: databaseUrl,
            },
          },
        ).trim(),
      ) as {
        token: string;
        partyId: string;
        contactId: string;
        email: string;
        unverifiedEmail: string;
      };
      await context.addCookies([
        {
          name: "msr_client_session",
          value: fixture.token,
          url: origins.client,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const c = searchAlertCopy("bg"),
        p = privacyCopy("bg");
      await page.setViewportSize({ width: 320, height: 900 });
      await page.goto(hostUrl("client", `/bg/preferences/search-alerts?${filters}`));
      await expect(page.getByRole("heading", { name: c.title, exact: true })).toBeVisible();
      await expect(page.getByRole("checkbox", { name: c.consent, exact: true })).not.toBeChecked();
      await expect(
        page.getByRole("option", { name: fixture.unverifiedEmail, exact: true }),
      ).toHaveCount(0);
      await page.getByLabel(p.email, { exact: true }).selectOption(fixture.contactId);
      await page.getByLabel(p.frequency, { exact: true }).selectOption("weekly");
      await page.getByLabel(p.timezone, { exact: true }).fill("Europe/Sofia");
      await page.getByRole("checkbox", { name: c.consent, exact: true }).check();
      await info.attach("account-width-320", {
        body: Buffer.from(
          JSON.stringify(
            await page.evaluate(() =>
              Array.from(document.querySelectorAll("body *"))
                .map((element) => {
                  const rect = element.getBoundingClientRect();
                  return {
                    tag: element.tagName,
                    class: element.getAttribute("class"),
                    left: rect.left,
                    right: rect.right,
                    width: rect.width,
                    scrollWidth: element.scrollWidth,
                    clientWidth: element.clientWidth,
                    text: element.textContent?.slice(0, 50),
                    display: getComputedStyle(element).display,
                  };
                })
                .filter(
                  (rect) =>
                    rect.right > 320 ||
                    rect.left < 0 ||
                    (rect.width > 0 && rect.scrollWidth > rect.clientWidth + 1),
                )
                .slice(0, 20),
            ),
            null,
            2,
          ),
        ),
        contentType: "application/json",
      });
      await page.screenshot({
        path: info.outputPath(`search-alert-account-before-width-${javaScriptEnabled}.png`),
        fullPage: true,
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        320,
      );
      await page.screenshot({
        path: info.outputPath(`search-alert-account-320-${javaScriptEnabled}.png`),
        fullPage: true,
      });
      await page.getByRole("button", { name: c.save, exact: true }).click();
      await expect(page.getByText(c.saved, { exact: true })).toBeVisible();
      const choices = await db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.partyId, fixture.partyId));
      expect(choices).toHaveLength(1);
      const saved = choices[0];
      expect(saved).toMatchObject({
        purpose: "search_alerts",
        state: "active",
        contactMethodId: fixture.contactId,
        frequency: "weekly",
        timezone: "Europe/Sofia",
        criteria: {
          locale: "bg",
          q: "Synthetic search alerts",
          sort: "price_asc",
          criteria: {
            purpose: "long_term_rent",
            propertyTypes: ["apartment", "house"],
            price: { currency: "EUR", min: 95003, max: 150007 },
            bedrooms: { min: 2, max: 3 },
            rooms: { min: 3, max: 5 },
            area: { basis: "built", min: 74.51, max: 90.07 },
            mustHave: ["lift", "parking"],
            includeNeedsConfirmation: true,
          },
        },
      });
      if (!saved) throw new Error("Missing saved preference");
      expect(
        await db
          .select()
          .from(schema.externalActions)
          .where(eq(schema.externalActions.subjectId, saved.id)),
      ).toEqual([]);
      const consent = await db
        .select()
        .from(schema.consentEvents)
        .where(eq(schema.consentEvents.subscriptionId, saved.id));
      expect(consent.some((event) => event.kind === "opted_in")).toBe(true);
      await page.getByRole("link", { name: c.preferences, exact: true }).first().click();
      const pause = page.getByRole("button", { name: p.pause, exact: true });
      await pause.click();
      await expect(page.getByText(new RegExp(p.receipt))).toBeVisible();
      expect(
        (
          await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.id, saved.id))
        )[0]?.state,
      ).toBe("paused");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        320,
      );
    });
  });
}
