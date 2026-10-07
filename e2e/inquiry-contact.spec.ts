import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { type BrowserContext, expect, type Page, type Route, test } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { discoveryCopy } from "../src/features/discovery/copy";
import { contactCopy } from "../src/features/work/contact-copy";
import { workCopy } from "../src/features/work/copy";
import { inquiryReferenceCookie } from "../src/features/work/inquiry-reference";
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

async function openRecord(page: Page, label: string) {
  await page
    .getByRole("link", { name: label, exact: true })
    .or(page.getByRole("button", { name: label, exact: true }))
    .click();
}

async function contactEvidence(id: string) {
  const [receipts, observations, tasks] = await Promise.all([
    db
      .select({ key: schema.operations.idempotencyKey, status: schema.operations.status })
      .from(schema.operations)
      .where(
        and(
          eq(schema.operations.operationType, "work.inquiry.contact"),
          eq(schema.operations.resultId, id),
        ),
      ),
    db
      .select({ id: schema.auditEvents.id })
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.recordId, id),
          eq(schema.auditEvents.action, "work.inquiry.contact_recorded"),
        ),
      ),
    db.select({ id: schema.tasks.id }).from(schema.tasks).where(eq(schema.tasks.inquiryId, id)),
  ]);
  return { receipts, observations: observations.length, tasks: tasks.length };
}

async function holdInquiryScripts(page: Page) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/_next/**/*.js*", async (route) => {
    await held;
    await route.continue();
  });
  return release;
}

for (const kind of ["contact", "triage", "accept"] as const)
  test(`O02 S15 restored ${kind} draft requires review of a newer inquiry before any request`, async ({
    page,
    context,
  }) => {
    const fixture = seed(),
      copy = contactCopy("en"),
      work = workCopy("en");
    if (kind === "accept")
      await db
        .update(schema.inquiries)
        .set({ state: "received", ownerId: null, coverageQueue: "agency" })
        .where(eq(schema.inquiries.id, fixture.id));
    await signIn(context, fixture.token);
    const path = hostUrl("staff", `/en/inquiries/${fixture.id}`);
    await page.goto(path);
    const fieldLabel =
      kind === "contact" ? copy.note : kind === "triage" ? work.reason : work.nextAction;
    const submitLabel =
      kind === "contact" ? copy.submit : kind === "triage" ? work.disposition : work.accept;
    const entries = `Private revision-sensitive ${kind} draft ${randomUUID()}`;
    await page.getByLabel(fieldLabel, { exact: true }).fill(entries);
    if (kind === "contact") {
      await page
        .getByLabel(copy.contactedAt, { exact: true })
        .fill(new Date(Date.now() - 60_000).toISOString().slice(0, 16));
      await page
        .getByLabel(copy.nextAction, { exact: true })
        .fill("Review service details with a human");
      await page
        .getByLabel(copy.dueAt, { exact: true })
        .fill(new Date(Date.now() + 7_200_000).toISOString().slice(0, 16));
      await page.getByLabel(copy.confirm, { exact: true }).check();
    } else if (kind === "accept") {
      await page
        .getByLabel(work.dueAt, { exact: true })
        .fill(new Date(Date.now() + 7_200_000).toISOString().slice(0, 16));
    } else {
      await page.getByLabel(work.state, { exact: true }).selectOption("contact_unreachable");
    }
    const [updated] = await db
      .update(schema.inquiries)
      .set({ version: sql`${schema.inquiries.version} + 1` })
      .where(eq(schema.inquiries.id, fixture.id))
      .returning({ version: schema.inquiries.version });
    if (!updated) throw new Error("Missing revised inquiry");
    const posts: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === `/en/inquiries/${fixture.id}`
      )
        posts.push(request.url());
    });
    await page.reload();
    const form = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: submitLabel, exact: true }) });
    const notice = form.getByRole("status").filter({ hasText: work.draft.restored });
    await expect(notice).toHaveText(
      new RegExp(work.draft.changed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    await expect(page.getByLabel(fieldLabel, { exact: true })).toHaveValue(entries);
    if (kind === "contact")
      await expect(page.getByLabel(copy.confirm, { exact: true })).not.toBeChecked();
    await page.getByRole("button", { name: submitLabel, exact: true }).click();
    await expect(form.getByText(work.draft.required, { exact: true })).toBeVisible();
    await expect(form.getByLabel(work.draft.confirm, { exact: true })).toBeFocused();
    expect(posts).toEqual([]);
    const [unchanged] = await db
      .select({ version: schema.inquiries.version })
      .from(schema.inquiries)
      .where(eq(schema.inquiries.id, fixture.id));
    expect(unchanged?.version).toBe(updated.version);
    // Leaving before review must preserve the old draft revision, not silently bless it.
    await page.goto(hostUrl("staff", "/en/inquiries"));
    await page.goto(path);
    await expect(form.getByLabel(work.draft.confirm, { exact: true })).not.toBeChecked();
    await expect(form.locator('input[name="_expectedRevision"]')).toHaveValue(
      String(updated.version),
    );
    await form.getByLabel(work.draft.confirm, { exact: true }).check();
    if (kind === "contact") await page.getByLabel(copy.confirm, { exact: true }).check();
    await page.getByRole("button", { name: submitLabel, exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: kind === "triage" ? work.statusTitle : work.changeSaved,
        exact: true,
      }),
    ).toBeVisible();
    expect(posts).toHaveLength(1);
    const [recorded] = await db
      .select({ version: schema.inquiries.version })
      .from(schema.inquiries)
      .where(eq(schema.inquiries.id, fixture.id));
    expect(recorded?.version).toBe(updated.version + 1);
  });

