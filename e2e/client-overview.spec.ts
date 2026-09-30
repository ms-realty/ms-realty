// C03 uses real record-scoped client access in this run's disposable database.
// The fixture is synthetic; it is not evidence of live listing or launch readiness.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { caseCopy } from "../src/features/cases/copy";
import { lifecycleCopy } from "../src/features/cases/lifecycle-copy";
import { createCase, createClient, createStaff, relate } from "../src/server/testing";
import { hostUrl, origins } from "./hosts";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("Client overview requires the generated disposable browser database");
const connection = postgres(databaseUrl, { max: 2 });
const db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());

async function fixture(context: BrowserContext) {
  const data = await db.transaction(async (tx) => {
    const broker = await createStaff(tx, { roles: ["assigned_broker"] });
    const client = await createClient(tx);
    const name = `Broker${randomUUID().replaceAll("-", "")}${"W".repeat(82)}`;
    const [owner] = await tx
      .update(schema.principals)
      .set({ displayName: name })
      .where(eq(schema.principals.id, broker.id))
      .returning({ partyId: schema.principals.partyId });
    if (!owner) throw new Error("Missing synthetic broker");
    const ids = await Promise.all([
      createCase(tx, broker.id),
      createCase(tx, broker.id),
      createCase(tx, broker.id),
    ]);
    const records = await tx
      .select()
      .from(schema.cases)
      .where(inArray(schema.cases.id, ids))
      .orderBy(schema.cases.id);
    const [first, second, excluded] = records;
    if (!first || !second || !excluded) throw new Error("Missing synthetic Cases");
    const title = `Recorded buyer search ${randomUUID().slice(0, 8)}`;
    const summary = "Review the recorded step-free access requirement with your broker.";
    const internal = "Private negotiation limit — never shown to the client";
    const requirement = "Step-free access is essential; confirm access before choosing a property.";
    const dueAt = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 0, 15, 10));
    await tx
      .update(schema.cases)
      .set({ title, clientSummary: summary, nextAction: internal, nextActionDueAt: dueAt })
      .where(eq(schema.cases.id, first.id));
    const participantId = await relate(tx, {
      partyId: client.partyId,
      caseId: first.id,
      role: "buyer",
    });
    const [brief] = await tx
      .insert(schema.briefRevisions)
      .values({
        caseId: first.id,
        revisionNumber: 1,
        authorKind: "staff",
        authorId: broker.id,
        items: [{ kind: "hard_constraint", origin: "broker_interpretation", text: requirement }],
      })
      .returning({ id: schema.briefRevisions.id });
    if (!brief) throw new Error("Missing synthetic requirements revision");
    const token = randomBytes(32).toString("base64url");
    await tx.insert(schema.sessions).values({
      principalKind: "client",
      principalId: client.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 3600000),
      lastSeenAt: new Date(),
      reverifiedAt: new Date(),
    });
    return {
      brokerId: broker.id,
      brokerPartyId: owner.partyId,
      clientId: client.id,
      clientPartyId: client.partyId,
      token,
      name,
      ids,
      first: { ...first, title },
      second,
      excluded,
      participantId,
      briefId: brief.id,
      summary,
      internal,
      requirement,
      dueAt,
    };
  });
  await context.addCookies([
    {
      name: "msr_client_session",
      value: data.token,
      url: origins.client,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  return data;
}

async function cleanup(data: Awaited<ReturnType<typeof fixture>>) {
  await db.transaction(async (tx) => {
    await tx.delete(schema.briefRevisions).where(inArray(schema.briefRevisions.caseId, data.ids));
    await tx
      .delete(schema.caseParticipants)
      .where(inArray(schema.caseParticipants.caseId, data.ids));
    await tx.delete(schema.cases).where(inArray(schema.cases.id, data.ids));
    const principals = [data.clientId, data.brokerId];
    await tx.delete(schema.sessions).where(inArray(schema.sessions.principalId, principals));
    await tx.delete(schema.grants).where(inArray(schema.grants.principalId, principals));
    await tx
      .delete(schema.staffMemberships)
      .where(eq(schema.staffMemberships.principalId, data.brokerId));
    await tx.delete(schema.principals).where(inArray(schema.principals.id, principals));
    await tx
      .delete(schema.parties)
      .where(inArray(schema.parties.id, [data.clientPartyId, data.brokerPartyId]));
  });
}

async function fitsViewport(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
}

for (const javaScriptEnabled of [true, false]) {
  test.describe(`C03 client overview with JavaScript ${javaScriptEnabled}`, () => {
    test.use({ javaScriptEnabled });
    test("one authorized Case opens its recorded next step; native navigation, chooser and isolation survive all widths", async ({
      context,
      page,
    }, info) => {
      // This one journey covers three widths, RTL, all five native destinations and Back.
      test.slow();
      const data = await fixture(context);
      try {
        expect(data.name).toHaveLength(120);
        const overview = hostUrl("client", "/en/overview");
        for (const width of [320, 390, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          expect((await page.goto(overview))?.status()).toBe(200);
          await expect(page.getByRole("heading", { level: 1 })).toHaveText(
            `${data.first.reference} · ${data.first.title}`,
          );
          await expect(
            page.getByRole("heading", { name: data.summary, exact: true }),
          ).toBeVisible();
          await expect(page.getByRole("heading", { name: data.name, exact: true })).toBeVisible();
          await expect(
            page.getByText(
              `${caseCopy("en").buyer} · ${caseCopy("en").needsReview} · ${lifecycleCopy("en").active}`,
              { exact: true },
            ),
          ).toBeVisible();
          await expect(page.getByText(data.internal, { exact: true })).toHaveCount(0);
          await expect(page.getByText(data.second.reference, { exact: false })).toHaveCount(0);
          await expect(page.getByText(data.excluded.reference, { exact: false })).toHaveCount(0);
          await expect(page.locator(`time[datetime="${data.dueAt.toISOString()}"]`)).toBeVisible();
          await expect(
            page
              .getByRole("complementary", { name: caseCopy("en").owned })
              .getByRole("link", { name: caseCopy("en").messages, exact: true }),
          ).toHaveAttribute("href", `/en/messages/${data.first.id}`);
          const review = page.getByRole("link", { name: caseCopy("en").requirements, exact: true });
          await expect(review).toHaveAttribute("href", `/en/overview/${data.first.id}#case-brief`);
          await expect(page.getByRole("main").locator("form")).toHaveCount(0);
          await expect(page.locator("#case-brief")).toHaveCount(0);
          const nextSteps = page.getByRole("region", { name: "Next steps", exact: true });
          await expect(nextSteps.getByRole("link", { name: /Properties/ })).toHaveAttribute(
            "href",
            `/en/properties/${data.first.id}`,
          );
          await fitsViewport(page, width);
          await page.screenshot({
            path: info.outputPath(`client-overview-${width}-${javaScriptEnabled}.png`),
            fullPage: true,
          });
          await review.click();
          await expect(page).toHaveURL(
            hostUrl("client", `/en/overview/${data.first.id}#case-brief`),
          );
          const brief = page.locator("#case-brief");
          await expect(brief).toContainText(data.requirement);
          await expect(brief.locator('input[name="briefId"]')).toHaveValue(data.briefId);
          await expect(
            brief.getByRole("checkbox", { name: lifecycleCopy("en").ackCheck, exact: true }),
          ).not.toBeChecked();
          await expect(
            brief.getByRole("button", { name: lifecycleCopy("en").acknowledge, exact: true }),
          ).toBeVisible();
          await expect(
            page.getByRole("button", { name: caseCopy("en").nextSave, exact: true }),
          ).toHaveCount(0);
          await fitsViewport(page, width);
          await page.screenshot({
            path: info.outputPath(`client-case-requirements-${width}-${javaScriptEnabled}.png`),
            fullPage: true,
          });
          await page.goBack();
          await expect(page).toHaveURL(overview);
          await expect(
            page.getByRole("heading", { name: data.summary, exact: true }),
          ).toBeVisible();
          await expect(page.getByRole("main").locator("form")).toHaveCount(0);
        }

        await page.setViewportSize({ width: 320, height: 900 });
        await page.goto(overview);
        await page.keyboard.press("Tab");
        await expect(
          page.getByRole("link", { name: "Skip to main content", exact: true }),
        ).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("main")).toBeFocused();
        const menu = page.getByRole("button", { name: "Menu", exact: true });
        for (const destination of [
          "overview",
          "properties",
          "appointments",
          "messages",
          "documents",
        ]) {
          await menu.focus();
          await page.keyboard.press("Enter");
          const link = page.locator(`header nav a[href="/en/${destination}"]`);
          await expect(link).toBeVisible();
          expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
          await link.click();
          await expect(page).toHaveURL(hostUrl("client", `/en/${destination}`));
          await expect(page.getByRole("main")).toBeVisible();
          await expect(page.getByText(data.excluded.reference, { exact: false })).toHaveCount(0);
          if (destination === "overview") await page.goto(overview);
          else {
            await page.goBack();
            await expect(page).toHaveURL(/\/en\/overview(?:#main)?$/);
            await expect(
              page.getByRole("heading", { name: data.summary, exact: true }),
            ).toBeVisible();
            // Native history may restore an open details; explicitly close it through its control.
            if (await menu.evaluate((element) => element.closest("details")?.open))
              await menu.click();
          }
        }
        if (javaScriptEnabled) {
          await menu.focus();
          await page.keyboard.press("Enter");
          await expect(page.locator('header nav a[href="/en/overview"]')).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(menu).toBeFocused();
          await expect(page.locator('header nav a[href="/en/overview"]')).toBeHidden();
        }

        await page.getByRole("button", { name: "Language: English", exact: true }).click();
        await page.getByRole("link", { name: "עברית", exact: true }).click();
        await expect(page).toHaveURL(/\/he\/overview(?:#main)?$/);
        await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
        await expect(page.getByRole("heading", { name: data.summary, exact: true })).toBeVisible();
        await expect(page.getByRole("heading", { name: data.name, exact: true })).toBeVisible();
        await page.getByRole("button", { name: "תפריט", exact: true }).click();
        for (const destination of [
          "overview",
          "properties",
          "appointments",
          "messages",
          "documents",
        ])
          await expect(page.locator(`header nav a[href="/he/${destination}"]`)).toBeVisible();
        await fitsViewport(page, 320);
        await page.screenshot({
          path: info.outputPath(`client-overview-he-320-${javaScriptEnabled}.png`),
          fullPage: true,
        });

        // A second current relationship makes an explicit chooser; no guessed current Case.
        await relate(db, { partyId: data.clientPartyId, caseId: data.second.id, role: "buyer" });
        await page.goto(overview);
        await expect(
          page.getByRole("heading", { level: 1, name: caseCopy("en").cases }),
        ).toBeVisible();
        const rows = page.getByRole("main").getByRole("listitem");
        await expect(rows).toHaveCount(2);
        await expect(
          page.getByRole("link", {
            name: `${data.first.reference} · ${data.first.title}`,
            exact: true,
          }),
        ).toHaveAttribute("href", `/en/overview/${data.first.id}`);
        await expect(
          page.getByRole("link", {
            name: `${data.second.reference} · ${data.second.title}`,
            exact: true,
          }),
        ).toHaveAttribute("href", `/en/overview/${data.second.id}`);
        await expect(page.getByRole("heading", { name: data.summary, exact: true })).toHaveCount(0);
        await expect(page.getByText(data.excluded.reference, { exact: false })).toHaveCount(0);
        await fitsViewport(page, 320);
        await page.screenshot({
          path: info.outputPath(`client-case-chooser-320-${javaScriptEnabled}.png`),
          fullPage: true,
        });
        expect(
          (await page.goto(hostUrl("client", `/en/overview/${data.excluded.id}`)))?.status(),
        ).toBe(404);
        await expect(page.locator("body")).not.toContainText(data.excluded.reference);
        // An already-known exact URL also rechecks a revoked client relationship.
        await db
          .update(schema.caseParticipants)
          .set({ revokedAt: new Date() })
          .where(eq(schema.caseParticipants.id, data.participantId));
        expect(
          (await page.goto(hostUrl("client", `/en/overview/${data.first.id}`)))?.status(),
        ).toBe(404);
        await expect(page.locator("body")).not.toContainText(data.first.title);
        await expect(page.locator("body")).not.toContainText(data.summary);
      } finally {
        await cleanup(data);
      }
    });
  });
}
