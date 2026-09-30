// Native global Hermes entry. Uses source authorization only; no draft job or provider call.
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { aiCopy } from "../src/features/ai/copy";
import { entryCopy } from "../src/features/ai/entry-copy";
import { hostUrl, origins } from "./hosts";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Hermes entry tests require the disposable browser database");
const connection = postgres(url, { max: 2 });
const db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());

type Fixture = {
  actorId: string;
  partyId: string;
  token: string;
  inquiryIds: string[];
  allowed: { id: string; reference: string }[];
  denied: { id: string; reference: string };
  inaccessible: { id: string; reference: string };
};
function fixture(role?: "content_editor"): Fixture {
  // Record scopes isolate this fixture from other parallel browser work. Forty
  // earlier, unreadable records exercise authorization before the 30-row page.
  const script = `
    import { randomUUID } from 'node:crypto';
    import { eq } from 'drizzle-orm';
    import { drizzle } from 'drizzle-orm/postgres-js';
    import postgres from 'postgres';
    import * as schema from './src/db/schema.ts';
    import { createStaff } from './src/server/testing.ts';
    import { createSession } from './src/server/auth/sessions.ts';
    const url = process.env.E2E_DATABASE_URL;
    if (!url || !/^\\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname)) throw new Error('Disposable DB required');
    const connection = postgres(url, { max: 2 });
    const db = drizzle(connection, { schema });
    try {
      const result = await db.transaction(async (tx) => {
        const key = randomUUID().slice(0, 8);
        const rows = await tx.insert(schema.inquiries).values(Array.from({ length: 73 }, (_, index) => ({
          reference: 'RQ-ENTRY-' + key + '-' + String(index).padStart(2, '0'),
          purpose: 'question', source: 'website', submissionKey: randomUUID(), payloadDigest: 'synthetic-entry',
          preferredLocale: index < 40 ? 'bg' : 'en', coverageQueue: 'synthetic-entry',
          createdAt: new Date(Date.UTC(2020, 0, 1, 0, 0, index)),
          message: 'Synthetic source ' + index + '. Contact private@example.test.', preferredName: 'Private synthetic name',
        }))).returning({ id: schema.inquiries.id, reference: schema.inquiries.reference });
        rows.sort((left, right) => left.reference.localeCompare(right.reference));
        const permitted = rows.slice(40);
        const denied = permitted[31];
        const allowed = permitted.filter((row) => row.id !== denied.id);
        const role = ${JSON.stringify(role ?? null)};
        const actor = await createStaff(tx, role ? { roles: [role] } : { grants: [
          ...permitted.map((row) => ({ capability: 'inquiry.read', recordType: 'inquiry', recordId: row.id })),
          ...allowed.map((row) => ({ capability: 'ai.draft', recordType: 'inquiry', recordId: row.id })),
        ] });
        await tx.insert(schema.passkeys).values([0, 1].map(() => ({ principalId: actor.id, credentialId: randomUUID(), publicKey: Buffer.from([1]), deviceType: 'singleDevice', backedUp: false })));
        const { token } = await createSession(tx, { kind: 'staff', id: actor.id });
        const [principal] = await tx.select({ partyId: schema.principals.partyId }).from(schema.principals).where(eq(schema.principals.id, actor.id));
        return { actorId: actor.id, partyId: principal.partyId, token, inquiryIds: rows.map((row) => row.id), allowed, denied, inaccessible: rows[0] };
      });
      console.log(JSON.stringify(result));
    } finally { await connection.end(); }
  `;
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "--input-type=module", "-e", script],
      {
        encoding: "utf8",
        env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
      },
    ).trim(),
  ) as Fixture;
}
async function cleanup(data: Fixture) {
  await db.transaction(async (tx) => {
    await tx.delete(schema.inquiries).where(inArray(schema.inquiries.id, data.inquiryIds));
    await tx.delete(schema.grants).where(eq(schema.grants.principalId, data.actorId));
    await tx.delete(schema.sessions).where(eq(schema.sessions.principalId, data.actorId));
    await tx.delete(schema.passkeys).where(eq(schema.passkeys.principalId, data.actorId));
    await tx
      .delete(schema.staffMemberships)
      .where(eq(schema.staffMemberships.principalId, data.actorId));
    await tx.delete(schema.principals).where(eq(schema.principals.id, data.actorId));
    await tx.delete(schema.parties).where(eq(schema.parties.id, data.partyId));
  });
}

