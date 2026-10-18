import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostUrl, origins } from "./hosts";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1 }),
  db = drizzle(connection, { schema });
test.afterAll(async () => {
  await connection.end();
});

async function readyPrivatePage(page: import("@playwright/test").Page) {
  await page.waitForLoadState("load");
  await expect(page.locator('[data-private-ready="true"]')).toHaveCount(1, { timeout: 30_000 });
}

async function findReview(page: import("@playwright/test").Page, id: string, limit = 40) {
  const form = page
    .locator("form")
    .filter({ has: page.locator(`input[name="id"][value="${id}"]`) });
  for (let pages = 0; pages < limit; pages++) {
    // A plain link can finish its click at navigation commit. Inspect the new page only
    // after its streamed document and private-page hydration have completed.
    await readyPrivatePage(page);
    if ((await form.count()) !== 0) break;
    const next = page.getByRole("link", { name: "Next requests", exact: true });
    await expect(next).toBeVisible();
    const href = await next.getAttribute("href");
    if (!href) throw new Error("Missing privacy queue continuation");
    await Promise.all([
      page.waitForURL(new URL(href, page.url()).toString(), { waitUntil: "load" }),
      next.click(),
    ]);
  }
  await readyPrivatePage(page);
  await expect(form).toHaveCount(1);
  await expect(
    form.getByRole("button", { name: "Record human review", exact: true }),
  ).toBeEnabled();
  return form;
}

async function expectKeptReview(
  page: import("@playwright/test").Page,
  fixture: { sessionId: string; targetId: string },
  form: import("@playwright/test").Locator,
) {
  const operationId = await form.locator('input[name="operationId"]').inputValue();
  const version = Number(await form.locator('input[name="expectedVersion"]').inputValue());
  await expect
    .poll(() =>
      page.evaluate(({ sessionId, targetId }) => {
        const saved = window.sessionStorage.getItem(`privacy-review:${sessionId}:${targetId}`);
        return saved ? JSON.parse(saved) : null;
      }, fixture),
    )
    .toMatchObject({ operationId, version, values: expect.arrayContaining([["to", "verifying"]]) });
}

async function restorePrivateTab(page: import("@playwright/test").Page) {
  await expect(page.locator('[data-private-ready="true"]')).toHaveCount(1);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("[data-private-content]")).toBeHidden();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

// A real software-authenticator assertion exercises production verification and session
// rotation on every browser engine. The browser ceremony prompt itself is outside this test.
function passkeyHandoff(mode: "prepare" | "complete", token: string, prepared?: unknown) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        `
      import { readFileSync } from "node:fs";
      import postgres from "postgres";
      import { drizzle } from "drizzle-orm/postgres-js";
      import * as schema from "./src/db/schema/index.ts";
      import { readSession } from "./src/server/auth/sessions.ts";
      import { startPasskeyRegistration, finishPasskeyRegistration, startPasskeyAuthentication,
        finishPasskeyAuthentication } from "./src/server/auth/passkeys.ts";
      import { SoftAuthenticator } from "./src/server/auth/testing-authenticator.ts";
      const input = JSON.parse(readFileSync(0, "utf8"));
      const connection = postgres(process.env.E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
      const db = drizzle(connection, { schema });
      try {
        const session = await readSession(db, input.token);
        if (!session) throw new Error("Expected live synthetic session");
        if (input.mode === "prepare") {
          const key = new SoftAuthenticator("staff");
          const registration = await startPasskeyRegistration(db, session);
          await finishPasskeyRegistration(db, session, key.register(registration.challenge), {
            expectedChallenge: registration.challenge, label: "Synthetic recovery key" });
          const options = await startPasskeyAuthentication(db, "staff", { clientIp: "192.0.2.233" });
          console.log(JSON.stringify({ challenge: options.challenge, response: key.authenticate(options.challenge) }));
        } else {
          const issued = await finishPasskeyAuthentication(db, "staff", input.prepared.response, {
            expectedChallenge: input.prepared.challenge, currentSessionToken: input.token, reauthenticate: session });
          console.log(JSON.stringify({ token: issued.token, sessionId: issued.session.id }));
        }
      } finally { await connection.end(); }
    `,
      ],
      {
        env: {
          ...process.env,
          AUTH_SECRET: process.env.E2E_AUTH_SECRET,
          DATABASE_URL: url,
          APP_ORIGIN: origins.public,
          PUBLIC_ORIGIN: origins.public,
          CLIENT_ORIGIN: origins.client,
          STAFF_ORIGIN: origins.staff,
        },
        input: JSON.stringify({ mode, token, prepared }),
        encoding: "utf8",
        timeout: 30_000,
      },
    ),
  );
}

