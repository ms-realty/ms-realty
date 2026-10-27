// Current-source synthetic browser proof; no live-service or owner acceptance claim.
import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hostUrl, origins } from "./hosts";
import { fillAgencyInstant } from "./time";

type Seed = {
  session: string;
  marker: string;
  email: string;
  inquiryId: string;
  inquiryReference: string;
  partyId: string;
  taskId: string;
  taskTitle: string;
  reference: string;
  listingId: string;
};
const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Staff completion browser proof requires the generated disposable database");
const connection = postgres(url, { max: 1 });
const db = drizzle(connection, { schema });
test.afterAll(async () => {
  await connection.end();
});
function seed(): Seed {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "e2e/support/staff-completion-seed.ts"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          AUTH_SECRET: process.env.E2E_AUTH_SECRET,
          DATABASE_URL: process.env.E2E_DATABASE_URL,
        },
      },
    ).trim(),
  );
}
async function open(page: Page, f: Seed, path: string) {
  await page
    .context()
    .addCookies([
      {
        name: "msr_staff_session",
        value: f.session,
        url: origins.staff,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  await page.goto(hostUrl("staff", path));
}

test("F13/O03/O18 searches scoped records, prepares a human email draft and records the task outcome", async ({
  page,
}, info) => {
  const f = seed();
  await open(page, f, "/en/search");
  await page.getByRole("searchbox").fill(f.marker);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("link", { name: new RegExp(f.taskTitle) })).toBeVisible();
  expect(page.url()).not.toContain(f.marker);
  await page.goto(hostUrl("staff", `/en/inquiries/${f.inquiryId}`));
  await page
    .getByRole("textbox", { name: "Reply draft", exact: true })
    .fill("Synthetic source reviewed by the human operator.");
  await page
    .getByRole("checkbox", {
      name: "I reviewed the recipient, source facts and this draft.",
      exact: true,
    })
    .check();
  await expect(page.getByRole("link", { name: "Open email draft", exact: true })).toHaveAttribute(
    "href",
    new RegExp(`^mailto:${encodeURIComponent(f.email)}`),
  );
  await page.screenshot({ path: info.outputPath("inquiry-reply.png"), fullPage: true });
  await page.goto(hostUrl("staff", `/en/tasks/${f.taskId}`));
  await page
    .getByRole("textbox", { name: "What actually happened", exact: true })
    .fill("Reviewed the synthetic source and completed the stated outcome.");
  await page.getByRole("button", { name: "Complete task", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Change recorded", exact: true })).toBeVisible();
  await expect(page.getByText("Done", { exact: true }).first()).toBeVisible();
  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, f.taskId));
  expect(task?.state).toBe("done");
});

test("F31/O33 restricts current exposure and keeps unresolved correction work with its human owner", async ({
  page,
}, info) => {
  const f = seed();
  await open(page, f, `/en/inventory/${f.reference}/correction`);
  await page
    .getByRole("textbox", { name: "Source or evidence reference", exact: true })
    .fill("synthetic-source-evidence");
  await page
    .getByRole("textbox", { name: "Disputed or changed fact", exact: true })
    .fill("The recorded source price requires human correction");
  await page.getByRole("combobox", { name: "Urgency", exact: true }).selectOption("urgent");
  await page
    .getByRole("checkbox", {
      name: "I reviewed this impact and authorize restriction of the current public exposure.",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Record correction and restrict exposure", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Correction recorded", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open current correction workspace", exact: true }).click();
  for (const choice of await page.getByRole("combobox").all())
    await choice.selectOption("unresolved");
  for (const evidence of await page
    .getByRole("textbox", { name: "Evidence or unresolved disposition", exact: true })
    .all())
    await evidence.fill("Synthetic unresolved review remains with the current human owner.");
  await fillAgencyInstant(
    page.getByLabel("Review the unresolved work at", { exact: true }),
    new Date(Date.now() + 3600000),
  );
  await page
    .getByRole("checkbox", {
      name: "I reviewed every current impact item. Unresolved work remains assigned to me.",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Record human reconciliation", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Correction recorded", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open current correction workspace", exact: true }).click();
  await expect(page.getByText(/Current correction state: Waiting/)).toBeVisible();
  await page.screenshot({ path: info.outputPath("correction-waiting.png"), fullPage: true });
  const [task] = await db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.listingId, f.listingId));
  expect(task?.state).toBe("waiting");
  const pointers = await db
    .select()
    .from(schema.currentPublications)
    .where(eq(schema.currentPublications.listingId, f.listingId));
  expect(pointers.every((pointer) => pointer.state === "restricted")).toBe(true);
});
