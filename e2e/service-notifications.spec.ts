// ADR 0014, AT31/AT32 path: a staff change to a viewing reaches the client by e-mail at once,
// the confirmed viewing carries its calendar file, and the client's confirmation reaches the
// broker. Synthetic fixture and the loopback-only test outbox; no real provider is involved.
import { execFileSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { type APIRequestContext, expect, type Page } from "@playwright/test";
import { hostUrl, origins } from "./hosts";
// Confirming a viewing is a booking consumer: it reads the shared operating policy, so it takes
// the same lease as the other booking specs instead of racing the spec that edits the policy.
import { withPolicyFixtureTimeout } from "./support/policy-test";

// The journey's own budget also covers the wait for the lease.
const test = withPolicyFixtureTimeout(240_000);

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");

interface Notice {
  recipient: string;
  template: string;
  params: { event: string; url: string; subject: { id: string; reference: string } };
  rendered: {
    subject: string;
    text: string;
    html?: string;
    attachments?: { filename: string; content: string; content_type: string }[];
  } | null;
}

async function notices(request: APIRequestContext, host: "client" | "staff") {
  const response = await request.get(hostUrl("public", "/api/test-outbox"), {
    headers: { host: new URL(origins[host]).host },
  });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { messages: Notice[] }).messages.filter(
    (message) => message.template === "deal.notice.v1",
  );
}
async function arrival(
  request: APIRequestContext,
  host: "client" | "staff",
  recipient: string,
  event: string,
) {
  let found: Notice | undefined;
  await expect
    .poll(
      async () => {
        found = (await notices(request, host)).find(
          (n) => n.recipient === recipient && n.params.event === event,
        );
        return Boolean(found);
      },
      { timeout: 60_000, intervals: [500, 1000, 2000] },
    )
    .toBe(true);
  return found as Notice;
}
async function recorded(page: Page) {
  await expect(page.getByRole("heading", { name: "Change recorded", exact: true })).toBeVisible();
}

test("staff propose and confirm a viewing, the client gets each notice and the calendar file, and their confirmation reaches the broker", async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(240_000);
  const f = JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "src/server/notifications/browser-seed.ts"],
      {
        env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
        encoding: "utf8",
      },
    ),
  ) as {
    caseId: string;
    appointmentId: string;
    staffToken: string;
    staffEmail: string;
    clientToken: string;
    clientEmail: string;
  };
  const staffContext = await browser.newContext({ ...testInfo.project.use });
  const clientContext = await browser.newContext({ ...testInfo.project.use });
  try {
    await staffContext.addCookies([
      {
        name: "msr_staff_session",
        value: f.staffToken,
        url: origins.staff,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await clientContext.addCookies([
      {
        name: "msr_client_session",
        value: f.clientToken,
        url: origins.client,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const staff = await staffContext.newPage();
    const client = await clientContext.newPage();
    const year = new Date().getUTCFullYear() + 1;
    // A working day of its own: other specs confirm viewings on the same shared database, and
    // two confirmed viewings at one time compete for the same resources.
    let slot = new Date(Date.UTC(year, 0, 18 + randomInt(0, 40)));
    while ([0, 6].includes(slot.getUTCDay()))
      slot = new Date(Date.UTC(year, 0, slot.getUTCDate() + 1));
    const day = slot.toISOString().slice(0, 10);
    const viewingDay = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Sofia",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(`${day}T08:00:00Z`));
    const arrange = async (action: "propose" | "confirm") => {
      await staff.goto(hostUrl("staff", `/en/calendar/${f.appointmentId}`));
      // Before hydration the form posts natively and lands on the record without a receipt;
      // under a loaded server that is what an early click gets.
      await expect(staff.locator('[data-private-ready="true"]')).toHaveCount(1);
      const form = staff
        .locator("section")
        .filter({ has: staff.getByRole("heading", { name: "Arrange appointment", exact: true }) });
      await form.getByLabel("Action", { exact: true }).selectOption(action);
      await form.getByLabel("Start", { exact: true }).fill(`${day}T10:00`);
      await form.getByLabel("End", { exact: true }).fill(`${day}T11:00`);
      await form
        .getByLabel("I confirmed property access for this appointment", { exact: true })
        .check();
      await form
        .getByLabel("I checked external busy periods for the host", { exact: true })
        .check();
      await form
        .getByLabel("Private meeting/access instructions", { exact: true })
        .fill("Private synthetic key collection instructions");
      await form.getByRole("button", { name: "Record appointment change", exact: true }).click();
      await recorded(staff);
    };

    await arrange("propose");
    const proposed = await arrival(request, "client", f.clientEmail, "viewing.proposed");
    expect(proposed.rendered?.subject).toContain(`Viewing time proposed for ${viewingDay}`);
    expect(proposed.rendered?.text).toContain(
      hostUrl("client", `/en/appointments/${f.appointmentId}`),
    );
    expect(proposed.rendered?.attachments).toBeUndefined();

    await arrange("confirm");
    const confirmed = await arrival(request, "client", f.clientEmail, "viewing.confirmed");
    expect(confirmed.rendered?.subject).toBe(
      `Your viewing on ${viewingDay} is confirmed (${confirmed.params.subject.reference})`,
    );
    const file = confirmed.rendered?.attachments?.[0];
    expect(file?.filename).toBe("viewing.ics");
    const ics = Buffer.from(file?.content ?? "", "base64").toString("utf8");
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("SEQUENCE:1");
    expect(ics).toContain(`DTSTART:${day.replaceAll("-", "")}T080000Z`);
    for (const message of [proposed, confirmed]) {
      const all = JSON.stringify(message);
      expect(all).not.toContain("Private synthetic key collection instructions");
    }
    // The file the e-mail carries is the one the client area serves: same UID and SEQUENCE.
    const served = await clientContext.request.get(
      hostUrl("client", `/en/appointments/${f.appointmentId}/calendar`),
    );
    expect(served.status()).toBe(200);
    const uid = (await served.text()).match(/UID:([^\r\n]+)/)?.[1];
    expect(uid).toBeTruthy();
    expect(ics).toContain(`UID:${uid}`);

    await client.goto(hostUrl("client", `/en/appointments/${f.appointmentId}`));
    await expect(client.getByTestId("appointment-state")).toHaveText("Confirmed");
    await client.getByRole("button", { name: "Confirm this time", exact: true }).click();
    await recorded(client);
    await client.goto(hostUrl("client", `/en/appointments/${f.appointmentId}`));
    await expect(
      client.getByText("You confirmed this time. Your broker has been told.", { exact: true }),
    ).toBeVisible();
    await expect(
      client.getByRole("button", { name: "Confirm this time", exact: true }),
    ).toHaveCount(0);

    const broker = await arrival(request, "staff", f.staffEmail, "client.viewing_confirmed");
    expect(broker.params.url).toBe(hostUrl("staff", `/bg/calendar/${f.appointmentId}`));
    expect(broker.rendered?.subject).toContain("Клиентът потвърди огледа");
    // Each event reached its recipient exactly once.
    expect(
      (await notices(request, "client")).filter((n) => n.recipient === f.clientEmail),
    ).toHaveLength(2);
    expect(
      (await notices(request, "staff")).filter((n) => n.recipient === f.staffEmail),
    ).toHaveLength(1);
    await client.screenshot({
      path: testInfo.outputPath("client-confirmed-viewing.png"),
      fullPage: true,
    });
  } finally {
    await staffContext.close();
    await clientContext.close();
  }
});
