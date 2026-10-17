// Origin-backed no-JS regression for the gateway's bounded Next 404 recovery.
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { type GatewayEnv, gateway } from "../gateway/worker";
import { type HostContext, hostUrl, origins } from "./hosts";

test.use({ javaScriptEnabled: false });

const publicHosts = {
  public: "makler-realty.com",
  client: "my.makler-realty.com",
  staff: "app.makler-realty.com",
} as const;
const env: GatewayEnv = {
  STAGING: "false",
  ORIGIN_URL: "https://origin.invalid",
  ORIGIN_VERIFY_SECRET: randomBytes(32).toString("hex"),
  PUBLIC_ORIGIN: `https://${publicHosts.public}`,
  CLIENT_ORIGIN: `https://${publicHosts.client}`,
  STAFF_ORIGIN: `https://${publicHosts.staff}`,
  LEGACY_ROUTES_JSON: "[]",
  LEGACY_ROUTES_SHA256: createHash("sha256").update("[]").digest("hex"),
};

for (const surface of ["public", "client", "staff"] satisfies HostContext[]) {
  test(`${surface}: a page-thrown missing record returns usable 404 HTML without JavaScript`, async ({
    page,
    context,
  }, info) => {
    if (surface !== "public") {
      const fixture = JSON.parse(
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
      ) as { clientToken: string; staffToken: string };
      await context.addCookies([
        {
          name: `msr_${surface}_session`,
          value: surface === "client" ? fixture.clientToken : fixture.staffToken,
          url: origins[surface],
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
    }
    // The origin performs real record/session/authorization reads. Its completed HTTP
    // response then passes through the production gateway code, with one origin call.
    await page.route("**/*", async (route) => {
      const origin = await route.fetch();
      if (origin.status() !== 404 || !origin.headers()["content-type"]?.startsWith("text/html")) {
        await route.fulfill({ response: origin });
        return;
      }
      const address = new URL(route.request().url());
      const response = await gateway(
        new Request(`https://${publicHosts[surface]}${address.pathname}${address.search}`, {
          headers: route.request().headers(),
        }),
        env,
        async () =>
          new Response(new Uint8Array(await origin.body()), {
            status: origin.status(),
            headers: origin.headers(),
          }),
      );
      const headers = Object.fromEntries(response.headers);
      delete headers["content-encoding"];
      delete headers["content-length"];
      await route.fulfill({
        status: response.status,
        headers,
        body: Buffer.from(await response.arrayBuffer()),
      });
    });
    const path =
      surface === "public"
        ? "/en/properties/MS-999999999999/ms-999999999999"
        : `/en/${surface === "client" ? "overview" : "cases"}/${randomUUID()}`;
    for (const target of [path, "/en/no-such-page"]) {
      const response = await page.goto(hostUrl(surface, target));
      expect(response?.status()).toBe(404);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
      await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Go to the home page", exact: true }),
      ).toBeVisible();
      expect(
        await page
          .locator('meta[name="robots"]')
          .evaluateAll((nodes) =>
            nodes.some((node) => node.getAttribute("content")?.includes("noindex")),
          ),
      ).toBe(true);
      if (target === path) {
        await page.screenshot({
          path: info.outputPath(`${surface}-not-found.png`),
          fullPage: true,
        });
      }
    }
  });
}
