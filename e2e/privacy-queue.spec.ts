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
    await form.getByLabel("Next state", { exact: true }).selectOption("verifying");
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
    await form.getByLabel("Next state", { exact: true }).selectOption("verifying");
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
      page.getByText("This record changed. Refresh and review the current version.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(target).toBeVisible();
    await form.getByLabel("Next state", { exact: true }).selectOption("verifying");
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
  ) as { token: string; targetId: string };
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
  const form = page
    .locator("form")
    .filter({ has: page.locator(`input[name="id"][value="${id}"]`) });
  for (let pages = 0; (await form.count()) === 0 && pages < 10; pages++)
    await page.getByRole("link", { name: "Next requests", exact: true }).click();
  await expect(form).toHaveCount(1);
  const version = await form.locator('input[name="expectedVersion"]').inputValue();
  const operation = await form.locator('input[name="operationId"]').inputValue();
  const [before] = await db
    .select()
    .from(schema.privacyRequests)
    .where(eq(schema.privacyRequests.id, id));
  await form.getByLabel("Next state", { exact: true }).selectOption("verifying");
  await form.getByRole("checkbox", { name: /I reviewed the policy/ }).check();
  // Another operator advances the record; this tab refreshes its server render when visible.
  await db
    .update(schema.privacyRequests)
    .set({ version: Number(version) + 1 })
    .where(eq(schema.privacyRequests.id, id));
  // The guard conceals the page synchronously and reveals it after a new authorized render.
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const record = form.getByRole("button", { name: "Record human review", exact: true });
  await expect(record).toBeVisible({ timeout: 30_000 });
  await expect(form.locator('input[name="expectedVersion"]')).toHaveValue(version);
  await expect(form.locator('input[name="operationId"]')).toHaveValue(operation);
  await expect(form.getByLabel("Next state", { exact: true })).toHaveValue("verifying");
  await record.click();
  await expect(
    page.getByText("This record changed. Refresh and review the current version.", {
      exact: true,
    }),
  ).toBeVisible();
  const [after] = await db
    .select()
    .from(schema.privacyRequests)
    .where(eq(schema.privacyRequests.id, id));
  expect(after).toMatchObject({ state: before?.state, version: Number(version) + 1 });
});
