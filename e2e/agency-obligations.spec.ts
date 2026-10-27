// B10 / OPS09 / STA09: native and enhanced synthetic workflows on every supported profile.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { agencyCopy, caseReviewCopy } from "../src/features/agency-obligations/copy";
import { caseCopy } from "../src/features/cases/copy";
import { workCopy } from "../src/features/work/copy";
import { hostUrl, origins } from "./hosts";
import { test, withPolicyFixtureTimeout } from "./support/policy-test";

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
  partyName: string;
  caseId: string;
  reviewId: string;
  contentPageId: string;
  contentVersionId: string;
  reviewSlug: string;
  listingId: string;
  listingReference: string;
};
function seed(partnerPicker = false): Fixture {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "src/server/agency-obligations/browser-seed.ts",
        ...(partnerPicker ? ["--partner-picker"] : []),
      ],
      {
        encoding: "utf8",
        env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
      },
    ),
  );
}

test("B10 actual private JSON transport enforces surface, replay and original-author consent", async ({
  browser,
}, info) => {
  const f = seed(),
    context = await browser.newContext({ ...info.project.use });
  try {
    await context.addCookies([
      {
        name: "msr_staff_session",
        value: f.staffToken,
        url: origins.staff,
        httpOnly: true,
        sameSite: "Lax",
      },
      {
        name: "msr_client_session",
        value: f.clientToken,
        url: origins.client,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const page = await context.newPage();
    async function command(name: string, body: unknown) {
      return page.evaluate(
        async ({ name, body }) => {
          const response = await fetch(`/api/agency/${name}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
          return {
            status: response.status,
            cache: response.headers.get("cache-control"),
            data: await response.json(),
          };
        },
        { name, body },
      );
    }
    const input = {
      id: randomUUID(),
      operationId: randomUUID(),
      expectedVersion: 0,
      caseId: null,
      counterpartyPartyId: f.partyId,
      relationship: "referral",
      purpose: "Synthetic HTTP source binding",
      sourceReference: "Synthetic supplied source",
      sourceVersion: "http-fixture-1",
      termsText: "Synthetic exact terms. No actual fee, legal policy or acceptance.",
      documentVersionId: null,
      acceptedReference: null,
      acceptedAt: null,
      validUntil: null,
      unknowns: "Actual human terms and counterparty acceptance remain held.",
      reviewed: true,
    };
    for (const name of ["partnerSave", "clientConsent"]) {
      const publicAttempt = await context.request.post(hostUrl("public", `/api/agency/${name}`), {
        headers: { origin: origins.public },
        data: input,
      });
      expect(publicAttempt.status()).toBe(404);
    }
    await page.goto(hostUrl("staff", "/en/operations/agency"));
    expect((await command("unknown", input)).status).toBe(404);
    expect((await command("clientConsent", input)).status).toBe(404);
    const saved = await command("partnerSave", input);
    expect(saved).toMatchObject({
      status: 200,
      cache: "private, no-store",
      data: { replayed: false, outcome: { id: input.id, version: 1 } },
    });
    const replay = await command("partnerSave", input);
    expect(replay).toMatchObject({
      status: 200,
      data: { operationId: saved.data.operationId, replayed: true, outcome: saved.data.outcome },
    });
    expect(
      await command("partnerSave", { ...input, termsText: `${input.termsText} Changed` }),
    ).toMatchObject({ status: 409, data: { error: { code: "IDEMPOTENCY_KEY_REUSED" } } });
    expect(
      await command("partnerSave", { ...input, operationId: randomUUID(), expectedVersion: 99 }),
    ).toMatchObject({ status: 409, data: { error: { code: "REVISION_CONFLICT" } } });
    expect(
      (
        await command("partnerSave", {
          ...input,
          id: randomUUID(),
          operationId: randomUUID(),
          counterpartyPartyId: randomUUID(),
        })
      ).status,
    ).toBe(404);
    const [review] = await db
      .select()
      .from(schema.agencyCaseReviews)
      .where(eq(schema.agencyCaseReviews.id, f.reviewId));
    const [policy] = await db
      .select({ id: schema.contentPageVersions.id })
      .from(schema.contentPageVersions)
      .innerJoin(
        schema.contentPages,
        eq(schema.contentPages.id, schema.contentPageVersions.contentPageId),
      )
      .where(
        and(
          eq(schema.contentPages.kind, "help"),
          eq(schema.contentPages.slug, "review-publication-consent"),
          eq(schema.contentPages.currentVersionNumber, schema.contentPageVersions.versionNumber),
        ),
      );
    if (!review || !policy) throw new Error("Missing synthetic exact review/policy context");
    await page.goto(hostUrl("client", `/en/reviews/${f.reviewId}`));
    expect((await command("partnerSave", input)).status).toBe(404);
    const assent = {
      id: review.id,
      operationId: randomUUID(),
      expectedVersion: review.version,
      expectedHash: review.bindingHash,
      decision: "granted",
      policyVersionId: policy.id,
      reviewed: true,
    };
    const consent = await command("clientConsent", assent);
    expect(consent).toMatchObject({
      status: 200,
      data: { outcome: { id: review.id, consentState: "granted" } },
    });
    expect(await command("clientConsent", assent)).toMatchObject({
      status: 200,
      data: {
        operationId: consent.data.operationId,
        replayed: true,
        outcome: consent.data.outcome,
      },
    });
    expect(
      await command("clientConsent", {
        ...assent,
        operationId: randomUUID(),
        expectedVersion: consent.data.outcome.version,
        decision: "withdrawn",
        policyVersionId: null,
      }),
    ).toMatchObject({ status: 200, data: { outcome: { consentState: "withdrawn" } } });
    await db
      .update(schema.grants)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.grants.principalId, f.staffId),
          eq(schema.grants.capability, "compliance.review"),
        ),
      );
    await page.goto(hostUrl("staff", "/en/today"));
    expect((await command("partnerSave", input)).status).toBe(404);
    const retained = await db
      .select()
      .from(schema.agencyPartnerTerms)
      .where(eq(schema.agencyPartnerTerms.id, input.id));
    expect(retained).toHaveLength(1);
    expect(retained[0]).toMatchObject({ version: 1, state: "draft", termsText: input.termsText });
  } finally {
    await context.close();
  }
});

for (const javaScriptEnabled of [true, false]) {
  const test = withPolicyFixtureTimeout(120000);
  test(`B10 partner exact-source acceptance and honest property photography${javaScriptEnabled ? "" : " without JavaScript"}`, async ({
    browser,
  }, info) => {
    const f = seed(true),
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
      await expect(
        page.getByRole("heading", { name: c.pickCounterparty, exact: true }),
      ).toBeVisible();
      await expect(page.getByLabel(c.fields.termsText, { exact: true })).toHaveCount(0);
      const draft = new URL(page.url()).searchParams.get("draft");
      expect(draft).toMatch(/^[a-f0-9-]{36}$/);
      const choice = page.getByRole("link", { name: f.partyName, exact: true });
      await expect(choice).toHaveCount(0);
      await page.setViewportSize({ width: 320, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: info.outputPath(
          `partner-picker-${javaScriptEnabled ? "enhanced" : "native"}-320.png`,
        ),
        fullPage: true,
      });
      let pages = 0;
      while (!(await choice.count())) {
        const previousPage = Number(new URL(page.url()).searchParams.get("page") ?? 1);
        await page.getByRole("link", { name: workCopy("en").next, exact: true }).click();
        expect(new URL(page.url()).searchParams.get("draft")).toBe(draft);
        expect(Number(new URL(page.url()).searchParams.get("page"))).toBe(previousPage + 1);
        pages++;
      }
      expect(pages).toBeGreaterThan(0);
      await choice.click();
      expect(new URL(page.url()).searchParams.get("draft")).toBe(draft);
      expect(new URL(page.url()).searchParams.get("party")).toBe(f.partyId);
      await expect(page.getByLabel(c.fields.counterpartyPartyId, { exact: true })).toHaveValue(
        f.partyId,
      );
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
      expect(appointment).toMatchObject({
        purpose: "photography",
        caseId: null,
        interestId: null,
      });
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
      await page.screenshot({
        path: info.outputPath("review-qualified-320.png"),
        fullPage: true,
      });
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
          .getByLabel("I reviewed this exact edition, its scope and this action.", {
            exact: true,
          })
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
