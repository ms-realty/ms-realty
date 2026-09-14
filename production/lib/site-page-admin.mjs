import { createSitePageContentService, SITE_PAGE_LOCALES, SitePageContentError } from "./site-page-content.mjs";
import { loadLocaleRegistry } from "./locales.mjs";
import { sellerPath } from "./seo.mjs";
import { renderSellerPage, sellerPageBaselineContent, withSellerPageContent } from "./public-site.mjs";
import { renderHtmlPage } from "./html.mjs";
import { renderReactPublicBody } from "./react-public-site.mjs";
import { h, renderStaticElement } from "./react-static-html.mjs";
import { CSP_HEADER } from "./security-headers.mjs";
import { renderSitePageAdminBody, sitePageAdminCopy, sitePageAdminPayload, sitePageEditorUrl, SITE_PAGE_ADMIN_PATH } from "./site-page-admin-ui.mjs";

const PRIVATE_HEADERS = { ...CSP_HEADER, "cache-control": "private,no-store", "x-robots-tag": "noindex,nofollow",
  "x-content-type-options": "nosniff", "referrer-policy": "same-origin", "x-frame-options": "DENY" };
const json = (status, value) => new Response(JSON.stringify(value), { status, headers: { ...PRIVATE_HEADERS, "content-type": "application/json; charset=utf-8" } });
const html = (page, bodyHtml) => new Response(renderHtmlPage(page, { bodyHtml }), {
  status: page.status || 200, headers: { ...PRIVATE_HEADERS, "content-type": "text/html; charset=utf-8" },
});
const contentFrom = (input) => Object.fromEntries(["title", "description", "h1", "intro"].map((key) => [key, input[key]]));
const checked = (value) => value === true || value === "on";
function versionOf(value) {
  if ((typeof value !== "number" && !/^\d+$/.test(String(value))) || !Number.isSafeInteger(Number(value))) {
    throw new SitePageContentError("A saved page version is required.");
  }
  return Number(value);
}
function selection(input, principal, locale) {
  return { principal, locale, expectedVersion: versionOf(input.expectedVersion), revisionId: input.revisionId, contentHash: input.contentHash };
}
function errorView(error, locale) {
  const ui = sitePageAdminCopy(locale);
  const status = error.status || 500;
  return { status, kind: error.code || "site_page_request_failed", unavailable: status >= 500, blocked: status === 409 || status >= 500,
    message: status >= 500 ? ui.unavailable : status === 409 ? ui.conflict : error instanceof SitePageContentError ? error.message : ui.failure };
}

// Called only after the main admin adapter resolves the principal and applies
// its session, CSRF, capability and second-factor gates. Its bounded parser is
// passed in; actor fields from a request are never forwarded to the service.
export async function renderSitePageAdminResponse(request, { config, principal, parseInput, defaultInterfaceLocale = "bg", decoratePage = (page) => page }) {
  const url = new URL(request.url);
  const registry = loadLocaleRegistry(config.localeRegistryPath);
  const cms = createSitePageContentService({ payload: config.sitePageContentPayload || config.payloadListingRuntime || null });
  const nativeForm = request.method === "POST" && (request.headers.get("content-type") || "").includes("application/x-www-form-urlencoded");
  const wantsHtml = url.pathname === SITE_PAGE_ADMIN_PATH || nativeForm;
  let input = {};
  let locale = url.searchParams.get("contentLocale") || "bg";
  let interfaceLocale = ["bg", "ru", "en"].includes(url.searchParams.get("locale")) ? url.searchParams.get("locale") : defaultInterfaceLocale;

  async function editorResponse(error = null) {
    let state = { page_key: "seller", locale, version: 0, draft: null, published: null, published_source_revision_id: null, publication_status: "not_published" };
    let source = null;
    try {
      state = await cms.readDraft({ principal, locale });
      if (locale !== "bg") source = await cms.readPublished({ locale: "bg" });
    } catch (readError) { error = errorView(readError, interfaceLocale); }
    const content = error && input.action === "save" ? contentFrom(input) : state.draft?.content || sellerPageBaselineContent(locale);
    const page = decoratePage(sitePageAdminPayload({ registry, interfaceLocale, state, principal, content, source,
      publicPath: sellerPath(registry, locale), error, saved: url.searchParams.get("saved") === "1" }));
    return html(page, renderSitePageAdminBody(page));
  }

  try {
    if (!["GET", "POST"].includes(request.method) || (request.method === "POST" && url.pathname === SITE_PAGE_ADMIN_PATH)) {
      return json(405, { kind: "method_not_allowed" });
    }
    if (request.method === "POST") {
      try { input = await parseInput(); } catch (error) {
        throw new SitePageContentError("The request body could not be read.", error.status || 400, "invalid_site_page_request");
      }
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new SitePageContentError("A page action is required.");
      locale = input.contentLocale || "bg";
      if (["bg", "ru", "en"].includes(input.interfaceLocale)) interfaceLocale = input.interfaceLocale;
    }
    if (!SITE_PAGE_LOCALES.includes(locale)) throw new SitePageContentError("Select a supported page language.");
    if (request.method === "GET") {
      if (url.searchParams.get("preview") === "1") {
        const preview = await cms.previewRevision(selection(Object.fromEntries(url.searchParams), principal, locale));
        if (!wantsHtml) return json(200, preview);
        const ui = sitePageAdminCopy(interfaceLocale);
        const seller = withSellerPageContent(renderSellerPage({ registry, localeCode: locale, leadWritesDisabled: true, photoUploadDisabled: true }), preview.content);
        const page = { ...seller, indexable: false, hreflang: [], metadata: { ...seller.metadata, robots: "noindex,nofollow" } };
        const banner = renderStaticElement(h("aside", { "aria-label": ui.privatePreview, lang: interfaceLocale }, h("p", null, ui.privatePreview),
          h("a", { href: sitePageEditorUrl(interfaceLocale, locale) }, ui.returnToEditor)));
        return html(page, banner + renderReactPublicBody(page));
      }
      if (wantsHtml) return editorResponse();
      return json(200, { kind: "site_page_state", ...await cms.readDraft({ principal, locale }), editor_url: sitePageEditorUrl(interfaceLocale, locale) });
    }
    const selected = selection(input, principal, locale);
    let state;
    switch (input.action) {
      case "save": state = await cms.saveDraft({ ...selected, content: contentFrom(input), sourceRevisionId: input.sourceRevisionId || null }); break;
      case "submit": state = await cms.submitForReview(selected); break;
      case "approve": state = await cms.approveRevision({ ...selected, contentReviewed: checked(input.contentReviewed), translationReviewed: checked(input.translationReviewed),
        evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs : String(input.evidenceRefs || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean) }); break;
      case "publish": state = await cms.publishRevision({ ...selected, confirm: checked(input.confirm) }); break;
      default: throw new SitePageContentError("Select save, submit, approve or publish.");
    }
    const editorUrl = `${sitePageEditorUrl(interfaceLocale, locale)}&saved=1`;
    if (nativeForm) return new Response(null, { status: 303, headers: { ...PRIVATE_HEADERS, location: editorUrl } });
    return json(200, { kind: "site_page_saved", ...state, editor_url: editorUrl });
  } catch (error) {
    const failure = errorView(error, interfaceLocale);
    if (!wantsHtml || !SITE_PAGE_LOCALES.includes(locale)) return json(failure.status, { kind: failure.kind, message: failure.message });
    return editorResponse(failure);
  }
}
