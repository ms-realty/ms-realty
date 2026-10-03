// One app, three hosts (architecture §11.1, §8.1; ux-spec §03.1): each host serves only its
// own route tree, a route of one host is a 404 on the others, and the locale sets lang/dir.
// Pages are opened in the browser: Chromium resolves *.localhost itself on every platform.
import { expect, test } from "@playwright/test";
import { hostUrl, origins } from "./hosts";

test.describe("each host serves its own routes (§11.1)", () => {
  for (const { context, path, heading } of [
    { context: "public", path: "/bg", heading: "MS Realty" },
    { context: "client", path: "/bg/access", heading: "Вход към „Моят път“" },
    { context: "staff", path: "/bg/today", heading: "Днес" },
    { context: "staff", path: "/en/access", heading: "Staff sign-in" },
  ] as const) {
    test(`${context} ${path} renders its screen`, async ({ page }) => {
      const response = await page.goto(hostUrl(context, path));
      expect(response?.status()).toBe(200);
      expect(response?.request().redirectedFrom()).toBeNull();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      expect(response?.headers()["content-security-policy"]).toMatch(/'nonce-[^']+'/);
      if (context !== "public") {
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      }
    });
  }

  test.describe("with a Hebrew browser", () => {
    test.use({ locale: "he-IL" });

    test("/ opens each host's home in a locale that host offers", async ({ page }) => {
      await page.goto(hostUrl("public", "/"));
      expect(page.url()).toBe(hostUrl("public", "/he"));
      await page.goto(hostUrl("client", "/"));
      expect(page.url()).toBe(hostUrl("client", "/he/access"));
      // Staff interface languages are BG/EN/RU; the browser's Hebrew is not one of them.
      await page.goto(hostUrl("staff", "/"));
      expect(page.url()).toBe(hostUrl("staff", "/bg/today"));
      await page.goto(hostUrl("staff", "/ru"));
      expect(page.url()).toBe(hostUrl("staff", "/ru/today"));
    });
  });

  test("the workspace links only routes that exist and marks the current one", async ({ page }) => {
    await page.goto(hostUrl("staff", "/bg/today"));
    const today = page.getByRole("link", { name: "Днес" }).filter({ visible: true }).first();
    await expect(today).toHaveAttribute("aria-current", "page");
    await expect(today).toHaveAttribute("href", "/bg/today");
    const hrefs = await page
      .locator("nav a[href]")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of new Set(hrefs)) {
      const response = await page.goto(hostUrl("staff", href ?? ""));
      expect(response?.status(), href ?? "").toBe(200);
    }
  });
});

test.describe("cross-host isolation (§11.1, §8.1)", () => {
  // Paths only one host serves. `/{locale}/access` exists on both private hosts, as two
  // different screens (see below).
  const routes = [
    { owner: "public", path: "/bg/design" },
    { owner: "public", path: "/api/inquiries" },
    { owner: "staff", path: "/bg/today" },
  ] as const;

  for (const context of ["public", "client", "staff"] as const) {
    test(`${context} host answers 404 for other hosts' routes and internal paths`, async ({
      page,
    }) => {
      for (const { owner, path } of routes) {
        if (owner === context) continue;
        const response = await page.goto(hostUrl(context, path));
        expect(response?.status(), `${context} ${path}`).toBe(404);
      }
      for (const path of ["/public/bg", "/client/bg/access", "/staff/bg/today", "/_not-found"]) {
        const response = await page.goto(hostUrl(context, path));
        expect(response?.status(), `${context} ${path}`).toBe(404);
      }
    });
  }

  test("a path both private hosts serve opens each host's own screen", async ({ page }) => {
    await page.goto(hostUrl("client", "/bg/access"));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Вход към „Моят път“");
    await page.goto(hostUrl("staff", "/bg/access"));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Вход за служители");
    const response = await page.goto(hostUrl("public", "/bg/access"));
    expect(response?.status()).toBe(404);
  });

  test("a staff route's 404 on the public host renders the public shell", async ({ page }) => {
    const response = await page.goto(hostUrl("public", "/en/today"));
    expect(response?.status()).toBe(404);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
    await expect(page.getByRole("link", { name: "Go to the home page" })).toHaveAttribute(
      "href",
      "/en",
    );
  });

  test("a locale choice stays on the host where it was made", async ({ page, context }) => {
    await page.goto(hostUrl("public", "/bg"));
    await page.getByRole("button", { name: /Език/ }).click();
    await page.getByRole("link", { name: "English", exact: true }).click();
    await expect(page).toHaveURL(hostUrl("public", "/en"));
    const choice = (await context.cookies(origins.public)).find(
      (cookie) => cookie.name === "NEXT_LOCALE",
    );
    // Host-only (no Domain attribute, so no leading dot): neither private host receives it.
    expect(choice).toMatchObject({ value: "en", domain: "localhost", httpOnly: true });
    for (const host of ["client", "staff"] as const) {
      const response = await page.goto(hostUrl(host, "/en/access"));
      const headers = await response?.request().allHeaders();
      expect(headers?.cookie ?? "", host).not.toContain("NEXT_LOCALE");
    }
  });
});

test.describe("lang and dir follow the URL locale on every host (§03.1)", () => {
  for (const { context, path, lang, dir } of [
    { context: "public", path: "/he", lang: "he", dir: "rtl" },
    { context: "public", path: "/el", lang: "el", dir: "ltr" },
    { context: "client", path: "/he/access", lang: "he", dir: "rtl" },
    { context: "client", path: "/de/access", lang: "de", dir: "ltr" },
    { context: "staff", path: "/ru/today", lang: "ru", dir: "ltr" },
    { context: "staff", path: "/en/access", lang: "en", dir: "ltr" },
  ] as const) {
    test(`${context} ${path} is lang=${lang} dir=${dir}`, async ({ page }) => {
      const response = await page.goto(hostUrl(context, path));
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(page.locator("html")).toHaveAttribute("dir", dir);
    });
  }

  test("staff routes do not exist in public-only locales", async ({ page }) => {
    for (const locale of ["de", "nl", "el", "he"]) {
      const response = await page.goto(hostUrl("staff", `/${locale}/today`));
      expect(response?.status(), locale).toBe(404);
      await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    }
  });
});

test.describe("unknown query parameters never error (§03.3)", () => {
  const query = "?utm_source=x&gclid=abc&unknown=1&empty=&repeat=1&repeat=2&odd=%ZZ";

  for (const { context, path } of [
    { context: "public", path: "/bg" },
    { context: "public", path: "/" },
    { context: "client", path: "/en/access" },
    { context: "client", path: "/" },
    { context: "staff", path: "/bg/today" },
    { context: "staff", path: "/ru/access" },
  ] as const) {
    test(`${context} ${path} keeps working with unknown parameters`, async ({ page }) => {
      const response = await page.goto(hostUrl(context, `${path}${query}`));
      expect(response?.status()).toBe(200);
      expect(new URL(page.url()).searchParams.get("unknown")).toBe("1");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  }
});
