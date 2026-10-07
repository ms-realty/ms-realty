// O01 binding to the scoped read model, ported from Codex's codex/msr-o01-today-binding browser
// cases onto the Figma Today screen: real totals beyond the loaded page, record scope, rows that
// open their own workspaces, and native navigation. The unavailable-list case lives in
// today-unavailable.spec.ts because it breaks a shared table.
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import * as schema from "../src/db/schema";
import { hostUrl } from "./hosts";
import { noOverflow, staffSession, todayDatabase } from "./today-helpers";

const { connection, db } = todayDatabase();
test.afterAll(async () => {
  await connection.end();
});

for (const javaScriptEnabled of [false, true])
  test.describe(`JavaScript ${javaScriptEnabled ? "on" : "off"}`, () => {
    test.use({ javaScriptEnabled });

    test("O01 scoped viewings, Case work and listing drafts keep their real totals and native navigation", async ({
      page,
      context,
    }, testInfo) => {
      const staff = await staffSession(db, context);
      const marker = randomUUID();
      const cases = await db
        .insert(schema.cases)
        .values(
          ["allowed", "hidden"].map((key) => ({
            reference: `CS-${key}-${marker}`,
            kind: "buyer" as const,
            stage: "needs_agreed",
            title: `Today ${key} case`,
            ownerId: staff.id,
            nextAction: "Review the agreed brief",
            clientSummary: "Review shared requirements",
          })),
        )
        .returning();
      const [allowed, hidden] = cases;
      if (!allowed || !hidden) throw new Error("Missing test cases");
      const now = Date.now();
      const appointments = await db
        .insert(schema.appointments)
        .values(
          Array.from({ length: 32 }, (_, n) => ({
            reference: `AP-${n}-${marker}`,
            caseId: n === 31 ? hidden.id : allowed.id,
            format: "in_person" as const,
            timezone: "Europe/Sofia",
            icsUid: randomUUID(),
            hostId: staff.id,
            proposedStartsAt: new Date(now + (n + 1) * 3600000),
            proposedEndsAt: new Date(now + (n + 1) * 3600000 + 1800000),
          })),
        )
        .returning();
      const [property] = await db
        .insert(schema.properties)
        .values({
          reference: `PR-${marker}`,
          propertyType: "apartment",
          country: "BG",
          region: "Blagoevgrad",
          settlement: "Sandanski",
        })
        .returning();
      if (!property) throw new Error("Missing test property");
      const [listing] = await db
        .insert(schema.listings)
        .values({
          reference: `MS-${marker}`,
          propertyId: property.id,
          purpose: "sale",
          responsibleBrokerId: staff.id,
        })
        .returning();
      if (!listing) throw new Error("Missing test listing");
      await db.insert(schema.grants).values([
        {
          principalId: staff.id,
          capability: "case.read",
          recordType: "case",
          recordId: allowed.id,
          reason: "Scoped Today browser fixture",
        },
        {
          principalId: staff.id,
          capability: "case.read_internal",
          recordType: "case",
          recordId: allowed.id,
          reason: "Scoped Today browser fixture",
        },
        ...appointments.map((row) => ({
          principalId: staff.id,
          capability: "appointment.manage" as const,
          recordType: "appointment",
          recordId: row.id,
          reason: "Scoped Today browser fixture",
        })),
        ...["listing.read", "listing.edit"].map((capability) => ({
          principalId: staff.id,
          capability: capability as "listing.read" | "listing.edit",
          recordType: "listing",
          recordId: listing.id,
          reason: "Scoped Today browser fixture",
        })),
      ]);
      await page.goto(hostUrl("staff", "/en/today"));
      const main = page.getByRole("main");
      // 31 readable viewings and the new listing's availability check; the hidden Case's
      // viewing is not counted.
      await expect(
        main.getByText("Waiting for action: 32. Start at the top of the list."),
      ).toBeVisible();
      const viewings = page.locator('[data-today-group="viewings"]');
      await expect(viewings.getByRole("heading", { level: 3 })).toHaveText(
        "ViewingsIn the queue: 31",
      );
      await expect(viewings.getByText(/^Today shows the first 30 of 31\./)).toBeVisible();
      await expect(viewings.getByRole("link", { name: "Calendar", exact: true })).toHaveAttribute(
        "href",
        "/en/calendar",
      );
      const first = appointments[0],
        sixth = appointments[5];
      if (!first || !sixth) throw new Error("Missing ordered viewing fixtures");
      const row = (reference: string) =>
        viewings.getByRole("link", { name: new RegExp(`^Proposed viewing time · ${reference}`) });
      await expect(row(first.reference)).toBeVisible();
      await expect(row(first.reference)).toContainText("Host: Today broker · ");
      await expect(row(first.reference)).toContainText(`Case ${allowed.reference}`);
      await expect(row(first.reference)).toContainText("Next step: confirm or change the time");
      await expect(row(sixth.reference)).toBeHidden();
      // The rest of what Today read opens in place, with or without JavaScript.
      await viewings.getByText("Show 25 more").click();
      await expect(row(sixth.reference)).toBeVisible();
      await expect(page.getByText(`AP-31-${marker}`, { exact: false })).toHaveCount(0);

      const reviews = page.locator('[data-today-group="listing-reviews"]');
      await expect(
        reviews.getByRole("link", {
          name: new RegExp(`^Availability to confirm · ${listing.reference}`),
        }),
      ).toHaveAttribute("href", `/en/inventory/${listing.reference}`);
      const continued = page.locator('[data-today-group="case-continue"]');
      const caseRow = continued.getByRole("link", { name: /^Today allowed case/ });
      await expect(caseRow).toHaveAttribute("href", `/en/cases/${allowed.id}`);
      await expect(caseRow).toContainText("Next step: Review the agreed brief");
      await expect(continued.getByText(/Today hidden case/)).toHaveCount(0);
      const drafts = page.locator('[data-today-group="draft-continue"]');
      await expect(
        drafts.getByRole("link", { name: new RegExp(`^Draft · ${listing.reference}`) }),
      ).toHaveAttribute("href", `/en/inventory/${listing.reference}`);
      // Today links to each workspace; nothing here publishes, sends or approves.
      await expect(main.getByRole("button", { name: /publish|send|approve/i })).toHaveCount(0);
      expect(await noOverflow(page)).toBe(true);
      // Axe needs browser timers, which Playwright stops when scripting is off.
      if (javaScriptEnabled)
        expect(
          (
            await new AxeBuilder({ page })
              .include("main")
              .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`today-scoped-${javaScriptEnabled}.png`),
        fullPage: true,
      });
      await row(first.reference).click();
      await expect(page).toHaveURL(hostUrl("staff", `/en/calendar/${first.id}`));
      await expect(
        page.getByRole("heading", { name: first.reference, exact: false }),
      ).toBeVisible();
    });
  });
