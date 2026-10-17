// O32 / F29: synthetic UI and ordinary commands, separate from live model qualification.
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { type BrowserContext, expect, type Page, type TestInfo, test } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import {
  isDepartingWorkspacePrefetch,
  type WorkspacePrefetchFailure,
} from "../src/features/ai/testing/workspace-browser-diagnostics";
import { workspaceCopy } from "../src/features/ai/workspace-copy";
import { hostUrl, origins } from "./hosts";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Generative UI tests require the disposable browser database");
const connection = postgres(url, { max: 2 }),
  db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());
type Fixture = {
  id: string;
  actorId: string;
  token: string;
  caseId: string;
  caseReference: string;
  inquiryId: string;
  listingId: string;
  listingReference: string;
  taskId: string;
  buyerId: string;
  runId: string | null;
};
async function fixture(context: BrowserContext, mode?: "expired" | "active"): Promise<Fixture> {
  const data = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "src/features/ai/testing/workspace-seed.ts",
        ...(mode ? [mode] : []),
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          AUTH_SECRET: process.env.E2E_AUTH_SECRET,
          DATABASE_URL: url,
          APP_ORIGIN: origins.public,
          PUBLIC_ORIGIN: origins.public,
          CLIENT_ORIGIN: origins.client,
          STAFF_ORIGIN: origins.staff,
          CANONICAL_ORIGIN: "https://makler-realty.com",
          STAGING: "true",
          MEDIA_PUBLIC_BASE_URL: origins.public + "/media",
        },
      },
    ).trim(),
  ) as Fixture;
  await context.addCookies([
    {
      name: "msr_staff_session",
      value: data.token,
      url: origins.staff,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  return data;
}
const workspace = (locale: string, id: string) =>
  hostUrl("staff", "/" + locale + "/operations/assistance/research/" + id);

const browserDiagnostics = new WeakMap<
  Page,
  {
    errors: string[];
    console: string[];
    failedRequests: (WorkspacePrefetchFailure & { departingPage: string | null })[];
    providerRequests: string[];
    disabledScripts: string[];
    cancelledPrefetches: WorkspacePrefetchFailure[];
    departingPage: string | null;
  }
>();
test.beforeEach(async ({ page }, testInfo) => {
  const entries = {
    errors: [] as string[],
    console: [] as string[],
    failedRequests: [] as (WorkspacePrefetchFailure & { departingPage: string | null })[],
    providerRequests: [] as string[],
    disabledScripts: [] as string[],
    cancelledPrefetches: [] as WorkspacePrefetchFailure[],
    departingPage: null as string | null,
  };
  browserDiagnostics.set(page, entries);
  page.on("pageerror", (error) => entries.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") entries.console.push(message.text());
  });
  page.on("requestfailed", (request) => {
    const error = request.failure()?.errorText;
    if (error?.includes("ERR_ABORTED")) return;
    const headers = request.headers();
    const failure = {
      error,
      method: request.method(),
      resourceType: request.resourceType(),
      url: request.url(),
      referer: headers.referer,
      rsc: headers.rsc,
      prefetch: headers["next-router-prefetch"],
    };
    if (isDepartingWorkspacePrefetch(failure, entries.departingPage, origins.staff)) {
      entries.cancelledPrefetches.push(failure);
      return;
    }
    const nativeDisabledScript =
      testInfo.titlePath.some((part) => part.includes("JavaScript false")) &&
      request.resourceType() === "script" &&
      error === "csp" &&
      request.url().startsWith(origins.staff + "/_next/static/");
    if (nativeDisabledScript) entries.disabledScripts.push(request.url());
    else entries.failedRequests.push({ ...failure, departingPage: entries.departingPage });
  });
  page.on("request", (request) => {
    if (/openrouter|api\.openai|api\.anthropic/.test(request.url()))
      entries.providerRequests.push(request.url());
  });
});
test.afterEach(async ({ page }, testInfo) => {
  const entries = browserDiagnostics.get(page);
  await testInfo.attach("browser-diagnostics", {
    body: JSON.stringify(entries, null, 2),
    contentType: "application/json",
  });
  expect(entries?.errors).toEqual([]);
  expect(entries?.failedRequests).toEqual([]);
  expect(entries?.providerRequests).toEqual([]);
  expect(entries?.console).toEqual([]);
});
async function openWorkspacePage(page: Page, href: string) {
  const entries = browserDiagnostics.get(page);
  if (!entries) throw new Error("Missing workspace browser diagnostics");
  // These deliberate page changes may cancel Next's optional link prefetches.
  // The exception ends with this navigation and requires its exact departing referer.
  entries.departingPage = page.url() !== href ? page.url() : null;
  try {
    return await page.goto(href);
  } finally {
    entries.departingPage = null;
  }
}
async function capture(page: Page, testInfo: TestInfo, name: string) {
  if (
    testInfo.project.name !== "chromium-desktop" ||
    testInfo.titlePath.some((part) => part.includes("JavaScript false"))
  )
    return;
  const viewport = page.viewportSize();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      window.scrollTo(0, 0);
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await page.screenshot({
      path: testInfo.outputPath(name + "-" + width + ".png"),
      fullPage: true,
      animations: "disabled",
    });
  }
  if (viewport) await page.setViewportSize(viewport);
}

