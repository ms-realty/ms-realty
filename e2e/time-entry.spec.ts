// M-050/M-051 and UI11: a staff follow-up and a client's counter-offer deadline are typed as
// Sofia wall times, with and without JavaScript, and stored as exactly the instant they name.
// No field asks for UTC, an offset or an id. Fixtures are synthetic and local only.
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostUrl, origins } from "./hosts";
import { agencyWallTime } from "./time";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Time entry browser tests require the generated disposable database.");
const connection = postgres(url, { max: 2 });
const db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());

const machineText = /UTC|GMT|Europe\/|YYYY|[+-]0[23]:00|\d{4}-\d{2}-\d{2}T/;
// Explicit instants: next year's 15 January is winter time in Sofia (UTC+2).
const year = new Date().getUTCFullYear() + 1;
const followUp = new Date(Date.UTC(year, 0, 15, 8, 0)); // 10:00 in Sofia
const deadline = new Date(Date.UTC(year, 0, 20, 16, 30)); // 18:30 in Sofia

async function staffSession(context: BrowserContext) {
  const name = `Time broker ${randomUUID().slice(0, 8)}`;
  const [party] = await db
    .insert(schema.parties)
    .values({ kind: "person", displayName: name })
    .returning();
  if (!party) throw new Error("Party fixture missing");
  const [principal] = await db
    .insert(schema.principals)
    .values({
      partyId: party.id,
      kind: "staff",
      issuer: "urn:ms-realty:staff",
      subject: randomUUID(),
      email: `${randomUUID()}@example.test`,
      displayName: name,
    })
    .returning();
  if (!principal) throw new Error("Principal fixture missing");
  await db.insert(schema.staffMemberships).values({ principalId: principal.id });
  await db.insert(schema.grants).values({
    principalId: principal.id,
    role: "assigned_broker",
    reason: "Isolated time entry fixture",
  });
  await db.insert(schema.passkeys).values(
    [0, 1].map(() => ({
      principalId: principal.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.sessions).values({
    principalKind: "staff",
    principalId: principal.id,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(Date.now() + 3600000),
    lastSeenAt: new Date(),
    reverifiedAt: new Date(),
  });
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
  return principal;
}

async function recorded(page: Page) {
  await expect(page.getByRole("heading", { name: "Change recorded", exact: true })).toBeVisible();
}

for (const javaScriptEnabled of [true, false]) {
  test(`O02 accept: a follow-up typed on the Sofia clock is stored as that instant (JavaScript ${javaScriptEnabled})`, async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({ ...testInfo.project.use, javaScriptEnabled });
    try {
      const broker = await staffSession(context);
      const key = randomBytes(4).toString("hex");
      const [inquiry] = await db
        .insert(schema.inquiries)
        .values({
          reference: `RQ-TIME-${key}`,
          source: "website",
          state: "received",
          coverageQueue: "agency",
          purpose: "question",
          preferredName: `Time visitor ${key}`,
          message: "Synthetic question for the time entry journey.",
          submissionKey: randomUUID(),
          payloadDigest: "synthetic-time",
        })
        .returning();
      if (!inquiry) throw new Error("Inquiry fixture missing");
      const page = await context.newPage();
      await page.goto(hostUrl("staff", `/en/inquiries/${inquiry.id}`));
      const accept = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Accept and assign to me" }) });
      const due = accept.getByLabel("Follow-up time", { exact: true });
      await expect(due).toHaveAttribute("type", "datetime-local");
      await expect(due).toHaveAccessibleDescription(/^Sofia time/);
      await expect(accept).not.toContainText(machineText);
      await accept.getByLabel("Next action", { exact: true }).fill("Call back about the question");
      await due.fill(agencyWallTime(followUp));
      expect(agencyWallTime(followUp)).toBe(`${year}-01-15T10:00`);
      if (javaScriptEnabled) await expect(due).toHaveAccessibleDescription(/15 January.*10:00/);
      await accept.getByRole("button", { name: "Accept and assign to me" }).click();
      if (javaScriptEnabled) await recorded(page);
      await expect
        .poll(async () => {
          const [row] = await db
            .select()
            .from(schema.inquiries)
            .where(eq(schema.inquiries.id, inquiry.id));
          return row?.followUpAt?.toISOString();
        })
        .toBe(followUp.toISOString());
      const [task] = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.inquiryId, inquiry.id));
      expect(task).toMatchObject({ ownerId: broker.id, dueTimezone: "Europe/Sofia" });
      expect(task?.dueAt?.toISOString()).toBe(followUp.toISOString());
      // The task reads the same instant back on the agency's clock, in words. (A native accept
      // keeps the inquiry behind its confirmed-action page until that is acknowledged.)
      await page.goto(hostUrl("staff", `/en/tasks/${task?.id}`));
      const followUpTime = page.locator(`time[datetime="${followUp.toISOString()}"]`).first();
      await expect(followUpTime).toContainText("15 January");
      await expect(followUpTime).toContainText("10:00");
      await expect(page.locator("main")).not.toContainText(/\bUTC\b|Europe\/Sofia/);
    } finally {
      await context.close();
    }
  });

  test(`C10 counter-offer: the client's deadline on the Sofia clock is stored as that instant (JavaScript ${javaScriptEnabled})`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(120000);
    const f = JSON.parse(
      execFileSync(
        process.execPath,
        ["--conditions=react-server", "--import", "tsx", "src/server/proposals/browser-seed.ts"],
        {
          env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
          encoding: "utf8",
        },
      ),
    ) as { proposalId: string; staffToken: string; clientToken: string };
    const staff = await browser.newContext({ ...testInfo.project.use });
    const clients = await browser.newContext({ ...testInfo.project.use, javaScriptEnabled });
    try {
      await staff.addCookies([
        {
          name: "msr_staff_session",
          value: f.staffToken,
          url: origins.staff,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      await clients.addCookies([
        {
          name: "msr_client_session",
          value: f.clientToken,
          url: origins.client,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const page = await staff.newPage();
      await page.goto(hostUrl("staff", `/en/proposals/${f.proposalId}`));
      await page
        .getByLabel(
          "I reviewed these exact parties, terms, source and deadline. This is a coordination record, not legal approval.",
          { exact: true },
        )
        .check();
      await page.getByRole("button", { name: "Record exact-terms review", exact: true }).click();
      await recorded(page);
      await page.getByRole("link", { name: "Open current record", exact: true }).click();
      await page
        .getByLabel(
          "I reviewed the exact revision and its audience. Make it available to these parties in their client workspace.",
          { exact: true },
        )
        .check();
      await page
        .getByRole("button", { name: "Make available to these parties", exact: true })
        .click();
      await recorded(page);

      const [current] = await db
        .select()
        .from(schema.proposalRevisions)
        .where(eq(schema.proposalRevisions.proposalId, f.proposalId))
        .orderBy(desc(schema.proposalRevisions.revisionNumber));
      if (!current) throw new Error("Missing proposal revision");
      const client = await clients.newPage();
      await client.goto(hostUrl("client", `/en/proposals/${f.proposalId}`));
      // The agreed deadline reads in words with its zone named once for the client.
      await expect(
        client.locator(`time[datetime="${current.deadlineAt.toISOString()}"]`).first(),
      ).toContainText("(Sofia time)");
      const counter = client
        .locator("form")
        .filter({ has: client.getByRole("button", { name: "Propose revised terms" }) });
      const field = counter.getByLabel("Response deadline", { exact: true });
      await expect(field).toHaveAttribute("type", "datetime-local");
      await expect(field).toHaveValue(agencyWallTime(current.deadlineAt));
      await expect(field).toHaveAccessibleDescription(/^Sofia time/);
      await expect(counter).not.toContainText(machineText);
      await field.fill(agencyWallTime(deadline));
      expect(agencyWallTime(deadline)).toBe(`${year}-01-20T18:30`);
      await counter
        .getByLabel("Reason or response note", { exact: true })
        .fill("Synthetic counter-offer with a later reply date.");
      await counter.getByRole("button", { name: "Propose revised terms" }).click();
      if (javaScriptEnabled) await recorded(client);
      await expect
        .poll(async () => {
          const [latest] = await db
            .select()
            .from(schema.proposalRevisions)
            .where(eq(schema.proposalRevisions.proposalId, f.proposalId))
            .orderBy(desc(schema.proposalRevisions.revisionNumber));
          return latest?.revisionNumber === current.revisionNumber
            ? null
            : latest?.deadlineAt.toISOString();
        })
        .toBe(deadline.toISOString());
    } finally {
      await clients.close();
      await staff.close();
    }
  });
}
