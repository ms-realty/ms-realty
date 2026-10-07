import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostHandoverCopy } from "../src/features/appointments/host-copy";
import { caseCopy } from "../src/features/cases/copy";
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
          MSR_HOST_SEED_PLANNED: "1",
          AUTH_SECRET: process.env.E2E_AUTH_SECRET,
          DATABASE_URL: url,
        },
      },
    ),
  ) as {
    token: string;
    ownerToken: string;
    receiverId: string;
    ownerId: string;
    id: string;
  };
}
for (const locale of ["bg", "ru", "en"])
  for (const javascript of [true, false])
    test(`F19 planned viewing handover ${locale}, JavaScript ${javascript}`, async ({
      browser,
    }, testInfo) => {
      const f = seed(),
        c = hostHandoverCopy(locale),
        copy = caseCopy(locale);
      const context = await browser.newContext({
        ...testInfo.project.use,
        javaScriptEnabled: javascript,
        viewport: { width: 320, height: 844 },
      });
      const path = hostUrl("staff", `/${locale}/calendar/${f.id}`);
      const current = async () =>
        (await db.select().from(schema.appointments).where(eq(schema.appointments.id, f.id)))[0];
      const resources = async () =>
        db
          .select()
          .from(schema.appointmentResources)
          .where(eq(schema.appointmentResources.appointmentId, f.id));
      const before = await current(),
        held = await resources();
      async function signIn(token: string) {
        await context.clearCookies();
        await context.addCookies([
          {
            name: "msr_staff_session",
            value: token,
            url: origins.staff,
            httpOnly: true,
            sameSite: "Lax",
          },
        ]);
      }
      try {
        const page = await context.newPage();
        await signIn(f.ownerToken);
        await page.goto(path);
        await expect(page.getByRole("heading", { name: c.offerTitle, exact: true })).toBeVisible();
        for (let wave = 0; wave < 2; wave++) {
          const offer = page
            .locator("form")
            .filter({ has: page.getByRole("button", { name: c.offerSubmit, exact: true }) });
          await offer.getByLabel(c.receiver, { exact: true }).selectOption(f.receiverId);
          await offer
            .getByLabel(c.reason, { exact: true })
            .fill("Synthetic reviewed viewing handover to this named colleague");
          await offer.getByLabel(c.offerReviewed, { exact: true }).check();
          if (wave === 0 && javascript) {
            expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual(
              [],
            );
            await page.screenshot({
              path: testInfo.outputPath(`planned-offer-${locale}-320.png`),
              fullPage: true,
            });
          }
          await offer.getByRole("button", { name: c.offerSubmit, exact: true }).click();
          await expect(page.getByRole("heading", { name: copy.saved, exact: true })).toBeVisible();
          await page.reload();
          await expect(page.getByRole("heading", { name: copy.saved, exact: true })).toBeVisible();
          await page.goto(path);
          await expect(page.getByRole("heading", { name: c.pending, exact: true })).toBeVisible();
          expect(await current()).toMatchObject({
            hostId: f.ownerId,
            pendingHostId: f.receiverId,
            icsSequence: before?.icsSequence,
          });
          expect(await resources()).toEqual(held);
          if (wave === 0) {
            const withdraw = page
              .locator("form")
              .filter({ has: page.getByRole("button", { name: c.withdraw, exact: true }) });
            await withdraw
              .getByLabel(c.reason, { exact: true })
              .fill("Withdraw this offer while retaining the original viewing");
            await withdraw.getByLabel(c.withdrawReviewed, { exact: true }).check();
            await withdraw.getByRole("button", { name: c.withdraw, exact: true }).click();
            await expect(
              page.getByRole("heading", { name: copy.saved, exact: true }),
            ).toBeVisible();
            await page.goto(path);
            expect(await current()).toMatchObject({ hostId: f.ownerId, pendingHostId: null });
          }
        }
        await signIn(f.token);
        await page.goto(path);
        await expect(page.getByText(c.plannedLead, { exact: true })).toBeVisible();
        const accept = page
          .locator("form")
          .filter({ has: page.getByRole("button", { name: c.submit, exact: true }) });
        await accept
          .getByLabel(c.reason, { exact: true })
          .fill("I personally accept this reviewed arrangement and its commitments");
        for (const label of [c.reviewed, c.external, copy.access])
          await accept.getByRole("checkbox", { name: label, exact: true }).check();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          320,
        );
        await page.screenshot({
          path: testInfo.outputPath(`planned-accept-${locale}-${javascript}-320.png`),
          fullPage: true,
        });
        await accept.getByRole("button", { name: c.submit, exact: true }).click();
        await expect(page.getByRole("heading", { name: copy.saved, exact: true })).toBeVisible();
        expect(await current()).toMatchObject({
          hostId: f.receiverId,
          pendingHostId: null,
          version: 5,
          icsUid: before?.icsUid,
          icsSequence: (before?.icsSequence ?? 0) + 1,
          confirmedStartsAt: before?.confirmedStartsAt,
          confirmedEndsAt: before?.confirmedEndsAt,
        });
        const after = await resources();
        expect(after.find((r) => r.kind === "property_access")).toEqual(
          held.find((r) => r.kind === "property_access"),
        );
        expect(after.filter((r) => r.kind === "broker" && r.active)).toHaveLength(1);
        expect(after.find((r) => r.kind === "broker" && r.active)?.resourceId).toBe(f.receiverId);
      } finally {
        await context.close();
      }
    });
