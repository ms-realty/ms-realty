// Real public intake → authorized staff queue → accountable follow-up and conflict recovery.
// Identity ceremonies have their own suite; these fixtures seed valid sessions only in this
// run's disposable database. They never stand in for live acceptance or launch evidence.
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { type BrowserContext, expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostUrl, origins } from "./hosts";
import { openUnassignedQueueAt } from "./inquiry-queue";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("Work browser tests require the generated disposable database.");
const connection = postgres(databaseUrl, { max: 2 });
const db = drizzle(connection, { schema });
test.afterAll(async () => {
  await connection.end();
});

async function staffSession(context: BrowserContext) {
  const name = `Work broker ${randomUUID().slice(0, 8)}`;
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
    reason: "Isolated work journey fixture",
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

test("durable public inquiry is accepted, stale triage is reviewed, and the owned task is explicitly closed", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  // Each isolated journey represents a different visitor behind the trusted edge.
  // Keep the production limiter; do not make all three browser profiles share its bucket.
  const visitorIp = `2001:db8:${randomBytes(12).toString("hex").match(/.{4}/g)?.join(":")}`;
  await context.setExtraHTTPHeaders({ "cf-connecting-ip": visitorIp });
  const marker = `Browser inquiry ${randomUUID()}`;
  const email = `${randomUUID()}@example.test`;
  await page.goto(hostUrl("public", "/en/inquire"));
  await page.getByLabel("Your inquiry", { exact: true }).fill(marker);
  await page.getByLabel("Name", { exact: false }).fill("Synthetic visitor");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Review inquiry", exact: true }).click();
  await page.getByRole("button", { name: "Send inquiry to MS Realty", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Inquiry received", exact: true })).toBeVisible();
  const rows = await db.select().from(schema.inquiries).where(eq(schema.inquiries.message, marker));
  expect(rows).toHaveLength(1);
  const inquiry = rows[0];
  if (!inquiry) throw new Error("No durable inquiry");
  expect(inquiry.coverageQueue).toBeTruthy();
  expect(inquiry.ownerId).toBeNull();
  await expect(page.getByText(inquiry.reference, { exact: true })).toBeVisible();

  const broker = await staffSession(context);
  await openUnassignedQueueAt(page, inquiry.id);
  await expect(page.locator(`[data-inquiry-id="${inquiry.id}"]`)).toContainText(inquiry.reference);
  await page.getByRole("link", { name: inquiry.reference, exact: true }).click();
  await expect(page.getByRole("heading", { name: inquiry.reference, exact: true })).toBeVisible();
  const stale = await context.newPage();
  await stale.goto(hostUrl("staff", `/en/inquiries/${inquiry.id}`));
  await stale.getByLabel("Reason", { exact: true }).fill("Synthetic request held for staff review");

  const nextAction = `Review visitor question ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Next action", { exact: true }).fill(nextAction);
  await page
    .getByLabel("Follow-up time (UTC)", { exact: true })
    .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: "Accept and assign to me", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Change recorded", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open updated record", exact: true }).click();
  await expect(page.getByTestId("inquiry-owner")).toHaveText(broker.displayName);
  await expect(page.getByTestId("inquiry-state")).toHaveText("Assigned");

  await stale.getByRole("button", { name: "Record a disposition", exact: true }).click();
  await expect(
    stale.getByText(
      "This record changed. Compare the latest version with your draft before applying it again.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(stale.getByLabel("Reason", { exact: true })).toHaveValue(
    "Synthetic request held for staff review",
  );
  await stale.getByRole("button", { name: "Apply my reviewed changes", exact: true }).click();
  await expect(stale.getByRole("heading", { name: "Change recorded", exact: true })).toBeVisible();
  await stale.getByRole("link", { name: "Open updated record", exact: true }).click();
  await expect(stale.getByTestId("inquiry-state")).toHaveText("Suspected spam");
  await expect(stale.getByTestId("inquiry-owner")).toHaveText(broker.displayName);

  await page.goto(hostUrl("staff", `/en/contacts/${inquiry.partyId}`));
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.getByRole("link", { name: inquiry.reference, exact: true }).click();
  await page.getByRole("link", { name: nextAction, exact: true }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("done");
  await page
    .getByLabel("Outcome, dependency or cancellation reason", { exact: true })
    .fill("Reviewed the original inquiry and confirmed the synthetic test outcome");
  await page.getByRole("button", { name: "Update task", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Change recorded", exact: true })).toBeVisible();
  await stale.reload();
  await stale.getByLabel("Status", { exact: true }).selectOption("resolved_without_case");
  await stale.getByLabel("Reason", { exact: true }).fill("Synthetic test completed without a case");
  await stale.getByRole("button", { name: "Record a disposition", exact: true }).click();
  await expect(stale.getByRole("heading", { name: "Change recorded", exact: true })).toBeVisible();
  const [saved] = await db
    .select()
    .from(schema.inquiries)
    .where(eq(schema.inquiries.id, inquiry.id));
  expect(saved).toMatchObject({
    state: "resolved_without_case",
    ownerId: broker.id,
    message: marker,
    firstResponseAt: null,
  });
  const followUps = await db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.inquiryId, inquiry.id));
  expect(followUps).toHaveLength(1);
  expect(followUps[0]).toMatchObject({
    ownerId: broker.id,
    state: "done",
    completedById: broker.id,
  });
  await stale.close();
});

test("each work route requires staff access, including detail and reconciliation URLs", async ({
  page,
}) => {
  for (const path of [
    "today",
    "inquiries",
    "inbox",
    "tasks",
    "contacts",
    `inquiries/${randomUUID()}`,
    `tasks/${randomUUID()}`,
    `contacts/${randomUUID()}`,
    `inquiries/${randomUUID()}/operations?type=accept&key=missing`,
  ]) {
    await page.goto(hostUrl("staff", `/en/${path}`));
    await expect(page).toHaveURL(hostUrl("staff", "/en/access"));
  }
});

for (const javaScriptEnabled of [true, false]) {
  test(`public inquiry rate-limit recovery with JavaScript ${javaScriptEnabled}`, async ({
    browser,
  }, testInfo) => {
    const visitorIp = `2001:db8:${randomBytes(12).toString("hex").match(/.{4}/g)?.join(":")}`;
    const secret = process.env.E2E_AUTH_SECRET;
    if (!secret) throw new Error("No isolated rate-limit secret");
    const bucketKey = `inquiry.ip:${createHmac("sha256", secret).update(visitorIp).digest("hex")}`;
    // Seed only this synthetic visitor's exhausted bucket, then simulate elapsed refill time.
    await db.insert(schema.rateLimitBuckets).values({
      key: bucketKey,
      tokens: 0,
      refilledAt: new Date(),
      expiresAt: new Date(Date.now() + 600000),
    });
    const isolated = await browser.newContext({
      ...testInfo.project.use,
      javaScriptEnabled,
      extraHTTPHeaders: { "cf-connecting-ip": visitorIp },
    });
    try {
      const page = await isolated.newPage(),
        marker = `Limited visitor ${randomUUID()}`;
      await page.goto(hostUrl("public", "/en/inquire"));
      const operationId = await page.locator('[name="_operationId"]').inputValue();
      await page.getByLabel("Your inquiry", { exact: true }).fill(marker);
      await page.getByLabel("Email", { exact: true }).fill(`${randomUUID()}@example.test`);
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Review inquiry", exact: true }).click();
      await page.getByRole("button", { name: "Send inquiry to MS Realty", exact: true }).click();
      await expect(page.getByText(/Your inquiry was not submitted/)).toBeVisible();
      await expect(page.getByLabel("Your inquiry", { exact: true })).toHaveValue(marker);
      await expect(page.locator('[name="_operationId"]')).toHaveValue(operationId);
      expect(
        await db.select().from(schema.inquiries).where(eq(schema.inquiries.message, marker)),
      ).toHaveLength(0);
      await db
        .update(schema.rateLimitBuckets)
        .set({ refilledAt: new Date(Date.now() - 121000) })
        .where(eq(schema.rateLimitBuckets.key, bucketKey));
      await page.getByRole("button", { name: "Review inquiry", exact: true }).click();
      await page.getByRole("button", { name: "Send inquiry to MS Realty", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Inquiry received", exact: true }),
      ).toBeVisible();
      expect(
        await db.select().from(schema.inquiries).where(eq(schema.inquiries.message, marker)),
      ).toHaveLength(1);
    } finally {
      await isolated.close();
    }
  });
}