test("privacy queue reaches and reviews an unresolved request beyond 100 without JavaScript", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const fixture = JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "src/server/privacy/queue-browser-seed.ts"],
      {
        env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
        encoding: "utf8",
      },
    ),
  ) as {
    token: string;
    sessionId: string;
    ids: string[];
    targetId: string;
    targetReference: string;
    ownerName: string;
  };
  const context = await browser.newContext({ ...testInfo.project.use, javaScriptEnabled: false });
  try {
    await context.addCookies([
      {
        name: "msr_staff_session",
        value: fixture.token,
        url: origins.staff,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const page = await context.newPage();
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(hostUrl("staff", "/en/operations/privacy"));
    const assertNativeGeometry = async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        320,
      );
      const controls = page.locator(
        'nav[aria-label="Privacy request pages"] a, form button, form select, form textarea, form input:not([type="hidden"]):not([type="checkbox"])',
      );
      // Only rendered controls: the shell keeps a hidden sign-out variant per breakpoint.
      const heights = await controls.evaluateAll((elements) =>
        elements
          .filter((element) => element.getClientRects().length > 0)
          .map((element) => element.getBoundingClientRect().height),
      );
      expect(heights.length).toBeGreaterThan(0);
      expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
    };
    // The long eligible owner must be a rendered option before the 320 px geometry means anything.
    await expect(
      page.locator('select[name="responsibleId"] option', { hasText: fixture.ownerName }).first(),
    ).toBeAttached();
    await assertNativeGeometry();
    const target = page
      .getByRole("heading", { level: 2 })
      .filter({ hasText: fixture.targetReference });
    await expect(target).toHaveCount(0);
    const reached = new Set<string>();
    const rememberRequests = async () => {
      for (const id of await page
        .locator('form input[name="id"]')
        .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)))
        if (fixture.ids.includes(id)) reached.add(id);
    };
    await rememberRequests();
    let pages = 1;
    while ((await target.count()) === 0) {
      expect(pages).toBeLessThan(20);
      const next = page.getByRole("link", { name: "Next requests", exact: true });
      await expect(next).toBeVisible();
      await next.click();
      await expect(page).toHaveURL(/\/en\/operations\/privacy\?after=/);
      pages++;
      await rememberRequests();
    }
    expect(pages).toBeGreaterThanOrEqual(5);
    await expect(target).toBeVisible();
    expect([...reached].sort()).toEqual([...fixture.ids].sort());
    await assertNativeGeometry();
    const targetPageUrl = page.url();
    await page.getByRole("link", { name: "Previous requests", exact: true }).click();
    await expect(page).toHaveURL(/\?before=/);
    await expect(target).toHaveCount(0);
    await page.getByRole("link", { name: "Next requests", exact: true }).click();
    await expect(target).toBeVisible();
    await page.goBack();
    await expect(target).toHaveCount(0);
    await page.goto(targetPageUrl);
    const position = new URL(targetPageUrl).pathname + new URL(targetPageUrl).search;
    await db
      .update(schema.sessions)
      .set({ reverifiedAt: new Date(Date.now() - 3600_000) })
      .where(eq(schema.sessions.id, fixture.sessionId));
    await page.goto(targetPageUrl);
    await expect(page).toHaveURL(
      (current) =>
        current.pathname === "/en/access/reauth" &&
        current.searchParams.get("returnTo") === position,
    );
    // Only the disposable fixture restores freshness; this does not claim a passkey ceremony.
    await db
      .update(schema.sessions)
      .set({ reverifiedAt: new Date() })
      .where(eq(schema.sessions.id, fixture.sessionId));
    await page.goto(targetPageUrl);
    const form = page
      .locator("form")
      .filter({ has: page.locator(`input[name="id"][value="${fixture.targetId}"]`) });
    await form.getByLabel("Where the request goes next", { exact: true }).selectOption("verifying");
    await form
      .getByRole("checkbox", {
        name: "I reviewed the policy, scope, owner, due condition and evidence for this transition.",
        exact: true,
      })
      .check();
    await db
      .update(schema.sessions)
      .set({ reverifiedAt: new Date(Date.now() - 3600_000) })
      .where(eq(schema.sessions.id, fixture.sessionId));
    await form.getByRole("button", { name: "Record human review", exact: true }).click();
    await expect(page).toHaveURL(
      (current) =>
        current.pathname === "/en/access/reauth" &&
        current.searchParams.get("returnTo") === position,
    );
    const [unchanged] = await db
      .select()
      .from(schema.privacyRequests)
      .where(eq(schema.privacyRequests.id, fixture.targetId));
    expect(unchanged).toMatchObject({ state: "received", version: 1 });
    await db
      .update(schema.sessions)
      .set({ reverifiedAt: new Date() })
      .where(eq(schema.sessions.id, fixture.sessionId));
    await page.goto(targetPageUrl);
    await form.getByLabel("Where the request goes next", { exact: true }).selectOption("verifying");
    await form.getByRole("checkbox", { name: /I reviewed the policy/ }).check();
    await db
      .update(schema.privacyRequests)
      .set({ version: 2 })
      .where(eq(schema.privacyRequests.id, fixture.targetId));
    await form.getByRole("button", { name: "Record human review", exact: true }).click();
    await expect(page).toHaveURL(
      (current) =>
        current.pathname === "/en/operations/privacy" &&
        current.searchParams.get("after") === new URL(targetPageUrl).searchParams.get("after") &&
        current.searchParams.get("error") === "REVISION_CONFLICT",
    );
    await expect(
      page.getByText(
        "Someone changed this in the meantime. Refresh and review the current version.",
        {
          exact: true,
        },
      ),
    ).toBeVisible();
    await expect(target).toBeVisible();
    await form.getByLabel("Where the request goes next", { exact: true }).selectOption("verifying");
    await form.getByRole("checkbox", { name: /I reviewed the policy/ }).check();
    await assertNativeGeometry();
    // The whole queue page can exceed WebKit's 32767 px screenshot limit; keep the reviewed form.
    await form.screenshot({
      path: testInfo.outputPath("privacy-queue-older-unresolved-native.png"),
    });
    await form.getByRole("button", { name: "Record human review", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/operations\/privacy\?receipt=/);
    await expect(page.getByText("Change recorded", { exact: false })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("after")).toBe(
      new URL(targetPageUrl).searchParams.get("after"),
    );
    const [saved] = await db
      .select()
      .from(schema.privacyRequests)
      .where(eq(schema.privacyRequests.id, fixture.targetId));
    expect(saved).toMatchObject({ state: "verifying", version: 3 });
    await page.getByRole("link", { name: "Latest requests", exact: true }).click();
    await expect(page).toHaveURL(
      (current) => current.pathname === "/en/operations/privacy" && !current.search,
    );
    // The queue is ordered by creation, so a reviewed request keeps its page.
    await expect(target).toHaveCount(0);
    await page.goto(targetPageUrl);
    await expect(target).toBeVisible();
    await assertNativeGeometry();
  } finally {
    await context.close();
    await db.delete(schema.privacyRequests).where(inArray(schema.privacyRequests.id, fixture.ids));
  }
});

