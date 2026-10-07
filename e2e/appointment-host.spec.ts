import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostHandoverCopy } from "../src/features/appointments/host-copy";
import { caseCopy } from "../src/features/cases/copy";
import { findCoverageRecord } from "./coverage-helpers";
import { hostUrl, origins } from "./hosts";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("Disposable database required");
const connection = postgres(databaseUrl, { max: 2 }),
  db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());
function seed() {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "src/server/appointments/host-browser-seed.ts",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          AUTH_SECRET: process.env.E2E_AUTH_SECRET,
          DATABASE_URL: databaseUrl,
        },
      },
    ),
  ) as {
    token: string;
    receiverId: string;
    ownerId: string;
    id: string;
    caseId: string;
    propertyId: string;
  };
}
for (const javaScriptEnabled of [true, false])
  test(`UX18 receiving host accepts the preserved viewing, JavaScript ${javaScriptEnabled}`, async ({
    browser,
  }, testInfo) => {
    const f = seed(),
      context = await browser.newContext({
        ...testInfo.project.use,
        javaScriptEnabled,
        viewport: { width: 320, height: 844 },
      });
    const current = async () =>
      (await db.select().from(schema.appointments).where(eq(schema.appointments.id, f.id)))[0];
    const before = await current(),
      resources = await db
        .select()
        .from(schema.appointmentResources)
        .where(eq(schema.appointmentResources.appointmentId, f.id));
    try {
      await context.addCookies([
        {
          name: "msr_staff_session",
          value: f.token,
          url: origins.staff,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const page = await context.newPage();
      expect(await findCoverageRecord(page, `/en/calendar/${f.id}`)).toBe(true);
      await page.locator(`a[href="/en/calendar/${f.id}"]`).click();
      for (const locale of ["bg", "ru", "en"]) {
        await page.goto(hostUrl("staff", `/${locale}/calendar/${f.id}`));
        await expect(
          page.getByRole("heading", { name: hostHandoverCopy(locale).title, exact: true }),
        ).toBeVisible();
        await expect(
          page.getByText(hostHandoverCopy(locale).reserved, { exact: false }),
        ).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          320,
        );
      }
      const form = page.locator("form").filter({
        has: page.getByRole("button", { name: hostHandoverCopy("en").submit, exact: true }),
      });
      await form
        .getByLabel(hostHandoverCopy("en").reason, { exact: true })
        .fill("I reviewed the preserved viewing and will personally host it.");
      for (const label of [
        caseCopy("en").access,
        hostHandoverCopy("en").external,
        hostHandoverCopy("en").reviewed,
      ])
        await form.getByRole("checkbox", { name: label, exact: true }).check();
      await page.screenshot({
        path: testInfo.outputPath(`host-review-${javaScriptEnabled}-320.png`),
        fullPage: true,
      });
      await form.getByRole("button", { name: hostHandoverCopy("en").submit, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Change recorded", exact: true }),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Change recorded", exact: true }),
      ).toBeVisible();
      const after = await current();
      expect(after).toMatchObject({
        hostId: f.receiverId,
        version: 2,
        icsSequence: 3,
        icsUid: before?.icsUid,
        confirmedStartsAt: before?.confirmedStartsAt,
        confirmedEndsAt: before?.confirmedEndsAt,
        state: "confirmed",
      });
      const held = await db
        .select()
        .from(schema.appointmentResources)
        .where(eq(schema.appointmentResources.appointmentId, f.id));
      expect(held.find((r) => r.kind === "property_access")).toEqual(
        resources.find((r) => r.kind === "property_access"),
      );
      expect(held.filter((r) => r.kind === "broker" && r.active)).toHaveLength(1);
      expect(held.find((r) => r.kind === "broker" && r.active)?.resourceId).toBe(f.receiverId);
      await page.getByRole("link", { name: "Open current record", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: hostHandoverCopy("en").title, exact: true }),
      ).toHaveCount(0);
      expect(await findCoverageRecord(page, `/en/calendar/${f.id}`)).toBe(false);
    } finally {
      await context.close();
    }
  });