for (const javaScriptEnabled of [true, false]) {
  test.describe("F29 with JavaScript " + javaScriptEnabled, () => {
    test.use({ javaScriptEnabled });
    test("saves a free goal while generation is disabled and preserves corrections", async ({
      page,
      context,
    }, testInfo) => {
      const f = await fixture(context),
        copy = workspaceCopy("en");
      const [approved] = await db
        .select({ propertyId: schema.listings.propertyId })
        .from(schema.listings)
        .where(eq(schema.listings.id, f.listingId));
      if (!approved) throw new Error("Missing approved listing fixture");
      const unavailableReferences = [0, 1].map(() => `MS-${randomBytes(6).readUIntBE(0, 6)}`);
      await db.insert(schema.listings).values(
        unavailableReferences.map((reference, index) => ({
          reference,
          propertyId: approved.propertyId,
          purpose: "sale" as const,
          commercialState:
            index === 0 ? ("confirmation_required" as const) : ("withdrawn" as const),
          responsibleBrokerId: f.actorId,
        })),
      );
      const entry = await page.goto(hostUrl("staff", "/en/operations/assistance/research"));
      expect(entry?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: copy.title })).toBeVisible();
      await expect(page.getByText(copy.disabled)).toBeVisible();
      await expect(
        page.getByRole("checkbox", { name: f.listingReference, exact: true }),
      ).toBeVisible();
      for (const reference of unavailableReferences)
        await expect(page.getByRole("checkbox", { name: reference, exact: true })).toHaveCount(0);
      expect(await page.locator('[name="task"]').count()).toBe(0);
      const id = new URL(page.url()).searchParams.get("draft");
      expect(id).toBeTruthy();
      await page
        .getByRole("textbox", { name: copy.goal, exact: true })
        .fill("Compare quiet places for remote work. Keep tradeoffs clear.");
      await page
        .getByRole("textbox", { name: copy.constraints, exact: true })
        .fill("Do not invent listing facts\nKeep unconfirmed details visible");
      await page.getByRole("combobox", { name: copy.case }).selectOption(f.caseId);
      await capture(page, testInfo, "goal");
      await page.getByRole("button", { name: copy.create, exact: true }).click();
      await expect(page.getByRole("heading", { name: copy.saved, exact: true })).toBeVisible();
      await capture(page, testInfo, "goal-saved");
      const [saved] = await db
        .select()
        .from(schema.generativeSessions)
        .where(eq(schema.generativeSessions.id, id as string));
      expect(saved).toMatchObject({
        ownerId: f.actorId,
        state: "idle",
        goal: "Compare quiet places for remote work. Keep tradeoffs clear.",
        selection: { caseId: f.caseId },
      });
      await page
        .getByRole("region", { name: copy.saved, exact: true })
        .getByRole("link", { name: copy.open, exact: true })
        .click();
      await expect(page.getByRole("heading", { level: 1, name: saved?.goal })).toBeVisible();
      await capture(page, testInfo, "goal-opened");
      expect(await page.getByRole("button", { name: copy.resume, exact: true }).count()).toBe(0);
      await page
        .getByRole("textbox", { name: copy.message, exact: true })
        .fill("Prioritise quiet streets. Keep the same comparison history.");
      await page.getByRole("button", { name: copy.saveMessage, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: copy.messageSaved, exact: true }),
      ).toBeVisible();
      await page
        .getByRole("region", { name: copy.messageSaved, exact: true })
        .getByRole("link", { name: copy.open, exact: true })
        .click();
      await expect(
        page.getByText("Prioritise quiet streets. Keep the same comparison history.", {
          exact: true,
        }),
      ).toBeVisible();
      await capture(page, testInfo, "conversation");
      const [revised] = await db
        .select()
        .from(schema.generativeSessions)
        .where(eq(schema.generativeSessions.id, id as string));
      expect(revised?.conversation.map((turn) => turn.text)).toContain(
        "Prioritise quiet streets. Keep the same comparison history.",
      );
      expect(
        await db
          .select()
          .from(schema.generativeRuns)
          .where(eq(schema.generativeRuns.sessionId, id as string)),
      ).toHaveLength(0);
    });

    test("explains expired saved progress and retains qualification before resuming", async ({
      page,
      context,
    }) => {
      const f = await fixture(context, "expired"),
        copy = workspaceCopy("en");
      await page.goto(workspace("en", f.id));
      await expect(page.getByText(copy.recovery, { exact: true })).toBeVisible();
      await expect(
        page.getByRole("region", { name: copy.progress, exact: true }).getByRole("status"),
      ).toHaveText(copy.states.running);
      await expect(page.getByText(copy.disabled, { exact: true })).toBeVisible();
      await expect(
        page.getByText("Synthetic saved research step can be resumed.", { exact: true }),
      ).toBeVisible();
      expect(await page.getByRole("button", { name: copy.resume, exact: true }).count()).toBe(0);
      const [run] = await db
        .select()
        .from(schema.generativeRuns)
        .where(eq(schema.generativeRuns.sessionId, f.id));
      expect(run?.state).toBe("running");
      expect(run?.contextPins.length).toBeGreaterThan(0);
    });

    test("keeps Stop and corrections valid while the worker advances only its version", async ({
      page,
      context,
    }) => {
      const copy = workspaceCopy("en");
      for (const command of ["cancel", "message"] as const) {
        const f = await fixture(context, "active");
        await page.goto(workspace("en", f.id));
        await expect(
          page.getByRole("region", { name: copy.progress, exact: true }).getByRole("status"),
        ).toHaveText(copy.states.running);
        if (command === "message")
          await page
            .getByRole("textbox", { name: copy.message, exact: true })
            .fill("Keep this correction while research advances.");
        await db
          .update(schema.generativeSessions)
          .set({ version: sql`${schema.generativeSessions.version} + 1` })
          .where(eq(schema.generativeSessions.id, f.id));
        await page
          .getByRole("button", {
            name: command === "cancel" ? copy.stop : copy.saveMessage,
            exact: true,
          })
          .click();
        await expect(
          page.getByRole("heading", {
            name: command === "cancel" ? copy.stopSaved : copy.messageSaved,
            exact: true,
          }),
        ).toBeVisible();
        const [saved] = await db
          .select()
          .from(schema.generativeSessions)
          .where(eq(schema.generativeSessions.id, f.id));
        expect(saved?.state).toBe(command === "cancel" ? "cancelled" : "idle");
        expect(saved?.generation).toBe(2);
        if (command === "message")
          expect(saved?.conversation.map((turn) => turn.text)).toContain(
            "Keep this correction while research advances.",
          );
        const [run] = await db
          .select()
          .from(schema.generativeRuns)
          .where(eq(schema.generativeRuns.id, f.runId as string));
        expect(run?.state).toBe("cancelled");
      }
    });

    test("a stale Stop cannot cancel work started by a newer human correction", async ({
      page,
      context,
    }) => {
      const f = await fixture(context, "active"),
        copy = workspaceCopy("en");
      await page.goto(workspace("en", f.id));
      await expect(page.getByRole("button", { name: copy.stop, exact: true })).toBeVisible();
      const nextId = randomUUID();
      await db.transaction(async (tx) => {
        const [run] = await tx
          .select()
          .from(schema.generativeRuns)
          .where(eq(schema.generativeRuns.id, f.runId as string));
        if (!run) throw new Error("Synthetic running fixture missing");
        await tx
          .update(schema.generativeRuns)
          .set({ state: "cancelled" })
          .where(eq(schema.generativeRuns.id, run.id));
        await tx.insert(schema.generativeRuns).values({
          ...run,
          id: nextId,
          generation: 2,
          state: "queued",
          steps: 0,
          claimId: null,
          claimedAt: null,
        });
        await tx
          .update(schema.generativeSessions)
          .set({
            state: "queued",
            generation: 2,
            activeRunId: nextId,
            version: sql`${schema.generativeSessions.version} + 1`,
          })
          .where(eq(schema.generativeSessions.id, f.id));
      });
      await page.getByRole("button", { name: copy.stop, exact: true }).click();
      await expect(page.getByText(copy.changed, { exact: true })).toBeVisible();
      const [newer] = await db
        .select()
        .from(schema.generativeRuns)
        .where(eq(schema.generativeRuns.id, nextId));
      expect(newer?.state).toBe("queued");
      const [saved] = await db
        .select()
        .from(schema.generativeSessions)
        .where(eq(schema.generativeSessions.id, f.id));
      expect(saved?.generation).toBe(2);
      expect(saved?.activeRunId).toBe(nextId);
    });

    test("edits an artifact version, creates one current-person task and exposes the actual receipt", async ({
      page,
      context,
    }, testInfo) => {
      const f = await fixture(context),
        copy = workspaceCopy("en");
      await page.goto(workspace("en", f.id));
      const original = page.locator("article").filter({
        has: page.getByRole("heading", { name: "Review quiet alternatives", exact: true }),
      });
      await original.getByText(copy.edit, { exact: true }).click();
      await original
        .getByRole("textbox", { name: copy.draftTitle })
        .fill("Review quiet alternatives with evidence");
      await original
        .getByRole("textbox", { name: copy.body })
        .fill("The approved listing price is 1 EUR.");
      await original.getByRole("button", { name: copy.revise, exact: true }).click();
      const retainedBody = original.getByRole("textbox", { name: copy.body });
      await expect(retainedBody).toHaveValue("The approved listing price is 1 EUR.");
      await expect(retainedBody).toHaveAttribute("aria-invalid", "true");
      await expect(original.getByText(copy.evidenceInvalid, { exact: true })).toBeVisible();
      await expect(original.getByRole("textbox", { name: copy.draftTitle })).toHaveValue(
        "Review quiet alternatives with evidence",
      );
      const [unchanged] = await db
        .select()
        .from(schema.generativeArtifacts)
        .where(eq(schema.generativeArtifacts.id, f.taskId));
      expect(unchanged?.state).toBe("draft");
      expect(
        await db
          .select()
          .from(schema.generativeArtifacts)
          .where(eq(schema.generativeArtifacts.replacesId, f.taskId)),
      ).toHaveLength(0);
      await original
        .getByRole("textbox", { name: copy.body })
        .fill(
          "Verify street noise using approved evidence. Retain uncertainty. Do not send messages.",
        );
      await original.getByRole("button", { name: copy.revise, exact: true }).click();
      await expect(
        original.getByRole("heading", { name: copy.revised, exact: true }),
      ).toBeVisible();
      // This earlier native receipt also streams shell assets before its link is usable.
      if (!javaScriptEnabled) await page.waitForLoadState("load");
      await original.getByRole("link", { name: copy.open, exact: true }).click();
      const artifact = page.locator("article").filter({
        has: page.getByRole("heading", {
          name: "Review quiet alternatives with evidence",
          exact: true,
        }),
      });
      await expect(
        artifact.getByRole("paragraph").filter({
          hasText:
            "Verify street noise using approved evidence. Retain uncertainty. Do not send messages.",
        }),
      ).toBeVisible();
      await artifact.getByRole("checkbox", { name: copy.personReview }).check();
      await artifact.getByRole("button", { name: copy.createTask, exact: true }).click();
      await expect(
        artifact.getByRole("heading", { name: copy.recordSaved, exact: true }),
      ).toBeVisible();
      const rows = await db
        .select()
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.caseId, f.caseId),
            eq(schema.tasks.title, "Review quiet alternatives with evidence"),
          ),
        );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        ownerId: f.actorId,
        state: "open",
        type: "general",
        purpose:
          "Verify street noise using approved evidence. Retain uncertainty. Do not send messages.",
      });
      await capture(page, testInfo, "reviewed-task");
      // A native receipt can paint before its document and shell assets finish loading.
      // Complete that load before following its task link, retaining strict request checks.
      if (!javaScriptEnabled) await page.waitForLoadState("load");
      await artifact
        .getByRole("region", { name: copy.recordSaved, exact: true })
        .getByRole("link", { name: copy.openRecord, exact: true })
        .click();
      await expect(page).toHaveURL(hostUrl("staff", "/en/tasks/" + rows[0]?.id));
      const artifacts = await db
        .select()
        .from(schema.generativeArtifacts)
        .where(eq(schema.generativeArtifacts.sessionId, f.id));
      expect(artifacts.find((item) => item.id === f.taskId)?.state).toBe("superseded");
      const recorded = artifacts.find(
        (item) => item.proposal.title === "Review quiet alternatives with evidence",
      );
      expect(recorded?.state).toBe("materialized");
      expect(recorded?.receiptId).toBeTruthy();
      expect(recorded?.result?.id).toBe(rows[0]?.id);
      expect(
        await db
          .select()
          .from(schema.messageAttempts)
          .innerJoin(schema.messages, eq(schema.messageAttempts.messageId, schema.messages.id))
          .where(eq(schema.messages.caseId, f.caseId)),
      ).toHaveLength(0);
      expect(
        await db.select().from(schema.appointments).where(eq(schema.appointments.caseId, f.caseId)),
      ).toHaveLength(0);
    });

    test("saves a buyer brief with a manual listing handoff without inventing candidate reviews", async ({
      page,
      context,
    }, testInfo) => {
      const f = await fixture(context),
        copy = workspaceCopy("en");
      await page.setViewportSize({ width: 390, height: 844 });
      for (const locale of ["bg", "ru", "en"]) {
        const labels = workspaceCopy(locale);
        await openWorkspacePage(page, workspace(locale, f.id));
        await expect(
          page.getByRole("heading", { name: labels.sources, exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", { name: labels.decisions, exact: true }),
        ).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          390,
        );
      }
      const artifact = page.locator("article").filter({
        has: page.getByRole("heading", { name: "Buyer research handoff", exact: true }),
      });
      await expect(artifact.getByText(copy.buyerHelp)).toBeVisible();
      await artifact.getByRole("checkbox", { name: copy.personReview }).check();
      await artifact.getByRole("button", { name: copy.saveBuyer, exact: true }).click();
      await expect(
        artifact.getByRole("heading", { name: copy.recordSaved, exact: true }),
      ).toBeVisible();
      const [recorded] = await db
        .select()
        .from(schema.generativeArtifacts)
        .where(eq(schema.generativeArtifacts.id, f.buyerId));
      expect(recorded?.state).toBe("materialized");
      expect(recorded?.result).toMatchObject({
        type: "case",
        id: f.caseId,
        interestIds: [],
        manualReviewListingIds: [f.listingId],
      });
      expect(
        await db.select().from(schema.interests).where(eq(schema.interests.caseId, f.caseId)),
      ).toHaveLength(0);
      const briefs = await db
        .select()
        .from(schema.briefRevisions)
        .where(eq(schema.briefRevisions.caseId, f.caseId));
      expect(briefs.length).toBeGreaterThan(1);
      // Native WebKit can paint the receipt before its POST document finishes streaming.
      // Finish that finite load before the explicit refresh, retaining strict network checks.
      if (!javaScriptEnabled) await page.waitForLoadState("load");
      await page.goto(workspace("en", f.id));
      const saved = page.locator("article").filter({
        has: page.getByRole("heading", { name: "Buyer research handoff", exact: true }),
      });
      await expect(saved.getByRole("link", { name: copy.manualListings })).toHaveAttribute(
        "href",
        "/en/cases/" + f.caseId + "/matching",
      );
      // Axe needs browser timers; the native path keeps scripting disabled throughout.
      // Audit each JavaScript-enabled browser, while native commands and diagnostics stay strict.
      if (javaScriptEnabled) {
        const audit = await new AxeBuilder({ page }).include("main").analyze();
        expect(audit.violations).toEqual([]);
      }
      await capture(page, testInfo, "buyer-handoff");
      // Playwright's WebKit screenshot helper injects an unnonced temporary stylesheet.
      // Preserve strict CSP/console checks there; required viewport captures use Chromium.
      if (testInfo.project.name !== "webkit-mobile")
        await page.screenshot({
          path: testInfo.outputPath("generative-workspace-390.png"),
          fullPage: true,
        });
    });
  });
}

