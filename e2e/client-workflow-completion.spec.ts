// Synthetic source/browser proof. Provider delivery, live availability and human acceptance stay separate.
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { accountSavesCopy } from "../src/features/account-saves/copy";
import { clientWorkflowCopy } from "../src/features/cases/client-workflow-copy";
import { caseCopy } from "../src/features/cases/copy";
import { identityCopy } from "../src/features/identity/copy";
import { hostUrl, origins } from "./hosts";

const database = process.env.E2E_DATABASE_URL;
if (!database || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(database).pathname))
  throw new Error("Disposable browser database required");
const sql = postgres(database, { max: 1, onnotice: () => {} });
test.afterAll(async () => {
  await sql.end();
});
for (const javaScriptEnabled of [true, false])
  test.describe(`client completion JavaScript ${javaScriptEnabled}`, () => {
    test.use({ javaScriptEnabled });
    test("C01 localized native validation retains input and exposes no signed-in navigation", async ({
      page,
    }, info) => {
      const c = identityCopy("he");
      await page.setViewportSize({ width: 320, height: 844 });
      await page.goto(hostUrl("client", "/he/access?returnTo=%2Fhe%2Fsaved%2Fimport"));
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.locator('nav a[href*="/overview"]')).toHaveCount(0);
      await page.getByLabel(c.emailLabel, { exact: true }).fill("synthetic-invalid-address");
      await page.getByRole("button", { name: c.sendLink, exact: true }).click();
      await expect(page.getByLabel(c.emailLabel, { exact: true })).toHaveValue(
        "synthetic-invalid-address",
      );
      await expect(page.locator("#client-email-error")).toHaveText(c.invalidEmail);
      await expect(
        page.getByRole("link", { name: `${c.emailLabel}: ${c.invalidEmail}`, exact: true }),
      ).toHaveAttribute("href", "#client-email");
      expect(page.url()).not.toContain("synthetic-invalid-address");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        320,
      );
      await page.screenshot({
        path: info.outputPath(`client-access-validation-${javaScriptEnabled}.png`),
        fullPage: true,
      });
    });
    test("C06/C07 same conversation continues after a native post; proposed acceptance cannot confirm a booking", async ({
      page,
      context,
    }, info) => {
      const f = JSON.parse(
        execFileSync(
          process.execPath,
          [
            "--conditions=react-server",
            "--import",
            "tsx",
            "src/server/cases/client-completion-browser-seed.ts",
          ],
          {
            env: {
              ...process.env,
              DATABASE_URL: database,
              AUTH_SECRET: process.env.E2E_AUTH_SECRET,
              PUBLIC_ORIGIN: origins.public,
              CLIENT_ORIGIN: origins.client,
              STAFF_ORIGIN: origins.staff,
            },
            encoding: "utf8",
          },
        ),
      ) as {
        clientToken: string;
        clientId: string;
        caseId: string;
        appointmentId: string;
        listingReference: string;
        creatorToken: string;
        transfer: { nonce: string; target: string };
      };
      await context.addCookies([
        {
          name: "msr_client_session",
          value: f.clientToken,
          url: origins.client,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const c = caseCopy("bg"),
        client = clientWorkflowCopy("bg"),
        body = "Synthetic mixed text: София / שלום, MS-12345.";
      await page.goto(hostUrl("client", `/bg/messages/${f.caseId}`));
      await page.getByLabel(c.message, { exact: true }).fill(body);
      await page.getByRole("button", { name: c.post, exact: true }).click();
      await expect(page).toHaveURL((url) => url.pathname === `/bg/messages/${f.caseId}`);
      await expect(page.getByText(body, { exact: true })).toHaveCount(1);
      await expect(page.getByText(body, { exact: true })).toHaveAttribute("dir", "auto");
      await expect(page.getByLabel(c.message, { exact: true })).toHaveValue("");
      await page.goto(hostUrl("client", `/bg/appointments/${f.appointmentId}`));
      await page.getByRole("button", { name: client.acceptSlot, exact: true }).click();
      await expect(page.getByRole("heading", { name: c.saved, exact: true })).toBeVisible();
      await page.getByRole("link", { name: c.back, exact: true }).click();
      await expect(page.getByText(client.slotAccepted, { exact: true })).toBeVisible();
      const [appointment] =
        await sql`select state,confirmed_starts_at from appointments where id=${f.appointmentId}`;
      expect(appointment?.state).toBe("proposed");
      expect(appointment?.confirmed_starts_at).toBeNull();
      expect(
        Number(
          (
            await sql`select count(*) as n from appointment_resources where appointment_id=${f.appointmentId}`
          )[0]?.n,
        ),
      ).toBe(0);
      await page.screenshot({
        path: info.outputPath(`participant-acceptance-held-${javaScriptEnabled}.png`),
        fullPage: true,
      });
      // Two actual origins exercise the protocol seam. Public product wiring is verified by the discovery successor.
      await context.clearCookies();
      await page.goto(hostUrl("public", "/bg/saved"));
      await page.evaluate(({ nonce, target }) => {
        const form = document.createElement("form");
        form.method = "post";
        form.action = target;
        for (const [name, value] of Object.entries({ nonce, target })) {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = name;
          input.value = value;
          form.append(input);
        }
        const button = document.createElement("button");
        button.textContent = "Continue synthetic transfer";
        button.type = "submit";
        form.append(button);
        document.body.append(form);
      }, f.transfer);
      await page.getByRole("button", { name: "Continue synthetic transfer", exact: true }).click();
      await expect(page).toHaveURL(/\/bg\/access\?returnTo=/);
      expect(page.url()).not.toContain(f.transfer.nonce);
      await context.addCookies([
        {
          name: "msr_client_session",
          value: f.clientToken,
          url: origins.client,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      await page.goto(hostUrl("client", "/bg/saved/import"));
      const saves = accountSavesCopy("bg");
      await expect(page.getByText(f.listingReference, { exact: true })).toBeVisible();
      await page.getByRole("button", { name: saves.confirm, exact: true }).click();
      await expect(page.getByText(saves.complete, { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByText(saves.complete, { exact: true })).toBeVisible();
      expect(
        Number(
          (
            await sql`select count(*) as n from personal_saved_listings where principal_id=${f.clientId}`
          )[0]?.n,
        ),
      ).toBe(1);
      expect(page.url()).not.toContain(f.transfer.nonce);
    });
  });
