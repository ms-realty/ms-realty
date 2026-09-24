// Locale routing and the three surface shells (spec §06, §18.2, §20.1, §20.4; F01, A01, A02;
// plan AD9, AD15). The chromium-mobile and chromium-desktop projects run every test.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const wcag22aa = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const publicLocales = [
  { locale: "bg", dir: "ltr", skip: "Към основното съдържание" },
  { locale: "en", dir: "ltr", skip: "Skip to main content" },
  { locale: "ru", dir: "ltr", skip: "Перейти к основному содержанию" },
  { locale: "de", dir: "ltr", skip: "Zum Hauptinhalt springen" },
  { locale: "nl", dir: "ltr", skip: "Naar de hoofdinhoud" },
  { locale: "el", dir: "ltr", skip: "Μετάβαση στο κύριο περιεχόμενο" },
  { locale: "he", dir: "rtl", skip: "דילוג לתוכן הראשי" },
] as const;

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(wcag22aa).analyze();
  const violations = results.violations.map((violation) => ({
    id: violation.id,
    nodes: violation.nodes.map((node) => node.target.join(" ")),
  }));
  expect(violations).toEqual([]);
}

test.describe("public locales (§18.2)", () => {
  for (const { locale, dir, skip } of publicLocales) {
    test(`${locale} renders with lang=${locale} dir=${dir} and the shell landmarks`, async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);
      const response = await page.goto(`/${locale}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute("dir", dir);
      expect(await page.evaluate(() => getComputedStyle(document.body).direction)).toBe(dir);

      await expect(page.getByRole("banner")).toBeVisible();
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.getByRole("contentinfo")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("link", { name: skip })).toHaveCount(1);

      // The brand phone is a call link in the footer.
      const call = page.getByRole("contentinfo").locator('a[href="tel:+359879696870"]');
      await expect(call).toBeVisible();
      await expect(call).toContainText("+359 879 696 870");

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });
  }

  test("he sets Hebrew in Noto Sans Hebrew, not the Latin fallback face", async ({ page }) => {
    await page.goto("/he");
    const family = await page
      .getByRole("heading", { level: 1 })
      .evaluate((element) => getComputedStyle(element).fontFamily);
    expect(family.split(",")[0]).toContain("Noto Sans Hebrew");
  });

  test("he isolates the left-to-right phone number inside right-to-left text", async ({ page }) => {
    await page.goto("/he");
    const number = page.getByRole("banner").locator('a[href^="tel:"] bdi[dir="ltr"]');
    if (await number.isVisible()) await expect(number).toHaveText("+359 879 696 870");
    const footerCall = page.getByRole("contentinfo").locator('a[href^="tel:"]');
    // U+2066 LEFT-TO-RIGHT ISOLATE ... U+2069 POP DIRECTIONAL ISOLATE around the number.
    expect(await footerCall.textContent()).toContain("\u2066+359 879 696 870\u2069");
  });
});

// Browser language preferences come from each context's locale (its Accept-Language).
test.describe("locale negotiation suggests and never forces (F01, A02)", () => {
  test.describe("with a Bulgarian browser", () => {
    test.use({ locale: "bg-BG" });

    test("an explicit /en is not redirected; the suggestion is dismissible", async ({ page }) => {
      const response = await page.goto("/en");
      expect(response?.status()).toBe(200);
      expect(response?.request().redirectedFrom()).toBeNull();
      expect(new URL(page.url()).pathname).toBe("/en");
      await expect(page.locator("html")).toHaveAttribute("lang", "en");

      const suggestion = page.getByRole("region", { name: "Предложение за език" });
      await expect(suggestion).toBeVisible();
      await expect(suggestion).toHaveAttribute("lang", "bg");
      await expect(
        suggestion.getByRole("link", { name: "Продължете на български" }),
      ).toHaveAttribute("href", "/bg");
      await expectNoAxeViolations(page);

      await suggestion.getByRole("button", { name: "Скрийте предложението" }).focus();
      await page.keyboard.press("Enter");
      await expect(suggestion).toHaveCount(0);
      // Keyboard users keep their place (WCAG 2.4.3): focus moves to the main content.
      await expect(page.getByRole("main")).toBeFocused();
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.getByRole("region", { name: "Предложение за език" })).toHaveCount(0);
    });

    test("choosing a language is remembered for / and silences the suggestion", async ({
      page,
    }) => {
      await page.goto("/bg");
      await expect(page.getByRole("region", { name: "Предложение за език" })).toHaveCount(0);
      await page.getByRole("button", { name: /Език/ }).click();
      await page.getByRole("link", { name: "English", exact: true }).click();
      await expect(page).toHaveURL(/\/en$/);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.getByRole("region", { name: "Предложение за език" })).toHaveCount(0);

      await page.goto("/");
      expect(new URL(page.url()).pathname).toBe("/en");
    });
  });

  test.describe("with a Hebrew browser", () => {
    test.use({ locale: "he-IL" });

    test("a deep link in another locale is served as requested", async ({ page }) => {
      const response = await page.goto("/de");
      expect(response?.request().redirectedFrom()).toBeNull();
      await expect(page.locator("html")).toHaveAttribute("lang", "de");
      const suggestion = page.getByRole("region", { name: "הצעת שפה" });
      await expect(suggestion).toBeVisible();
      await expect(suggestion).toHaveAttribute("dir", "rtl");
    });
  });

  test.describe("with a Dutch browser", () => {
    test.use({ locale: "nl-BE" });

    test("/ opens the browser's language", async ({ page }) => {
      const response = await page.goto("/");
      expect(response?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe("/nl");
    });
  });

  test.describe("with a browser in an unsupported language", () => {
    test.use({ locale: "fr-FR" });

    test("/ opens the Bulgarian source locale and nothing is suggested", async ({ page }) => {
      await page.goto("/");
      expect(new URL(page.url()).pathname).toBe("/bg");
      await expect(page.getByRole("region")).toHaveCount(0);
    });
  });

  test("switching language keeps the query and the fragment", async ({ page }) => {
    await page.goto("/bg?utm_source=x#contact");
    await page.getByRole("button", { name: /Език/ }).click();
    await expect(page.getByRole("link", { name: "English", exact: true })).toHaveAttribute(
      "href",
      "/en?utm_source=x#contact",
    );
  });

  test("tracking parameters never produce an error page", async ({ page }) => {
    const response = await page.goto("/?utm_source=x");
    expect(response?.status()).toBe(200);
    const url = new URL(page.url());
    expect(url.pathname).toMatch(/^\/(bg|en|ru|de|nl|el|he)$/);
    expect(url.searchParams.get("utm_source")).toBe("x");

    const tagged = await page.goto(
      "/bg?utm_source=newsletter&utm_medium=email&gclid=abc&fbclid=def&ref=partner&unknown=1",
    );
    expect(tagged?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "bg");
  });
});

test.describe("keyboard and accessibility (§20.1)", () => {
  test("the skip link is the first stop and moves focus to main", async ({ page }) => {
    await page.goto("/bg");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Към основното съдържание" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
  });

  for (const path of ["/bg", "/he", "/en/no-such-page", "/workspace"]) {
    test(`${path} has no WCAG 2.2 AA violations`, async ({ page }) => {
      await page.goto(path);
      await expectNoAxeViolations(page);
    });
  }

  test("the language list opens, names the current language and closes with Escape", async ({
    page,
  }) => {
    await page.goto("/he");
    const trigger = page.getByRole("button", { name: /שפה/ });
    await trigger.click();
    const current = page.getByRole("link", { name: "עברית" });
    await expect(current).toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("link", { name: "English", exact: true })).toHaveAttribute(
      "href",
      "/en",
    );
    await expectNoAxeViolations(page);
    await page.keyboard.press("Escape");
    await expect(current).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

test.describe("not found (§17.1)", () => {
  test("an unknown page under a locale answers 404 in that language inside the shell", async ({
    page,
  }) => {
    const response = await page.goto("/en/no-such-page");
    expect(response?.status()).toBe(404);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to the home page" })).toHaveAttribute(
      "href",
      "/en",
    );
  });

  test.describe("with a Russian browser", () => {
    test.use({ locale: "ru-RU" });

    test("an unknown path outside any locale answers 404 in the negotiated language", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);
      const response = await page.goto("/no-such-page");
      expect(response?.status()).toBe(404);
      await expect(page.locator("html")).toHaveAttribute("lang", "ru");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Страница не найдена");
      // Rendered dynamically, so its scripts carry the CSP nonce.
      expect(response?.headers()["content-security-policy"]).toMatch(/'nonce-[^']+'/);
      expect(errors.filter((error) => !error.includes("404"))).toEqual([]);
    });
  });
});

test.describe("not found without JavaScript (§17.1, WCAG 3.1.1)", () => {
  test.use({ javaScriptEnabled: false, locale: "ru-RU" });

  for (const { path, lang, dir, heading, title } of [
    {
      path: "/en/no-such-page",
      lang: "en",
      dir: "ltr",
      heading: "Page not found",
      title: "Page not found",
    },
    {
      path: "/he/no-such-page",
      lang: "he",
      dir: "rtl",
      heading: "הדף לא נמצא",
      title: "הדף לא נמצא",
    },
    {
      path: "/no-such-page",
      lang: "ru",
      dir: "ltr",
      heading: "Страница не найдена",
      title: "Страница не найдена",
    },
    {
      path: "/workspace/nope",
      lang: "bg",
      dir: "ltr",
      heading: "Страницата не е намерена",
      title: "Страницата не е намерена",
    },
  ]) {
    test(`${path} is a complete server-rendered 404 document`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(page.locator("html")).toHaveAttribute("dir", dir);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page).toHaveTitle(title);
      await expect(page.getByRole("banner")).toBeVisible();
    });
  }
});

test.describe("crawl policy (§20.4)", () => {
  test("a non-canonical host is noindex everywhere and disallows all crawling", async ({
    page,
    request,
  }) => {
    await page.goto("/bg");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);

    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    const body = await robots.text();
    expect(body).toMatch(/User-Agent: \*/i);
    expect(body).toMatch(/Disallow: \/\s*$/m);

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).not.toContain("<url>");
  });
});

test.describe("workspace shell (§06.3)", () => {
  // The browser prefers English; the workspace still follows the staff preference.
  test("uses the staff language from the preference cookie, never the URL", async ({ page }) => {
    let response = await page.goto("/workspace");
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/workspace");
    await expect(page.locator("html")).toHaveAttribute("lang", "bg");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.getByRole("link", { name: "Днес" })).toHaveAttribute("aria-current", "page");

    await page.context().addCookies([{ name: "staff_locale", value: "ru", url: page.url() }]);
    response = await page.goto("/workspace");
    expect(new URL(page.url()).pathname).toBe("/workspace");
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Сегодня");
  });

  test("changing the interface language keeps the address", async ({ page }) => {
    await page.goto("/workspace");
    const more = page.getByRole("button", { name: "Още" });
    if (await more.isVisible()) await more.click();
    const form = page.locator("form:visible");
    await form.getByRole("button", { name: /Език на интерфейса/ }).click();
    await page.getByRole("option", { name: "English" }).click();
    await form.getByRole("button", { name: "Приложи" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today");
    expect(new URL(page.url()).pathname).toBe("/workspace");
  });
});
