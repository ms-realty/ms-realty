import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { type BrowserContext, expect, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { contactCopy } from "../src/features/work/contact-copy";
import { workCopy } from "../src/features/work/copy";
import { hostUrl, origins } from "./hosts";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable database required");
const connection = postgres(url, { max: 2 }),
  db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());
function seed() {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "src/server/work/contact-browser-seed.ts"],
      {
        encoding: "utf8",
        env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
      },
    ),
  ) as {
    id: string;
    token: string;
    brokerId: string;
    taskId: string;
    contactId: string;
    email: string;
  };
}
async function signIn(context: BrowserContext, token: string) {
  await context.addCookies([
    {
      name: "msr_staff_session",
      value: token,
      url: origins.staff,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

for (const locale of ["bg", "ru", "en"] as const) {
  for (const javaScriptEnabled of [true, false]) {
    test(`O03 / AT14: ${locale} ${javaScriptEnabled ? "hydrated" : "native"} contact distinguishes attempts, response and promises`, async ({
      browser,
    }, info) => {
      const fixture = seed();
      const context = await browser.newContext({
        javaScriptEnabled,
        viewport: { width: 320, height: 844 },
      });
      await signIn(context, fixture.token);
      const page = await context.newPage();
      const copy = contactCopy(locale),
        work = workCopy(locale);
      try {
        await page.goto(hostUrl("staff", `/${locale}/inquiries/${fixture.id}`));
        await expect(page.getByTestId("inquiry-first-response")).toHaveText(copy.noResponse);
        const attemptNote = `Synthetic unanswered contact ${randomUUID()}`;
        const nextAction = `Follow up on the question ${randomUUID().slice(0, 8)}`;
        await page
          .getByLabel(copy.contactedAt, { exact: true })
          .fill(new Date(Date.now() - 60000).toISOString().slice(0, 19));
        await page.getByLabel(copy.note, { exact: true }).fill(attemptNote);
        await page.getByLabel(copy.nextAction, { exact: true }).fill(nextAction);
        await page
          .getByLabel(copy.dueAt, { exact: true })
          .fill(new Date(Date.now() + 7200000).toISOString().slice(0, 16));
        await page.getByRole("button", { name: copy.submit, exact: true }).click();
        await expect(
          page.getByRole("alert").filter({ hasText: work.validation }).first(),
        ).toBeVisible();
        await expect(page.getByLabel(copy.note, { exact: true })).toHaveValue(attemptNote);
        await page.getByLabel(copy.confirm, { exact: true }).check();
        await page.getByRole("button", { name: copy.submit, exact: true }).click();
        await expect(
          page.getByRole("heading", { name: work.changeSaved, exact: true }),
        ).toBeVisible();
        await page.reload();
        await page.getByRole("link", { name: work.openRecord, exact: true }).click();
        await expect(page.getByTestId("inquiry-first-response")).toHaveText(copy.noResponse);
        await expect(page.getByText(attemptNote, { exact: true })).toBeVisible();
        const [oldTask] = await db
          .select()
          .from(schema.tasks)
          .where(eq(schema.tasks.id, fixture.taskId));
        expect(oldTask?.state).toBe("open");

        const responseNote = `Synthetic useful service explanation ${randomUUID()}`;
        await page.getByLabel(copy.result, { exact: true }).selectOption("useful_response");
        const observedAt = new Date(Date.now() - 30000).toISOString().slice(0, 19);
        await page.getByLabel(copy.contactedAt, { exact: true }).fill(observedAt);
        await page.getByLabel(copy.note, { exact: true }).fill(responseNote);
        await page
          .getByLabel(copy.nextAction, { exact: true })
          .fill("Send the agreed service details after human review");
        await page
          .getByLabel(copy.dueAt, { exact: true })
          .fill(new Date(Date.now() + 10800000).toISOString().slice(0, 16));
        await page.getByLabel(copy.promise, { exact: true }).check();
        await page.getByLabel(copy.confirm, { exact: true }).check();
        await page.getByRole("button", { name: copy.submit, exact: true }).click();
        await expect(
          page.getByRole("heading", { name: work.changeSaved, exact: true }),
        ).toBeVisible();
        await page.getByRole("link", { name: work.openRecord, exact: true }).click();
        await expect(page.getByText(responseNote, { exact: true })).toBeVisible();
        await expect(page.getByTestId("inquiry-first-response")).not.toHaveText(copy.noResponse);
        const [updated] = await db
          .select()
          .from(schema.inquiries)
          .where(eq(schema.inquiries.id, fixture.id));
        expect(updated?.firstResponseAt?.toISOString()).toBe(`${observedAt}.000Z`);
        const commitments = await db
          .select()
          .from(schema.tasks)
          .where(eq(schema.tasks.inquiryId, fixture.id));
        expect(commitments).toHaveLength(3);
        expect(
          commitments.every((task) => task.state === "open" && task.ownerId === fixture.brokerId),
        ).toBe(true);
        expect(commitments.filter((task) => task.promisedToClient)).toHaveLength(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          320,
        );
        if (javaScriptEnabled)
          expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await info.attach("contact-outcome-320", {
          body: await page.screenshot(),
          contentType: "image/png",
        });
      } finally {
        await context.close();
      }
    });
  }
}

for (const javaScriptEnabled of [true, false]) {
  test(`O03: ${javaScriptEnabled ? "hydrated" : "native"} stale contact retains the note and requires current contact review`, async ({
    browser,
  }) => {
    const fixture = seed();
    const context = await browser.newContext({ javaScriptEnabled });
    await signIn(context, fixture.token);
    const page = await context.newPage(),
      copy = contactCopy("en"),
      work = workCopy("en");
    try {
      await page.goto(hostUrl("staff", `/en/inquiries/${fixture.id}`));
      const note = `Synthetic stale contact ${randomUUID()}`;
      await page
        .getByLabel(copy.contactedAt, { exact: true })
        .fill(new Date(Date.now() - 60000).toISOString().slice(0, 19));
      await page.getByLabel(copy.note, { exact: true }).fill(note);
      await page
        .getByLabel(copy.nextAction, { exact: true })
        .fill("Review the corrected contact before the next step");
      await page
        .getByLabel(copy.dueAt, { exact: true })
        .fill(new Date(Date.now() + 7200000).toISOString().slice(0, 16));
      await page.getByLabel(copy.confirm, { exact: true }).check();
      const corrected = `${randomUUID()}@example.test`;
      await db
        .update(schema.contactMethods)
        .set({ value: corrected, version: 2 })
        .where(eq(schema.contactMethods.id, fixture.contactId));
      await page.getByRole("button", { name: copy.submit, exact: true }).click();
      await expect(page.getByText(work.conflict, { exact: true })).toBeVisible();
      await expect(page.getByLabel(copy.note, { exact: true })).toHaveValue(note);
      await expect(page.getByLabel(copy.confirm, { exact: true })).not.toBeChecked();
      await expect(
        page.getByRole("option", { name: `email · ${corrected}`, exact: true }),
      ).toBeAttached();
      await page
        .getByLabel(copy.contact, { exact: true })
        .selectOption({ label: `email · ${corrected}` });
      await page.getByLabel(copy.confirm, { exact: true }).check();
      await page.getByRole("button", { name: work.form.reapply, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: work.changeSaved, exact: true }),
      ).toBeVisible();
      await page.reload();
      expect(
        await db.select().from(schema.tasks).where(eq(schema.tasks.inquiryId, fixture.id)),
      ).toHaveLength(2);
      const [contact] = await db
        .select()
        .from(schema.activityEvents)
        .where(
          and(
            eq(schema.activityEvents.recordId, fixture.id),
            eq(schema.activityEvents.messageKey, "work.inquiry.contact_recorded"),
          ),
        );
      expect(contact?.params).toMatchObject({ note, contact: { value: corrected, version: 2 } });
    } finally {
      await context.close();
    }
  });
}
