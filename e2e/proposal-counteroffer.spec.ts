// M-051 / C08: the native and enhanced money entry reach the same guarded revision command.
import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { caseCopy } from "../src/features/cases/copy";
import { proposalStatus } from "../src/features/proposals/contract";
import { proposalCopy } from "../src/features/proposals/copy";
import { counterofferCopy } from "../src/features/proposals/counteroffer-copy";
import { hostUrl, origins } from "./hosts";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("Counteroffers require a disposable browser database.");
const connection = postgres(databaseUrl, { max: 2 });
const db = drizzle(connection, { schema });
test.afterAll(() => connection.end());

async function recorded(page: Page) {
  await expect(page.getByRole("heading", { name: "Change recorded", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open current record", exact: true }).click();
}

for (const locale of ["bg", "en", "ru", "de", "nl", "el", "he"] as const)
  for (const javaScriptEnabled of [true, false])
    test(`C08 ${locale} counteroffer preserves exact money and recovery, JavaScript ${javaScriptEnabled}`, async ({
      page,
      context,
      browser,
    }, info) => {
      const fixture = JSON.parse(
        execFileSync(
          process.execPath,
          ["--conditions=react-server", "--import", "tsx", "src/server/proposals/browser-seed.ts"],
          {
            encoding: "utf8",
            env: {
              ...process.env,
              AUTH_SECRET: process.env.E2E_AUTH_SECRET,
              DATABASE_URL: databaseUrl,
            },
          },
        ),
      ) as { proposalId: string; revisionId: string; staffToken: string; clientToken: string };
      await context.addCookies([
        {
          name: "msr_staff_session",
          value: fixture.staffToken,
          url: origins.staff,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const staffCopy = proposalCopy("en");
      await page.goto(hostUrl("staff", `/en/proposals/${fixture.proposalId}`));
      await page.getByLabel(staffCopy.reviewCheck, { exact: true }).check();
      await page.getByRole("button", { name: staffCopy.review, exact: true }).click();
      await recorded(page);
      await page.getByLabel(staffCopy.submitCheck, { exact: true }).check();
      await page.getByRole("button", { name: staffCopy.submit, exact: true }).click();
      await recorded(page);

      const clients = await browser.newContext({ ...info.project.use, javaScriptEnabled });
      try {
        await clients.addCookies([
          {
            name: "msr_client_session",
            value: fixture.clientToken,
            url: origins.client,
            httpOnly: true,
            sameSite: "Lax",
          },
        ]);
        const client = await clients.newPage();
        const counter = counterofferCopy(locale);
        await client.goto(hostUrl("client", `/${locale}/proposals/${fixture.proposalId}`));
        const disclosure = client.locator("details").filter({
          has: client.locator('form input[name="amount"]'),
        });
        const form = disclosure.locator("form");
        const amount = form.locator('input[name="amount"]');
        await expect(amount).toBeHidden();
        await disclosure.locator(":scope > summary").click();
        await expect(amount).toBeVisible();
        await expect(amount).toHaveAccessibleName(/EUR/);
        await amount.fill("1,23,4");
        await form.locator('textarea[name="reason"]').fill("Synthetic revised terms for review");
        await form.getByRole("button", { name: counter.submit, exact: true }).click();
        await expect(amount).toHaveAttribute("aria-invalid", "true");
        await expect(amount).toHaveValue("1,23,4");
        await expect(amount).toBeVisible();
        const revisions = () =>
          db
            .select()
            .from(schema.proposalRevisions)
            .where(eq(schema.proposalRevisions.proposalId, fixture.proposalId))
            .orderBy(asc(schema.proposalRevisions.revisionNumber));
        expect(await revisions()).toHaveLength(1);

        // Independent Intl input and a literal expected integer prove the adapter's exactness.
        const entry = new Intl.NumberFormat(locale === "en" ? "en-GB" : locale, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(119000.03);
        await amount.fill(entry);
        const operationId = await form.locator('input[name="_operationId"]').inputValue();
        await form.getByRole("button", { name: counter.submit, exact: true }).click();
        const resultCopy = caseCopy(locale);
        if (javaScriptEnabled) {
          await expect(
            client.getByRole("heading", { name: resultCopy.saved, exact: true }),
          ).toBeVisible();
        } else {
          await expect(client).toHaveURL(
            (url) =>
              url.pathname === `/${locale}/proposals/operations` &&
              url.searchParams.get("command") === "revise" &&
              url.searchParams.get("id") === fixture.proposalId &&
              url.searchParams.get("key") === operationId,
          );
          await expect(
            client.getByRole("heading", { name: resultCopy.status, exact: true }),
          ).toBeVisible();
          await expect(client.getByText(resultCopy.statusSaved, { exact: true })).toBeVisible();
          await expect(
            client.getByRole("link", { name: resultCopy.back, exact: true }),
          ).toHaveAttribute("href", `/${locale}/proposals/${fixture.proposalId}`);
          // This durable GET result can be refreshed without posting the counteroffer again.
          await client.reload();
          await expect(client.getByText(resultCopy.statusSaved, { exact: true })).toBeVisible();
        }
        const saved = await revisions();
        expect(saved).toHaveLength(2);
        expect(saved[0]?.state).toBe("countered");
        expect(saved[1]).toMatchObject({
          amountMinor: 11900003,
          currency: "EUR",
          state: "draft",
          submittedAt: null,
          respondsToRevisionId: fixture.revisionId,
        });
        expect(saved[1]?.deadlineAt.getTime()).toBe(saved[0]?.deadlineAt.getTime());
        expect(saved[1]?.parties).toEqual(saved[0]?.parties);
        await info.attach("exact-counteroffer.json", {
          body: JSON.stringify({
            locale,
            javaScriptEnabled,
            entry,
            amountMinor: saved[1]?.amountMinor,
          }),
          contentType: "application/json",
        });
        if (locale === "en" || locale === "he")
          await client.screenshot({
            path: info.outputPath("counteroffer-receipt.png"),
            fullPage: true,
          });
      } finally {
        await clients.close();
      }
    });

test("C08 native lost acknowledgement retains the exact draft after the committed revision changes eligibility", async ({
  page,
  context,
  browser,
}, info) => {
  const fixture = JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "src/server/proposals/browser-seed.ts"],
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
    proposalId: string;
    revisionId: string;
    caseId: string;
    staffToken: string;
    clientToken: string;
  };
  await context.addCookies([
    {
      name: "msr_staff_session",
      value: fixture.staffToken,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const staffCopy = proposalCopy("en");
  await page.goto(hostUrl("staff", `/en/proposals/${fixture.proposalId}`));
  await page.getByLabel(staffCopy.reviewCheck, { exact: true }).check();
  await page.getByRole("button", { name: staffCopy.review, exact: true }).click();
  await recorded(page);
  await page.getByLabel(staffCopy.submitCheck, { exact: true }).check();
  await page.getByRole("button", { name: staffCopy.submit, exact: true }).click();
  await recorded(page);

  const clients = await browser.newContext({ ...info.project.use, javaScriptEnabled: false });
  try {
    await clients.addCookies([
      {
        name: "msr_client_session",
        value: fixture.clientToken,
        url: origins.client,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const client = await clients.newPage();
    let nativePosts = 0;
    client.on("request", (request) => {
      if (request.method() === "POST") nativePosts += 1;
    });
    await client.goto(hostUrl("client", `/en/proposals/${fixture.proposalId}`));
    const disclosure = client.locator("details").filter({
      has: client.locator('form input[name="amount"]'),
    });
    await disclosure.locator(":scope > summary").click();
    const form = disclosure.locator("form");
    await form.locator('input[name="amount"]').fill("119,000.03");
    await form.locator('textarea[name="paymentBasis"]').fill("Exact entered payment basis");
    await form.locator('textarea[name="conditions"]').fill("Exact entered condition");
    await form.locator('textarea[name="inclusions"]').fill("Exact entered inclusion");
    await form.locator('textarea[name="reason"]').fill("Exact entered recovery explanation");
    const operationId = await form.locator('input[name="_operationId"]').inputValue();
    const expectedRevision = await form.locator('input[name="_expectedRevision"]').inputValue();
    const deadline = await form.locator('input[name="deadline"]').inputValue();
    const clientPartyId = await form.locator('input[name="clientPartyId"]').inputValue();
    const entries = await form.evaluate((element: HTMLFormElement) =>
      Array.from(new FormData(element).entries()).map(([name, value]) => [name, String(value)]),
    );
    entries.push(["_intent", "submit"]);
    // Execute the guarded command once, then simulate its lost acknowledgement in the exact
    // operation ledger. The browser's original native form is submitted only once below.
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "src/features/proposals/testing/commit-before-ack.ts",
      ],
      {
        encoding: "utf8",
        input: JSON.stringify({ token: fixture.clientToken, id: fixture.proposalId, entries }),
        env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET },
      },
    );
    const revisions = () =>
      db
        .select()
        .from(schema.proposalRevisions)
        .where(eq(schema.proposalRevisions.proposalId, fixture.proposalId))
        .orderBy(asc(schema.proposalRevisions.revisionNumber));
    const saved = await revisions();
    expect(saved).toHaveLength(2);
    expect(saved[0]?.state).toBe("countered");
    expect(saved[1]).toMatchObject({
      amountMinor: 11900003,
      currency: "EUR",
      state: "draft",
      submittedAt: null,
      respondsToRevisionId: fixture.revisionId,
      paymentBasis: "Exact entered payment basis",
      conditions: ["Exact entered condition"],
      inclusions: ["Exact entered inclusion"],
    });
    expect(saved[1]?.deadlineAt.getTime()).toBe(saved[0]?.deadlineAt.getTime());
    expect(saved[1]?.parties).toEqual(saved[0]?.parties);

    await form.getByRole("button", { name: counterofferCopy("en").submit, exact: true }).click();
    const copy = caseCopy("en");
    await expect(client.getByText(copy.statusUnknown, { exact: true })).toBeVisible();
    await info.attach("native-result-position", {
      body: JSON.stringify(
        await form.evaluate((node) => ({
          id: node.id,
          hash: location.hash,
          scrollY,
          top: node.getBoundingClientRect().top,
        })),
      ),
      contentType: "application/json",
    });
    await client.screenshot({ path: info.outputPath("lost-acknowledgement-viewport.png") });
    await expect(client.getByText(copy.statusUnknown, { exact: true })).toBeInViewport();
    await expect(client.getByText(proposalCopy("en").notCurrent, { exact: true })).toBeVisible();
    await expect(disclosure).toHaveAttribute("open", "");
    await expect(form.locator('input[name="amount"]')).toHaveValue("119,000.03");
    await expect(form.locator('input[name="amount"]')).toHaveAttribute("readonly", "");
    await expect(form.locator('textarea[name="paymentBasis"]')).toHaveValue(
      "Exact entered payment basis",
    );
    await expect(form.locator('textarea[name="reason"]')).toHaveValue(
      "Exact entered recovery explanation",
    );
    await expect(form.locator('input[name="deadline"]')).toHaveValue(deadline);
    await expect(form.locator('input[name="_operationId"]')).toHaveValue(operationId);
    await expect(form.locator('input[name="_expectedRevision"]')).toHaveValue(expectedRevision);
    await expect(form.locator('input[name="revisionId"]')).toHaveValue(fixture.revisionId);
    await expect(form.locator('input[name="clientPartyId"]')).toHaveValue(clientPartyId);
    await expect(form.locator('select[name="currency"]')).toHaveValue("EUR");
    await expect(form.locator('select[name="currency"]')).toBeDisabled();
    await expect(form.locator('textarea[name="conditions"]')).toHaveValue(
      "Exact entered condition",
    );
    await expect(form.locator('textarea[name="inclusions"]')).toHaveValue(
      "Exact entered inclusion",
    );
    await expect(form.getByRole("button")).toHaveCount(0);
    const statusHref = proposalStatus("en", "revise", fixture.proposalId, operationId);
    await expect(form.getByRole("link", { name: copy.status, exact: true })).toHaveAttribute(
      "href",
      statusHref,
    );
    await client.screenshot({
      path: info.outputPath("lost-acknowledgement-draft.png"),
      fullPage: true,
    });
    await form.getByRole("link", { name: copy.status, exact: true }).click();
    await expect(client.getByText(copy.statusUnknown, { exact: true })).toBeVisible();
    await expect(client.getByRole("link", { name: copy.checkAgain, exact: true })).toHaveAttribute(
      "href",
      statusHref,
    );
    await client.getByRole("link", { name: copy.checkAgain, exact: true }).click();
    await expect(client.getByText(copy.statusUnknown, { exact: true })).toBeVisible();
    expect(nativePosts).toBe(1);
    await client.screenshot({
      path: info.outputPath("operation-status-unknown.png"),
      fullPage: true,
    });
    await client.screenshot({ path: info.outputPath("operation-status-unknown-viewport.png") });

    await db
      .update(schema.operations)
      .set({ status: "succeeded" })
      .where(
        and(
          eq(schema.operations.operationType, "proposal.revise"),
          eq(schema.operations.idempotencyKey, operationId),
        ),
      );
    await client.reload();
    await expect(client.getByText(copy.statusSaved, { exact: true })).toBeVisible();
    await client.screenshot({
      path: info.outputPath("operation-status-saved.png"),
      fullPage: true,
    });
    await client.getByRole("link", { name: copy.back, exact: true }).click();
    await expect(client.locator('input[name="amount"]')).toHaveCount(0);
    await expect(
      client.getByRole("button", { name: counterofferCopy("en").submit, exact: true }),
    ).toHaveCount(0);
    await client.reload();
    await expect(client.locator('input[name="amount"]')).toHaveCount(0);
    expect(await revisions()).toHaveLength(2);
    expect(nativePosts).toBe(1);

    await db
      .update(schema.caseParticipants)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.caseParticipants.caseId, fixture.caseId),
          eq(schema.caseParticipants.partyId, clientPartyId),
        ),
      );
    const denied = await client.goto(hostUrl("client", statusHref));
    expect(denied?.status()).toBe(404);
    await expect(client.getByText(copy.statusSaved, { exact: true })).toHaveCount(0);
    expect(nativePosts).toBe(1);
    expect(await revisions()).toHaveLength(2);
  } finally {
    await clients.close();
  }
});
