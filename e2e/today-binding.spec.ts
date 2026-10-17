// O01 binding to the scoped read model, ported from Codex's codex/msr-o01-today-binding browser
// cases (4cae9799, 825091bf) onto the Figma Today screen: real totals beyond the loaded page,
// record and locale scope, rows that open their own workspaces, native navigation, and no
// promise of a page that would continue a list, except the translation reviews, which continue
// in the O01 focus view (?queue=translation-reviews&after=<cursor>). Every count here is scoped
// by this test's own grants, so parallel workers cannot change it. Agency-wide delivery
// operations live in today-operations.spec.ts; the unavailable-list case waits in
// today-unavailable.spec.ts.
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { eq } from "drizzle-orm";
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
      // No page lists exactly these viewings: the count stays plain and nothing promises more.
      await expect(
        viewings.getByText(
          "Today shows the first 30 of 31. The full list is not available here yet.",
        ),
      ).toBeVisible();
      await expect(viewings.getByRole("heading", { level: 3 }).getByRole("link")).toHaveCount(0);
      await expect(viewings.locator('a[href="/en/calendar"]')).toHaveCount(0);
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

    test("O01 a reviewer scoped to one language keeps the translations it may open and links past the thirtieth", async ({
      page,
      context,
    }, testInfo) => {
      const staff = await staffSession(db, context);
      const items = await localeOnlyTranslations(staff.id);
      const first = items[0],
        last = items[30];
      if (!first || !last) throw new Error("Missing translation fixtures");
      await page.goto(hostUrl("staff", "/en/today"));
      // Only the 31 Russian reviews the grants allow are counted; the English one is not.
      await expect(
        page.getByRole("main").getByText("Waiting for action: 31. Start at the top of the list."),
      ).toBeVisible();
      const group = page.locator('[data-today-group="translation-reviews"]');
      const heading = group.getByRole("heading", { level: 3 });
      await expect(heading).toHaveText("Translations to reviewIn the queue: 31");
      // The count and the line past the thirtieth open the same queue in the O01 focus view.
      await expect(heading.getByRole("link")).toHaveAttribute("href", focusPath);
      await expect(group.getByText("Today shows the first 30 of 31.")).toBeVisible();
      await expect(group.getByRole("link", { name: "Open the full list" })).toHaveAttribute(
        "href",
        focusPath,
      );
      // Nothing points this reviewer at the Inventory, which a language grant cannot open.
      await expect(
        page.locator('main a[href^="/en/inventory?"], main a[href="/en/inventory"]'),
      ).toHaveCount(0);
      const link = (reference: string) => translationLink(group, reference);
      await expect(link(first.reference)).toBeVisible();
      await group.getByText("Show 25 more").click();
      await expect(group.locator('a[href$="/translations/ru"]')).toHaveCount(30);
      await expect(group.locator('a[href$="/translations/en"]')).toHaveCount(0);
      await expect(group.getByText(last.reference, { exact: false })).toHaveCount(0);
      expect(await noOverflow(page)).toBe(true);
      if (javaScriptEnabled) await accessible(page);
      await capture(page, testInfo.outputPath(`today-translations-31-${javaScriptEnabled}`));
      await link(first.reference).click();
      await expect(page).toHaveURL(
        hostUrl("staff", `/en/inventory/${first.reference}/translations/ru`),
      );
      await expect(page.getByRole("heading", { level: 1 })).toContainText("RU");
      await expect(page.getByText("Synthetic BG source", { exact: true })).toBeVisible();
      await expect(page.getByRole("textbox", { name: /title/i })).toHaveValue(
        "Synthetic RU translation",
      );
    });

    test("O01 the focus view pages the same translation reviews by the server's cursor and refuses a link it cannot continue", async ({
      page,
      context,
      browser,
    }, testInfo) => {
      test.setTimeout(120_000);
      const staff = await staffSession(db, context);
      const items = await localeOnlyTranslations(staff.id);
      const first = items[0],
        thirtieth = items[29],
        last = items[30];
      if (!first || !thirtieth || !last) throw new Error("Missing translation fixtures");
      await page.goto(hostUrl("staff", "/en/today"));
      const group = page.locator('[data-today-group="translation-reviews"]');
      // Today shows the thirty it read, plus a link to the rest.
      await expect(group.locator('a[href$="/translations/ru"]')).toHaveCount(30);
      await group.getByRole("link", { name: "Open the full list" }).click();

      // Page one: the oldest thirty under the server's total, each opening its workbench.
      await expect(page).toHaveURL(hostUrl("staff", focusPath));
      const view = page.locator('[data-today-focus="translation-reviews"]');
      await expect(view).toHaveAttribute("data-today-state", "ready");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Translations to review");
      await expect(view.getByText("Waiting for review: 31, oldest first.")).toBeVisible();
      const list = page.getByRole("list", { name: "Translations to review" });
      await expect(list.getByRole("link")).toHaveCount(30);
      await expect(translationLink(list, first.reference)).toHaveAttribute(
        "href",
        `/en/inventory/${first.reference}/translations/ru`,
      );
      await expect(translationLink(list, thirtieth.reference)).toBeVisible();
      await expect(list.getByText(last.reference, { exact: false })).toHaveCount(0);
      await expect(page.locator('main a[href$="/translations/en"]')).toHaveCount(0);
      expect(await noOverflow(page)).toBe(true);
      if (javaScriptEnabled) await accessible(page);
      await capture(page, testInfo.outputPath(`today-focus-page-1-${javaScriptEnabled}`));

      // Page two, after the server's cursor: the rest, and a way back to the first page.
      const pages = page.getByRole("navigation", { name: "Pages of this list" });
      const next = await pages.getByRole("link", { name: "Next page" }).getAttribute("href");
      const cursor = new URL(next ?? "", hostUrl("staff", "/")).searchParams.get("after");
      if (!next || !cursor) throw new Error("Missing the next page link");
      expect(next).toBe(`${focusPath}&after=${cursor}`);
      await pages.getByRole("link", { name: "Next page" }).click();
      await expect(page).toHaveURL(hostUrl("staff", next));
      await expect(view.getByText("Continued after the previous page.")).toBeVisible();
      await expect(view.getByText("Waiting for review: 31, oldest first.")).toBeVisible();
      await expect(list.getByRole("link")).toHaveCount(1);
      await expect(translationLink(list, last.reference)).toHaveAttribute(
        "href",
        `/en/inventory/${last.reference}/translations/ru`,
      );
      await expect(pages.getByRole("link", { name: "Next page" })).toHaveCount(0);
      expect(await noOverflow(page)).toBe(true);
      if (javaScriptEnabled) await accessible(page);
      await capture(page, testInfo.outputPath(`today-focus-page-2-${javaScriptEnabled}`));
      await pages.getByRole("link", { name: "Go to the first page" }).click();
      await expect(page).toHaveURL(hostUrl("staff", focusPath));
      await expect(list.getByRole("link")).toHaveCount(30);
      await page.getByRole("link", { name: "Back to Today" }).click();
      await expect(page).toHaveURL(hostUrl("staff", "/en/today"));
      await expect(group.getByRole("heading", { level: 3 })).toHaveText(
        "Translations to reviewIn the queue: 31",
      );

      // A cursor the server refuses is a link that is no longer valid, never a failure: one
      // that is not a cursor at all, and this person's own cursor with an impossible date.
      const position = JSON.parse(Buffer.from(cursor, "base64url").toString());
      const impossible = Buffer.from(
        JSON.stringify({ ...position, at: "2026-02-30T25:61:00.000000Z" }),
      ).toString("base64url");
      for (const after of ["not-a-cursor", impossible]) {
        await page.goto(hostUrl("staff", `${focusPath}&after=${after}`));
        await expect(view).toHaveAttribute("data-today-state", "invalid-link");
        await expect(
          page.getByText("This page link is no longer valid. Start from the first page."),
        ).toBeVisible();
        await expect(page.getByRole("list", { name: "Translations to review" })).toHaveCount(0);
        await expect(page.getByText(/could not load/)).toHaveCount(0);
      }
      expect(await noOverflow(page)).toBe(true);
      if (javaScriptEnabled) await accessible(page);
      await capture(page, testInfo.outputPath(`today-focus-invalid-${javaScriptEnabled}`));
      await page.getByRole("link", { name: "Go to the first page" }).click();
      await expect(page).toHaveURL(hostUrl("staff", focusPath));
      await expect(list.getByRole("link")).toHaveCount(30);

      // Another person's cursor never continues their list here: it is refused the same way.
      const other = await browser.newContext({ ...testInfo.project.use, javaScriptEnabled });
      try {
        await staffSession(db, other);
        const otherPage = await other.newPage();
        await otherPage.goto(hostUrl("staff", next));
        await expect(otherPage.locator("[data-today-focus]")).toHaveAttribute(
          "data-today-state",
          "invalid-link",
        );
        await expect(otherPage.getByText(last.reference, { exact: false })).toHaveCount(0);
      } finally {
        await other.close();
      }
      // A queue Today does not page is not a page.
      expect((await page.goto(hostUrl("staff", "/en/today?queue=viewings")))?.status()).toBe(404);
    });
  });

