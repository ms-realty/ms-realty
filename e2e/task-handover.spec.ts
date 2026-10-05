import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { findCoverageRecord, findPaginatedRecord, moveQueuePage } from "./coverage-helpers";

/** A future review time as the native datetime-local value in the agency zone. */
function reviewInput(offsetMs = 1_800_000) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(Date.now() + offsetMs))
    .replace(" ", "T");
}

import { hostUrl, origins } from "./hosts";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(databaseUrl, { max: 2 }),
  db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());
function seed() {
  const authKey = process.env.E2E_AUTH_SECRET;
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "src/server/auth/offboarding-browser-seed.ts",
      ],
      {
        encoding: "utf8",
        env: { ...process.env, AUTH_SECRET: authKey, DATABASE_URL: databaseUrl },
      },
    ),
  ) as {
    staffToken: string;
    managerId: string;
    brokerId: string;
    brokerToken: string;
    caseId: string;
    keyId: string;
  };
}

for (const javaScriptEnabled of [true, false])
  test(`revocation routes work to coverage until individually accepted, JavaScript ${javaScriptEnabled}`, async ({
    browser,
  }, testInfo) => {
    const f = seed();
    const [task] = await db
      .insert(schema.tasks)
      .values({
        ownerId: f.brokerId,
        caseId: f.caseId,
        title: `Synthetic coverage ${f.brokerId}`,
        promisedToClient: true,
        dueAt: new Date("1900-01-01T10:00:00Z"),
      })
      .returning();
    if (!task) throw new Error("Missing task");
    // Coverage pages contain 25 records per category, not 25 records across all categories.
    // Earlier tasks force this task beyond page one; a later retained task must remain there
    // after acceptance. Other suites' records cannot move our target back onto page one.
    const retained = await db
      .insert(schema.tasks)
      .values([
        ...Array.from({ length: 26 }, (_, index) => ({
          ownerId: f.brokerId,
          caseId: f.caseId,
          title: `Earlier retained coverage ${f.brokerId} ${index}`,
          promisedToClient: true,
          dueAt: new Date("1899-01-01T10:00:00Z"),
        })),
        {
          ownerId: f.brokerId,
          caseId: f.caseId,
          title: `Later retained coverage ${f.brokerId}`,
          promisedToClient: true,
          dueAt: new Date("1901-01-01T10:00:00Z"),
        },
      ])
      .returning();
    const later = retained.at(-1);
    if (!later) throw new Error("Missing retained coverage fixture");
    const context = await browser.newContext({
      ...testInfo.project.use,
      javaScriptEnabled,
      viewport: { width: 320, height: 844 },
    });
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
      await page.goto(hostUrl("staff", `/en/access/offboard/${f.brokerId}`));
      await page
        .getByLabel("Reason and handover plan", { exact: true })
        .fill("Manager will review the retained work in agency coverage.");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "End staff access", exact: true }).click();
      await expect(page.getByText("Staff membership ended", { exact: true })).toBeVisible();
      await page.goto(hostUrl("staff", "/en/today"));
      await page.getByRole("button", { name: "More", exact: true }).click();
      await page.getByRole("link", { name: "More tools", exact: true }).click();
      await expect(page).toHaveURL(hostUrl("staff", "/en/operations"));
      await expect(page.getByRole("heading", { name: "Operations", exact: true })).toBeVisible();
      await page
        .getByRole("main")
        .getByRole("link", { name: "Agency coverage", exact: true })
        .click();
      for (const [locale, heading] of [
        ["bg", "Дежурна опашка"],
        ["ru", "Очередь подхвата"],
        ["en", "Agency coverage"],
      ]) {
        await page.goto(hostUrl("staff", `/${locale}/coverage`));
        await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
        const href = `/${locale}/tasks/${task.id}`;
        // Deliberately absent here but present later: page-one absence must not pass as gone.
        await expect(page.locator(`a[href="${href}"]`)).toHaveCount(0);
        expect(await findPaginatedRecord(page, href, { locale, viewportWidth: 320 })).toBe(true);
        const targetPage = Number(new URL(page.url()).searchParams.get("page"));
        expect(targetPage).toBeGreaterThan(1);
        // Other journeys create/remove their own earlier padding rows concurrently. Only
        // page one is guaranteed to exclude this task by our 26 retained earlier records.
        // Exercise the real previous links back to that stable boundary, then search the
        // actual next pages instead of assuming the record keeps the same numeric offset.
        for (let previous = targetPage - 1; previous >= 1; previous--)
          expect(await moveQueuePage(page, "previous", { locale, viewportWidth: 320 })).toBe(true);
        await expect(page.locator(`a[href="${href}"]`)).toHaveCount(0);
        expect(await moveQueuePage(page, "next", { locale, viewportWidth: 320 })).toBe(true);
        expect(await findPaginatedRecord(page, href, { locale, viewportWidth: 320 })).toBe(true);
        await expect(page.locator(`a[href="${href}"]`)).toBeVisible();
      }
      await expect(
        page.getByRole("region", { name: "Tasks needing coverage", exact: true }),
      ).toContainText("Promised to a client");
      expect(await findCoverageRecord(page, `/en/cases/${f.caseId}`)).toBe(true);
      expect(await findCoverageRecord(page, `/en/operations/keys/${f.keyId}`)).toBe(true);
      expect(
        (await db.select().from(schema.keySets).where(eq(schema.keySets.id, f.keyId)))[0],
      ).toMatchObject({ holderId: f.brokerId, state: "checked_out", version: 2 });
      expect(await findCoverageRecord(page, `/en/tasks/${task.id}`)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        320,
      );
      await page.screenshot({
        path: testInfo.outputPath(`coverage-${javaScriptEnabled}-320.png`),
        fullPage: false,
      });
      await page.locator(`a[href="/en/tasks/${task.id}"]`).click();
      const request = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Request task handover", exact: true }) });
      await request.getByLabel("Receiving colleague", { exact: true }).selectOption(f.managerId);
      await request
        .getByLabel("Reason and handover notes", { exact: true })
        .fill("Manager will take the unchanged client promise.");
      await request.getByRole("checkbox").check();
      await request.getByRole("button", { name: "Request task handover", exact: true }).click();
      await expect(
        page.getByText("This action was recorded successfully.", { exact: true }),
      ).toBeVisible();
      // W03: the receiver may decline with a reason; the work stays and the decision is shown.
      await page.goto(hostUrl("staff", `/en/tasks/${task.id}`));
      await page.getByRole("link", { name: "Decline with a reason", exact: true }).click();
      await expect(page).toHaveURL(/[?&]handover=decline/);
      const decline = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Send the decline", exact: true }) });
      const declineReason = "Not my area; please ask the rental team.";
      await decline.getByLabel("Reason for declining", { exact: true }).fill(declineReason);
      await decline.getByRole("button", { name: "Send the decline", exact: true }).click();
      await expect(
        page.getByText("This action was recorded successfully.", { exact: true }),
      ).toBeVisible();
      await page.goto(hostUrl("staff", `/en/tasks/${task.id}`));
      await expect(page.getByRole("heading", { name: /declined the handover$/ })).toBeVisible();
      await expect(page.getByText(declineReason, { exact: true })).toBeVisible();
      expect(
        (await db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)))[0],
      ).toMatchObject({ pendingOwnerId: null, dueAt: task.dueAt });
      const again = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Request task handover", exact: true }) });
      await again.getByLabel("Receiving colleague", { exact: true }).selectOption(f.managerId);
      await again
        .getByLabel("Reason and handover notes", { exact: true })
        .fill("Manager will take the unchanged client promise.");
      await again.getByRole("checkbox").check();
      await again.getByRole("button", { name: "Request task handover", exact: true }).click();
      await expect(
        page.getByText("This action was recorded successfully.", { exact: true }),
      ).toBeVisible();
      await page.goto(hostUrl("staff", `/en/tasks/${task.id}`));
      // W03: the receiver accepts with their own next step and a future review time.
      const accept = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Accept the work", exact: true }) });
      const reviewAt = reviewInput();
      await accept
        .getByLabel("Your next step", { exact: true })
        .fill("Call the client about the unchanged promise");
      await accept.getByLabel("When will you review it again?", { exact: true }).fill(reviewAt);
      await accept.getByRole("button", { name: "Accept the work", exact: true }).click();
      await expect(
        page.getByText("This action was recorded successfully.", { exact: true }),
      ).toBeVisible();
      expect(
        (await db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)))[0],
      ).toMatchObject({
        ownerId: f.managerId,
        pendingOwnerId: null,
        title: "Call the client about the unchanged promise",
        dueAt: task.dueAt,
        promisedToClient: true,
        state: "open",
      });
      expect(await findCoverageRecord(page, `/en/tasks/${task.id}`)).toBe(false);
      expect(await findCoverageRecord(page, `/en/tasks/${later.id}`)).toBe(true);
      expect(Number(new URL(page.url()).searchParams.get("page"))).toBeGreaterThan(1);
      expect(
        await db
          .select()
          .from(schema.tasks)
          .where(
            inArray(
              schema.tasks.id,
              retained.map((row) => row.id),
            ),
          ),
      ).toEqual(expect.arrayContaining(retained));
      expect(await findCoverageRecord(page, `/en/cases/${f.caseId}`)).toBe(true);
      expect(await findCoverageRecord(page, `/en/operations/keys/${f.keyId}`)).toBe(true);
    } finally {
      try {
        // Delete this test's exact padding rows before browser teardown can reject or delay
        // close and leave extra queue pages for the next journey.
        await db.delete(schema.tasks).where(
          inArray(
            schema.tasks.id,
            retained.map((row) => row.id),
          ),
        );
      } finally {
        await context.close();
      }
    }
  });

