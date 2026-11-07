// Run with playwright.indexability.config.ts. All publication records below are synthetic;
// they do not alter or assert real content, catalogue review or locale indexing approvals.
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

const origin = "https://makler-realty.com";
const locales = ["bg", "en", "ru", "de", "nl", "el", "he"] as const;

test("R09 production crawling exposes noindex on unapproved locales and keeps approved BG discoverable", async ({
  page,
  request,
}) => {
  for (const locale of locales) {
    expect((await page.goto(`/${locale}`))?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      locale === "bg" ? "index, follow" : "noindex, follow",
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${origin}/${locale}`,
    );
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(2);
    for (const language of ["bg", "x-default"])
      await expect(page.locator(`link[rel="alternate"][hreflang="${language}"]`)).toHaveAttribute(
        "href",
        `${origin}/bg`,
      );
  }
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const policy = await robots.text();
  expect(policy).toMatch(/^Allow: \/$/m);
  expect(policy).toMatch(/^Disallow: \/api\/$/m);
  expect(policy).not.toMatch(/^Disallow: \/$/m);
  expect(policy).toContain(`Sitemap: ${origin}/sitemap.xml`);

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain(`<loc>${origin}/bg</loc>`);
  for (const locale of locales.filter((locale) => locale !== "bg")) {
    expect(xml).not.toContain(`${origin}/${locale}`);
    expect(xml).not.toContain(`hreflang="${locale}"`);
  }
  expect(xml).not.toContain("/legacy/");
});

test("AT27 rendered listing metadata and sitemap exclude unavailable and fallback editions", async ({
  page,
  request,
}) => {
  const url = process.env.E2E_DATABASE_URL;
  if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
    throw new Error("Indexability fixtures require the disposable E2E database.");
  const data = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "src/features/discovery/testing/seed.ts",
        "create",
      ],
      {
        encoding: "utf8",
        env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET, DATABASE_URL: url },
      },
    ),
  ) as {
    published: { reference: string; title: string };
    restricted: { reference: string };
    withdrawn: { reference: string };
  };
  const path = (locale: string, reference: string) =>
    `/${locale}/properties/${reference}/${reference.toLowerCase()}`;
  for (const item of [
    { locale: "bg", reference: data.published.reference, indexable: true },
    { locale: "en", reference: data.published.reference, indexable: false },
    { locale: "ru", reference: data.published.reference, indexable: false },
    { locale: "bg", reference: data.restricted.reference, indexable: false },
    { locale: "bg", reference: data.withdrawn.reference, indexable: false },
  ]) {
    const route = path(item.locale, item.reference);
    expect((await page.goto(route))?.status()).toBe(200);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${origin}${route}`,
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      item.indexable ? "index, follow" : "noindex, follow",
    );
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(
      item.indexable ? 2 : 0,
    );
    if (item.indexable)
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(data.published.title);
  }
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain(`<loc>${origin}${path("bg", data.published.reference)}</loc>`);
  for (const locale of ["en", "ru"])
    expect(xml).not.toContain(`${origin}${path(locale, data.published.reference)}`);
  expect(xml).not.toContain(data.restricted.reference);
  expect(xml).not.toContain(data.withdrawn.reference);
});

test("R09 retains pending legacy source pages and missing CMS recovery without index claims", async ({
  page,
}) => {
  for (const route of [
    "/bg/legacy/49bedd92a43a06d767046abe",
    "/ru/legacy/0442585901845f0312ec1ad0",
    "/bg/help/synthetic-missing-indexability-edition",
  ]) {
    expect((await page.goto(route))?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${origin}${route}`,
    );
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
    if (route.includes("/legacy/")) {
      await expect(page.locator("article[data-legacy-source-hash]")).toHaveAttribute(
        "data-legacy-source-hash",
        /^[a-f0-9]{64}$/,
      );
      await expect(page.locator("article h1")).toBeVisible();
    }
  }
});

test("R09/AT27 CMS native entries follow current approvals and generic services follow their visible body guard", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const nativePaths = ["/contact", "/sell", "/let"];
  const allPaths = [...nativePaths, "/help/contact", "/services/sell", "/services/let"];
  for (const path of allPaths) {
    expect((await page.goto(`/bg${path}`))?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${origin}/bg${path}`,
    );
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
  }
  const missingXml = await (await request.get("/sitemap.xml")).text();
  for (const path of allPaths) expect(missingXml).not.toContain(`<loc>${origin}/bg${path}</loc>`);

  const seed = (...args: string[]) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "src/server/seo/testing/cms-fixture.ts",
          ...args,
        ],
        {
          encoding: "utf8",
          env: { ...process.env, AUTH_SECRET: process.env.E2E_AUTH_SECRET },
        },
      ),
    );
  type Edition = {
    path: string;
    content: { title: string; paragraphs: string[]; version: { id: string } };
  };
  const fixture = seed() as { native: Edition[]; generic: Edition };
  const approved = [...fixture.native, fixture.generic];
  const approvedXml = await (await request.get("/sitemap.xml")).text();
  for (const edition of approved) {
    expect((await page.goto(`/bg${edition.path}`))?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(edition.content.title);
    await expect(page.locator("article")).toContainText(edition.content.paragraphs.join(" "));
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${origin}/bg${edition.path}`,
    );
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(2);
    expect(approvedXml).toContain(`<loc>${origin}/bg${edition.path}</loc>`);
    expect((await page.goto(`/en${edition.path}`))?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
    await expect(page.locator("article")).toHaveCount(0);
    expect(approvedXml).not.toContain(`${origin}/en${edition.path}`);
  }
  for (const slug of ["sell", "let"]) {
    await page.goto(`/bg/services/${slug}`);
    await expect(page.locator("article")).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${origin}/bg/services/${slug}`,
    );
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
    expect(approvedXml).not.toContain(`<loc>${origin}/bg/services/${slug}</loc>`);
  }
  seed("expire", ...approved.map((edition) => edition.content.version.id));
  const staleXml = await (await request.get("/sitemap.xml")).text();
  for (const edition of approved) {
    await page.goto(`/bg${edition.path}`);
    await expect(page.locator("article")).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
    expect(staleXml).not.toContain(`<loc>${origin}/bg${edition.path}</loc>`);
  }
});
