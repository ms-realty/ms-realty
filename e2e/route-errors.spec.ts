// UI01 M-004: a real server failure inside each host's route group renders the localized error
// boundary in the host's shell, with a support reference and no internal detail, and "Try again"
// recovers once the failure is gone. Like e2e/today-unavailable.spec.ts, the failure is a
// renamed table on real PostgreSQL, which would break pages loaded in parallel. Run it alone:
//   E2E_ROUTE_ERRORS=1 npx playwright test e2e/route-errors.spec.ts --workers=1 --project chromium-desktop
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { type BrowserContext, expect, type Page, type TestInfo, test } from "@playwright/test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { createClient, createStaff } from "../src/server/testing";
import { hostUrl, origins } from "./hosts";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("Route error cases require the disposable browser database");
const connection = postgres(databaseUrl, { max: 2, onnotice: () => {} });
const db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());

function isolated(info: TestInfo) {
  test.skip(
    process.env.E2E_ROUTE_ERRORS !== "1" ||
      info.config.workers !== 1 ||
      info.project.name !== "chromium-desktop",
    "Renames a shared table: use the isolated single-worker run after the parallel suite.",
  );
}

async function session(context: BrowserContext, kind: "staff" | "client", principalId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.sessions).values({
    principalKind: kind,
    principalId,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(Date.now() + 3600000),
    lastSeenAt: new Date(),
    reverifiedAt: new Date(),
  });
  await context.addCookies([
    {
      name: `msr_${kind}_session`,
      value: token,
      url: origins[kind],
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

/** Loads `path` while `table` is renamed, then puts the table back. */
async function failingLoad(page: Page, table: string, path: string) {
  const renamed = `${table}_m004_unavailable`;
  await connection.unsafe(`alter table ${table} rename to ${renamed}`);
  try {
    return await page.goto(path);
  } finally {
    await connection.unsafe(`alter table ${renamed} rename to ${table}`);
  }
}

async function expectRecovery(page: Page, heading: string, retry: string, reference: string) {
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  await expect(main.getByRole("heading", { level: 1, name: heading })).toBeFocused();
  // The support reference is Next's numeric digest, the same one the server log prints.
  await expect(main.getByText(new RegExp(`^${reference}: [0-9]+$`))).toBeVisible();
  await expect(main.getByRole("button", { name: retry })).toBeVisible();
  // Never the framework's page, a stack trace or the database's words.
  await expect(page.getByText(/This page couldn.t load|Application error/)).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/m004_unavailable|relation|at async/);
}

test("M-004 staff: a failed Inventory read keeps the workspace shell and recovers", async ({
  page,
  context,
}, info) => {
  isolated(info);
  const staff = await createStaff(db, { roles: ["manager"] });
  await db.insert(schema.passkeys).values(
    [0, 1].map(() => ({
      principalId: staff.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  await session(context, "staff", staff.id);
  const response = await failingLoad(page, "listings", hostUrl("staff", "/en/inventory"));
  expect(response?.status()).toBe(500);
  await expectRecovery(page, "This page could not be shown", "Try again", "Reference");
  await expect(page.getByRole("navigation", { name: "Workspace" }).first()).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Back to Today" })).toHaveAttribute(
    "href",
    "/en/today",
  );
  await expect(page.getByRole("main").locator('a[href^="tel:"]')).toHaveCount(0);
  await expect(page.getByRole("main")).toContainText("give the reference to your manager");
  await page.screenshot({ path: info.outputPath("error-staff-en.png"), fullPage: true });
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Listings" })).toBeVisible();
});

test("M-004 client: a failed deal list keeps the journey shell and recovers", async ({
  page,
  context,
}, info) => {
  isolated(info);
  const client = await createClient(db);
  await session(context, "client", client.id);
  const response = await failingLoad(page, "cases", hostUrl("client", "/bg/overview"));
  expect(response?.status()).toBe(500);
  await expectRecovery(
    page,
    "Страницата не може да бъде показана",
    "Опитайте отново",
    "Референция",
  );
  await expect(page.getByRole("navigation", { name: "Моят път" }).first()).toBeVisible();
  await expect(page.getByRole("main").locator('a[href="tel:+359879696870"]')).toBeVisible();
  await page.screenshot({ path: info.outputPath("error-client-bg.png"), fullPage: true });
  await page.getByRole("button", { name: "Опитайте отново" }).click();
  await expect(page.getByRole("main").getByText("Страницата не може да бъде показана")).toHaveCount(
    0,
  );
});

test("M-004 public: a failed shared-list read keeps the site shell, in Hebrew right to left", async ({
  page,
}, info) => {
  isolated(info);
  const token = randomBytes(32).toString("base64url");
  const response = await failingLoad(
    page,
    "public_shares",
    hostUrl("public", `/he/share/${token}`),
  );
  expect(response?.status()).toBe(500);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expectRecovery(page, "לא ניתן להציג את הדף", "לנסות שוב", "מספר אסמכתה");
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "חיפוש נכסים" })).toHaveAttribute(
    "href",
    "/he/properties",
  );
  await page.screenshot({ path: info.outputPath("error-public-he.png"), fullPage: true });
  await page.getByRole("button", { name: "לנסות שוב" }).click();
  await expect(page.getByRole("main").getByText("לא ניתן להציג את הדף")).toHaveCount(0);
});

test("M-004 staff layout: a failed workspace layout still answers in a page of its own", async ({
  page,
  context,
}, info) => {
  isolated(info);
  const staff = await createStaff(db);
  await db.insert(schema.passkeys).values(
    [0, 1].map(() => ({
      principalId: staff.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  await session(context, "staff", staff.id);
  // The workspace layout reads the person's grants for its navigation, before any page.
  const response = await failingLoad(page, "grants", hostUrl("staff", "/ru/today"));
  expect(response?.status()).toBe(500);
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.locator("main#main")).toBeVisible();
  await expectRecovery(page, "Не удалось показать страницу", "Повторить", "Номер обращения");
});
