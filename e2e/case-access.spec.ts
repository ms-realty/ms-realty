import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { hostUrl, origins } from "./hosts";

test.use({ javaScriptEnabled: false });
test("client requests bounded specialist access; staff approves and later revokes case access without JavaScript", async ({
  page,
  context,
  browser,
}, info) => {
  test.setTimeout(120000);
  const f = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "src/server/documents/request-browser-seed.ts",
      ],
      {
        env: {
          ...process.env,
          AUTH_SECRET: process.env.E2E_AUTH_SECRET,
          DATABASE_URL: process.env.E2E_DATABASE_URL,
        },
        encoding: "utf8",
      },
    ),
  ) as { caseId: string; staffToken: string; clientToken: string; participantId: string };
  await context.addCookies([
    {
      name: "msr_staff_session",
      value: f.staffToken,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const clientContext = await browser.newContext({ ...info.project.use, javaScriptEnabled: false });
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
    const client = await clientContext.newPage(),
      clientPath = hostUrl("client", `/en/overview/${f.caseId}/participants`),
      staffPath = hostUrl("staff", `/en/cases/${f.caseId}/participants`);
    await client.goto(hostUrl("client", `/en/overview/${f.caseId}`));
    await client.getByRole("link", { name: "Participants and access", exact: true }).click();
    const invite = client
      .locator("section")
      .filter({ has: client.getByRole("heading", { name: "Request an invitation", exact: true }) });
    const recipient = `Synthetic adviser ${randomUUID().slice(0, 6)}`;
    await invite
      .getByLabel("Recipient email", { exact: true })
      .fill(`browser-${randomUUID()}@example.test`);
    await invite.getByLabel("Recipient name", { exact: true }).fill(recipient);
    await invite.getByLabel("Requested role", { exact: true }).selectOption("specialist");
    await invite
      .getByLabel("Reason", { exact: true })
      .fill("Please let the named specialist review this case");
    await invite.getByRole("button", { name: "Request an invitation", exact: true }).click();
    await expect(
      client.getByRole("heading", { name: "The action was recorded.", exact: true }),
    ).toBeVisible();
    await expect(client.getByText("Pending review", { exact: true })).toBeVisible();
    await page.goto(staffPath);
    const request = page.getByRole("listitem").filter({
      has: page.getByRole("heading", {
        name: `Request an invitation · ${recipient}`,
        exact: true,
      }),
    });
    await request.getByLabel("Decision", { exact: true }).selectOption("approve");
    await request
      .getByLabel("Access expires (Europe/Sofia)", { exact: true })
      .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
    await request
      .getByLabel("Outcome shown to the requester", { exact: true })
      .fill("Approved for a time limited specialist review");
    await request.getByRole("button", { name: "Record decision", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "The action was recorded.", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Pending invitations", exact: true }),
    ).toBeVisible();
    await client.goto(clientPath);
    await expect(client.getByText("Approved", { exact: true })).toBeVisible();
    await expect(
      client.getByRole("heading", { name: "Pending invitations", exact: true }),
    ).toHaveCount(0);
    await expect(
      client.getByRole("button", { name: "Revoke case access", exact: true }),
    ).toHaveCount(0);
    await client.screenshot({
      path: info.outputPath("client-participant-request.png"),
      fullPage: true,
    });
    await page.screenshot({
      path: info.outputPath("staff-participant-review.png"),
      fullPage: true,
    });
    const roster = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Current participants", exact: true }) });
    await roster
      .getByLabel("Reason", { exact: true })
      .fill("The client requested closure of this case access");
    await roster.getByRole("button", { name: "Revoke case access", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "The action was recorded.", exact: true }),
    ).toBeVisible();
    await expect(roster.getByText("Revoked", { exact: true })).toBeVisible();
    expect((await client.goto(clientPath))?.status()).toBe(404);
    await expect(client.locator("body")).not.toContainText(recipient);
  } finally {
    await clientContext.close();
  }
});