for (const retained of [false, true])
  test(`O02 S15 hydration preserves the edited DOM and caret without a differing restore (retained ${retained})`, async ({
    page,
    context,
  }) => {
    const fixture = seed(),
      copy = contactCopy("en"),
      work = workCopy("en");
    await signIn(context, fixture.token);
    const path = hostUrl("staff", `/en/inquiries/${fixture.id}`);
    const note = "Synthetic entries typed before hydration";
    if (retained) {
      await page.goto(path);
      await page.getByLabel(copy.note, { exact: true }).fill(note);
    }
    const release = await holdInquiryScripts(page);
    try {
      await page.goto(path, { waitUntil: "commit" });
      const control = page.getByLabel(copy.note, { exact: true });
      await control.fill(note);
      await control.evaluate((element) => {
        const textarea = element as HTMLTextAreaElement;
        textarea.setAttribute("data-before-hydration", "yes");
        textarea.focus();
        textarea.setSelectionRange(4, 13, "backward");
      });
      release();
      await page.waitForLoadState("networkidle");
      await expect(control).toHaveAttribute("data-before-hydration", "yes");
      await expect(control).toBeFocused();
      expect(
        await control.evaluate((element) => {
          const textarea = element as HTMLTextAreaElement;
          return [textarea.selectionStart, textarea.selectionEnd, textarea.selectionDirection];
        }),
      ).toEqual([4, 13, "backward"]);
      await expect(control).toHaveValue(note);
      if (retained)
        await expect(page.getByRole("status").filter({ hasText: work.draft.restored })).toHaveText(
          new RegExp(work.draft.local.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        );
      else await expect(page.getByText(work.draft.restored, { exact: true })).toHaveCount(0);
    } finally {
      release();
      await page.unrouteAll({ behavior: "wait" });
    }
  });

test("O02 S15 an actual restore and its unknown status keep the current focus", async ({
  page,
  context,
}) => {
  const fixture = seed(),
    copy = contactCopy("en"),
    work = workCopy("en");
  const path = hostUrl("staff", `/en/inquiries/${fixture.id}`);
  await signIn(context, fixture.token);
  await page.goto(path);
  const note = "Synthetic retained note awaiting explicit recording";
  await page.getByLabel(copy.note, { exact: true }).fill(note);
  const before = await contactEvidence(fixture.id);
  for (const unknown of [false, true]) {
    if (unknown)
      await page.getByLabel(copy.note, { exact: true }).evaluate((control, id) => {
        const key = `msr.inquiry-draft.${id}:contact`;
        const draft = JSON.parse(sessionStorage.getItem(key) ?? "null");
        const form = control.closest("form");
        if (!draft || !form) throw new Error("Missing retained draft");
        draft.operation = {
          id: (form.elements.namedItem("_operationId") as HTMLInputElement).value,
          revision: Number(
            (form.elements.namedItem("_expectedRevision") as HTMLInputElement).value,
          ),
        };
        sessionStorage.setItem(key, JSON.stringify(draft));
      }, fixture.id);
    const release = await holdInquiryScripts(page);
    try {
      await page.goto(path, { waitUntil: "commit" });
      const focus = page.locator('a[href="/en/today"]:visible').first();
      await focus.focus();
      release();
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("status").filter({ hasText: work.draft.restored })).toContainText(
        work.draft.local,
      );
      await expect(page.getByLabel(copy.note, { exact: true })).toHaveValue(note);
      await expect(focus).toBeFocused();
      if (unknown) {
        await expect(
          page.locator("form").getByText(work.form.unknown, { exact: true }),
        ).toBeVisible();
        await expect(page.getByRole("button", { name: copy.submit, exact: true })).toHaveCount(0);
        await expect(page.getByLabel(copy.note, { exact: true })).toHaveAttribute("readonly", "");
      }
    } finally {
      release();
      await page.unrouteAll({ behavior: "wait" });
    }
  }
  expect(await contactEvidence(fixture.id)).toEqual(before);
});

