import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { type BrowserContext, expect, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { discoveryCopy } from "../src/features/discovery/copy";
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
          .fill(new Date(Date.now() - 60000).toISOString().slice(0, 16));
        await page.getByLabel(copy.note, { exact: true }).fill(attemptNote);
        await page.getByLabel(copy.nextAction, { exact: true }).fill(nextAction);
        await page
          .getByLabel(copy.dueAt, { exact: true })
          .fill(new Date(Date.now() + 7200000).toISOString().slice(0, 16));
        await page.getByRole("button", { name: copy.submit, exact: true }).click();
        await expect(
          page.getByRole("region", { name: work.form.errorSummary, exact: true }),
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
        const observedAt = new Date(Date.now() - 30000).toISOString().slice(0, 16);
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
        expect(updated?.firstResponseAt?.toISOString()).toBe(`${observedAt}:00.000Z`);
        const commitments = await db
          .select()
          .from(schema.tasks)
          .where(eq(schema.tasks.inquiryId, fixture.id));
        expect(commitments).toHaveLength(3);
        expect(
          commitments.every((task) => task.state === "open" && task.ownerId === fixture.brokerId),
        ).toBe(true);
        expect(commitments.filter((task) => task.promisedToClient)).toHaveLength(1);
        await info.attach("contact-width-320", {
          body: JSON.stringify(
            await page.evaluate(() =>
              Array.from(document.body.querySelectorAll("*"))
                .map((element) => {
                  const rect = element.getBoundingClientRect();
                  return {
                    tag: element.tagName,
                    class: element.getAttribute("class"),
                    width: rect.width,
                    right: rect.right,
                    scrollWidth: element.scrollWidth,
                    clientWidth: element.clientWidth,
                    text: element.textContent?.slice(0, 80),
                  };
                })
                .filter(
                  (rect) =>
                    rect.right > 320 || (rect.width > 0 && rect.scrollWidth > rect.clientWidth + 1),
                )
                .slice(0, 30),
            ),
            null,
            2,
          ),
          contentType: "application/json",
        });
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
  test(`AT14 joined: public review to broker responsibility to useful human contact ${javaScriptEnabled ? "hydrated" : "native"}`, async ({
    browser,
  }, info) => {
    const broker = seed();
    const listing = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "src/features/discovery/testing/seed.ts",
          "create",
        ],
        {
          encoding: "utf8",
          env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
        },
      ),
    ).published as { reference: string; title: string };
    const context = await browser.newContext({
      javaScriptEnabled,
      viewport: { width: 320, height: 844 },
    });
    const page = await context.newPage();
    const marker = `Synthetic joined public inquiry ${randomUUID()}`;
    const email = `joined-${randomUUID()}@example.test`;
    const work = workCopy("en"),
      copy = contactCopy("en");
    try {
      await context.setExtraHTTPHeaders({
        "cf-connecting-ip": `2001:db8::${Math.floor(Math.random() * 65535).toString(16)}`,
      });
      await page.goto(hostUrl("public", `/en/properties?q=${listing.reference}`));
      await page.getByRole("link", { name: listing.title, exact: true }).click();
      await page.getByRole("link", { name: discoveryCopy("en").ask, exact: true }).click();
      await page.getByLabel("Your inquiry", { exact: true }).fill(marker);
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Review inquiry", exact: true }).click();
      await expect(
        page.getByRole("region", { name: "Review your inquiry", exact: true }),
      ).toContainText(listing.reference);
      expect(
        await db.select().from(schema.inquiries).where(eq(schema.inquiries.message, marker)),
      ).toHaveLength(0);
      await page.getByRole("button", { name: "Send inquiry to MS Realty", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Inquiry received", exact: true }),
      ).toBeVisible();
      const [received] = await db
        .select()
        .from(schema.inquiries)
        .where(eq(schema.inquiries.message, marker));
      if (!received) throw new Error("No durable public inquiry");
      expect(received).toMatchObject({ state: "received", ownerId: null, firstResponseAt: null });
      expect(received.coverageQueue).toBeTruthy();
      expect(received.context).toMatchObject({
        listing: { reference: listing.reference, title: listing.title },
      });
      await signIn(context, broker.token);
      await page.goto(hostUrl("staff", "/en/inquiries?view=unassigned"));
      await expect(page.locator(`[data-inquiry-id="${received.id}"]`)).toContainText(
        received.reference,
      );
      await page.getByRole("link", { name: received.reference, exact: true }).click();
      await page
        .getByLabel(work.nextAction, { exact: true })
        .fill("Review and answer this specific inquiry");
      await page
        .getByLabel(work.dueAt, { exact: true })
        .fill(new Date(Date.now() + 3600000).toISOString().slice(0, 16));
      await page.getByRole("button", { name: work.accept, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: work.changeSaved, exact: true }),
      ).toBeVisible();
      await page.reload();
      await page.getByRole("link", { name: work.openRecord, exact: true }).click();
      await expect(page.getByTestId("inquiry-first-response")).toHaveText(copy.noResponse);
      await expect(
        page.getByRole("option", { name: `email · ${email}`, exact: true }),
      ).toBeAttached();
      await page.getByLabel(copy.result, { exact: true }).selectOption("useful_response");
      await expect.poll(() => Date.now()).toBeGreaterThan(received.createdAt.getTime() + 1500);
      const observedAt = new Date(Date.now() - 500).toISOString().slice(0, 19);
      await page.getByLabel(copy.contactedAt, { exact: true }).fill(observedAt.replace(/:00$/, ""));
      await page
        .getByLabel(copy.note, { exact: true })
        .fill("Synthetic human explanation of the requested service and next steps");
      await page
        .getByLabel(copy.nextAction, { exact: true })
        .fill("Human review of the agreed details");
      await page
        .getByLabel(copy.dueAt, { exact: true })
        .fill(new Date(Date.now() + 7200000).toISOString().slice(0, 16));
      await page.getByLabel(copy.promise, { exact: true }).check();
      await page.getByLabel(copy.confirm, { exact: true }).check();
      await page.getByRole("button", { name: copy.submit, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: work.changeSaved, exact: true }),
      ).toBeVisible();
      await page.reload();
      await page.getByRole("link", { name: work.openRecord, exact: true }).click();
      const [responded] = await db
        .select()
        .from(schema.inquiries)
        .where(eq(schema.inquiries.id, received.id));
      expect(responded?.firstResponseAt?.toISOString()).toBe(`${observedAt}.000Z`);
      expect(responded?.ownerId).toBe(broker.brokerId);
      const followUps = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.inquiryId, received.id));
      expect(followUps).toHaveLength(2);
      expect(
        followUps.every((task) => task.ownerId === broker.brokerId && task.state === "open"),
      ).toBe(true);
      expect(followUps.filter((task) => task.promisedToClient)).toHaveLength(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        320,
      );
      if (javaScriptEnabled)
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await info.attach("joined-public-to-human-response-320", {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
    } finally {
      await context.close();
    }
  });

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
        .fill(new Date(Date.now() - 60000).toISOString().slice(0, 16));
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
