// F04/F05 and AT28–AT32: explicit qualification, client continuity and booking semantics.
// Fixtures are synthetic and isolated. This is product-path evidence, not live release proof.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostUrl, origins } from "./hosts";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Case browser tests require the generated disposable database.");
const connection = postgres(url, { max: 2 });
const db = drizzle(connection, { schema });
test.afterAll(async () => {
  await connection.end();
});

async function recorded(page: Page) {
  await expect(page.getByRole("heading", { name: "Change recorded", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open current record", exact: true }).click();
}

test("owned inquiry becomes a scoped case with client feedback, tentative request, confirmed booking and cancellation", async ({
  page,
  context,
  browser,
}, testInfo) => {
  test.setTimeout(120000);
  const f = JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "src/server/cases/browser-seed.ts"],
      {
        env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
        encoding: "utf8",
      },
    ),
  ) as {
    inquiryId: string;
    staffId: string;
    staffToken: string;
    brokerName: string;
    clientToken: string;
    clientPartyId: string;
    listingReference: string;
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
  await page.goto(hostUrl("staff", `/en/cases/new?inquiry=${f.inquiryId}`));
  const title = `S4 buyer journey ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Case title (visible to participants)", { exact: true }).fill(title);
  await page
    .getByLabel("Requirements to review", { exact: true })
    .fill("Step-free access is essential");
  await page
    .getByLabel("Preferences to review", { exact: true })
    .fill("Quiet street near the town centre");
  await page
    .getByLabel("Next internal action", { exact: true })
    .fill("Internal negotiation limit check");
  await page
    .getByLabel("Next action due (UTC)", { exact: true })
    .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: "Create a case", exact: true }).click();
  await recorded(page);
  const [inquiry] = await db
    .select()
    .from(schema.inquiries)
    .where(eq(schema.inquiries.id, f.inquiryId));
  const caseId = inquiry?.caseId;
  if (!caseId) throw new Error("No durable linked Case");
  expect(inquiry.state).toBe("linked_to_case");
  const [task] = await db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.inquiryId, f.inquiryId));
  if (!task) throw new Error("No linked intake follow-up task");
  expect(task).toMatchObject({ caseId, ownerId: f.staffId, state: "open" });
  await expect(
    page.getByRole("link", { name: "Existing intake follow-up", exact: true }),
  ).toBeVisible();
  // Open commitments must be reachable before the long editable requirements form.
  const followUp = page.getByRole("link", { name: "Existing intake follow-up", exact: true });
  const requirements = page.getByRole("heading", { name: "Requirements", exact: true });
  const followUpBox = await followUp.boundingBox();
  const requirementsBox = await requirements.boundingBox();
  if (!followUpBox || !requirementsBox) throw new Error("Case task or requirements not rendered");
  expect(followUpBox.y).toBeLessThan(requirementsBox.y);
  await followUp.click();
  await expect(page).toHaveURL(hostUrl("staff", `/en/tasks/${task.id}`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Existing intake follow-up");
  await page.goto(hostUrl("staff", `/en/cases/${caseId}`));
  await page.screenshot({ path: testInfo.outputPath("case-current-work.png"), fullPage: true });
  await expect(
    page.getByText("Broker interpretation · client agreement has not been recorded", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Listing reference", { exact: true }).fill(f.listingReference);
  await page
    .getByLabel("Fit and known trade-offs (visible to participants)", { exact: true })
    .fill("Access must be checked at the viewing; the approved location matches your preference.");
  await page.getByRole("button", { name: "Suggest a property", exact: true }).click();
  await recorded(page);

  const clientContext = await browser.newContext({ ...testInfo.project.use });
  try {
    await clientContext.addCookies([
      {
        name: "msr_client_session",
        value: f.clientToken,
        url: origins.client,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const client = await clientContext.newPage();
    await client.goto(hostUrl("client", `/en/overview/${caseId}`));
    await expect(client.getByText(f.brokerName, { exact: true })).toBeVisible();
    await expect(client.getByText("Internal negotiation limit check", { exact: true })).toHaveCount(
      0,
    );
    await expect(
      client.getByRole("button", { name: "Record next action", exact: true }),
    ).toHaveCount(0);
    await client
      .getByLabel("Feedback or reason", { exact: true })
      .fill("I would like to see this property");
    await client.getByRole("button", { name: "Record feedback", exact: true }).click();
    await recorded(client);
    await client
      .getByLabel("Preferred window (not a confirmed booking)", { exact: true })
      .fill("A weekday morning, subject to confirmation");
    await client.getByRole("button", { name: "Request a viewing", exact: true }).click();
    await recorded(client);
    await expect(client.getByTestId("appointment-state")).toHaveText("Requested");
    const [appointment] = await db
      .select()
      .from(schema.appointments)
      .where(eq(schema.appointments.caseId, caseId));
    if (!appointment) throw new Error("No durable appointment");
    expect(appointment.confirmedStartsAt).toBeNull();
    expect(
      (
        await client.request.get(hostUrl("client", `/en/appointments/${appointment.id}/calendar`))
      ).status(),
    ).toBe(404);

    await page.goto(hostUrl("staff", `/en/calendar/${appointment.id}`));
    const arrange = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Arrange appointment", exact: true }) });
    await arrange.getByLabel("Action", { exact: true }).selectOption("confirm");
    const year = new Date().getUTCFullYear() + 1;
    await arrange
      .getByLabel("Start in Sofia with UTC offset", { exact: true })
      .fill(`${year}-01-15T10:00+02:00`);
    await arrange
      .getByLabel("End in Sofia with UTC offset", { exact: true })
      .fill(`${year}-01-15T11:00+02:00`);
    await arrange
      .getByLabel("I confirmed property access for this appointment", { exact: true })
      .check();
    await arrange
      .getByLabel("I checked external busy periods for the host", { exact: true })
      .check();
    await arrange
      .getByLabel("Private meeting/access instructions", { exact: true })
      .fill("Private synthetic key collection instructions");
    await arrange.getByRole("button", { name: "Record appointment change", exact: true }).click();
    await recorded(page);
    await expect(page.getByTestId("appointment-state")).toHaveText("Confirmed");
    await client.reload();
    await expect(client.getByTestId("appointment-state")).toHaveText("Confirmed");
    await expect(
      client.getByText("Private synthetic key collection instructions", { exact: true }),
    ).toHaveCount(0);
    const calendarUrl = hostUrl("client", `/en/appointments/${appointment.id}/calendar`);
    const initialCalendar = await client.request.get(calendarUrl);
    expect(initialCalendar.status()).toBe(200);
    const initialICS = await initialCalendar.text();
    expect(initialICS).toContain("SEQUENCE:1");
    expect(initialICS).not.toContain("Private synthetic");
    const uid = initialICS.match(/UID:([^\r]+)/)?.[1];
    expect(uid).toBeTruthy();
    await client.getByLabel("Action", { exact: true }).selectOption("reschedule_requested");
    await client
      .getByLabel("Reason or factual outcome", { exact: true })
      .fill("Please discuss an afternoon option");
    await client.getByRole("button", { name: "Record appointment change", exact: true }).click();
    await recorded(client);
    await expect(client.getByTestId("appointment-state")).toHaveText(
      "Change requested · existing confirmation remains in force",
    );
    const [pending] = await db
      .select()
      .from(schema.appointments)
      .where(eq(schema.appointments.id, appointment.id));
    expect(pending?.confirmedStartsAt?.toISOString()).toBe(`${year}-01-15T08:00:00.000Z`);
    expect(
      await db
        .select()
        .from(schema.appointmentResources)
        .where(
          and(
            eq(schema.appointmentResources.appointmentId, appointment.id),
            eq(schema.appointmentResources.active, true),
          ),
        ),
    ).toHaveLength(2);
    await client.getByLabel("Action", { exact: true }).selectOption("cancelled");
    await client
      .getByLabel("Reason or factual outcome", { exact: true })
      .fill("Cancel this request after reviewing the arrangement");
    await client.getByRole("button", { name: "Record appointment change", exact: true }).click();
    await recorded(client);
    await expect(client.getByTestId("appointment-state")).toHaveText("Cancelled");
    await expect(
      client.getByRole("heading", { name: "Previous arrangement", exact: true }),
    ).toBeVisible();
    expect(
      await db
        .select()
        .from(schema.appointmentResources)
        .where(
          and(
            eq(schema.appointmentResources.appointmentId, appointment.id),
            eq(schema.appointmentResources.active, true),
          ),
        ),
    ).toHaveLength(0);
    const cancelledICS = await (await client.request.get(calendarUrl)).text();
    expect(cancelledICS).toContain(`UID:${uid}\r\n`);
    expect(cancelledICS).toContain("SEQUENCE:2");
    expect(cancelledICS).toContain("METHOD:CANCEL");

    await client.goto(hostUrl("client", `/en/messages/${caseId}`));
    await client
      .getByLabel("Message", { exact: true })
      .fill("Please revise my requirements to include a lift");
    await client.getByRole("button", { name: "Post in this case", exact: true }).click();
    await recorded(client);
    await page.goto(hostUrl("staff", `/en/cases/${caseId}`));
    await expect(
      page.getByText("Please revise my requirements to include a lift", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Internal note · staff only", { exact: true })
      .fill("Private synthetic broker note");
    await page.getByRole("button", { name: "Save internal note", exact: true }).click();
    await recorded(page);
    await client.reload();
    await expect(client.getByText("Private synthetic broker note", { exact: true })).toHaveCount(0);
    await client.screenshot({ path: testInfo.outputPath("client-case.png"), fullPage: true });
    await db
      .update(schema.caseParticipants)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.caseParticipants.caseId, caseId),
          eq(schema.caseParticipants.partyId, f.clientPartyId),
        ),
      );
    expect((await client.request.get(calendarUrl)).status()).toBe(404);
    await client.reload();
    await expect(client.getByRole("heading", { name: new RegExp(title) })).toHaveCount(0);
  } finally {
    await clientContext.close();
  }
});
