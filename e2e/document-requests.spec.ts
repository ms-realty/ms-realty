import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostUrl, origins } from "./hosts";

test.use({ javaScriptEnabled: false });
const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable database required");
const connection = postgres(url, { max: 2 }),
  db = drizzle(connection, { schema });
test.afterAll(async () => {
  await connection.end();
});
const section = (page: Page, name: string) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name, exact: true }) });
test("native purpose-bound request, real scan, replacement and revoked private access", async ({
  page,
  context,
  browser,
}, info) => {
  test.setTimeout(150000);
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
        env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
        encoding: "utf8",
      },
    ),
  ) as {
    caseId: string;
    staffToken: string;
    clientToken: string;
    participantId: string;
    policyId: string;
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
      staffPath = hostUrl("staff", `/en/cases/${f.caseId}/document-requests`);
    await page.goto(staffPath);
    const create = section(page, "Request a document"),
      title = `Requested property plan ${randomUUID().slice(0, 6)}`;
    await create.getByLabel("Recipient", { exact: true }).selectOption(f.participantId);
    await create.getByLabel("Approved process policy", { exact: true }).selectOption(f.policyId);
    await create.getByLabel("Request title", { exact: true }).fill(title);
    await create
      .getByLabel("Why this document is needed", { exact: true })
      .fill("Review the proposed room arrangement");
    await create.getByLabel("What to provide", { exact: true }).fill("One readable PDF plan");
    await create
      .getByLabel("Acceptable alternatives", { exact: true })
      .fill("Discuss the plan in person with your broker");
    await create
      .getByLabel("Request expires (Europe/Sofia)", { exact: true })
      .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
    await create.getByRole("button", { name: "Request a document", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "The action was recorded.", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Open current record", exact: true }).click();
    const [request] = await db
      .select()
      .from(schema.documentRequests)
      .where(
        and(eq(schema.documentRequests.caseId, f.caseId), eq(schema.documentRequests.title, title)),
      );
    if (!request) throw new Error("Request not persisted");
    const clientPath = hostUrl("client", `/en/documents/requests/${request.id}`);
    await client.goto(clientPath);
    await expect(
      client.getByText("Review the proposed room arrangement", { exact: false }),
    ).toBeVisible();
    const bytes = Buffer.from("%PDF-1.4\nSynthetic browser document\n%%EOF");
    const upload = async () => {
      await client
        .getByLabel("Choose a file", { exact: true })
        .setInputFiles({ name: "synthetic-plan.pdf", mimeType: "application/pdf", buffer: bytes });
      await client.getByRole("button", { name: "Upload and scan", exact: true }).click();
      await expect(client).toHaveURL((u) => Boolean(u.searchParams.get("saved")));
    };
    const awaitScan = async () => {
      await expect
        .poll(
          async () => {
            const [row] = await db
              .select({
                scan: schema.documentVersions.scan,
                engine: schema.documentVersions.scannerVersion,
              })
              .from(schema.documentVersions)
              .innerJoin(
                schema.documents,
                eq(schema.documents.id, schema.documentVersions.documentId),
              )
              .where(
                and(
                  eq(schema.documents.id, request.documentId),
                  eq(schema.documentVersions.versionNumber, schema.documents.currentVersionNumber),
                ),
              );
            if (row?.scan === "clean") expect(row.engine).toMatch(/^ClamAV /);
            return row?.scan;
          },
          { timeout: 30000 },
        )
        .toBe("clean");
    };
    await upload();
    await awaitScan();
    await page.goto(staffPath);
    const [requestedFileRecord] = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, request.documentId));
    if (!requestedFileRecord) throw new Error("Missing requested document");
    const heading = `${title} · ${requestedFileRecord.reference}`,
      item = section(page, heading);
    await item.getByLabel("Decision", { exact: true }).selectOption("needs_replacement");
    await item
      .getByLabel("Internal review note — agency staff only", { exact: true })
      .fill("PRIVATE technical reviewer observation");
    await item
      .getByLabel("Outcome shown to the recipient", { exact: true })
      .first()
      .fill("Please supply a clearer plan");
    await item
      .getByLabel("I reviewed this exact version for the stated purpose.", { exact: true })
      .check();
    await item.getByRole("button", { name: "Record review", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "The action was recorded.", exact: true }),
    ).toBeVisible();
    await client.goto(clientPath);
    await expect(
      client.getByText("Outcome shown to the recipient: Please supply a clearer plan", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(client.locator("body")).not.toContainText("PRIVATE");
    await upload();
    await awaitScan();
    await page.goto(staffPath);
    await item.getByLabel("Decision", { exact: true }).selectOption("accepted_for_purpose");
    await item
      .getByLabel("Internal review note — agency staff only", { exact: true })
      .fill("PRIVATE accepted for plan comparison only");
    await item
      .getByLabel("Outcome shown to the recipient", { exact: true })
      .first()
      .fill("Accepted for comparing the proposed room arrangement");
    await item
      .getByLabel("I reviewed this exact version for the stated purpose.", { exact: true })
      .check();
    await item.getByRole("button", { name: "Record review", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "The action was recorded.", exact: true }),
    ).toBeVisible();
    await client.goto(clientPath);
    await expect(
      client.getByText("Accepted for comparing the proposed room arrangement", { exact: false }),
    ).toBeVisible();
    const download = client.getByRole("link", {
        name: "Download current permitted file",
        exact: true,
      }),
      href = await download.getAttribute("href");
    if (!href) throw new Error("Missing permitted download link");
    expect((await clientContext.request.get(hostUrl("client", href))).status()).toBe(200);
    await client.screenshot({
      path: info.outputPath("client-request-reviewed.png"),
      fullPage: true,
    });
    await page.goto(staffPath);
    await page.screenshot({ path: info.outputPath("staff-request-reviewed.png"), fullPage: true });
    const cancel = item.locator("form").filter({
      has: page.getByRole("button", { name: "Cancel request and file access", exact: true }),
    });
    await cancel
      .getByLabel("Outcome shown to the recipient", { exact: true })
      .fill("This request is complete; file access is now closed");
    await cancel
      .getByRole("button", { name: "Cancel request and file access", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "The action was recorded.", exact: true }),
    ).toBeVisible();
    expect((await clientContext.request.get(hostUrl("client", href))).status()).toBe(404);
    await client.goto(clientPath);
    await expect(
      client.getByText("This request was cancelled. File access has ended.", { exact: true }),
    ).toBeVisible();
    await expect(client.locator("body")).not.toContainText("synthetic-plan.pdf");
    for (const p of [page, client])
      expect(
        await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
  } finally {
    await clientContext.close();
  }
});
