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
import { openUnassignedQueueAt } from "./inquiry-queue";

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

test("O02 draft notes and reasons survive scope and conversation switches, then clear after confirmation", async ({
  page,
  context,
}) => {
  const fixture = seed(),
    copy = contactCopy("en"),
    work = workCopy("en");
  const marker = randomUUID();
  const [other] = await db
    .insert(schema.inquiries)
    .values({
      reference: `RQ-DRAFT-${marker}`,
      source: "website",
      state: "assigned",
      purpose: "question",
      ownerId: fixture.brokerId,
      preferredName: "Synthetic second draft conversation",
      message: "A separate synthetic inquiry for draft switching.",
      submissionKey: randomUUID(),
      payloadDigest: "synthetic-draft",
    })
    .returning({ id: schema.inquiries.id });
  if (!other) throw new Error("Missing second conversation");
  await signIn(context, fixture.token);
  const note = `Private unsent contact note ${marker}`,
    reason = `Private unsent triage reason ${marker}`;
  const requested: string[] = [];
  page.on("request", (request) => requested.push(request.url()));
  await page.goto(hostUrl("staff", `/en/inquiries/${fixture.id}?view=all`));
  await page
    .getByLabel(copy.contactedAt, { exact: true })
    .fill(new Date(Date.now() - 60_000).toISOString().slice(0, 16));
  await page.getByLabel(copy.note, { exact: true }).fill(note);
  await page
    .getByLabel(copy.nextAction, { exact: true })
    .fill("Review the service details with a human");
  await page
    .getByLabel(copy.dueAt, { exact: true })
    .fill(new Date(Date.now() + 7_200_000).toISOString().slice(0, 16));
  await page.getByLabel(copy.confirm, { exact: true }).check();
  await page.getByLabel(work.reason, { exact: true }).fill(reason);
  const wide = (page.viewportSize()?.width ?? 0) >= 1024;
  if (!wide) await page.getByRole("link", { name: work.queue.back, exact: true }).click();
  await page
    .getByRole("navigation", { name: work.queue.views, exact: true })
    .getByRole("link", { name: work.scopes.mine, exact: true })
    .click();
  if (!wide) await page.locator(`[data-inquiry-id="${fixture.id}"] a`).click();
  await expect(page.getByLabel(copy.note, { exact: true })).toHaveValue(note);
  await expect(page.getByLabel(work.reason, { exact: true })).toHaveValue(reason);
  async function openConversation(id: string) {
    if (!wide) await page.getByRole("link", { name: work.queue.back, exact: true }).click();
    await page.locator(`[data-inquiry-id="${id}"] a`).click();
    await expect(page).toHaveURL(hostUrl("staff", `/en/inquiries/${id}?view=mine`));
  }
  await openConversation(other.id);
  await expect(page.getByLabel(work.reason, { exact: true })).toHaveValue("");
  await page
    .getByLabel(work.reason, { exact: true })
    .fill("The second conversation's separate draft");
  await openConversation(fixture.id);
  await expect(page.getByLabel(copy.note, { exact: true })).toHaveValue(note);
  await expect(page.getByLabel(work.reason, { exact: true })).toHaveValue(reason);
  await expect(page.getByLabel(copy.confirm, { exact: true })).toBeChecked();
  if (wide)
    await expect(page.locator(`[data-inquiry-id="${fixture.id}"] a`)).toHaveAttribute(
      "aria-current",
      "page",
    );
  await page.getByRole("button", { name: copy.submit, exact: true }).click();
  await expect(page.getByRole("heading", { name: work.changeSaved, exact: true })).toBeVisible();
  await page.getByRole("link", { name: work.openRecord, exact: true }).click();
  await expect(page.getByLabel(copy.note, { exact: true })).toHaveValue("");
  await expect(page.getByLabel(work.reason, { exact: true })).toHaveValue(reason);

  const anotherActor = seed();
  await signIn(context, anotherActor.token);
  await page.goto(hostUrl("staff", `/en/inquiries/${anotherActor.id}`));
  await expect(page.getByLabel(copy.note, { exact: true })).toHaveValue("");
  await signIn(context, fixture.token);
  await page.goto(hostUrl("staff", `/en/inquiries/${fixture.id}`));
  await expect(page.getByLabel(work.reason, { exact: true })).toHaveValue("");
  expect(
    requested.every(
      (address) =>
        ![note, reason].some(
          (text) => address.includes(text) || address.includes(encodeURIComponent(text)),
        ),
    ),
  ).toBe(true);
});

