// O26/F30 · AT45/UX23: real native POST, lost response, same-key readback and partial outcomes.
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { erasureCategories } from "../src/domain/privacy-erasure";
import { privacyErasureCopy } from "../src/features/privacy/erasure-copy";
import { hostUrl, origins } from "./hosts";
import { test } from "./support/policy-test";

// The reviewed policy is one agency singleton; share B08's lock across browser projects.
test.describe.configure({ mode: "serial" });

for (const javascript of [false, true])
  test(`AT45 reviewed erasure ${javascript ? "enhanced" : "native"}`, async ({
    browser,
  }, testInfo) => {
    // The automatic policy fixture has already validated the disposable URL and owns its lease.
    const connection = postgres(process.env.E2E_DATABASE_URL as string, {
        max: 1,
        onnotice: () => {},
      }),
      db = drizzle(connection, { schema });
    try {
      const fixture = JSON.parse(
        execFileSync(
          process.execPath,
          [
            "--conditions=react-server",
            "--import",
            "tsx",
            "src/server/privacy/erasure-browser-seed.ts",
          ],
          { env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET }, encoding: "utf8" },
        ),
      ) as {
        staffToken: string;
        clientToken: string;
        requestId: string;
        partyId: string;
        otherPartyId: string;
      };
      const context = await browser.newContext({
        ...testInfo.project.use,
        javaScriptEnabled: javascript,
      });
      try {
        await context.addCookies([
          {
            name: "msr_staff_session",
            value: fixture.staffToken,
            url: origins.staff,
            httpOnly: true,
            sameSite: "Lax",
          },
          {
            name: "msr_client_session",
            value: fixture.clientToken,
            url: origins.client,
            httpOnly: true,
            sameSite: "Lax",
          },
        ]);
        const page = await context.newPage(),
          c = privacyErasureCopy("en");
        const path = `/en/operations/privacy/${fixture.requestId}/erasure`;
        await page.goto(hostUrl("staff", path));
        await expect(page.getByRole("heading", { name: c.title, exact: true })).toBeVisible();
        const original = new URL(page.url()),
          operation = original.searchParams.get("operation");
        expect(operation).toBeTruthy();
        await page.reload();
        expect(new URL(page.url()).searchParams.get("operation")).toBe(operation);
        for (const category of erasureCategories) {
          await page
            .locator(`input[name="evidence:${category}"]`)
            .fill("Synthetic source review; disposable browser only");
          if (["contact_preferences", "matching_aliases"].includes(category)) {
            await page
              .locator(`select[name="disposition:${category}"]`)
              .selectOption("erase_optional_copy");
            await page
              .locator(`select[name="classification:${category}"]`)
              .selectOption("optional_only");
          }
        }
        await page.getByLabel(c.confirm, { exact: true }).check();
        if (javascript) expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        const submit = `**/operations/privacy/${fixture.requestId}/erasure/submit*`;
        await page.route(submit, async (route) => {
          const committed = await route.fetch({ maxRedirects: 0 });
          expect(committed.status()).toBe(303);
          const receipt = new URL(committed.headers().location ?? "", origins.staff);
          expect(receipt.pathname).toBe(path);
          expect(receipt.searchParams.get("error")).toBeNull();
          expect(receipt.searchParams.get("operation")).toBe(operation);
          expect(receipt.searchParams.get("receipt")).toBeTruthy();
          await route.abort("failed");
        });
        // The server commits; deliberately lose its response and recover using the issued key.
        await page.getByRole("button", { name: c.apply, exact: true }).click();
        await page.unroute(submit);
        await page.goto(hostUrl("staff", `${path}/submit?${original.searchParams}`));
        await expect(page.getByText(c.statuses.succeeded, { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: c.apply, exact: true })).toHaveCount(0);
        await expect(page.getByText(c.localApplied, { exact: true })).toBeVisible();
        await expect(page.getByText(c.manual, { exact: true })).toBeVisible();
        const decisions = await db
          .select()
          .from(schema.privacySafetyDecisions)
          .where(eq(schema.privacySafetyDecisions.requestId, fixture.requestId));
        expect(decisions).toHaveLength(1);
        const [party] = await db
          .select()
          .from(schema.parties)
          .where(eq(schema.parties.id, fixture.partyId));
        expect(party).toMatchObject({
          contactPreferences: {},
          matchingAliases: [],
          givenName: "Synthetic retained name",
        });
        const [request] = await db
          .select()
          .from(schema.privacyRequests)
          .where(eq(schema.privacyRequests.id, fixture.requestId));
        expect(request?.state).toBe("in_progress");
        const [other] = await db
          .select()
          .from(schema.parties)
          .where(eq(schema.parties.id, fixture.otherPartyId));
        expect(other?.displayName).toBe("Test Client");
        await page.getByRole("link", { name: c.completionCheck, exact: true }).click();
        await page.getByLabel(c.confirmCheck, { exact: true }).check();
        await page.getByRole("button", { name: c.completionCheck, exact: true }).click();
        await expect(page.getByText(c.localApplied, { exact: true })).toBeVisible();
        expect(
          (
            await db
              .select()
              .from(schema.privacyRequests)
              .where(eq(schema.privacyRequests.id, fixture.requestId))
          )[0]?.state,
        ).toBe("in_progress");
        await page.screenshot({
          path: testInfo.outputPath(`erasure-${javascript ? "enhanced" : "native"}.png`),
          fullPage: true,
        });
        await page.setViewportSize({ width: 320, height: 800 });
        expect(
          await page.locator("body").evaluate((node) => node.scrollWidth <= window.innerWidth),
        ).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`erasure-${javascript ? "enhanced" : "native"}-mobile.png`),
          fullPage: true,
        });
        const client = await context.newPage();
        await client.goto(hostUrl("client", "/en/privacy"));
        expect(new URL(client.url()).pathname).toContain("/access");
      } finally {
        await context.close();
      }
    } finally {
      await connection.end({ timeout: 2 });
    }
  });