for (const beforeHydration of [false, true])
  test(`O02 S15 native sign-out removes private tab drafts (before hydration ${beforeHydration})`, async ({
    page,
    context,
  }) => {
    const fixture = seed(),
      copy = contactCopy("en");
    await signIn(context, fixture.token);
    await page.goto(hostUrl("staff", `/en/inquiries/${fixture.id}`));
    await page.getByLabel(copy.note, { exact: true }).fill("Private draft to remove on sign-out");
    const release = beforeHydration ? await holdInquiryScripts(page) : () => {};
    try {
      await page.goto(hostUrl("staff", "/en/today"), {
        waitUntil: beforeHydration ? "commit" : "load",
      });
      const signOut = page.locator('form[action="/en/access/signout"] button:visible');
      if ((await signOut.count()) === 0)
        await page.getByRole("button", { name: "More", exact: true }).click();
      const posted = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/en/access/signout" &&
          response.request().method() === "POST",
      );
      await signOut.click();
      expect((await posted).status()).toBe(303);
      await expect(page).toHaveURL(hostUrl("staff", "/en/access"));
      release();
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("heading", { name: "Staff sign-in", exact: true })).toBeVisible();
      expect(
        await page.evaluate(() =>
          Object.keys(sessionStorage).filter((key) => key.startsWith("msr.inquiry-draft.")),
        ),
      ).toEqual([]);
      expect((await context.cookies()).some((cookie) => cookie.name === "msr_staff_session")).toBe(
        false,
      );
    } finally {
      release();
      await page.unrouteAll({ behavior: "wait" });
    }
  });

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
  await openRecord(page, work.openRecord);
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

test("O02 pending contact fences SSR with scripts delayed and clears after explicit native reconciliation", async ({
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
  const ownerId = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem("msr.inquiry-draft.owner") ?? "null")?.id,
  );
  expect(ownerId).toMatch(/^[0-9a-f]{64}$/);
  const referenceName = inquiryReferenceCookie(ownerId, fixture.id, "contact");
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
    // Capture the client-written reference before observing the real command. route.fetch
    // can ingest response cookies; restore the pre-reply cookie to model withheld headers.
    const pending = (await context.cookies()).find((cookie) => cookie.name === referenceName);
    expect(pending?.value).toBe(operationId);
    const response = await route.fetch();
    if (pending) await context.addCookies([pending]);
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
    const blockScripts = async (route: Route) => {
      if (route.request().resourceType() === "script") await route.abort();
      else await route.continue();
    };
    await page.route("**/_next/static/**", blockScripts);
    await page.goto(hostUrl("staff", `/en/inquiries/${fixture.id}?view=mine&page=2`));
    await expect(page).toHaveURL(
      hostUrl(
        "staff",
        `/en/inquiries/${fixture.id}/operations?type=contact&key=${operationId}&view=mine&page=2`,
      ),
    );
    await expect(page.getByLabel(copy.note, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: copy.submit, exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: work.changeSaved, exact: true })).toBeVisible();
    expect((await context.cookies()).find((cookie) => cookie.name === referenceName)?.value).toBe(
      operationId,
    );
    // Native resolution verifies the terminal receipt before releasing the server fence.
    await page.getByRole("button", { name: work.openRecord, exact: true }).click();
    await expect(page).toHaveURL(hostUrl("staff", `/en/inquiries/${fixture.id}?view=mine&page=2`));
    expect(
      decodeURIComponent(
        (await context.cookies()).find((cookie) => cookie.name === referenceName)?.value ?? "",
      ),
    ).toBe(`succeeded:${operationId}`);
    // The old local pending reference remains until scripts resume; verified SSR resolution
    // must clear it before the restored form can block or offer another replay.
    expect(
      await page.evaluate(
        (id) =>
          JSON.parse(sessionStorage.getItem(`msr.inquiry-draft.${id}:contact`) ?? "null")?.operation
            ?.id,
        fixture.id,
      ),
    ).toBe(operationId);
    await page.unroute("**/_next/static/**", blockScripts);
    await page.reload();
    await expect(page.getByLabel(copy.note, { exact: true })).toHaveValue("");
    await expect(page.getByRole("button", { name: copy.submit, exact: true })).toBeEnabled();
    await expect(page.getByText(note, { exact: true })).toBeVisible();
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