test("F29 live progress updates without navigating or replacing a dirty correction", async ({
  page,
  context,
}) => {
  const f = await fixture(context, "active"),
    copy = workspaceCopy("en");
  await page.goto(workspace("en", f.id));
  await expect(page.getByText(copy.liveProgress, { exact: true })).toBeVisible();
  const correction = page.getByRole("textbox", { name: copy.message, exact: true });
  await correction.fill("Keep this draft unchanged while progress updates.");
  const navigations: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  await db.transaction(async (tx) => {
    await tx
      .update(schema.generativeRuns)
      .set({ steps: 2, observedCostMicros: 100 })
      .where(eq(schema.generativeRuns.id, f.runId as string));
    await tx
      .update(schema.generativeSessions)
      .set({ version: sql`${schema.generativeSessions.version} + 1` })
      .where(eq(schema.generativeSessions.id, f.id));
  });
  const progress = page.getByRole("region", { name: copy.progress, exact: true });
  await expect(
    progress.getByText(copy.steps, { exact: true }).locator("..").locator("dd"),
  ).toHaveText("2");
  await expect(correction).toHaveValue("Keep this draft unchanged while progress updates.");
  const response = page.waitForResponse(
    (item) => item.url() === workspace("en", f.id) + "/progress" && item.status() === 200,
  );
  await db.transaction(async (tx) => {
    await tx
      .update(schema.generativeRuns)
      .set({ state: "review", claimId: null, claimedAt: null, actualCostMicros: 100 })
      .where(eq(schema.generativeRuns.id, f.runId as string));
    await tx
      .update(schema.generativeSessions)
      .set({ state: "review", version: sql`${schema.generativeSessions.version} + 1` })
      .where(eq(schema.generativeSessions.id, f.id));
  });
  const read = await response;
  expect(Object.keys((await read.json()) as Record<string, unknown>).sort()).toEqual(
    [
      "state",
      "steps",
      "maxSteps",
      "reservedCostMicros",
      "actualCostMicros",
      "hasRun",
      "recovery",
      "sourceChanged",
    ].sort(),
  );
  await expect(progress.getByRole("status")).toHaveText(copy.states.review);
  await expect(page.getByText(copy.resultsReady, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: copy.openLatest, exact: true })).toHaveAttribute(
    "href",
    "/en/operations/assistance/research/" + f.id,
  );
  await expect(correction).toHaveValue("Keep this draft unchanged while progress updates.");
  expect(navigations).toEqual([]);
});

