import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostUrl, origins } from "./hosts";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable database required.");
const connection = postgres(url, { max: 2 }),
  db = drizzle(connection, { schema });
test.afterAll(async () => {
  await connection.end();
});
async function recorded(page: Page) {
  await expect(page.getByRole("heading", { name: "Change recorded", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open current record", exact: true }).click();
}

test("exact Brief acknowledgement, accepted broker handover and individually resolved closeout", async ({
  page,
  context,
  browser,
}, testInfo) => {
  test.setTimeout(120000);
  const f = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "src/server/cases/lifecycle-browser-seed.ts",
      ],
      {
        env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
        encoding: "utf8",
      },
    ),
  ) as {
    caseId: string;
    staffId: string;
    staffToken: string;
    clientToken: string;
    receiverToken: string;
    receiverId: string;
    receiverName: string;
    taskId: string;
  };
  await context.addCookies([
    {
      name: "msr_staff_session",
      value: f.staffToken,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const other = await browser.newContext({ ...testInfo.project.use });
  try {
    await other.addCookies([
      {
        name: "msr_client_session",
        value: f.clientToken,
        url: origins.client,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const client = await other.newPage();
    await client.goto(hostUrl("client", `/en/overview/${f.caseId}`));
    await client
      .getByLabel(
        "I reviewed this exact requirements revision and acknowledge it as the current brief.",
        { exact: true },
      )
      .check();
    await client
      .getByRole("button", { name: "Acknowledge this requirements revision", exact: true })
      .click();
    await recorded(client);
    await expect(
      client.getByText("Client acknowledgment is recorded for this requirements revision", {
        exact: true,
      }),
    ).toBeVisible();
    const continuity = hostUrl("staff", `/en/cases/${f.caseId}/continuity`);
    await page.goto(continuity);
    const stage = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Record stage change", exact: true }) });
    await stage.getByLabel("Next stage", { exact: true }).selectOption("evaluating");
    await stage
      .getByLabel("Reason", { exact: true })
      .fill("Client acknowledged the current brief and the reviewed option.");
    await stage.getByRole("button", { name: "Record stage change", exact: true }).click();
    await recorded(page);
    await page.goto(continuity);
    const transfer = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Request handover", exact: true }) });
    await transfer.getByLabel("Receiving broker", { exact: true }).selectOption(f.receiverId);
    await transfer.getByLabel("Reason", { exact: true }).fill("Planned staff coverage");
    await transfer.getByRole("checkbox").check();
    await transfer.getByRole("button", { name: "Request handover", exact: true }).click();
    await recorded(page);
    expect(
      (await db.select().from(schema.cases).where(eq(schema.cases.id, f.caseId)))[0],
    ).toMatchObject({ ownerId: f.staffId, pendingOwnerId: f.receiverId });
    await other.addCookies([
      {
        name: "msr_staff_session",
        value: f.receiverToken,
        url: origins.staff,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const receiver = await other.newPage();
    await receiver.goto(continuity);
    const acceptance = receiver.locator("form").filter({
      has: receiver.getByRole("button", { name: "Accept case and commitments", exact: true }),
    });
    await acceptance
      .getByLabel("Reason", { exact: true })
      .fill("I reviewed and accept all current commitments.");
    await acceptance.getByRole("checkbox").check();
    await acceptance
      .getByRole("button", { name: "Accept case and commitments", exact: true })
      .click();
    await recorded(receiver);
    await expect(
      receiver.getByRole("main").getByText(f.receiverName, { exact: true }),
    ).toBeVisible();
    expect(
      (await db.select().from(schema.tasks).where(eq(schema.tasks.id, f.taskId)))[0]?.ownerId,
    ).toBe(f.receiverId);
    await receiver.goto(continuity);
    const closure = receiver
      .locator("form")
      .filter({ has: receiver.getByRole("button", { name: "Record disposition", exact: true }) });
    const fillClosure = async () => {
      await closure.getByLabel("Case disposition", { exact: true }).selectOption("closed");
      await closure.getByLabel("Reason", { exact: true }).fill("Client chose not to proceed");
      await closure.getByLabel("Recorded outcome", { exact: true }).fill("No transaction occurred");
      await closure
        .getByLabel("Retention disposition", { exact: true })
        .fill("Retain under the recorded current policy");
      await closure
        .getByLabel("Aftercare disposition", { exact: true })
        .fill("No outstanding obligations after task resolution");
    };
    await fillClosure();
    await closure.getByRole("button", { name: "Record disposition", exact: true }).click();
    await expect(
      receiver.getByText(
        "This step is not available. Check the current state and required evidence.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      (await db.select().from(schema.cases).where(eq(schema.cases.id, f.caseId)))[0]?.disposition,
    ).toBe("active");
    await receiver.goto(hostUrl("staff", `/en/tasks/${f.taskId}`));
    await receiver.getByLabel("Status", { exact: true }).selectOption("cancelled");
    await receiver
      .getByLabel("Outcome, dependency or cancellation reason", { exact: true })
      .fill("Client withdrew the request; follow-up is no longer required.");
    await receiver.getByRole("button", { name: "Update task", exact: true }).click();
    await expect(
      receiver.getByRole("heading", { name: "Change recorded", exact: true }),
    ).toBeVisible();
    await receiver.goto(continuity);
    await fillClosure();
    await closure.getByRole("button", { name: "Record disposition", exact: true }).click();
    await recorded(receiver);
    const [closed] = await db.select().from(schema.cases).where(eq(schema.cases.id, f.caseId));
    expect(closed).toMatchObject({
      disposition: "closed",
      stage: "evaluating",
      closureOutcome: "No transaction occurred",
    });
    expect(closed?.commitmentDispositions).toHaveProperty(f.taskId);
    await receiver.screenshot({
      path: testInfo.outputPath("recorded-closeout.png"),
      fullPage: true,
    });
  } finally {
    await other.close();
  }
});
