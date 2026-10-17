import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostHandoverCopy } from "../src/features/appointments/host-copy";
import { caseCopy } from "../src/features/cases/copy";
import { hostUrl, origins } from "./hosts";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("Disposable database required");
const connection = postgres(databaseUrl, { max: 2 }),
  db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());
for (const javaScriptEnabled of [true, false])
  test(`UX18 conflict requires renewed review before receiving the host role, JavaScript ${javaScriptEnabled}`, async ({
    browser,
  }, testInfo) => {
    const f = JSON.parse(
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
    const [before] = await db
      .select()
      .from(schema.appointments)
      .where(eq(schema.appointments.id, f.id));
    const [original] = await db
      .select()
      .from(schema.appointmentResources)
      .where(
        and(
          eq(schema.appointmentResources.appointmentId, f.id),
          eq(schema.appointmentResources.kind, "broker"),
        ),
      );
    if (!original || !before) throw new Error("Missing appointment fixture");
    const [other] = await db
      .insert(schema.appointments)
      .values({
        reference: randomUUID(),
        icsUid: randomUUID(),
        caseId: f.caseId,
        hostId: f.receiverId,
        format: "in_person",
        timezone: "Europe/Sofia",
      })
      .returning();
    if (!other) throw new Error("Missing busy fixture");
    const [busy] = await db
      .insert(schema.appointmentResources)
      .values({
        appointmentId: other.id,
        kind: "broker",
        resourceId: f.receiverId,
        during: original.during,
      })
      .returning();
    if (!busy) throw new Error("Missing busy resource");
    const context = await browser.newContext({
      ...testInfo.project.use,
      javaScriptEnabled,
      viewport: { width: 320, height: 844 },
    });
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
      await page.goto(hostUrl("staff", `/en/calendar/${f.id}`));
      const form = page.locator("form").filter({
        has: page.getByRole("button", { name: hostHandoverCopy("en").submit, exact: true }),
      });
      const reason = "I reviewed the preserved viewing and will personally host it.";
      await form.getByLabel(hostHandoverCopy("en").reason, { exact: true }).fill(reason);
      const review = async () => {
        for (const label of [
          caseCopy("en").access,
          hostHandoverCopy("en").external,
          hostHandoverCopy("en").reviewed,
        ])
          await form.getByRole("checkbox", { name: label, exact: true }).check();
      };
      await review();
      await form.getByRole("button", { name: hostHandoverCopy("en").submit, exact: true }).click();
      await expect(page.getByText(hostHandoverCopy("en").busy, { exact: true })).toBeVisible();
      await expect(form.getByLabel(hostHandoverCopy("en").reason, { exact: true })).toHaveValue(
        reason,
      );
      for (const check of await form.getByRole("checkbox").all())
        await expect(check).not.toBeChecked();
      expect(
        (await db.select().from(schema.appointments).where(eq(schema.appointments.id, f.id)))[0],
      ).toEqual(before);
      expect(
        (
          await db
            .select()
            .from(schema.appointmentResources)
            .where(eq(schema.appointmentResources.id, original.id))
        )[0],
      ).toEqual(original);
      // A separately recorded cancellation frees the conflicting synthetic booking.
      await db
        .update(schema.appointmentResources)
        .set({ active: false, releasedAt: new Date() })
        .where(eq(schema.appointmentResources.id, busy.id));
      await review();
      await form.getByRole("button", { name: hostHandoverCopy("en").submit, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Change recorded", exact: true }),
      ).toBeVisible();
      expect(
        (await db.select().from(schema.appointments).where(eq(schema.appointments.id, f.id)))[0],
      ).toMatchObject({ hostId: f.receiverId, version: 2 });
    } finally {
      await context.close();
    }
  });