for (const javaScriptEnabled of [true, false])
  test(`offboarding work leads to an individually accepted task handover, JavaScript ${javaScriptEnabled}`, async ({
    browser,
  }, testInfo) => {
    const f = seed(),
      receiver = seed();
    const dueAt = new Date(Date.now() + 86400000);
    const [task] = await db
      .insert(schema.tasks)
      .values({
        id: `ffffffff-${randomUUID().slice(9)}`,
        ownerId: f.brokerId,
        caseId: f.caseId,
        title: "Synthetic handover promise",
        promisedToClient: true,
        dueAt,
      })
      .returning();
    if (!task) throw new Error("Missing synthetic task");
    // Offboarding sorts UUIDs with 25 per category; acceptance sorts due dates with 30/page.
    // Force this same task beyond both first pages without depending on shared fixture order.
    const pending = await db
      .insert(schema.tasks)
      .values(
        Array.from({ length: 31 }, (_, index) => ({
          id: `00000000-${randomUUID().slice(9)}`,
          ownerId: f.brokerId,
          pendingOwnerId: receiver.brokerId,
          caseId: f.caseId,
          title: `Earlier pending promise ${f.brokerId} ${index}`,
          promisedToClient: true,
          dueAt: new Date("1900-01-01T10:00:00Z"),
        })),
      )
      .returning();
    const context = await browser.newContext({
      ...testInfo.project.use,
      javaScriptEnabled,
      viewport: { width: 320, height: 844 },
    });
    const cookie = (value: string) => ({
      name: "msr_staff_session",
      value,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax" as const,
    });
    try {
      await context.addCookies([cookie(f.staffToken)]);
      const page = await context.newPage();
      await page.goto(hostUrl("staff", `/en/access/offboard/${f.brokerId}`));
      const taskHref = `/en/tasks/${task.id}`;
      await expect(page.locator(`a[href="${taskHref}"]`)).toHaveCount(0);
      expect(
        await findPaginatedRecord(page, taskHref, {
          pageParameter: "workPage",
          viewportWidth: 320,
        }),
      ).toBe(true);
      expect(Number(new URL(page.url()).searchParams.get("workPage"))).toBeGreaterThan(1);
      await page.locator(`a[href="${taskHref}"]`).click();
      const request = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Request task handover", exact: true }) });
      await request
        .getByLabel("Receiving colleague", { exact: true })
        .selectOption(receiver.brokerId);
      await request
        .getByLabel("Reason and handover notes", { exact: true })
        .fill("Review the promised follow-up before accepting ownership.");
      await request.getByRole("checkbox").check();
      await request.getByRole("button", { name: "Request task handover", exact: true }).click();
      await expect(
        page.getByText("This action was recorded successfully.", { exact: true }),
      ).toBeVisible();
      expect(
        (await db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)))[0],
      ).toMatchObject({ ownerId: f.brokerId, pendingOwnerId: receiver.brokerId, dueAt });
      await context.clearCookies();
      await context.addCookies([cookie(receiver.brokerToken)]);
      await page.goto(hostUrl("staff", "/en/today"));
      await page.getByRole("link", { name: "Awaiting my acceptance", exact: true }).click();
      await expect(page.locator(`a[href="${taskHref}"]`)).toHaveCount(0);
      expect(await findPaginatedRecord(page, taskHref, { viewportWidth: 320 })).toBe(true);
      expect(Number(new URL(page.url()).searchParams.get("page"))).toBeGreaterThan(1);
      expect(new URL(page.url()).searchParams.get("view")).toBe("handovers");
      expect(await moveQueuePage(page, "previous", { viewportWidth: 320 })).toBe(true);
      expect(new URL(page.url()).searchParams.get("view")).toBe("handovers");
      expect(await moveQueuePage(page, "next", { viewportWidth: 320 })).toBe(true);
      await page.locator(`a[href="${taskHref}"]`).click();
      const accept = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Accept the work", exact: true }) });
      await accept
        .getByLabel("Your next step", { exact: true })
        .fill("Confirm the promised date with the client");
      await accept
        .getByLabel("When will you review it again?", { exact: true })
        .fill(reviewInput());
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        320,
      );
      await page.screenshot({
        path: testInfo.outputPath(`task-handover-${javaScriptEnabled}.png`),
        fullPage: true,
      });
      await accept.getByRole("button", { name: "Accept the work", exact: true }).click();
      await expect(
        page.getByText("This action was recorded successfully.", { exact: true }),
      ).toBeVisible();
      expect(
        (await db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)))[0],
      ).toMatchObject({
        ownerId: receiver.brokerId,
        pendingOwnerId: null,
        dueAt,
        promisedToClient: true,
        state: "open",
      });
      await page.goto(hostUrl("staff", "/en/tasks?view=handovers"));
      expect(await findPaginatedRecord(page, taskHref, { viewportWidth: 320 })).toBe(false);
      const lastPending = pending.reduce((last, row) => (row.id > last.id ? row : last));
      if (!lastPending) throw new Error("Missing pending handover fixture");
      expect(
        await findPaginatedRecord(page, `/en/tasks/${lastPending.id}`, { viewportWidth: 320 }),
      ).toBe(true);
      expect(Number(new URL(page.url()).searchParams.get("page"))).toBeGreaterThan(1);
      await page.goto(hostUrl("staff", `/en/tasks/${task.id}`));
      const secondRequest = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Request task handover", exact: true }) });
      await secondRequest
        .getByLabel("Receiving colleague", { exact: true })
        .selectOption(f.brokerId);
      await secondRequest
        .getByLabel("Reason and handover notes", { exact: true })
        .fill("Proposed return for an explicit cancellation check.");
      await secondRequest.getByRole("checkbox").check();
      await secondRequest
        .getByRole("button", { name: "Request task handover", exact: true })
        .click();
      await expect(
        page.getByText("This action was recorded successfully.", { exact: true }),
      ).toBeVisible();
      await page.goto(hostUrl("staff", `/en/tasks/${task.id}`));
      // W03: withdrawing is its own native step with a required reason.
      await page.getByRole("link", { name: "Withdraw the offer", exact: true }).click();
      await expect(page).toHaveURL(/[?&]handover=withdraw/);
      const cancel = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Withdraw the offer", exact: true }) });
      await cancel.getByLabel("Reason", { exact: true }).fill("short");
      await cancel.getByRole("button", { name: "Withdraw the offer", exact: true }).click();
      await expect(
        page.getByRole("region", { name: "There is a problem", exact: true }),
      ).toBeVisible();
      await expect(cancel.getByLabel("Reason", { exact: true })).toHaveValue("short");
      await cancel
        .getByLabel("Reason", { exact: true })
        .fill("Cancel the proposal and keep the accepted owner and dates.");
      await cancel.getByRole("button", { name: "Withdraw the offer", exact: true }).click();
      await expect(
        page.getByText("This action was recorded successfully.", { exact: true }),
      ).toBeVisible();
      expect(
        (await db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)))[0],
      ).toMatchObject({ ownerId: receiver.brokerId, pendingOwnerId: null, dueAt, version: 5 });
      expect(
        await db
          .select()
          .from(schema.tasks)
          .where(
            inArray(
              schema.tasks.id,
              pending.map((row) => row.id),
            ),
          ),
      ).toEqual(expect.arrayContaining(pending));
    } finally {
      await context.close();
      await db.delete(schema.tasks).where(
        inArray(
          schema.tasks.id,
          pending.map((row) => row.id),
        ),
      );
    }
  });