const focusPath = "/en/today?queue=translation-reviews";
const translationLink = (scope: Locator, reference: string) =>
  scope.getByRole("link", { name: new RegExp(`^Translation to review · RU · ${reference}`) });

async function accessible(page: Page) {
  // Axe needs browser timers, which Playwright stops when scripting is off.
  expect(
    (
      await new AxeBuilder({ page })
        .include("main")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
}

/** Full-page captures at the project's width and at 320 px, for the review record. */
async function capture(page: Page, path: string) {
  const viewport = page.viewportSize();
  await page.screenshot({ path: `${path}-${viewport?.width}.png`, fullPage: true });
  if (!viewport || viewport.width === 320) return;
  await page.setViewportSize({ width: 320, height: viewport.height });
  expect(await noOverflow(page)).toBe(true);
  await page.screenshot({ path: `${path}-320.png`, fullPage: true });
  await page.setViewportSize(viewport);
}

/**
 * 31 Russian translations under review on approved sources, each readable and reviewable only
 * in Russian through record grants, plus one English review the grants do not cover.
 */
async function localeOnlyTranslations(staffId: string) {
  const marker = randomUUID().toUpperCase();
  const items = Array.from({ length: 31 }, (_, index) => ({
    id: randomUUID(),
    propertyId: randomUUID(),
    factId: randomUUID(),
    sourceId: randomUUID(),
    reference: `MS-TR-${index}-${marker}`,
  }));
  await db.insert(schema.properties).values(
    items.map((item) => ({
      id: item.propertyId,
      reference: `PR-${item.propertyId}`,
      propertyType: "apartment" as const,
      country: "BG",
      region: "Blagoevgrad",
      settlement: "Sandanski",
    })),
  );
  await db.insert(schema.propertyFactRevisions).values(
    items.map((item) => ({
      id: item.factId,
      propertyId: item.propertyId,
      revisionNumber: 1,
      contentDigest: randomUUID(),
      materialChange: "initial" as const,
      createdByKind: "system" as const,
      createdById: "synthetic-today",
    })),
  );
  await db.insert(schema.listings).values(
    items.map((item) => ({
      id: item.id,
      propertyId: item.propertyId,
      reference: item.reference,
      purpose: "sale" as const,
    })),
  );
  await db.insert(schema.listingRevisions).values(
    items.map((item) => ({
      id: item.sourceId,
      listingId: item.id,
      factRevisionId: item.factId,
      revisionNumber: 1,
      contentDigest: randomUUID(),
      sourceCopy: { text: { title: "Synthetic BG source", description: "Synthetic fixture" } },
      terms: {},
      disclosure: {},
      createdByKind: "system" as const,
      createdById: "synthetic-today",
    })),
  );
  for (const item of items)
    await db
      .update(schema.listings)
      .set({ approvedRevisionId: item.sourceId })
      .where(eq(schema.listings.id, item.id));
  const now = Date.now();
  // Oldest first: the 31st, newest, is the one beyond the loaded thirty.
  await db.insert(schema.localizedRevisions).values(
    items.map((item, index) => ({
      listingId: item.id,
      sourceRevisionId: item.sourceId,
      locale: "ru" as const,
      state: "reviewing" as const,
      title: "Synthetic RU translation",
      body: { description: "Synthetic translation" },
      updatedAt: new Date(now - (31 - index) * 1000),
    })),
  );
  const [first] = items;
  if (!first) throw new Error("Missing translation fixtures");
  await db.insert(schema.localizedRevisions).values({
    listingId: first.id,
    sourceRevisionId: first.sourceId,
    locale: "en",
    state: "reviewing",
    title: "English translation outside the grant",
  });
  await db.insert(schema.grants).values(
    items.flatMap((item) =>
      (["listing.read", "translation.review"] as const).map((capability) => ({
        principalId: staffId,
        capability,
        recordType: "listing",
        recordId: item.id,
        locales: ["ru" as const],
        reason: "Locale-only Today browser fixture",
      })),
    ),
  );
  return items;
}
