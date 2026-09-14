import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../../lib/app-admin-adapter.mjs";
import { appRouterConfigFromEnv, renderAppRouteResponse } from "../../lib/app-router-adapter.mjs";
import { createSitePageContentService } from "../../lib/site-page-content.mjs";
import { fromRoot } from "../../lib/paths.mjs";
import { loadLocaleRegistry } from "../../lib/locales.mjs";
import { sellerPath } from "../../lib/seo.mjs";

// Test-only loopback server drives the same Request/Response adapters as Next.
// It uses scoped test credentials and the caller's disposable real database.
export async function exerciseSellerPageBrowser({ payload, chromium }) {
  const editor = { id: "browser-editor", roles: ["editor"], token: "browser-editor-local-test-0123456789abcdef" };
  const owner = { id: "browser-owner", roles: ["admin"], token: "browser-owner-local-test-0123456789abcdef" };
  const authEnv = { MS_REALTY_ADMIN_CREDENTIALS_JSON: JSON.stringify([editor, owner]) };
  const config = { ...appAdminConfigFromEnv({}), authEnv, sitePageContentPayload: payload };
  const publicConfig = { ...appRouterConfigFromEnv({}), sitePageContentPayload: payload };
  let origin;
  const server = http.createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url, origin);
      let response;
      if (url.pathname.startsWith("/vendor/") || url.pathname.startsWith("/fonts/")) {
        const file = path.resolve(fromRoot("public"), `.${url.pathname}`);
        if (!file.startsWith(`${fromRoot("public")}${path.sep}`) || !fs.existsSync(file)) response = new Response(null, { status: 404 });
        else response = new Response(fs.readFileSync(file), { headers: { "content-type": file.endsWith(".js") ? "application/javascript" : file.endsWith(".css") ? "text/css" : "font/woff2" } });
      } else {
        const chunks = [];
        for await (const chunk of incoming) chunks.push(chunk);
        const body = chunks.length ? Buffer.concat(chunks) : undefined;
        const request = new Request(url, { method: incoming.method, headers: incoming.headers, ...(body ? { body } : {}) });
        response = url.pathname.startsWith("/admin/") || url.pathname.startsWith("/api/admin/")
          ? await renderAppAdminResponse(request, { config })
          : await renderAppRouteResponse({ pathname: url.pathname, url: url.href, host: incoming.headers.host, accept: "text/html", config: publicConfig });
      }
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) { outgoing.writeHead(500); outgoing.end(error.message); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  let page;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { authorization: `Bearer ${editor.token}` } });
    context.setDefaultTimeout(5000);
    context.setDefaultNavigationTimeout(5000);
    await context.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const editorUrl = `${origin}/admin/site-pages/seller?locale=en&contentLocale=bg`;
    const feedback = page.locator("[data-site-page-feedback]");
    const save = page.getByRole("button", { name: "Save draft", exact: true });
    const cms = createSitePageContentService({ payload });
    const before = await cms.readPublished();
    const copy = { title: "Проверена страница от браузъра", description: "Описание, прегледано от редактора.", h1: "Вашият имот в Сандански", intro: "Текст, запазен през формата и публикуван от собственика." };
    await page.goto(`${origin}/admin/approved-content?locale=en`);
    await page.getByRole("link", { name: "Seller page", exact: true }).click();
    assert.equal(await page.getByRole("heading", { level: 1, name: "Seller page" }).count(), 1);
    assert.equal(await page.locator('[data-site-page-form="publish"]').count(), 0);
    for (const [name, value] of Object.entries(copy)) await page.locator(`#site-page-${name}`).fill(value);
    assert.equal(await page.locator('[data-site-page-form="submit"] button').isDisabled(), true);

    // Real unauthorized response, not a fake success/error fetch implementation.
    await context.setExtraHTTPHeaders({});
    await save.click();
    await page.waitForFunction(() => document.querySelector("[data-site-page-feedback]").textContent.includes("session expired"));
    assert.equal(await page.locator("#site-page-intro").inputValue(), copy.intro);
    assert.equal(await page.getByRole("link", { name: "Sign in in a new tab" }).isVisible(), true);
    assert.equal((await cms.readPublished()).revision_id, before.revision_id);
    await context.setExtraHTTPHeaders({ authorization: `Bearer ${editor.token}` });
    config.authEnv = { MS_REALTY_ADMIN_CREDENTIALS_JSON: JSON.stringify([editor, owner].map((entry) => ({ ...entry, require_two_factor: true }))) };
    await save.click();
    await page.waitForFunction(() => document.querySelector("[data-site-page-feedback]").textContent.includes("session needs verification"));
    assert.equal(await page.getByRole("link", { name: "Verify your session in a new tab", exact: true }).isVisible(), true);
    assert.equal(await page.locator("#site-page-intro").inputValue(), copy.intro);
    config.authEnv = authEnv;
    const [savedResponse] = await Promise.all([page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/api/admin/site-pages/seller")), save.click()]);
    assert.equal(savedResponse.status(), 200);
    await page.waitForURL(/saved=1/);
    const draft = await cms.readDraft({ principal: { ...editor, can_mutate: true } });
    assert.deepEqual(draft.draft.content, copy);
    assert.equal(draft.draft.created_by, editor.id);
    assert.equal((await cms.readPublished()).revision_id, before.revision_id);

    const popupPromise = context.waitForEvent("page");
    await page.getByRole("link", { name: "Preview saved draft" }).click();
    const preview = await popupPromise;
    await preview.waitForLoadState();
    assert.equal(await preview.locator('meta[name="robots"]').getAttribute("content"), "noindex,nofollow");
    assert.equal(await preview.getByRole("heading", { name: copy.h1, exact: true }).count(), 1);
    assert.match(await preview.locator("body").innerText(), /Private draft preview/);
    await preview.close();

    await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Send for review", exact: true }).click()]);
    await page.getByLabel("Sources checked during review", { exact: true }).fill("Owner-approved seller page source");
    await page.getByLabel("I checked the text and its factual claims against these sources.", { exact: true }).check();
    await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Approve reviewed text", exact: true }).click()]);
    assert.equal(await page.locator('[data-site-page-form="publish"]').count(), 0);
    assert.match(await page.locator("body").innerText(), /The agency owner publishes approved text/);

    await context.setExtraHTTPHeaders({ authorization: `Bearer ${owner.token}` });
    await page.goto(editorUrl);
    await page.getByLabel("Publish this exact reviewed text on the website.", { exact: true }).check();
    await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Publish page", exact: true }).click()]);
    const published = await cms.readPublished();
    assert.deepEqual(published.content, copy);
    const publicPage = await context.newPage();
    const publicResponse = await publicPage.goto(`${origin}${sellerPath(loadLocaleRegistry(), "bg")}`);
    assert.equal(publicResponse.headers()["x-ms-site-page-revision"], published.revision_id);
    assert.equal(publicResponse.headers()["x-ms-site-page-content-hash"], published.content_hash);
    assert.equal(await publicPage.getByRole("heading", { name: copy.h1, exact: true }).count(), 1);
    assert.match(await publicPage.locator("body").innerText(), new RegExp(copy.intro));
    await publicPage.close();

    // Another editor saves while this form stays open. It must retain the local
    // text and show the conflict instead of rebasing or overwriting silently.
    await page.locator("#site-page-h1").fill("Моят незапазен текст");
    const current = await cms.readDraft({ principal: { ...owner, can_mutate: true } });
    await cms.saveDraft({ principal: { ...owner, can_mutate: true }, expectedVersion: current.version, content: { ...copy, h1: "Запазено в друг раздел" } });
    await save.click();
    await page.waitForFunction(() => document.querySelector("[data-site-page-feedback]").textContent.includes("changed elsewhere"));
    assert.equal(await page.locator("#site-page-h1").inputValue(), "Моят незапазен текст");
    assert.equal(await feedback.evaluate((element) => element === document.activeElement), true);
    assert.equal((await cms.readPublished()).revision_id, published.revision_id);

    // Existing shell styles, labels and Hebrew direction at a narrow viewport.
    await page.locator("#site-page-h1").fill(copy.h1);
    for (const locale of ["bg", "ru", "en"]) {
      await page.goto(`${origin}/admin/site-pages/seller?locale=${locale}&contentLocale=he`);
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.locator("html").getAttribute("lang"), locale);
      assert.equal(await page.locator("#site-page-intro").getAttribute("dir"), "rtl");
      assert.equal(await page.locator("#site-page-language").inputValue(), "he");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      assert.equal(await page.locator("#site-page-title").evaluate((element) => element.labels.length), 1);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('[data-admin-locales="rail"]').getByRole("link", { name: "BG", exact: true }).click();
    assert.equal(await page.locator("html").getAttribute("lang"), "bg");
    assert.equal(await page.locator("#site-page-language").inputValue(), "he");
    await page.locator('[data-admin-locales="rail"]').getByRole("link", { name: "EN", exact: true }).click();
    assert.equal(await page.locator("html").getAttribute("lang"), "en");
    assert.equal(await page.locator("#site-page-language").inputValue(), "he");
    await page.setViewportSize({ width: 390, height: 844 });
    const nativeContext = await browser.newContext({ javaScriptEnabled: false, extraHTTPHeaders: { authorization: `Bearer ${owner.token}` } });
    const nativePage = await nativeContext.newPage();
    await nativePage.goto(editorUrl);
    await nativePage.getByLabel("Page heading", { exact: true }).fill("Чернова без JavaScript");
    await Promise.all([nativePage.waitForURL(/saved=1/), nativePage.getByRole("button", { name: "Save draft", exact: true }).click()]);
    assert.equal((await cms.readDraft({ principal: { ...owner, can_mutate: true } })).draft.content.h1, "Чернова без JavaScript");
    assert.equal((await cms.readPublished()).revision_id, published.revision_id);
    await nativeContext.close();
    assert.deepEqual(pageErrors, []);
    if (process.env.MS_REALTY_SITE_PAGE_SCREENSHOT) await page.screenshot({ path: process.env.MS_REALTY_SITE_PAGE_SCREENSHOT, fullPage: true });
    return published;
  } catch (error) {
    if (page && !page.isClosed()) {
      if (process.env.MS_REALTY_SITE_PAGE_SCREENSHOT) await page.screenshot({ path: process.env.MS_REALTY_SITE_PAGE_SCREENSHOT, fullPage: true }).catch(() => {});
      error.message += `\nEditor feedback: ${await page.locator("[data-site-page-feedback]").textContent().catch(() => "unavailable")}`;
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