test("F29 source changes retain a dirty correction and an unconfirmed receipt never unlocks another command", async ({
  page,
  context,
}) => {
  const f = await fixture(context),
    copy = workspaceCopy("en");
  await page.goto(workspace("en", f.id));
  await page
    .getByRole("textbox", { name: copy.message, exact: true })
    .fill("Retain this unsaved correction through source review.");
  await db
    .update(schema.cases)
    .set({ nextAction: "Synthetic changed source requires a fresh review", version: 2 })
    .where(eq(schema.cases.id, f.caseId));
  await page.getByRole("link", { name: copy.refresh, exact: true }).click();
  await expect(page.getByText(copy.sourceChanged, { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: copy.message, exact: true })).toHaveValue(
    "Retain this unsaved correction through source review.",
  );
  expect(await page.getByRole("button", { name: copy.createTask, exact: true }).count()).toBe(0);
  const key = "unconfirmed-original-operation";
  await openWorkspacePage(
    page,
    workspace("en", f.id) + "?" + new URLSearchParams({ operation: key, command: "message" }),
  );
  await expect(page.getByText(copy.notFoundOperation, { exact: true })).toBeVisible();
  expect(await page.getByRole("button", { name: copy.saveMessage, exact: true }).count()).toBe(0);
  await expect(page.getByRole("link", { name: copy.refresh, exact: true }).first()).toHaveAttribute(
    "href",
    "/en/operations/assistance/research/" +
      f.id +
      "?" +
      new URLSearchParams({ operation: key, command: "message" }),
  );
});