for (const kind of ["accept", "contact", "triage"] as const) {
  test(`O02 pending ${kind} is fenced before hydration and with scripts disabled`, async ({
    page,
    context,
    browser,
  }) => {
    const fixture = seed(),
      copy = contactCopy("en"),
      work = workCopy("en");
    if (kind === "accept")
      await db
        .update(schema.inquiries)
        .set({ state: "received", ownerId: null, coverageQueue: "agency" })
        .where(eq(schema.inquiries.id, fixture.id));
    await signIn(context, fixture.token);
    await page.goto(hostUrl("staff", `/en/inquiries/${fixture.id}`));
    const field = page.getByLabel(
      kind === "contact" ? copy.note : kind === "triage" ? work.reason : work.nextAction,
      { exact: true },
    );
    const operationId = await field.evaluate(
      (control) =>
        (control.closest("form")?.querySelector('input[name="_operationId"]') as HTMLInputElement)
          ?.value,
    );
    expect(operationId).toMatch(/^[A-Za-z0-9_-]{43}\.[0-9a-f]{32}$/);
    const ownerId = await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("msr.inquiry-draft.owner") ?? "null")?.id,
    );
    expect(ownerId).toMatch(/^[0-9a-f]{64}$/);
    const name = inquiryReferenceCookie(ownerId, fixture.id, kind);
    await context.addCookies([
      { name, value: operationId, url: origins.staff, sameSite: "Strict" },
    ]);
    const native = await browser.newContext({ javaScriptEnabled: false });
    try {
      await native.addCookies((await context.cookies()).filter((cookie) => cookie.name !== name));
      const nativePage = await native.newPage();
      await nativePage.goto(hostUrl("staff", `/en/inquiries/${fixture.id}`));
      const freshField = nativePage.getByLabel(
        kind === "contact" ? copy.note : kind === "triage" ? work.reason : work.nextAction,
        { exact: true },
      );
      const freshId = await freshField.evaluate(
        (control) =>
          (control.closest("form")?.querySelector('input[name="_operationId"]') as HTMLInputElement)
            ?.value,
      );
      expect(freshId).not.toBe(operationId);
      const [before] = await db
        .select({ version: schema.inquiries.version })
        .from(schema.inquiries)
        .where(eq(schema.inquiries.id, fixture.id));
      // A form opened earlier must also be fenced by the server if another tab retained a
      // different pending reference after this HTML was delivered.
      await native.addCookies([
        { name, value: operationId, url: origins.staff, sameSite: "Strict" },
      ]);
      await nativePage
        .getByRole("button", {
          name:
            kind === "contact" ? copy.submit : kind === "triage" ? work.disposition : work.accept,
          exact: true,
        })
        .click();
      await expect(nativePage).toHaveURL(
        (address) =>
          address.href.split("#")[0] ===
          hostUrl(
            "staff",
            `/en/inquiries/${fixture.id}/operations?type=${kind}&key=${operationId}&view=all`,
          ),
      );
      const [after] = await db
        .select({ version: schema.inquiries.version })
        .from(schema.inquiries)
        .where(eq(schema.inquiries.id, fixture.id));
      expect(after?.version).toBe(before?.version);
      await nativePage.goto(hostUrl("staff", `/en/inquiries/${fixture.id}?view=mine`));
      await expect(nativePage).toHaveURL(
        hostUrl(
          "staff",
          `/en/inquiries/${fixture.id}/operations?type=${kind}&key=${operationId}&view=mine`,
        ),
      );
      await expect(nativePage.getByText(work.statusMissing, { exact: true })).toBeVisible();
      await expect(nativePage.locator('input[name="_operationId"]')).toHaveCount(0);
      await expect(
        nativePage.getByRole("button", { name: work.openRecord, exact: true }),
      ).toHaveCount(0);
      // A forged terminal prefix cannot release a pending operation without its receipt.
      await native.addCookies([
        { name, value: `succeeded:${operationId}`, url: origins.staff, sameSite: "Strict" },
      ]);
      await nativePage.goto(hostUrl("staff", `/en/inquiries/${fixture.id}?view=mine`));
      await expect(nativePage).toHaveURL(
        hostUrl(
          "staff",
          `/en/inquiries/${fixture.id}/operations?type=${kind}&key=${operationId}&view=mine`,
        ),
      );
      await expect(nativePage.locator('input[name="_operationId"]')).toHaveCount(0);
    } finally {
      await native.close();
    }
  });
}