test("C-11: a dirty privacy review keeps its reviewed version through a page refresh", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const fixture = JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "src/server/privacy/queue-browser-seed.ts"],
      {
        env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
        encoding: "utf8",
      },
    ),
  ) as { token: string; sessionId: string; targetId: string };
  await page.context().addCookies([
    {
      name: "msr_staff_session",
      value: fixture.token,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto(hostUrl("staff", "/en/operations/privacy"));
  // This run's own older record, on a cursor page that newer records from other projects (they
  // share the database) cannot shift.
  const id = fixture.targetId;
  const form = await findReview(page, id, 10);
  const version = await form.locator('input[name="expectedVersion"]').inputValue();
  const operation = await form.locator('input[name="operationId"]').inputValue();
  const [before] = await db
    .select()
    .from(schema.privacyRequests)
    .where(eq(schema.privacyRequests.id, id));
  await form.getByLabel("Where the request goes next", { exact: true }).selectOption("verifying");
  await form.getByRole("checkbox", { name: /I reviewed the policy/ }).check();
  await expectKeptReview(page, fixture, form);
  // Another operator advances the record; this tab refreshes its server render when visible.
  await db
    .update(schema.privacyRequests)
    .set({ version: Number(version) + 1 })
    .where(eq(schema.privacyRequests.id, id));
  // The guard conceals the page synchronously and reveals it after a new authorized render.
  await restorePrivateTab(page);
  const record = form.getByRole("button", { name: "Record human review", exact: true });
  await expect(record).toBeVisible({ timeout: 30_000 });
  await expect(form.locator('input[name="expectedVersion"]')).toHaveValue(version);
  await expect(form.locator('input[name="operationId"]')).toHaveValue(operation);
  await expect(form.getByLabel("Where the request goes next", { exact: true })).toHaveValue(
    "verifying",
  );
  await record.click();
  await expect(
    page.getByText(
      "Someone changed this in the meantime. Refresh and review the current version.",
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  const [after] = await db
    .select()
    .from(schema.privacyRequests)
    .where(eq(schema.privacyRequests.id, id));
  expect(after).toMatchObject({ state: before?.state, version: Number(version) + 1 });
  // The unsent review comes back with a notice, on the current version, without its
  // confirmation: a person confirms again before it records once.
  await expect(
    form.getByText("Your unsent review is restored below", { exact: false }),
  ).toBeVisible();
  await expect(form.getByLabel("Where the request goes next", { exact: true })).toHaveValue(
    "verifying",
  );
  await expect(form.getByRole("checkbox", { name: /I reviewed the policy/ })).not.toBeChecked();
  await form.getByRole("checkbox", { name: /I reviewed the policy/ }).check();
  await expect(form.locator('input[name="expectedVersion"]')).toHaveValue(
    String(Number(version) + 1),
  );
  await form.getByRole("button", { name: "Record human review", exact: true }).click();
  await expect(page.getByText("Change recorded", { exact: false })).toBeVisible();
  const [saved] = await db
    .select()
    .from(schema.privacyRequests)
    .where(eq(schema.privacyRequests.id, id));
  expect(saved).toMatchObject({ state: "verifying", version: Number(version) + 2 });
  await expect(
    form.getByText("Your unsent review is restored below", { exact: false }),
  ).toHaveCount(0);
});

test("C-11: another staff member never inherits a dirty review or its operation", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const seedQueue = () =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "src/server/privacy/queue-browser-seed.ts",
        ],
        {
          env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
          encoding: "utf8",
        },
      ),
    ) as { token: string; sessionId: string; targetId: string };
  // B first, so A's records are the newer ones on A's pages.
  const b = seedQueue(),
    a = seedQueue();
  const signIn = (token: string) =>
    page.context().addCookies([
      {
        name: "msr_staff_session",
        value: token,
        url: origins.staff,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  await signIn(a.token);
  await page.goto(hostUrl("staff", "/en/operations/privacy"));
  const form = await findReview(page, a.targetId);
  const operation = await form.locator('input[name="operationId"]').inputValue();
  await form.getByLabel("Where the request goes next", { exact: true }).selectOption("verifying");
  await form.getByRole("checkbox", { name: /I reviewed the policy/ }).check();
  await expectKeptReview(page, a, form);
  // Staff member B takes over this tab; the refreshed page belongs to B alone.
  await signIn(b.token);
  await restorePrivateTab(page);
  await expect(page.getByRole("heading", { level: 1, name: "Privacy review" })).toBeVisible({
    timeout: 30_000,
  });
  // B may review the same record: it is a fresh form with B's own operation.
  await expect(form).toHaveCount(1);
  await expect(form.locator('input[name="operationId"]')).not.toHaveValue(operation);
  await expect(form.getByRole("checkbox", { name: /I reviewed the policy/ })).not.toBeChecked();
  await expect(
    form.getByText("Your unsent review is restored below", { exact: false }),
  ).toHaveCount(0);
});

async function ownReview(page: import("@playwright/test").Page) {
  const fixture = JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "src/server/privacy/queue-browser-seed.ts"],
      {
        env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
        encoding: "utf8",
      },
    ),
  ) as { token: string; sessionId: string; targetId: string };
  await page.context().addCookies([
    {
      name: "msr_staff_session",
      value: fixture.token,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto(hostUrl("staff", "/en/operations/privacy"));
  const form = await findReview(page, fixture.targetId);
  return { fixture, form, position: page.url() };
}
const restoredText = "Your unsent review is restored below";

test("C-11: a recorded review whose answer was lost is cleared, not restored", async ({ page }) => {
  test.setTimeout(120_000);
  const { fixture, form, position } = await ownReview(page);
  await form.getByLabel("Where the request goes next", { exact: true }).selectOption("verifying");
  await form.getByRole("checkbox", { name: /I reviewed the policy/ }).check();
  await expectKeptReview(page, fixture, form);
  // The server records the review; the browser never sees the answer.
  await page.route("**/operations/privacy/submit**", async (route) => {
    await route.fetch();
    await route.abort();
  });
  await form.getByRole("button", { name: "Record human review", exact: true }).click();
  await expect
    .poll(async () => {
      const [row] = await db
        .select()
        .from(schema.privacyRequests)
        .where(eq(schema.privacyRequests.id, fixture.targetId));
      return row?.state;
    })
    .toBe("verifying");
  await page.unrouteAll({ behavior: "ignoreErrors" });
  const [session] = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.id, fixture.sessionId));
  if (!session) throw new Error("Missing synthetic session");
  // The exact saved success remains recoverable even after more than 50 newer reviews.
  await db.insert(schema.operations).values(
    Array.from({ length: 55 }, () => ({
      actorKind: "staff" as const,
      actorId: session.principalId,
      operationType: "privacy.review",
      idempotencyKey: crypto.randomUUID(),
      requestHash: "synthetic later receipt",
      status: "succeeded" as const,
      resultType: "privacy_request",
      resultId: fixture.targetId,
      expectedRevision: 1,
      outcome: { id: fixture.targetId },
    })),
  );
  await page.goto(position);
  await expect(form).toHaveCount(1);
  await expect(form.getByText(restoredText, { exact: false })).toHaveCount(0);
  await expect(form.getByText("The action was recorded.", { exact: true })).toBeVisible();
  await expect(
    form.getByRole("button", { name: "Record human review", exact: true }),
  ).toBeDisabled();
});

