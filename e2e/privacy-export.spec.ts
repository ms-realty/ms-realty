// C18/O26 · AT43/AT45/UX23. Native/enhanced frozen review, RTL download and revocation.
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { privacyExportCategories } from "../src/domain/privacy-export";
import { privacyExportCopy } from "../src/features/privacy/export-copy";
import { hostUrl, origins } from "./hosts";

for (const javascript of [false, true])
  test(`AT45 private partial dossier ${javascript ? "enhanced" : "native"}`, async ({
    browser,
  }, testInfo) => {
    const fixture = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "src/server/privacy/export-browser-seed.ts",
        ],
        { env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET }, encoding: "utf8" },
      ),
    ) as { staffToken: string; clientToken: string; requestId: string; messageId: string };
    const context = await browser.newContext({
      ...testInfo.project.use,
      javaScriptEnabled: javascript,
    });
    try {
      await context.addCookies([
        {
          name: "msr_staff_session",
          value: fixture.staffToken,
          url: origins.staff,
          httpOnly: true,
          sameSite: "Lax",
        },
        {
          name: "msr_client_session",
          value: fixture.clientToken,
          url: origins.client,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const page = await context.newPage(),
        c = privacyExportCopy("en");
      await page.goto(hostUrl("staff", `/en/operations/privacy/${fixture.requestId}/export`));
      await expect(page.getByRole("heading", { name: c.title })).toBeVisible();
      await page.getByLabel(c.confirm, { exact: true }).check();
      await page.getByRole("button", { name: c.prepare, exact: true }).click();
      await expect(page.getByRole("heading", { name: c.draft, exact: true })).toBeVisible();
      await expect(
        page.getByText("Synthetic own message selected for redaction", { exact: true }),
      ).toBeVisible();
      await page.locator(`input[name="omitText"][value="messages:${fixture.messageId}"]`).check();
      if (javascript) expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expect(page.locator("body")).not.toContainText("OTHER-PARTY-PRIVATE-CANARY");
      await page.getByRole("button", { name: c.redact, exact: true }).click();
      await expect(
        page.locator(`input[name="omitText"][value="messages:${fixture.messageId}"]`),
      ).toBeDisabled();
      await expect(
        page.getByText("Synthetic own message selected for redaction", { exact: true }),
      ).toHaveCount(0);
      await page.getByLabel(c.reviewed, { exact: true }).check();
      await page.getByLabel(c.acknowledge, { exact: true }).check();
      await page.getByRole("button", { name: c.issue, exact: true }).click();
      await expect(page.getByRole("heading", { name: c.issued, exact: true })).toBeVisible();
      const client = await context.newPage();
      await client.goto(hostUrl("client", "/he/privacy"));
      await expect(client.locator("html")).toHaveAttribute("dir", "rtl");
      const link = client.getByRole("link", {
        name: privacyExportCopy("he").download,
        exact: true,
      });
      await expect(link).toBeVisible();
      const href = await link.getAttribute("href");
      const downloading = client.waitForEvent("download");
      await link.click();
      const download = await downloading;
      const local = await download.path();
      if (!local) throw new Error("Missing synthetic download");
      const dossier = JSON.parse(await readFile(local, "utf8"));
      expect(dossier.fulfilment).toBe("partial");
      expect(dossier.data.messages[0].text).toContain("[redacted");
      expect(JSON.stringify(dossier)).not.toContain("OTHER-PARTY-PRIVATE-CANARY");
      const range = await context.request.get(hostUrl("client", href ?? ""), {
        headers: { range: "bytes=0-9" },
      });
      expect(range.status()).toBe(206);
      expect(range.headers()["cache-control"]).toBe("private, no-store");
      await page.getByLabel(c.revokeConfirm, { exact: true }).check();
      await page.getByRole("button", { name: c.revoke, exact: true }).click();
      expect(
        (
          await context.request.get(hostUrl("client", href ?? ""), {
            headers: { range: "bytes=0-0" },
          })
        ).status(),
      ).toBe(404);
      await client.setViewportSize({ width: 320, height: 740 });
      await client.reload();
      await expect(
        client.getByRole("link", { name: privacyExportCopy("he").download, exact: true }),
      ).toHaveCount(0);
      expect(
        await client.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
    } finally {
      await context.close();
    }
  });

for (const javascript of [false, true])
  test(`AT45 controlled declared-scope completion ${javascript ? "enhanced" : "native"}`, async ({
    browser,
  }, testInfo) => {
    const fixture = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "src/server/privacy/export-browser-seed.ts",
        ],
        {
          env: {
            ...process.env,
            AUTH_SECRET: process.env.E2E_AUTH_SECRET,
            E2E_PRIVACY_COVERAGE: "1",
          },
          encoding: "utf8",
        },
      ),
    ) as {
      staffToken: string;
      clientToken: string;
      requestId: string;
      exportId: string;
      documentVersionId: string;
    };
    const context = await browser.newContext({
      ...testInfo.project.use,
      javaScriptEnabled: javascript,
    });
    try {
      await context.addCookies([
        {
          name: "msr_staff_session",
          value: fixture.staffToken,
          url: origins.staff,
          httpOnly: true,
          sameSite: "Lax",
        },
        {
          name: "msr_client_session",
          value: fixture.clientToken,
          url: origins.client,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const page = await context.newPage(),
        c = privacyExportCopy("en");
      await page.goto(hostUrl("staff", `/en/operations/privacy/${fixture.requestId}/export`));
      await page.getByRole("button", { name: c.inventory, exact: true }).click();
      await expect(page.locator("[data-export-category]")).toHaveCount(5);
      for (const category of privacyExportCategories) {
        const form = page.locator(`[data-export-category="${category}"]`);
        const sourceCount = await form.locator('input[name="sourceKey"]').count();
        const disposition =
          category === "restricted_material_and_security_credentials"
            ? "withheld"
            : sourceCount
              ? "disclosed"
              : "none";
        await form.locator('select[name="disposition"]').selectOption(disposition);
        await form
          .locator('select[name="basis"]')
          .selectOption(
            disposition === "withheld"
              ? "security_boundary"
              : disposition === "disclosed"
                ? "reviewed_disclosure"
                : "no_sources",
          );
        if (sourceCount && category !== "personal_activity") {
          await form.locator("details > summary").click();
          for (const proof of await form.locator('select[name^="proof:"]').all())
            await proof.selectOption(fixture.documentVersionId);
        }
        await form
          .locator('textarea[name="evidenceReference"]')
          .fill("Synthetic browser review evidence only; never an actual disclosure decision");
        await form.getByLabel(c.decisionConfirm, { exact: true }).check();
        await form.getByRole("button", { name: c.saveDisposition, exact: true }).click();
        await expect(page.getByText(c.saved, { exact: true })).toBeVisible();
      }
      await expect(page.getByRole("button", { name: c.issueReviewed, exact: true })).toBeVisible();
      if (javascript) expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.getByLabel(c.reviewed, { exact: true }).check();
      await page.getByLabel(c.acknowledge, { exact: true }).check();
      await page.getByRole("button", { name: c.issueReviewed, exact: true }).click();
      await page.getByLabel(c.completeConfirm, { exact: true }).check();
      await page.getByRole("button", { name: c.complete, exact: true }).click();
      await expect(page.getByText(c.completedScope, { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: c.complete, exact: true })).toHaveCount(0);
      const client = await context.newPage();
      await client.goto(hostUrl("client", "/he/privacy"));
      await expect(client.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(
        client.getByText(privacyExportCopy("he").reviewedScope, { exact: true }),
      ).toBeVisible();
      const link = client.getByRole("link", {
        name: privacyExportCopy("he").download,
        exact: true,
      });
      const href = await link.getAttribute("href");
      const full = await context.request.get(hostUrl("client", href ?? ""));
      expect(full.status()).toBe(200);
      const dossier = await full.json();
      expect(dossier.fulfilment).toBe("reviewed_scope");
      expect(dossier.coverage).toHaveLength(5);
      expect(JSON.stringify(dossier)).not.toContain("reviewedById");
      const range = await context.request.get(hostUrl("client", href ?? ""), {
        headers: { range: "bytes=0-11" },
      });
      expect(range.status()).toBe(206);
      expect(range.headers()["cache-control"]).toBe("private, no-store");
      await page.getByLabel(c.revokeConfirm, { exact: true }).check();
      await page.getByRole("button", { name: c.revoke, exact: true }).click();
      expect(
        (
          await context.request.get(hostUrl("client", href ?? ""), {
            headers: { range: "bytes=0-0" },
          })
        ).status(),
      ).toBe(404);
      await client.setViewportSize({ width: 320, height: 740 });
      await client.reload();
      await expect(
        client.getByRole("link", { name: privacyExportCopy("he").download, exact: true }),
      ).toHaveCount(0);
      expect(
        await client.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
    } finally {
      await context.close();
    }
  });