test("O02 storage-disabled drafts survive history Forward and Back, with protection after unmount", async ({
  page,
  context,
}) => {
  const fixture = seed(),
    copy = contactCopy("en"),
    work = workCopy("en");
  await context.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error("Storage disabled");
    };
  });
  await signIn(context, fixture.token);
  const inquiryUrl = hostUrl("staff", `/en/inquiries/${fixture.id}`);
  await page.goto(inquiryUrl);
  const origin = await page.evaluate(() => performance.timeOrigin);
  const sidebar = page
    .getByRole("navigation", { name: "Workspace", exact: true })
    .getByRole("link", { name: "Today", exact: true });
  // Create the forward entry while the inquiry is clean, then edit after going Back.
  await sidebar.click();
  await expect(page).toHaveURL(hostUrl("staff", "/en/today"));
  await page.goBack();
  await expect(page).toHaveURL(inquiryUrl);
  await page
    .getByLabel(copy.note, { exact: true })
    .fill("Private note with browser storage unavailable");
  await page
    .getByLabel(work.reason, { exact: true })
    .fill("Private triage reason with browser storage unavailable");
  await page.goForward();
  await expect(page).toHaveURL(hostUrl("staff", "/en/today"));
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  // The beforeunload protection must outlive the now-unmounted inquiry forms.
  const asked = new Promise<void>((resolve) =>
    page.once("dialog", async (dialog) => {
      expect(dialog.type()).toBe("beforeunload");
      await dialog.dismiss();
      resolve();
    }),
  );
  await page.evaluate(() => location.reload());
  await asked;
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  await page.goBack();
  await expect(page).toHaveURL(inquiryUrl);
  await expect(page.getByLabel(copy.note, { exact: true })).toHaveValue(
    "Private note with browser storage unavailable",
  );
  await expect(page.getByLabel(work.reason, { exact: true })).toHaveValue(
    "Private triage reason with browser storage unavailable",
  );
  // Normal sidebar navigation also preserves the memory-only drafts without a leave prompt.
  await sidebar.click();
  await expect(page).toHaveURL(hostUrl("staff", "/en/today"));
  await page.goBack();
  await expect(page.getByLabel(work.reason, { exact: true })).toHaveValue(
    "Private triage reason with browser storage unavailable",
  );
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
});