test("C-11: pending and unknown saved keys remain fenced until exact reconciliation permits fresh review", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { fixture, form, position } = await ownReview(page);
  await form.getByLabel("Where the request goes next", { exact: true }).selectOption("verifying");
  await form.getByRole("checkbox", { name: /I reviewed the policy/ }).check();
  await expectKeptReview(page, fixture, form);
  const operationId = await form.locator('input[name="operationId"]').inputValue();
  const version = Number(await form.locator('input[name="expectedVersion"]').inputValue());
  const [session] = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.id, fixture.sessionId));
  if (!session) throw new Error("Missing synthetic session");
  const [receipt] = await db
    .insert(schema.operations)
    .values({
      actorKind: "staff",
      actorId: session.principalId,
      operationType: "privacy.review",
      idempotencyKey: operationId,
      requestHash: "synthetic unresolved receipt",
      status: "in_progress",
      resultType: "privacy_request",
      resultId: fixture.targetId,
      expectedRevision: version,
    })
    .returning();
  if (!receipt) throw new Error("Missing synthetic receipt");
  for (const status of ["in_progress", "outcome_unknown"] as const) {
    await db.update(schema.operations).set({ status }).where(eq(schema.operations.id, receipt.id));
    await page.goto(position);
    await expect(
      form.getByRole("button", { name: "Check this action again", exact: true }),
    ).toBeEnabled();
    await expect(
      form.getByRole("button", { name: "Record human review", exact: true }),
    ).toBeDisabled();
    const saved = await page.evaluate(
      ({ sessionId, targetId }) =>
        JSON.parse(
          window.sessionStorage.getItem(`privacy-review:${sessionId}:${targetId}`) ?? "null",
        ),
      fixture,
    );
    expect(saved).toMatchObject({ operationId, version });
    const [request] = await db
      .select()
      .from(schema.privacyRequests)
      .where(eq(schema.privacyRequests.id, fixture.targetId));
    expect(request).toMatchObject({ state: "received", version });
  }
  await db
    .update(schema.operations)
    .set({ status: "failed", outcome: { code: "validation_failed" } })
    .where(eq(schema.operations.id, receipt.id));
  await form.getByRole("button", { name: "Check this action again", exact: true }).click();
  await expect(form.getByText(restoredText, { exact: false })).toBeVisible();
  await expect(
    form.getByRole("button", { name: "Record human review", exact: true }),
  ).toBeEnabled();
  await expect(form.getByRole("checkbox", { name: /I reviewed the policy/ })).not.toBeChecked();
});