for (const javaScriptEnabled of [true, false]) {
  test.describe(`Hermes entry with JavaScript ${javaScriptEnabled}`, () => {
    test.use({ javaScriptEnabled });
    test("native picker preserves scoped pagination, current source and manual recovery", async ({
      context,
      page,
    }, testInfo) => {
      const data = fixture();
      try {
        expect(data.allowed).toHaveLength(32);
        expect(data.inquiryIds).toHaveLength(73);
        await context.addCookies([
          { name: "msr_staff_session", value: data.token, url: origins.staff },
        ]);
        await page.setViewportSize({ width: javaScriptEnabled ? 320 : 390, height: 844 });
        const response = await page.goto(hostUrl("staff", "/en/operations/assistance"));
        expect(response?.status()).toBe(200);
        await expect(
          page.getByRole("heading", { level: 1, name: entryCopy("en").title }),
        ).toBeVisible();
        const picker = page.getByRole("combobox", { name: entryCopy("en").source });
        await expect(picker.locator("option")).toHaveCount(31);
        await expect(picker.locator("option").last()).toHaveAttribute(
          "value",
          data.allowed[29]?.id ?? "missing",
        );
        await expect(page.getByText(data.inaccessible.reference)).toHaveCount(0);
        await expect(page.getByText("Private synthetic name")).toHaveCount(0);
        await expect(page.getByRole("textbox")).toHaveCount(0);
        await expect(page.getByRole("button", { name: aiCopy("en").request })).toHaveCount(0);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`hermes-entry-${javaScriptEnabled ? 320 : 390}.png`),
          fullPage: true,
        });

        const next = page.getByRole("link", { name: "Next page", exact: true });
        await expect(next).toHaveAttribute("href", "/en/operations/assistance?view=all&page=2");
        await next.click();
        await expect(page).toHaveURL(hostUrl("staff", "/en/operations/assistance?view=all&page=2"));
        await expect(picker.locator("option")).toHaveCount(3);
        await expect(picker.locator(`option[value="${data.denied.id}"]`)).toHaveCount(0);
        const selected = data.allowed.at(-1);
        if (!selected) throw new Error("Missing beyond-page-30 fixture");
        await expect(picker.locator("option").last()).toHaveAttribute("value", selected.id);
        await expect(
          page.getByRole("link", { name: "Previous page", exact: true }),
        ).toHaveAttribute("href", "/en/operations/assistance?view=all&page=1");

        // A picker never pins stale source text or a request revision. The selected
        // GET reads version 2, with contact data minimized by the existing service.
        await db
          .update(schema.inquiries)
          .set({ version: 2, message: "Current source version two. Contact changed@example.test." })
          .where(eq(schema.inquiries.id, selected.id));
        await picker.selectOption(selected.id);
        await page.getByRole("button", { name: entryCopy("en").inspect }).click();
        await expect(page).toHaveURL(
          hostUrl("staff", `/en/operations/assistance?source=${selected.id}`),
        );
        await expect(
          page.getByRole("heading", { name: aiCopy("en").source, exact: true }),
        ).toBeVisible();
        await expect(
          page.getByText("Current source version two. Contact [email removed].", { exact: true }),
        ).toBeVisible();
        await expect(page.getByText("changed@example.test")).toHaveCount(0);
        await expect(
          page.getByRole("link", { name: aiCopy("en").manual, exact: true }),
        ).toHaveAttribute("href", `/en/inquiries/${selected.id}`);
        await expect(page.getByText(aiCopy("en").disabled, { exact: true })).toBeVisible();

        await db
          .update(schema.grants)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(schema.grants.principalId, data.actorId),
              eq(schema.grants.recordId, selected.id),
              eq(schema.grants.capability, "ai.draft"),
            ),
          );
        expect(
          (
            await page.goto(hostUrl("staff", `/en/operations/assistance?source=${selected.id}`))
          )?.status(),
        ).toBe(404);
        expect(
          (
            await page.goto(
              hostUrl("staff", `/en/operations/assistance?source=${data.inaccessible.id}`),
            )
          )?.status(),
        ).toBe(404);
        expect(
          (
            await page.goto(hostUrl("staff", "/en/operations/assistance?source=not-an-inquiry"))
          )?.status(),
        ).toBe(404);
        expect(
          (
            await page.goto(
              hostUrl(
                "staff",
                `/en/operations/assistance?source=${selected.id}&source=${data.denied.id}`,
              ),
            )
          )?.status(),
        ).toBe(404);

        await db
          .update(schema.grants)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(schema.grants.principalId, data.actorId),
              eq(schema.grants.capability, "ai.draft"),
            ),
          );
        expect(
          (
            await page.goto(hostUrl("staff", "/ru/operations/assistance?view=all&page=2"))
          )?.status(),
        ).toBe(200);
        await expect(page.getByText(entryCopy("ru").manualOnly, { exact: true })).toBeVisible();
        await expect(page.getByRole("combobox")).toHaveCount(0);
        await expect(page.getByRole("link", { name: entryCopy("ru").manual })).toHaveAttribute(
          "href",
          "/ru/inquiries",
        );
        await expect(page.getByRole("navigation", { name: entryCopy("ru").pages })).toHaveCount(0);
        await expect(page.getByRole("link", { name: entryCopy("ru").locale })).toHaveCount(0);
        await expect(page.getByRole("link", { name: entryCopy("ru").intake })).toHaveCount(0);
        expect(
          await db
            .select()
            .from(schema.assistanceRuns)
            .where(eq(schema.assistanceRuns.requestedById, data.actorId)),
        ).toHaveLength(0);
      } finally {
        await cleanup(data);
      }
    });
    test("content editor reaches supported listing starters and manual inventory without inquiry data", async ({
      context,
      page,
    }, testInfo) => {
      const data = fixture("content_editor");
      try {
        await context.addCookies([
          { name: "msr_staff_session", value: data.token, url: origins.staff },
        ]);
        await page.setViewportSize({ width: javaScriptEnabled ? 320 : 390, height: 844 });
        expect((await page.goto(hostUrl("staff", "/en/operations/assistance")))?.status()).toBe(
          200,
        );
        await expect(
          page.getByRole("heading", { level: 1, name: entryCopy("en").title }),
        ).toBeVisible();
        await expect(page.getByRole("combobox")).toHaveCount(0);
        await expect(
          page.getByRole("heading", { name: entryCopy("en").inquiry, exact: true }),
        ).toHaveCount(0);
        await expect(page.getByRole("link", { name: entryCopy("en").manual })).toHaveCount(0);
        const content = await page.content();
        for (const id of data.inquiryIds) expect(content).not.toContain(id);
        for (const record of data.allowed) expect(content).not.toContain(record.reference);
        expect(content).not.toContain(data.inaccessible.reference);
        expect(content).not.toContain("Private synthetic name");
        await expect(page.getByRole("link", { name: entryCopy("en").locale })).toHaveAttribute(
          "href",
          "/en/operations/assistance/locale",
        );
        await expect(page.getByRole("link", { name: entryCopy("en").intake })).toHaveAttribute(
          "href",
          "/en/operations/assistance/intake",
        );
        await page.screenshot({
          path: testInfo.outputPath("hermes-content-editor-entry.png"),
          fullPage: true,
        });
        const inventory = page.getByRole("link", { name: entryCopy("en").inventory });
        await expect(inventory).toHaveAttribute("href", "/en/inventory");
        const response = page.waitForResponse(
          (response) =>
            response.url() === hostUrl("staff", "/en/inventory") &&
            response.request().isNavigationRequest(),
        );
        await inventory.click();
        expect((await response).status()).toBe(200);
        await expect(page).toHaveURL(hostUrl("staff", "/en/inventory"));
        expect(
          await db
            .select()
            .from(schema.assistanceRuns)
            .where(eq(schema.assistanceRuns.requestedById, data.actorId)),
        ).toHaveLength(0);
      } finally {
        await cleanup(data);
      }
    });
  });
}