test("O02 pending contact keeps its operation when acknowledgment is lost and clears after reconciliation", async ({
  page,
  context,
}) => {
  const fixture = seed(),
    copy = contactCopy("en"),
    work = workCopy("en");
  await signIn(context, fixture.token);
  await page.goto(hostUrl("staff", `/en/inquiries/${fixture.id}`));
  const note = `Synthetic lost-acknowledgment note ${randomUUID()}`;
  await page
    .getByLabel(copy.contactedAt, { exact: true })
    .fill(new Date(Date.now() - 60_000).toISOString().slice(0, 16));
  await page.getByLabel(copy.note, { exact: true }).fill(note);
  await page
    .getByLabel(copy.nextAction, { exact: true })
    .fill("Review the contact before another action");
  await page
    .getByLabel(copy.dueAt, { exact: true })
    .fill(new Date(Date.now() + 7_200_000).toISOString().slice(0, 16));
  await page.getByLabel(copy.confirm, { exact: true }).check();
  const operationId = await page
    .locator('[data-inquiry-contact] input[name="_operationId"]')
    .inputValue();
  let acknowledged!: () => void, release!: () => void;
  const received = new Promise<void>((resolve) => {
    acknowledged = resolve;
  });
  const holdResponse = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/*", async (route) => {
    if (route.request().method() !== "POST" || !route.request().headers()["next-action"]) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    acknowledged();
    await holdResponse;
    // A full navigation closes the original action request after the server has accepted it.
    await route.fulfill({ response }).catch(() => {});
  });
  try {
    await page.getByRole("button", { name: copy.submit, exact: true }).click();
    await received;
    await page.goto(hostUrl("staff", "/en/inquiries?view=mine"));
    release();
    await page.locator(`[data-inquiry-id="${fixture.id}"] a`).click();
    await expect(page.getByLabel(copy.note, { exact: true })).toHaveValue(note);
    await expect(page.getByLabel(copy.note, { exact: true })).toHaveAttribute("readonly");
    await expect(page.getByRole("button", { name: copy.submit, exact: true })).toHaveCount(0);
    const status = page.getByRole("link", { name: work.statusLink, exact: true });
    await expect(status).toHaveAttribute(
      "href",
      `/en/inquiries/${fixture.id}/operations?type=contact&key=${operationId}`,
    );
    await status.click();
    await expect(page.getByRole("heading", { name: work.changeSaved, exact: true })).toBeVisible();
    await page.getByRole("link", { name: work.openRecord, exact: true }).click();
    await expect(page.getByLabel(copy.note, { exact: true })).toHaveValue("");
    await expect(page.getByText(note, { exact: true })).toBeVisible();
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("O02 native triage submits its reason with a stable inquiry form identity", async ({
  browser,
}) => {
  const fixture = seed(),
    work = workCopy("en");
  const context = await browser.newContext({ javaScriptEnabled: false });
  await signIn(context, fixture.token);
  const page = await context.newPage();
  const reason = `Synthetic native triage reason ${randomUUID()}`;
  try {
    await page.goto(hostUrl("staff", `/en/inquiries/${fixture.id}`));
    await page.getByLabel(work.state, { exact: true }).selectOption("contact_unreachable");
    await page.getByLabel(work.reason, { exact: true }).fill(reason);
    await page.getByRole("button", { name: work.disposition, exact: true }).click();
    await expect(page.getByRole("heading", { name: work.changeSaved, exact: true })).toBeVisible();
    const [record] = await db
      .select()
      .from(schema.inquiries)
      .where(eq(schema.inquiries.id, fixture.id));
    expect(record?.state).toBe("contact_unreachable");
    expect(record?.dispositionReason).toBe(reason);
  } finally {
    await context.close();
  }
});

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
      await openUnassignedQueueAt(page, received.id);
      // O02 row: no name was given, so the reference names it beside the listing it came from.
      const row = page.locator(`[data-inquiry-id="${received.id}"]`);
      await expect(row).toContainText(`${received.reference} · ${listing.reference}`);
      await row.getByRole("link").click();
      await expect(
        page.getByRole("heading", { name: received.reference, exact: true }),
      ).toBeVisible();
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
      // The width below is measured on the opened record once it has loaded with its styles.
      await expect(page).toHaveURL(hostUrl("staff", `/en/inquiries/${received.id}`));
      await page.waitForLoadState("load");
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