test("C-11: an unrelated receipt in the address does not clear an unsent review", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { fixture, form, position } = await ownReview(page);
  await form.getByLabel("Where the request goes next", { exact: true }).selectOption("verifying");
  const policy = "Synthetic unsent policy reference for this browser test";
  await form.getByLabel("Approved policy reference", { exact: true }).fill(policy);
  await expectKeptReview(page, fixture, form);
  const withReceipt = new URL(position);
  withReceipt.searchParams.set("receipt", crypto.randomUUID());
  await page.goto(withReceipt.toString());
  await expect(form.getByText(restoredText, { exact: false })).toBeVisible();
  await expect(form.getByLabel("Where the request goes next", { exact: true })).toHaveValue(
    "verifying",
  );
  await expect(form.getByLabel("Approved policy reference", { exact: true })).toHaveValue(policy);
});

test("C-11: a verified same-principal session rotation keeps the unsent review without confirmation", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { fixture, form, position } = await ownReview(page);
  await form.getByLabel("Where the request goes next", { exact: true }).selectOption("verifying");
  await form.getByRole("checkbox", { name: /I reviewed the policy/ }).check();
  await expectKeptReview(page, fixture, form);
  const prepared = passkeyHandoff("prepare", fixture.token);
  await db
    .update(schema.sessions)
    .set({ reverifiedAt: new Date(Date.now() - 3600_000) })
    .where(eq(schema.sessions.id, fixture.sessionId));
  await restorePrivateTab(page);
  await expect(page).toHaveURL((current) => current.pathname === "/en/access/reauth", {
    timeout: 30_000,
  });
  const successor = passkeyHandoff("complete", fixture.token, prepared) as {
    token: string;
    sessionId: string;
  };
  expect(successor.sessionId).not.toBe(fixture.sessionId);
  const [old] = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.id, fixture.sessionId));
  const [next] = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.id, successor.sessionId));
  expect(old?.revokedAt).not.toBeNull();
  expect(next?.principalId).toBe(old?.principalId);
  expect(next?.expiresAt).toEqual(old?.expiresAt);
  await page.context().addCookies([
    {
      name: "msr_staff_session",
      value: successor.token,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto(position);
  await expect(form.getByText(restoredText, { exact: false })).toBeVisible();
  await expect(form.getByLabel("Where the request goes next", { exact: true })).toHaveValue(
    "verifying",
  );
  await expect(form.getByRole("checkbox", { name: /I reviewed the policy/ })).not.toBeChecked();
});

test("C-11: a browser that cannot keep the review says so before work is at risk", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    Object.defineProperty(window, "sessionStorage", {
      get() {
        throw new Error("Storage is blocked");
      },
    });
  });
  const { form } = await ownReview(page);
  await expect(
    form.getByText("This browser cannot keep an unsent review if the page reloads.", {
      exact: false,
    }),
  ).toBeVisible();
});