test("O02 success headers without an acknowledgment body keep the pending SSR reference", async ({
  page,
  context,
}) => {
  const fixture = seed(),
    copy = contactCopy("en"),
    work = workCopy("en");
  await signIn(context, fixture.token);
  await page.goto(hostUrl("staff", `/en/inquiries/${fixture.id}`));
  await page
    .getByLabel(copy.contactedAt, { exact: true })
    .fill(new Date(Date.now() - 60_000).toISOString().slice(0, 16));
  const note = `Synthetic headers-only acknowledgment ${randomUUID()}`;
  await page.getByLabel(copy.note, { exact: true }).fill(note);
  await page.getByLabel(copy.nextAction, { exact: true }).fill("Review the received contact");
  await page
    .getByLabel(copy.dueAt, { exact: true })
    .fill(new Date(Date.now() + 7_200_000).toISOString().slice(0, 16));
  await page.getByLabel(copy.confirm, { exact: true }).check();
  const key = await page.locator('[data-inquiry-contact] input[name="_operationId"]').inputValue();
  const ownerId = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem("msr.inquiry-draft.owner") ?? "null")?.id,
  );
  const name = inquiryReferenceCookie(ownerId, fixture.id, "contact");
  let delivered!: () => void;
  const headersDelivered = new Promise<void>((resolve) => {
    delivered = resolve;
  });
  let responseCookie = "";
  await page.route("**/*", async (route) => {
    if (route.request().method() !== "POST" || !route.request().headers()["next-action"]) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    responseCookie = response.headers()["set-cookie"] ?? "";
    // Deliver every actual successful response header, including Set-Cookie, with no action
    // acknowledgment body. Do not restore or fabricate the browser's reference cookie.
    await route.fulfill({ response, body: "" });
    delivered();
  });
  try {
    await page.getByRole("button", { name: copy.submit, exact: true }).click();
    await headersDelivered;
    expect(responseCookie).toContain(`${name}=${key}`);
    expect((await context.cookies()).find((cookie) => cookie.name === name)?.value).toBe(key);
    await page.route("**/_next/static/**", async (route) => {
      if (route.request().resourceType() === "script") await route.abort();
      else await route.continue();
    });
    await page.goto(hostUrl("staff", `/en/inquiries/${fixture.id}`));
    await expect(page).toHaveURL(
      hostUrl("staff", `/en/inquiries/${fixture.id}/operations?type=contact&key=${key}&view=all`),
    );
    await expect(page.getByLabel(copy.note, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: work.changeSaved, exact: true })).toBeVisible();
    expect((await context.cookies()).find((cookie) => cookie.name === name)?.value).toBe(key);
    await page.getByRole("button", { name: work.openRecord, exact: true }).click();
    await expect(page.getByText(note, { exact: true })).toBeVisible();
    await expect(page.getByLabel(copy.note, { exact: true })).toHaveValue("");
  } finally {
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("O02 lost validation body resumes the retained draft with the same reference and writes once", async ({
  page,
  context,
}) => {
  const fixture = seed(),
    copy = contactCopy("en"),
    work = workCopy("en");
  const before = await contactEvidence(fixture.id);
  await signIn(context, fixture.token);
  await page.goto(hostUrl("staff", `/en/inquiries/${fixture.id}`));
  const note = `Private validation recovery note ${randomUUID()}`;
  await page
    .getByLabel(copy.contactedAt, { exact: true })
    .fill(new Date(Date.now() - 60_000).toISOString().slice(0, 16));
  await page.getByLabel(copy.note, { exact: true }).fill(note);
  // Native minLength permits these spaces; schema trim/min fails before runOperation.
  await page.getByLabel(copy.nextAction, { exact: true }).fill("   x   ");
  await page
    .getByLabel(copy.dueAt, { exact: true })
    .fill(new Date(Date.now() + 7_200_000).toISOString().slice(0, 16));
  await page.getByLabel(copy.confirm, { exact: true }).check();
  const key = await page.locator('[data-inquiry-contact] input[name="_operationId"]').inputValue();
  let delivered!: () => void;
  const received = new Promise<void>((resolve) => {
    delivered = resolve;
  });
  let dropped = false,
    responseCookie = "";
  await page.route("**/*", async (route) => {
    if (
      !dropped &&
      route.request().method() === "POST" &&
      route.request().headers()["next-action"]
    ) {
      dropped = true;
      const response = await route.fetch();
      responseCookie = response.headers()["set-cookie"] ?? "";
      await route.fulfill({ response, body: "" });
      delivered();
    } else await route.continue();
  });
  try {
    await page.getByRole("button", { name: copy.submit, exact: true }).click();
    await received;
    // A pre-existing pending cookie may stay untouched; actual headers must not clear it.
    expect(responseCookie).not.toContain("Max-Age=0");
    expect(
      (await context.cookies()).find((cookie) => cookie.name.endsWith(`_${fixture.id}_contact`))
        ?.value,
    ).toBe(key);
    expect(await contactEvidence(fixture.id)).toEqual(before);
    await page.goto(hostUrl("staff", `/en/inquiries/${fixture.id}`));
    await expect(page.getByText(work.statusMissing, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: work.retryDraft, exact: true }).click();
    await expect(page.getByLabel(copy.note, { exact: true })).toHaveValue(note);
    await expect(page.getByLabel(copy.note, { exact: true })).not.toHaveAttribute("readonly");
    await expect(page.getByLabel(copy.nextAction, { exact: true })).toHaveValue("   x   ");
    await expect(page.locator('[data-inquiry-contact] input[name="_operationId"]')).toHaveValue(
      key,
    );
    await expect(page.getByLabel(copy.confirm, { exact: true })).not.toBeChecked();
    await page
      .getByLabel(copy.nextAction, { exact: true })
      .fill("Review the recovered contact draft");
    await page.getByLabel(copy.confirm, { exact: true }).check();
    await page.getByRole("button", { name: copy.submit, exact: true }).click();
    await expect(page.getByRole("heading", { name: work.changeSaved, exact: true })).toBeVisible();
    await openRecord(page, work.openRecord);
    await expect(page.getByText(note, { exact: true })).toBeVisible();
    const after = await contactEvidence(fixture.id);
    expect(after.receipts).toEqual([{ key, status: "succeeded" }]);
    expect(after.observations).toBe(before.observations + 1);
    expect(after.tasks).toBe(before.tasks + 1);
  } finally {
    await page.unrouteAll({ behavior: "wait" });
  }
});

for (const retryBody of ["received", "lost"] as const) {
  test(`O02 missing-receipt recovery cannot duplicate an earlier contact still in flight (retry body ${retryBody})`, async ({
    page,
    context,
  }) => {
    const fixture = seed(),
      copy = contactCopy("en"),
      work = workCopy("en");
    const before = await contactEvidence(fixture.id);
    await signIn(context, fixture.token);
    await page.goto(hostUrl("staff", `/en/inquiries/${fixture.id}`));
    const note = `Earlier in-flight contact ${randomUUID()}`;
    await page
      .getByLabel(copy.contactedAt, { exact: true })
      .fill(new Date(Date.now() - 60_000).toISOString().slice(0, 16));
    await page.getByLabel(copy.note, { exact: true }).fill(note);
    await page.getByLabel(copy.nextAction, { exact: true }).fill("Review the original contact");
    await page
      .getByLabel(copy.dueAt, { exact: true })
      .fill(new Date(Date.now() + 7_200_000).toISOString().slice(0, 16));
    await page.getByLabel(copy.confirm, { exact: true }).check();
    const key = await page
      .locator('[data-inquiry-contact] input[name="_operationId"]')
      .inputValue();
    let acquired!: () => void, release!: () => void;
    const locked = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const rowLock = connection.begin(async (tx) => {
      await tx`select id from inquiries where id = ${fixture.id}::uuid for update`;
      acquired();
      await held;
    });
    await locked;
    let contactRequests = 0,
      retryConflict = false,
      retryCookie = "";
    let delivered!: () => void;
    const retryDropped = new Promise<void>((resolve) => {
      delivered = resolve;
    });
    await page.route("**/*", async (route) => {
      const request = route.request();
      const contactRequest =
        request.method() === "POST" &&
        request.headers()["next-action"] &&
        new URL(request.url()).pathname === `/en/inquiries/${fixture.id}`;
      if (contactRequest) contactRequests++;
      if (contactRequest && (contactRequests === 1 || retryBody === "lost")) {
        const attempt = contactRequests;
        const response = await route.fetch();
        if (attempt === 2) {
          retryConflict = (await response.text()).includes("IDEMPOTENCY_KEY_REUSED");
          retryCookie = response.headers()["set-cookie"] ?? "";
        }
        // The original request continues in the server even after the client opens status.
        // Deliver the real headers, including cookies, but lose both acknowledgment bodies.
        if (attempt === 1) await route.fulfill({ response, body: "" }).catch(() => {});
        else {
          await route.fulfill({ response, body: "" });
          delivered();
        }
      } else await route.continue();
    });
    const waiting = async () => {
      const [row] = await connection<{ count: number }[]>`
      select count(*)::int as count from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'
      and query ilike '%inquiries%' and query ilike '%for update%'`;
      return row?.count;
    };
    try {
      await page.getByRole("button", { name: copy.submit, exact: true }).click();
      await expect.poll(waiting).toBe(1);
      await page.goto(hostUrl("staff", `/en/inquiries/${fixture.id}`));
      await expect(page.getByText(work.statusMissing, { exact: true })).toBeVisible();
      await page.getByRole("button", { name: work.retryDraft, exact: true }).click();
      await expect(page.getByLabel(copy.note, { exact: true })).toHaveValue(note);
      await expect(page.locator('[data-inquiry-contact] input[name="_operationId"]')).toHaveValue(
        key,
      );
      const changed = "Corrected contact intent while the earlier request is running";
      const correctedNote = `Corrected unapplied note ${randomUUID()}`;
      await page.getByLabel(copy.note, { exact: true }).fill(correctedNote);
      await page.getByLabel(copy.nextAction, { exact: true }).fill(changed);
      await page.getByLabel(copy.confirm, { exact: true }).check();
      await page.getByRole("button", { name: copy.submit, exact: true }).click();
      await expect.poll(waiting).toBe(2);
      release();
      await rowLock;
      if (retryBody === "lost") {
        await retryDropped;
        expect(retryConflict).toBe(true);
        expect(retryCookie).not.toContain("Max-Age=0");
        expect(
          (await context.cookies()).find((cookie) => cookie.name.endsWith(`_${fixture.id}_contact`))
            ?.value,
        ).toBe(key);
        await page.goto(hostUrl("staff", `/en/inquiries/${fixture.id}`));
      } else {
        await expect(page.getByText(work.conflict, { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: copy.submit, exact: true })).toHaveCount(0);
        await page.getByRole("link", { name: work.statusLink, exact: true }).click();
      }
      await expect(
        page.getByRole("heading", { name: work.changeSaved, exact: true }),
      ).toBeVisible();
      await openRecord(page, work.openRecord);
      await expect(page.getByRole("complementary").getByText(note, { exact: true })).toBeVisible();
      await expect(
        page.getByRole("complementary").getByText(correctedNote, { exact: true }),
      ).toHaveCount(0);
      await expect(page.getByLabel(copy.note, { exact: true })).toHaveValue(correctedNote);
      await expect(page.getByLabel(copy.nextAction, { exact: true })).toHaveValue(changed);
      await expect(page.getByLabel(copy.confirm, { exact: true })).not.toBeChecked();
      const after = await contactEvidence(fixture.id);
      expect(after.receipts).toEqual([{ key, status: "succeeded" }]);
      expect(after.observations).toBe(before.observations + 1);
      expect(after.tasks).toBe(before.tasks + 1);
      const observations = await db
        .select({ payload: schema.auditEvents.payload })
        .from(schema.auditEvents)
        .where(
          and(
            eq(schema.auditEvents.recordId, fixture.id),
            eq(schema.auditEvents.action, "work.inquiry.contact_recorded"),
          ),
        );
      expect(observations).toEqual([
        {
          payload: expect.objectContaining({
            note,
            nextAction: "Review the original contact",
          }),
        },
      ]);
      expect(
        await db
          .select({ id: schema.tasks.id })
          .from(schema.tasks)
          .where(and(eq(schema.tasks.inquiryId, fixture.id), eq(schema.tasks.title, changed))),
      ).toEqual([]);
      expect(contactRequests).toBe(2);
    } finally {
      release();
      await rowLock;
      await page.unrouteAll({ behavior: "wait" });
    }
  });
}

test("O02 storage-disabled triage draft survives a successful contact redirect and confirmed return", async ({
  page,
  context,
}) => {
  const fixture = seed(),
    copy = contactCopy("en"),
    work = workCopy("en");
  await context.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error("Storage disabled");
    };
  });
  await signIn(context, fixture.token);
  await page.goto(hostUrl("staff", `/en/inquiries/${fixture.id}`));
  const origin = await page.evaluate(() => performance.timeOrigin);
  const reason = `Unsent triage across contact redirect ${randomUUID()}`;
  const note = `Observed successful contact ${randomUUID()}`;
  await page.getByLabel(work.reason, { exact: true }).fill(reason);
  await page
    .getByLabel(copy.contactedAt, { exact: true })
    .fill(new Date(Date.now() - 60_000).toISOString().slice(0, 16));
  await page.getByLabel(copy.note, { exact: true }).fill(note);
  await page.getByLabel(copy.nextAction, { exact: true }).fill("Review the successful contact");
  await page
    .getByLabel(copy.dueAt, { exact: true })
    .fill(new Date(Date.now() + 7_200_000).toISOString().slice(0, 16));
  await page.getByLabel(copy.confirm, { exact: true }).check();
  await page.getByRole("button", { name: copy.submit, exact: true }).click();
  await expect(page.getByRole("heading", { name: work.changeSaved, exact: true })).toBeVisible();
  // This body was rendered: the successful reference may now be acknowledged by the client.
  await expect
    .poll(async () =>
      (await context.cookies()).find((cookie) => cookie.name.endsWith(`_${fixture.id}_contact`)),
    )
    .toBeUndefined();
  await expect(page).toHaveURL(
    (address) => address.pathname === `/en/inquiries/${fixture.id}/operations`,
  );
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  await openRecord(page, work.openRecord);
  await expect(page.getByLabel(work.reason, { exact: true })).toHaveValue(reason);
  await expect(page.getByLabel(copy.note, { exact: true })).toHaveValue("");
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
});

