// B10 / OPS09 / STA09: native and enhanced synthetic workflows on every supported profile.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { agencyCopy, caseReviewCopy } from "../src/features/agency-obligations/copy";
import { caseCopy } from "../src/features/cases/copy";
import { hostUrl, origins } from "./hosts";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable agency browser database required");
const connection = postgres(url, { max: 2 }),
  db = drizzle(connection, { schema });
test.afterAll(async () => {
  await connection.end();
});
type Fixture = {
  staffToken: string;
  staffId: string;
  clientToken: string;
  clientId: string;
  partyId: string;
  caseId: string;
  reviewId: string;
  contentPageId: string;
  contentVersionId: string;
  reviewSlug: string;
  listingId: string;
  listingReference: string;
};
function seed(): Fixture {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "src/server/agency-obligations/browser-seed.ts",
      ],
      {
        encoding: "utf8",
        env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
      },
    ),
  );
}

for (const javaScriptEnabled of [true, false]) {
  test(`B10 partner exact-source acceptance and honest property photography${javaScriptEnabled ? "" : " without JavaScript"}`, async ({
    browser,
  }, info) => {
    test.setTimeout(120000);
    const f = seed(),
      c = agencyCopy("en"),
      context = await browser.newContext({ ...info.project.use, javaScriptEnabled });
    try {
      await context.addCookies([
        {
          name: "msr_staff_session",
          value: f.staffToken,
          url: origins.staff,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      await page.goto(hostUrl("staff", "/en/operations/agency/partners/new"));
      const marker = `Synthetic standing partner ${randomUUID()}`;
      await page.getByLabel(c.fields.counterpartyPartyId, { exact: true }).selectOption(f.partyId);
      await page.getByLabel(c.fields.purpose, { exact: true }).fill(marker);
      await page
        .getByLabel(c.fields.sourceReference, { exact: true })
        .fill("Synthetic source only — no actual terms");
      await page.getByLabel(c.fields.sourceVersion, { exact: true }).fill("fixture-1");
      await page
        .getByLabel(c.fields.termsText, { exact: true })
        .fill(
          "Synthetic supplied terms for browser testing. No real fee policy, rate or legal clauses.",
        );
      await page
        .getByLabel(c.fields.acceptedReference, { exact: true })
        .fill("Synthetic counterparty acceptance");
      await page.getByLabel(c.fields.acceptedAt, { exact: true }).fill("2025-01-15T12:00");
      await page.getByLabel(c.fields.validUntil, { exact: true }).fill("2030-01-15T12:00");
      await page.getByLabel(c.termsReviewed, { exact: true }).check();
      await page.getByRole("button", { name: c.save, exact: true }).click();
      await expect(page.getByText(c.succeeded, { exact: true })).toBeVisible();
      await page.getByRole("link", { name: c.open, exact: true }).click();
      await expect(page.getByText(c.held, { exact: true })).toBeVisible();
      await page.setViewportSize({ width: 320, height: 844 });
      await page.screenshot({
        path: info.outputPath(`partner-held-${javaScriptEnabled ? "enhanced" : "native"}-320.png`),
        fullPage: true,
      });
      const approve = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: c.accept, exact: true }) })
        .last();
      await approve
        .getByLabel(c.fields.professionalName, { exact: true })
        .fill("Synthetic qualified reviewer");
      await approve
        .getByLabel(c.fields.note, { exact: true })
        .fill("Synthetic review of exact supplied source and counterparty acceptance");
      await approve.getByLabel(c.reviewed, { exact: true }).check();
      await approve.getByRole("button", { name: c.save, exact: true }).click();
      await expect(page.getByText(c.succeeded, { exact: true })).toBeVisible();
      await page.getByRole("link", { name: c.open, exact: true }).click();
      await expect(page.getByText(c.current, { exact: true })).toBeVisible();
      const [record] = await db
        .select()
        .from(schema.agencyPartnerTerms)
        .where(eq(schema.agencyPartnerTerms.purpose, marker));
      expect(record).toMatchObject({ caseId: null, state: "accepted", ownerId: f.staffId });
      if (info.project.name === "chromium-desktop") {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.screenshot({
          path: info.outputPath(
            `partner-accepted-${javaScriptEnabled ? "enhanced" : "native"}-desktop.png`,
          ),
          fullPage: true,
        });
      }
      await page.setViewportSize({ width: 320, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: info.outputPath(
          `partner-accepted-${javaScriptEnabled ? "enhanced" : "native"}-320.png`,
        ),
        fullPage: true,
      });
      const photoPath = `/en/inventory/${f.listingReference}/photography`;
      await page.goto(hostUrl("staff", photoPath));
      await page
        .getByLabel(c.fields.preferredWindow, { exact: true })
        .fill("Synthetic weekday morning");
      await page
        .getByLabel(c.fields.photographyScope, { exact: true })
        .fill(
          "Synthetic photography scope. Confirm access with the actual custodian; media rights remain held.",
        );
      await page.getByLabel(c.scopeReviewed, { exact: true }).check();
      await page.getByRole("button", { name: c.save, exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByText(c.succeeded, { exact: true })).toBeVisible();
      await page.getByRole("link", { name: c.open, exact: true }).click();
      await expect(page.getByRole("heading", { name: c.photo, exact: true })).toBeVisible();
      const [appointment] = await db
        .select()
        .from(schema.appointments)
        .where(eq(schema.appointments.listingId, f.listingId));
      expect(appointment).toMatchObject({ purpose: "photography", caseId: null, interestId: null });
      await page.screenshot({
        path: info.outputPath(
          `photography-workbench-${javaScriptEnabled ? "enhanced" : "native"}-320.png`,
        ),
        fullPage: true,
      });
      if (!appointment) throw new Error("Missing synthetic photography record");
      const viewingCopy = caseCopy("en");
      const arrange = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: c.arrangePhoto, exact: true }) })
        .last();
      await arrange.getByLabel(viewingCopy.action, { exact: true }).selectOption("confirm");
      const year = new Date().getUTCFullYear() + 1;
      await arrange.getByLabel(viewingCopy.start, { exact: true }).fill(`${year}-01-15T10:00`);
      await arrange.getByLabel(viewingCopy.end, { exact: true }).fill(`${year}-01-15T11:00`);
      await arrange.getByLabel(viewingCopy.access, { exact: true }).check();
      await arrange.getByLabel(viewingCopy.external, { exact: true }).check();
      await arrange
        .getByLabel(viewingCopy.logistics, { exact: true })
        .fill("Private synthetic property-work instructions, host only.");
      if (info.project.name === "chromium-desktop") {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.screenshot({
          path: info.outputPath(
            `photography-arrange-${javaScriptEnabled ? "enhanced" : "native"}-desktop.png`,
          ),
          fullPage: true,
        });
        await page.setViewportSize({ width: 320, height: 844 });
      }
      await page.screenshot({
        path: info.outputPath(
          `photography-arrange-${javaScriptEnabled ? "enhanced" : "native"}-320.png`,
        ),
        fullPage: true,
      });
      await arrange.getByRole("button", { name: viewingCopy.change, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: viewingCopy.saved, exact: true }),
      ).toBeVisible();
      await page.goto(hostUrl("staff", `/en/calendar/${appointment.id}`));
      await expect(page.getByTestId("appointment-state")).toHaveText(viewingCopy.confirmed);
      const actions = page
        .locator("details")
        .filter({ has: page.locator("summary").filter({ hasText: c.photoActions }) });
      await actions.locator("summary").first().click();
      await actions.getByLabel(viewingCopy.action, { exact: true }).selectOption("cancelled");
      await actions.getByLabel(viewingCopy.reason, { exact: true }).fill("x");
      await actions.getByRole("button", { name: viewingCopy.change, exact: true }).click();
      await expect(
        actions.getByRole("link", {
          name: `${viewingCopy.reason}: ${viewingCopy.invalid}`,
          exact: true,
        }),
      ).toBeVisible();
      await expect(actions.getByLabel(viewingCopy.reason, { exact: true })).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await expect(actions.getByLabel(viewingCopy.reason, { exact: true })).toHaveValue("x");
      await page.screenshot({
        path: info.outputPath(
          `photography-validation-${javaScriptEnabled ? "enhanced" : "native"}-320.png`,
        ),
        fullPage: true,
      });
      await actions
        .getByLabel(viewingCopy.reason, { exact: true })
        .fill("Synthetic explicit photography cancellation");
      await actions.getByRole("button", { name: viewingCopy.change, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: viewingCopy.saved, exact: true }),
      ).toBeVisible();
      await page.goto(hostUrl("staff", `/en/calendar/${appointment.id}`));
      await expect(page.getByTestId("appointment-state")).toHaveText(viewingCopy.cancelled);
      if (javaScriptEnabled)
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test(`B10 exact author consent, qualified verification, publication and withdrawal${javaScriptEnabled ? "" : " without JavaScript"}`, async ({
    browser,
  }, info) => {
    test.setTimeout(120000);
    const f = seed(),
      c = agencyCopy("en"),
      client = caseReviewCopy("en"),
      context = await browser.newContext({ ...info.project.use, javaScriptEnabled });
    try {
      await context.addCookies([
        {
          name: "msr_client_session",
          value: f.clientToken,
          url: origins.client,
          httpOnly: true,
          sameSite: "Lax",
        },
        {
          name: "msr_staff_session",
          value: f.staffToken,
          url: origins.staff,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      await page.goto(hostUrl("client", `/en/reviews/${f.reviewId}`));
      const grant = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: client.grant, exact: true }) });
      await grant.getByLabel(client.reviewed, { exact: true }).check();
      await grant.getByRole("button", { name: client.grant, exact: true }).click();
      await expect(page).toHaveURL(/reviews\/receipt/);
      expect(
        (
          await db
            .select()
            .from(schema.agencyCaseReviews)
            .where(eq(schema.agencyCaseReviews.id, f.reviewId))
        )[0],
      ).toMatchObject({
        consentState: "granted",
        consentSource: "client",
        consentDocumentVersionId: null,
      });
      await page.goto(hostUrl("staff", `/en/operations/agency/reviews/${f.reviewId}`));
      const verify = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: c.verify, exact: true }) })
        .last();
      await verify
        .getByLabel(c.fields.note, { exact: true })
        .fill("Synthetic verification of completed Case, original author and exact native assent");
      await verify.getByLabel(c.reviewed, { exact: true }).check();
      await verify.getByRole("button", { name: c.save, exact: true }).click();
      await expect(page.getByText(c.succeeded, { exact: true })).toBeVisible();
      await page.goto(hostUrl("staff", `/en/operations/agency/reviews/${f.reviewId}`));
      await page.setViewportSize({
        width: info.project.name === "chromium-desktop" ? 1440 : 390,
        height: 900,
      });
      await page.screenshot({
        path: info.outputPath("review-qualified-populated.png"),
        fullPage: true,
      });
      await page.setViewportSize({ width: 320, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: info.outputPath("review-qualified-320.png"), fullPage: true });
      await page.goto(hostUrl("staff", `/en/content/${f.contentPageId}`));
      for (const label of ["Approve editorial text", "Publish reviewed edition"]) {
        const form = page
          .locator("form")
          .filter({ has: page.getByRole("button", { name: label, exact: true }) });
        await form
          .getByLabel("Review evidence or reason", { exact: true })
          .fill("Synthetic exact publication review only");
        await form.getByLabel("Approval valid until", { exact: true }).fill("2030-01-15T12:00");
        await form
          .getByLabel("I reviewed this exact edition, its scope and this action.", { exact: true })
          .check();
        await form.getByRole("button", { name: label, exact: true }).click();
        await expect(page).toHaveURL(/content\/operations\?/);
        await page.goto(hostUrl("staff", `/en/content/${f.contentPageId}`));
      }
      const publicPage = await context.newPage();
      await publicPage.goto(hostUrl("public", `/bg/reviews/${f.reviewSlug}`));
      await expect(publicPage.getByRole("blockquote")).toContainText("Синтетичен отзив");
      await page.goto(hostUrl("client", `/en/reviews/${f.reviewId}`));
      const withdraw = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: client.withdraw, exact: true }) });
      await withdraw.getByLabel(client.reviewed, { exact: true }).check();
      await withdraw.getByRole("button", { name: client.withdraw, exact: true }).click();
      await expect(page).toHaveURL(/reviews\/receipt/);
      await publicPage.reload();
      await expect(publicPage.getByRole("blockquote")).toHaveCount(0);
      expect(
        (
          await db
            .select()
            .from(schema.agencyCaseReviews)
            .where(eq(schema.agencyCaseReviews.id, f.reviewId))
        )[0]?.consentState,
      ).toBe("withdrawn");
      await page.goto(hostUrl("staff", `/en/operations/agency/reviews/${f.reviewId}`));
      await page.screenshot({
        path: info.outputPath("review-withdrawn-held-320.png"),
        fullPage: true,
      });
      if (javaScriptEnabled)
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
