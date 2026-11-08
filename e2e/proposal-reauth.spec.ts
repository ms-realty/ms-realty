import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { proposalReauthCopy } from "../src/features/proposals/reauth-copy";
import { hostUrl, origins } from "./hosts";

test.use({ trace: "off" });
const copy = proposalReauthCopy("en");
const safeUrl = (value: string) => {
  const url = new URL(value);
  for (const key of ["token", "key", "operationId"])
    if (url.searchParams.has(key)) url.searchParams.set(key, "REDACTED");
  return url.toString();
};
for (const javaScriptEnabled of [true, false]) {
  test.describe(javaScriptEnabled ? "hydrated" : "native HTML", () => {
    test.use({ javaScriptEnabled });
    test("R09 / C10 preserves an explicit response draft through email confirmation with no replay", async ({
      page,
      context,
    }, info) => {
      const databaseUrl = process.env.E2E_DATABASE_URL;
      if (!databaseUrl) throw new Error("Missing disposable database");
      const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
      const receipt: { steps: unknown[]; requests: unknown[] } = { steps: [], requests: [] };
      page.on("request", (request) => {
        if (request.isNavigationRequest() || request.method() === "POST")
          receipt.requests.push({
            method: request.method(),
            type: request.resourceType(),
            url: safeUrl(request.url()),
          });
      });
      try {
        const f = JSON.parse(
          execFileSync(
            process.execPath,
            [
              "--conditions=react-server",
              "--import",
              "tsx",
              "src/server/reauth-drafts/browser-seed.ts",
            ],
            {
              env: {
                ...process.env,
                AUTH_SECRET: process.env.E2E_AUTH_SECRET,
                DATABASE_URL: databaseUrl,
              },
              encoding: "utf8",
            },
          ),
        ) as {
          proposalId: string;
          revisionId: string;
          clientId: string;
          sessionId: string;
          clientToken: string;
          email: string;
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
        const target = hostUrl("client", `/en/proposals/${f.proposalId}`);
        const effects = async () =>
          (
            await sql`select (select count(*)::int from proposal_responses where revision_id=${f.revisionId}) responses, (select count(*)::int from operations where actor_id=${f.clientId} and operation_type='proposal.decide') operations`
          )[0];
        await page.goto(target);
        const form = page.locator("form").filter({ has: page.locator('[name="state"]') });
        const snapshot = async (): Promise<Record<string, string>> => {
          const values = await form.evaluate((element) => {
            const form = element as HTMLFormElement;
            return Object.fromEntries(
              ["state", "reason", "revisionId", "_expectedRevision", "_operationId"].map((name) => [
                name,
                (form.elements.namedItem(name) as HTMLInputElement)?.value ?? "",
              ]),
            );
          });
          const operationIdHash = createHash("sha256")
            .update(values._operationId ?? "")
            .digest("hex");
          delete values._operationId;
          return { ...values, operationIdHash };
        };
        const draft =
          "  Synthetic R09 draft: please clarify access arrangements.\nKeep this exact spacing.  ";
        await form.getByLabel("Your response", { exact: true }).selectOption("declined");
        await form.getByLabel("Reason or response note", { exact: true }).fill(draft);
        await sql`update sessions set reverified_at=now()-interval '16 minutes' where id=${f.sessionId}`;
        const initial = await snapshot();
        await form.getByRole("button", { name: "Record my response", exact: true }).click();
        await expect(form.getByText(copy.notice, { exact: true })).toBeVisible();
        expect(await snapshot()).toEqual(initial);
        expect(await effects()).toEqual({ responses: 0, operations: 0 });
        const [unsaved] =
          await sql`select count(*)::int count from reauth_drafts where principal_id=${f.clientId}`;
        expect(unsaved?.count).toBe(0);
        await page.screenshot({ path: info.outputPath("01-local-response.png"), fullPage: true });
        await form.getByRole("button", { name: copy.save, exact: true }).click();
        await expect(page).toHaveURL((url) => url.pathname === "/en/access/reauth");
        const savedCookies = (await context.cookies()).filter((cookie) =>
          cookie.name.startsWith("msr_client_proposal_draft_"),
        );
        expect(savedCookies).toHaveLength(1);
        expect(savedCookies[0]).toMatchObject({
          httpOnly: true,
          sameSite: "Lax",
          path: "/",
          domain: "my.localhost",
        });
        receipt.steps.push({
          stage: "explicit_save",
          effects: await effects(),
          cookie: {
            httpOnly: savedCookies[0]?.httpOnly,
            sameSite: savedCookies[0]?.sameSite,
            domain: savedCookies[0]?.domain,
          },
          url: page.url(),
        });
        // Cancelling before requesting email retains a pending draft and offers a manual return.
        await page.goto(target);
        await expect(page.getByText(copy.pending, { exact: true })).toBeVisible();
        await page.locator('a[href*="/access/reauth?"]').click();
        const denied = await context.request.post(hostUrl("client", "/en/access/reauth/request"), {
          headers: { origin: "https://unrelated.example.test" },
          form: { returnTo: `/en/proposals/${f.proposalId}` },
          maxRedirects: 0,
        });
        expect(denied.status()).toBe(403);
        await page.getByRole("button", { name: "Email me a sign-in link", exact: true }).click();
        await expect(
          page.getByRole("heading", { name: "Check your email", exact: true }),
        ).toBeVisible();
        let authUrl = "";
        await expect
          .poll(
            async () => {
              const response = await context.request.get(hostUrl("public", "/api/test-outbox"), {
                headers: { host: new URL(origins.client).host },
              });
              if (response.status() !== 200) return false;
              const body = await response.json();
              const message = body.messages.find(
                (item: { recipient: string; template: string }) =>
                  item.recipient === f.email && item.template === "auth.email_link",
              );
              authUrl = message?.secretParams?.url ?? message?.params?.url ?? "";
              return Boolean(authUrl);
            },
            { timeout: 30_000 },
          )
          .toBe(true);
        await page.goto(authUrl);
        expect(await effects()).toEqual({ responses: 0, operations: 0 });
        await page.getByRole("button", { name: "Sign in", exact: true }).click();
        await expect(page).toHaveURL(target);
        await expect(form.getByLabel("Reason or response note", { exact: true })).toHaveValue(
          draft,
        );
        await expect(form.getByLabel("Your response", { exact: true })).toHaveValue("declined");
        await expect(page.getByText(copy.restored, { exact: true })).toBeVisible();
        const returned = await snapshot();
        expect(returned.operationIdHash).not.toBe(initial.operationIdHash);
        expect(returned.revisionId).toBe(initial.revisionId);
        expect(returned._expectedRevision).toBe(initial._expectedRevision);
        expect(await effects()).toEqual({ responses: 0, operations: 0 });
        const storageKeys = await page.evaluate(() => ({
          local: Object.keys(localStorage),
          session: Object.keys(sessionStorage),
        }));
        expect(storageKeys).toEqual({ local: [], session: [] });
        receipt.steps.push({
          stage: "authenticated_return",
          returned,
          effects: await effects(),
          storageKeys,
        });
        await page.screenshot({
          path: info.outputPath("02-restored-response.png"),
          fullPage: true,
        });
        await form.getByRole("button", { name: "Record my response", exact: true }).click();
        await expect(
          page.getByRole("heading", { name: "Change recorded", exact: true }),
        ).toBeVisible();
        expect(await effects()).toEqual({ responses: 1, operations: 1 });
        const [remaining] =
          await sql`select count(*)::int count from reauth_drafts where principal_id=${f.clientId}`;
        expect(remaining?.count).toBe(0);
        receipt.steps.push({
          stage: "explicit_submission",
          effects: await effects(),
          savedDrafts: remaining?.count,
        });
        await page.screenshot({
          path: info.outputPath("03-explicit-submission.png"),
          fullPage: true,
        });
      } finally {
        await writeFile(
          info.outputPath("behavior-receipt.json"),
          `${JSON.stringify(receipt, null, 2)}\n`,
        );
        await sql.end();
      }
    });
  });
}