test("O03 native pre-ledger validation retains the note and corrects with the same reference", async ({
  browser,
}) => {
  const fixture = seed(),
    copy = contactCopy("en");
  const before = await contactEvidence(fixture.id);
  const context = await browser.newContext({ javaScriptEnabled: false });
  await signIn(context, fixture.token);
  const page = await context.newPage();
  const note = `Synthetic native validation draft ${randomUUID()}`;
  try {
    await page.goto(hostUrl("staff", `/en/inquiries/${fixture.id}`));
    await page
      .getByLabel(copy.contactedAt, { exact: true })
      .fill(new Date(Date.now() - 60_000).toISOString().slice(0, 16));
    await page.getByLabel(copy.note, { exact: true }).fill(note);
    await page.getByLabel(copy.nextAction, { exact: true }).fill("   x   ");
    await page
      .getByLabel(copy.dueAt, { exact: true })
      .fill(new Date(Date.now() + 7_200_000).toISOString().slice(0, 16));
    await page.getByLabel(copy.confirm, { exact: true }).check();
    const key = await page
      .locator('[data-inquiry-contact] input[name="_operationId"]')
      .inputValue();
    await page.getByRole("button", { name: copy.submit, exact: true }).click();
    await expect(page.getByLabel(copy.note, { exact: true })).toHaveValue(note);
    await expect(page.getByLabel(copy.nextAction, { exact: true })).toHaveValue("   x   ");
    await expect(page.getByLabel(copy.nextAction, { exact: true })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(page.locator('[data-inquiry-contact] input[name="_operationId"]')).toHaveValue(
      key,
    );
    await expect(page.getByLabel(copy.confirm, { exact: true })).not.toBeChecked();
    expect(await contactEvidence(fixture.id)).toEqual(before);
    await page
      .getByLabel(copy.nextAction, { exact: true })
      .fill("Review the corrected native contact");
    await page.getByLabel(copy.confirm, { exact: true }).check();
    await page.getByRole("button", { name: copy.submit, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: workCopy("en").changeSaved, exact: true }),
    ).toBeVisible();
    const after = await contactEvidence(fixture.id);
    expect(after.receipts).toEqual([{ key, status: "succeeded" }]);
    expect(after.observations).toBe(before.observations + 1);
    expect(after.tasks).toBe(before.tasks + 1);
  } finally {
    await context.close();
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
    await expect(page.getByText(work.statusSucceeded, { exact: true })).toBeVisible();
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
        await openRecord(page, work.openRecord);
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
        await openRecord(page, work.openRecord);
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
      await openRecord(page, work.openRecord);
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
      await openRecord(page, work.openRecord);
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
