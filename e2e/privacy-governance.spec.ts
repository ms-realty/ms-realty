// O26/F30: real native/enhanced controlled records with synthetic staff and minimised evidence.
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  emptyGovernanceDocument,
  type GovernanceDocument,
  type GovernanceKind,
  governanceToValues,
} from "../src/domain/privacy-governance";
import { governanceCopy } from "../src/features/privacy-governance/copy";
import { formFields } from "../src/ui/form/contract";
import { hostUrl, origins } from "./hosts";

for (const javaScriptEnabled of [false, true])
  test(`O26 processing, transfers and incident response ${javaScriptEnabled ? "enhanced" : "native"}`, async ({
    browser,
  }, testInfo) => {
    // One journey exercises three controlled record kinds, competing tabs, history and receipts.
    test.setTimeout(60000);
    const fixture = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "src/server/privacy-governance/browser-seed.ts",
        ],
        { env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET }, encoding: "utf8" },
      ),
    ) as {
      operator: { id: string; token: string };
      other: { id: string; token: string };
      denied: { token: string };
    };
    const context = await browser.newContext({ ...testInfo.project.use, javaScriptEnabled }),
      c = governanceCopy("en"),
      base = "/en/operations/privacy-governance";
    const cookie = (value: string) => ({
      name: "msr_staff_session",
      value,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax" as const,
    });
    const marker = `Synthetic ${testInfo.project.name} ${javaScriptEnabled}`;
    function complete(kind: GovernanceKind): GovernanceDocument {
      const document = {
        ...emptyGovernanceDocument(kind),
        title: `${marker} ${kind}`,
        ownerId: fixture.operator.id,
        evidenceReference: `${marker} minimised source`,
        reviewPolicyReference: `${marker} internal review policy`,
        nextAction: `${marker} accountable follow-up`,
        nextReviewAt: new Date(Date.now() + 3600000).toISOString(),
      };
      if (document.kind === "processing")
        return {
          ...document,
          purpose: marker,
          dataSubjects: marker,
          dataClasses: marker,
          recipients: marker,
          systems: marker,
          lawfulBasisReference: marker,
          retentionReference: marker,
          securityReference: marker,
        };
      if (document.kind === "processor")
        return {
          ...document,
          processorName: marker,
          servicePurpose: marker,
          dataClasses: marker,
          territories: marker,
          transferState: "no_transfer",
          transferAssessmentReference: marker,
          agreementReference: marker,
          retentionReference: marker,
          securityReference: marker,
        };
      return {
        ...document,
        observedAt: new Date(Date.now() - 7200000).toISOString(),
        awarenessAt: new Date(Date.now() - 3600000).toISOString(),
        affectedScope: marker,
        impactAssessmentReference: marker,
        responsePolicyReference: marker,
        notificationDecision: "required",
        determinationById: fixture.operator.id,
        determinationReference: `${marker} qualified timestamp source`,
        deadlineAt: new Date(Date.now() + 7200000).toISOString(),
        deadlineTimezone: "America/New_York",
      };
    }
    async function fill(page: Page, document: GovernanceDocument) {
      const form = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: c.save, exact: true }) });
      for (const [key, value] of Object.entries(governanceToValues(document))) {
        if (key === "kind") continue;
        const control = form.locator(`[name="${key}"]`);
        if (
          [
            "ownerId",
            "determinationById",
            "lifecycle",
            "transferState",
            "notificationDecision",
            "responseState",
          ].includes(key)
        )
          await control.selectOption(value);
        else await control.fill(value);
      }
    }
    async function save(page: Page) {
      await page.getByRole("button", { name: c.save, exact: true }).click();
      await expect(page.getByRole("heading", { name: c.saved, exact: true })).toBeVisible();
    }
    async function create(page: Page, document: GovernanceDocument) {
      await page.goto(hostUrl("staff", `${base}/new?kind=${document.kind}`));
      const id = new URL(page.url()).searchParams.get("draft");
      expect(id).toMatch(/^[a-f0-9-]{36}$/);
      await fill(page, document);
      await save(page);
      const path = `${base}/${id}`;
      await page.goto(hostUrl("staff", path));
      return path;
    }
    async function review(page: Page) {
      const form = page
          .locator("form")
          .filter({ has: page.getByRole("button", { name: c.review, exact: true }) }),
        operation = await form.locator(`input[name="${formFields.operationId}"]`).inputValue();
      await form
        .getByLabel(c.note, { exact: true })
        .fill(`${marker} human review of exact saved source`);
      await form.getByLabel(c.confirm, { exact: true }).check();
      await form.getByRole("button", { name: c.review, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: c.reviewed, exact: true }).first(),
      ).toBeVisible();
      return operation;
    }
    try {
      await context.addCookies([cookie(fixture.operator.token)]);
      const page = await context.newPage();
      await page.goto(hostUrl("staff", "/en/settings?section=agency"));
      await page.getByRole("link", { name: c.title, exact: true }).click();
      await expect(page.getByRole("heading", { name: c.title, exact: true })).toBeVisible();
      const processing = complete("processing"),
        working = emptyGovernanceDocument("processing");
      Object.assign(working, {
        title: `${marker} awaiting policy`,
        ownerId: fixture.operator.id,
        nextAction: "Obtain real source and retention policy",
        nextReviewAt: processing.nextReviewAt,
      });
      const processingPath = await create(page, working);
      await expect(page.getByText(c.missing, { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: c.review, exact: true })).toHaveCount(0);
      await fill(page, processing);
      await save(page);
      await page.goto(hostUrl("staff", processingPath));
      const stale = await context.newPage();
      await stale.goto(hostUrl("staff", processingPath));
      await page.locator('textarea[name="purpose"]').fill(`${marker} changed source`);
      await save(page);
      await stale.getByLabel(c.note, { exact: true }).fill(`${marker} stale review intent`);
      await stale.getByLabel(c.confirm, { exact: true }).check();
      await stale.getByRole("button", { name: c.review, exact: true }).click();
      await expect(stale.getByText(c.conflict, { exact: true })).toBeVisible();
      await stale.close();
      await page.goto(hostUrl("staff", processingPath));
      const operation = await review(page),
        receiptPath = `${processingPath}/operations/review/${encodeURIComponent(operation)}`;
      await page.goto(hostUrl("staff", receiptPath));
      await expect(page.getByRole("heading", { name: c.reviewed, exact: true })).toBeVisible();
      const other = await browser.newContext({ ...testInfo.project.use, javaScriptEnabled });
      try {
        await other.addCookies([cookie(fixture.other.token)]);
        const otherPage = await other.newPage();
        await otherPage.goto(hostUrl("staff", receiptPath));
        await expect(otherPage.getByText(c.absent, { exact: true })).toBeVisible();
        const processor = complete("processor");
        if (processor.kind !== "processor") throw new Error("Expected processor");
        processor.processingRecordId = processingPath.split("/").at(-1) as string;
        const processorPath = await create(page, processor);
        await review(page);
        await page.goto(hostUrl("staff", processorPath));
        await expect(page.getByRole("heading", { name: c.reviewed, exact: true })).toBeVisible();
        const incident = complete("incident");
        const incidentPath = await create(page, incident);
        await otherPage.goto(hostUrl("staff", incidentPath));
        await expect(otherPage.getByText(c.qualifiedRequired, { exact: true })).toBeVisible();
        await expect(otherPage.getByRole("button", { name: c.review, exact: true })).toHaveCount(0);
        await otherPage
          .locator('textarea[name="nextAction"]')
          .fill(`${marker} manual operator follow-up`);
        await save(otherPage);
        await page.goto(hostUrl("staff", incidentPath));
        await review(page);
        await page.goto(hostUrl("staff", incidentPath));
        await expect(page.getByText(c.timer.notification, { exact: true })).toBeVisible();
        if (incident.kind !== "incident" || !incident.deadlineAt)
          throw new Error("Expected incident deadline");
        await expect(page.locator(`time[datetime="${incident.deadlineAt}"]`)).toHaveText(
          new Intl.DateTimeFormat("en", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZone: "America/New_York",
            timeZoneName: "short",
          }).format(new Date(incident.deadlineAt)),
        );
        await page.locator('select[name="responseState"]').selectOption("closed");
        await page
          .locator('textarea[name="responseEvidenceReference"]')
          .fill(`${marker} human response and closure receipt`);
        await save(page);
        await page.goto(hostUrl("staff", incidentPath));
        await review(page);
        await page.goto(hostUrl("staff", incidentPath));
        await expect(page.getByText(c.timer.response_recorded, { exact: true })).toBeVisible();
        await page.setViewportSize({ width: 320, height: 844 });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
        if (javaScriptEnabled)
          expect(
            (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
              .violations,
          ).toEqual([]);
        await page.screenshot({
          path: testInfo.outputPath("privacy-governance-record.png"),
          fullPage: true,
        });
        const version = page
          .locator("section")
          .filter({ has: page.getByRole("heading", { name: c.history, exact: true }) })
          .getByRole("link", { name: new RegExp(`^${c.version} [0-9]+$`) })
          .first();
        await version.click();
        await expect(
          page.getByText(`${marker} human response and closure receipt`, { exact: true }),
        ).toBeVisible();
        await page.setViewportSize({ width: 320, height: 844 });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
        if (javaScriptEnabled)
          expect(
            (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
              .violations,
          ).toEqual([]);
        await page.screenshot({
          path: testInfo.outputPath("privacy-governance-revision.png"),
          fullPage: true,
        });
      } finally {
        await other.close();
      }
      const denied = await browser.newContext({ ...testInfo.project.use, javaScriptEnabled });
      try {
        await denied.addCookies([cookie(fixture.denied.token)]);
        const deniedPage = await denied.newPage();
        await deniedPage.goto(hostUrl("staff", processingPath));
        await expect(deniedPage.getByText(c.denied, { exact: true })).toBeVisible();
        await expect(deniedPage.getByText(`${marker} changed source`, { exact: true })).toHaveCount(
          0,
        );
      } finally {
        await denied.close();
      }
    } finally {
      await context.close();
    }
  });
